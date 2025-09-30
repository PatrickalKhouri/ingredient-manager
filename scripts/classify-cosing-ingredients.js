#!/usr/bin/env node
/* eslint-disable no-console */

// Load env vars from .env (repo root)
try { require('dotenv').config(); } catch {}

/**
 * Classify CosIng ingredients as active / excipient / unknown
 * using EXACT matches of CosIng "functions" to keyword lists.
 *
 * Policy:
 * - This script is the SOURCE OF TRUTH: it ALWAYS rewrites manual fields.
 * - If classification is 'unknown', it CLEARS those fields.
 * - If BOTH active and excipient keywords are present, classify as 'active'.
 *
 * Usage:
 *   node scripts/classify-cosing-ingredients.js [--dry-run] [--limit=N] [--print-unknowns]
 *
 * Env:
 *   MONGO_URI   = mongodb://... or mongodb+srv://...
 *   DB_NAME     = your database name (optional if parsable from URI path)
 *   COSING_COLL = cosing_ingredients (default)
 */

const { MongoClient } = require('mongodb');

// ----------------- Keyword lists (canonical) -----------------
const ACTIVE_KEYWORDS = [
  'abrasive',
  'anti-seborrheic',
  'anti-sebum',
  'antiperspirant',
  'antiplaque',
  'antistatic',
  'astringent',
  'bleaching',
  'cleansing',
  'deodorant',
  'depilatory',
  'detangling',
  'epilating',
  'exfoliating',
  'eyelash conditioning',
  'hair conditioning',
  'hair dyeing',
  'hair fixing',
  'hair waving or straightening',
  'humectant',
  'keratolytic',
  'lytic',
  'moisturising',
  'nail conditioning',
  'nail sculpting',
  'occlusive',
  'oral care',
  'refatting',
  'refreshing',
  'skin conditioning',
  'skin conditioning - emollient',
  'skin conditioning - humectant',
  'skin conditioning - miscellaneous',
  'skin conditioning - occlusive',
  'skin protecting',
  'smoothing',
  'soothing',
  'surfactant - cleansing',
  'tanning',
  'tonic',
  'uv absorber',
  'uv filter'
];

const EXCIPIENT_KEYWORDS = [
  'absorbent',
  'adhesive',
  'anticaking',
  'anticorrosive',
  'antifoaming',
  'antimicrobial',
  'binding',
  'buffering',
  'bulking',
  'chelating',
  'colorant',
  'denaturant',
  'dispersing non-surfactant',
  'emulsion stabilising',
  'film forming',
  'flavouring',
  'foaming',
  'fragrance',
  'gel forming',
  'light stabilizer',
  'not reported',
  'opacifying',
  'oxidising',
  'pearlescent',
  'perfuming',
  'plasticiser',
  'preservative',
  'propellant',
  'reducing',
  'slip modifier',
  'solvent',
  'surface modifier',
  'surfactant',
  'surfactant - dispersing',
  'surfactant - emulsifying',
  'surfactant - foam boosting',
  'surfactant - hydrotrope',
  'surfactant - solubilizing',
  'viscosity controlling',
  'ph adjusters'
];

// ----------------- CLI flags -----------------
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const PRINT_UNKNOWNS = argv.includes('--print-unknowns');
const limitArg = argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

// ----------------- Env + Config -----------------
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const COSING_COLL = process.env.COSING_COLL || 'cosing_ingredients';
const DEFAULT_DB = 'olis_lab';

function inferDbNameFromUri(uri) {
  try {
    if (!uri) return null;
    const noQuery = uri.split('?')[0];
    const afterProtocol = noQuery.split('://')[1] || '';
    const dbName = afterProtocol.split('/')[1] || '';
    return dbName || null;
  } catch { return null; }
}
let DB_NAME = process.env.DB_NAME || process.env.MONGO_DB || inferDbNameFromUri(MONGO_URI) || DEFAULT_DB;

if (!MONGO_URI) {
  console.error('Error: MONGO_URI (or MONGODB_URI) env var is required.');
  process.exit(1);
}

const SOURCE_TAG = 'script:classify-cosing@1.3.0'; // bumped for "both -> active" policy

// ----------------- Helpers -----------------
function norm(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Build a normalized lookup map for exact matches
function buildKeywordIndex(keywordList) {
  const idx = new Map(); // norm(keyword) -> canonical keyword
  for (const kw of keywordList) idx.set(norm(kw), kw);
  return idx;
}

// Exact match of normalized function to normalized keyword
function matchKeywordsExact(functions, keywordIndex) {
  const hits = [];
  for (const f of functions) {
    const key = norm(f);
    if (keywordIndex.has(key)) hits.push(keywordIndex.get(key));
  }
  return hits;
}

const ACTIVE_IDX = buildKeywordIndex(ACTIVE_KEYWORDS);
const EXCIPIENT_IDX = buildKeywordIndex(EXCIPIENT_KEYWORDS);

function classifyByFunctions(functions) {
  if (!Array.isArray(functions) || functions.length === 0) {
    return { classification: 'unknown', hitsActive: [], hitsExcipient: [], promotedFromBoth: false };
  }
  const hitsActive = matchKeywordsExact(functions, ACTIVE_IDX);
  const hitsExcipient = matchKeywordsExact(functions, EXCIPIENT_IDX);

  let classification = 'unknown';
  let promotedFromBoth = false;

  if (hitsActive.length && hitsExcipient.length) {
    // Policy: both -> active
    classification = 'active';
    promotedFromBoth = true;
  } else if (hitsActive.length) {
    classification = 'active';
  } else if (hitsExcipient.length) {
    classification = 'excipient';
  }

  return { classification, hitsActive, hitsExcipient, promotedFromBoth };
}

// ----------------- Main -----------------
(async () => {
  const client = new MongoClient(MONGO_URI, { ignoreUndefined: true });
  await client.connect();
  const db = client.db(DB_NAME);
  const coll = db.collection(COSING_COLL);

  const query = { functions: { $type: 'array', $ne: [] } };
  const projection = { functions: 1, inci_name: 1 };

  if (LIMIT) console.log(`Running with LIMIT=${LIMIT}`);
  console.log(`Dry run: ${DRY_RUN ? 'YES' : 'NO'}`);
  console.log(`DB: ${DB_NAME}, Collection: ${COSING_COLL}`);
  console.log('---');

  const cursor = coll.find(query, { projection, batchSize: 500 });
  const now = new Date();

  let scanned = 0;
  let toWrite = 0;
  let updated = 0;
  let activeOnly = 0;
  let excipientOnly = 0;
  let promotedBothToActive = 0;
  let unknowns = 0;

  const bulk = [];

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;

    const { classification, hitsActive, hitsExcipient, promotedFromBoth } = classifyByFunctions(doc.functions);

    if (classification === 'unknown') {
      unknowns += 1;
      if (PRINT_UNKNOWNS) {
        console.log('[UNKNOWN]', { _id: String(doc._id), inci_name: doc.inci_name, functions: doc.functions });
      }
      toWrite += 1;
      if (!DRY_RUN) {
        bulk.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $unset: {
                manual_classification: "",
                manual_classification_hits: "",
                manual_classification_source: "",
                manual_classification_at: ""
              }
            }
          }
        });
      }
      continue;
    }

    if (classification === 'active') {
      if (promotedFromBoth) promotedBothToActive += 1;
      else activeOnly += 1;
    } else if (classification === 'excipient') {
      excipientOnly += 1;
    }

    const updateDoc = {
      manual_classification: classification,                   // 'active' or 'excipient'
      manual_classification_hits: { active: hitsActive, excipient: hitsExcipient },
      manual_classification_source: SOURCE_TAG,
      manual_classification_at: now,
      // Optional: track policy application for auditing
      manual_classification_notes: promotedFromBoth ? 'promoted_from_both' : undefined
    };

    toWrite += 1;
    if (!DRY_RUN) {
      bulk.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: updateDoc, $unset: { manual_classification_notes: promotedFromBoth ? undefined : "" } }
        }
      });
    }

    // Flush in chunks
    if (!DRY_RUN && bulk.length >= 1000) {
      const res = await coll.bulkWrite(bulk, { ordered: false });
      updated += res.modifiedCount;
      bulk.length = 0;
    }

    if (LIMIT && scanned >= LIMIT) break;
  }

  if (!DRY_RUN && bulk.length > 0) {
    const res = await coll.bulkWrite(bulk, { ordered: false });
    updated += res.modifiedCount;
  }

  await client.close();

  console.log('---');
  console.log(`Scanned:                 ${scanned}`);
  console.log(`To write:                ${toWrite}${DRY_RUN ? ' (dry-run, no DB writes)' : ''}`);
  console.log(`Updated:                 ${updated}`);
  console.log(`Classified active only:  ${activeOnly}`);
  console.log(`Promoted both -> active: ${promotedBothToActive}`);
  console.log(`Classified excipient:    ${excipientOnly}`);
  console.log(`Unknown (cleared):       ${unknowns}`);
  console.log('Done.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
