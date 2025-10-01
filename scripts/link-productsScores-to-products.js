#!/usr/bin/env node
/* eslint-disable no-console */

// Load env
try { require('dotenv').config(); } catch {}

// ---------- tiny utils ----------
const path = require('path');
function tryRequire(p) { try { return require(p); } catch { return null; } }
function normStr(s) { return String(s || '').toUpperCase().trim().replace(/\s+/g, ' '); }
function jaccard(a, b) {
  const A = new Set(a.map(normStr));
  const B = new Set(b.map(normStr));
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni === 0 ? 0 : inter / uni;
}

// ---------- CLI flags ----------
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const WITH_INGREDIENTS = argv.includes('--with-ingredients'); // optional, slower
const limitArg = argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

// ---------- attempt to import getCollections from many places ----------
let getCollections =
  // JS build (common)
  tryRequire(path.join(process.cwd(), 'dist', 'config', 'get-collections'))?.getCollections ||
  tryRequire(path.join(process.cwd(), 'dist', 'src', 'config', 'get-collections'))?.getCollections ||
  // legacy build
  tryRequire(path.join(process.cwd(), 'build', 'config', 'get-collections'))?.getCollections ||
  tryRequire(path.join(process.cwd(), 'build', 'src', 'config', 'get-collections'))?.getCollections ||
  // raw JS source (if you transpile TS to JS in src/)
  tryRequire(path.join(process.cwd(), 'src', 'config', 'get-collections.js'))?.getCollections ||
  null;

if (!getCollections) {
  // try ts-node for TS sources
  try { require('ts-node/register/transpile-only'); } catch {}
  getCollections =
    tryRequire(path.join(process.cwd(), 'src', 'config', 'get-collections'))?.getCollections ||
    null;
}

// ---------- if still not available, fall back to direct Mongo connection ----------
const { MongoClient, ObjectId } = require('mongodb');

let __client = null;
if (!getCollections) {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  const DB_NAME = process.env.DB_NAME || process.env.MONGO_DB || 'olis_lab';
  const PRODUCTS_COLL = process.env.PRODUCTS_COLL || 'products';
  const PRODUCTS_SCORES_COLL = process.env.PRODUCTS_SCORES_COLL || 'products_scores';

  if (!MONGO_URI) {
    console.error('❌ Could not import getCollections() and MONGO_URI/MONGODB_URI is not set.');
    process.exit(1);
  }

  getCollections = async () => {
    __client ||= new MongoClient(MONGO_URI, { ignoreUndefined: true });
    await __client.connect();
    const db = __client.db(DB_NAME);
    return {
      products: db.collection(PRODUCTS_COLL),
      productsScores: db.collection(PRODUCTS_SCORES_COLL),
    };
  };
}

// ---------- main ----------
(async () => {
  const { products, productsScores } = await getCollections();

  // Helpful index for future lookups
  if (!DRY_RUN) {
    try {
      await productsScores.createIndex(
        { product_id: 1 },
        {
          name: 'uniq_product_id',
          unique: true,
          partialFilterExpression: { product_id: { $exists: true } },
        }
      );
      console.log('✅ Ensured index on productsScores.product_id');
    } catch (e) {
      console.warn('⚠️ Index create warning:', e.message);
    }
  }

  const query = { $or: [{ product_id: { $exists: false } }, { product_id: null }] };
  const projection = { _id: 1, product_name: 1, product_brand: 1, product_ingredients: 1 };

  let cursor = productsScores.find(query, { projection });
  if (LIMIT && Number.isFinite(LIMIT)) cursor = cursor.limit(LIMIT);

  let scanned = 0,
      resolvedBySameId = 0,
      resolvedByBrandName = 0,
      resolvedByIngredients = 0,
      updated = 0,
      skipped = 0;

  while (await cursor.hasNext()) {
    const scoreDoc = await cursor.next();
    scanned += 1;

    const scoreId = scoreDoc._id;
    const brand = String(scoreDoc.product_brand || '').trim();
    const name  = String(scoreDoc.product_name  || '').trim();

    let productIdToSet = null;

    // 1) If a product with the same _id exists
    const prodSameId = await products.findOne(
      { _id: new ObjectId(String(scoreId)) },
      { projection: { _id: 1 } }
    );
    if (prodSameId) {
      productIdToSet = prodSameId._id;
      resolvedBySameId += 1;
    } else if (brand && name) {
      // 2) Unique (brand, name)
      const candidates = await products
        .find({ brand, name }, { projection: { _id: 1, inci: 1 } })
        .limit(5)
        .toArray();

      if (candidates.length === 1) {
        productIdToSet = candidates[0]._id;
        resolvedByBrandName += 1;
      } else if (candidates.length > 1 && WITH_INGREDIENTS) {
        // 3) Disambiguate by ingredient similarity (optional)
        const scoreInci = Array.isArray(scoreDoc.product_ingredients) ? scoreDoc.product_ingredients : [];
        let best = { idx: -1, score: -1 };
        for (let i = 0; i < candidates.length; i++) {
          const candInci = Array.isArray(candidates[i].inci) ? candidates[i].inci : [];
          const sim = jaccard(scoreInci, candInci);
          if (sim > best.score) best = { idx: i, score: sim };
        }
        if (best.idx >= 0 && best.score >= 0.7) {
          productIdToSet = candidates[best.idx]._id;
          resolvedByIngredients += 1;
        }
      }
    }

    if (productIdToSet) {
      if (!DRY_RUN) {
        await productsScores.updateOne(
          { _id: scoreId },
          { $set: { product_id: productIdToSet } }
        );
      }
      updated += 1;
      console.log(`✅ Linked score ${scoreId} → product_id ${productIdToSet}`);
    } else {
      skipped += 1;
      console.log(`⏭️  Skipped score ${scoreId} (no confident match)`);
    }
  }

  console.log('---');
  console.log(`Scanned:                ${scanned}`);
  console.log(`Resolved by same _id:   ${resolvedBySameId}`);
  console.log(`Resolved by brand/name: ${resolvedByBrandName}`);
  console.log(`Resolved by ingredients:${resolvedByIngredients}`);
  console.log(`Updated:                ${updated}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`Skipped:                ${skipped}`);
  console.log('Done.');

  try { if (__client) await __client.close(); } catch {}
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
