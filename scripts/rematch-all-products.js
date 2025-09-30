try { require('dotenv').config(); } catch {}

const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// ---------------- util ----------------
function tryRequire(p) {
  try { return require(p); } catch { return null; }
}
function log(...a) { console.log(...a); }

// ---------- args ----------
const argv = process.argv.slice(2);
const limitArg = argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const DRY_RUN = argv.includes('--dry-run');

// ---------------- try to import app modules (JS only) ----------------
let getCollections =
  tryRequire(path.join(process.cwd(), 'dist', 'config', 'get-collections'))?.getCollections ||
  tryRequire(path.join(process.cwd(), 'build', 'src', 'config', 'get-collections'))?.getCollections || // legacy
  tryRequire(path.join(process.cwd(), 'build', 'config', 'get-collections'))?.getCollections ||
  tryRequire(path.join(process.cwd(), 'src', 'config', 'get-collections.js'))?.getCollections ||
  null;

let matchesRepo =
  tryRequire(path.join(process.cwd(), 'dist', 'repos', 'matches.repo'))?.matchesRepo ||
  tryRequire(path.join(process.cwd(), 'build', 'src', 'repos', 'matches.repo'))?.matchesRepo || // legacy
  tryRequire(path.join(process.cwd(), 'build', 'repos', 'matches.repo'))?.matchesRepo ||
  tryRequire(path.join(process.cwd(), 'src', 'repos', 'matches.repo.js'))?.matchesRepo ||
  null;

// ---------------- fallbacks (no build, no installs) ----------------
let __client = null;
if (!getCollections) {
  const MONGO_URL = process.env.MONGO_URL || process.env.MONGODB_URI;
  const DB_NAME = process.env.MONGO_DB || 'olis_lab';
  const PRODUCTS_COLLECTION = process.env.MONGO_PRODUCTS_COLLECTION || 'products';
  const MATCHES_COLLECTION  = process.env.MONGO_MATCHES_COLLECTION  || 'matches';

  if (!MONGO_URL) {
    console.error('❌ MONGO_URL (or MONGODB_URI) not set in env.');
    process.exit(1);
  }

  getCollections = async () => {
    __client ||= new MongoClient(MONGO_URL);
    await __client.connect();
    const db = __client.db(DB_NAME);
    return {
      products: db.collection(PRODUCTS_COLLECTION),
      matches:  db.collection(MATCHES_COLLECTION),
    };
  };
}

// If we didn't find matchesRepo, provide an HTTP shim using MATCH_API_URL
if (!matchesRepo || typeof matchesRepo.matchProduct !== 'function') {
  const MATCH_API_URL = process.env.MATCH_API_URL || ''; // e.g. https://yourapp.com/v1/matches/rematch
  if (MATCH_API_URL) {
    matchesRepo = {
      matchProduct: async (id) => {
        const url = `${MATCH_API_URL.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
        if (DRY_RUN) { log(`(dry-run) POST ${url}`); return; }
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} ${text && `- ${text}`}`);
        }
      }
    };
  } else {
    console.error('❌ Could not import matchesRepo and MATCH_API_URL is not set.');
    console.error('   Set MATCH_API_URL to a rematch endpoint OR ensure your repo emits JS (dist/build).');
    process.exit(1);
  }
}

// ---------------- main ----------------
(async () => {
  const { products, matches } = await getCollections();

  // 1) wipe matches
  if (DRY_RUN) {
    log('🧹 (dry-run) Would delete all documents from matches collection.');
  } else {
    const del = await matches.deleteMany({});
    log(`🧹 Deleted ${del.deletedCount ?? 0} existing matches. Starting fresh...`);
  }

  // 2) fetch product ids (lean)
  let cursor = products.find({}, { projection: { _id: 1 } });
  if (LIMIT && Number.isFinite(LIMIT)) cursor = cursor.limit(LIMIT);
  const ids = await cursor.toArray();
  log(`📦 Found ${ids.length} products${LIMIT ? ` (limited to ${LIMIT})` : ''}, starting rematch...`);

  // 3) sequentially rematch
  let i = 0;
  for (const doc of ids) {
    i += 1;
    const id = String(doc._id instanceof ObjectId ? doc._id : doc._id);
    try {
      await matchesRepo.matchProduct(id);
      log(`[${i}/${ids.length}] ✅ Matched product ${id}`);
    } catch (err) {
      console.error(`[${i}/${ids.length}] ❌ Error matching product ${id}:`, err?.message || String(err));
    }
  }

  try { if (__client) await __client.close(); } catch {}
  log('🏁 Done.');
})().catch((err) => {
  console.error('Fatal error in rematch-all-products:', err);
  process.exit(1);
});
