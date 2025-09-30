// scripts/rematch-all-products.fast.js
try { require('dotenv').config(); } catch {}

const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// --------- tiny utils ---------
function tryRequire(p) { try { return require(p); } catch { return null; } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function log(...a) { console.log(...a); }

// --------- args ---------
const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const a = argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};
const has = (name) => argv.includes(`--${name}`);

const LIMIT        = arg('limit') ? parseInt(arg('limit'), 10) : null;
const CONCURRENCY  = arg('concurrency') ? Math.max(1, parseInt(arg('concurrency'), 10)) : (process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY, 10) : 32);
const DRY_RUN      = has('dry-run');
const NO_DROP      = has('no-drop');
const RETRIES      = arg('retries') ? parseInt(arg('retries'), 10) : 2;     // per item
const TIMEOUT_MS   = arg('timeoutMs') ? parseInt(arg('timeoutMs'), 10) : 20000; // per call

// --------- try to import app modules (JS only; no build/no installs) ---------
let getCollections =
  tryRequire(path.join(process.cwd(), 'dist', 'config', 'get-collections'))?.getCollections ||
  tryRequire(path.join(process.cwd(), 'build', 'config', 'get-collections'))?.getCollections ||
  tryRequire(path.join(process.cwd(), 'src',  'config', 'get-collections.js'))?.getCollections ||
  null;

let matchesRepo =
  tryRequire(path.join(process.cwd(), 'dist', 'repos', 'matches.repo'))?.matchesRepo ||
  tryRequire(path.join(process.cwd(), 'build', 'repos', 'matches.repo'))?.matchesRepo ||
  tryRequire(path.join(process.cwd(), 'src',  'repos',  'matches.repo.js'))?.matchesRepo ||
  null;

// --------- fallbacks (no extra installs) ---------
let __client = null;
if (!getCollections) {
  const MONGO_URL = process.env.MONGO_URL || process.env.MONGODB_URI;
  const DB_NAME   = process.env.MONGO_DB || 'olis_lab';
  const PRODUCTS_COLLECTION = process.env.MONGO_PRODUCTS_COLLECTION || 'products';
  const MATCHES_COLLECTION  = process.env.MONGO_MATCHES_COLLECTION  || 'matches';

  if (!MONGO_URL) {
    console.error('❌ MONGO_URL (or MONGODB_URI) not set in env.');
    process.exit(1);
  }

  getCollections = async () => {
    __client ||= new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 10000 });
    await __client.connect();
    const db = __client.db(DB_NAME);
    return {
      products: db.collection(PRODUCTS_COLLECTION),
      matches:  db.collection(MATCHES_COLLECTION),
    };
  };
}

// If matchesRepo missing, use HTTP shim via MATCH_API_URL (e.g., POST /v1/matches/rematch/:id)
if (!matchesRepo || typeof matchesRepo.matchProduct !== 'function') {
  const MATCH_API_URL = process.env.MATCH_API_URL || '';
  if (!MATCH_API_URL) {
    console.error('❌ Could not import matchesRepo and MATCH_API_URL is not set.');
    console.error('   Set MATCH_API_URL to a rematch endpoint OR ensure your repo emits JS (dist/build).');
    process.exit(1);
  }
  matchesRepo = {
    matchProduct: async (id, { signal } = {}) => {
      const url = `${MATCH_API_URL.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
      if (DRY_RUN) { log(`(dry-run) POST ${url}`); return; }
      const res = await fetch(url, { method: 'POST', signal });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
      }
    }
  };
}

// --------- concurrency runner ---------
async function runPool(producer, worker, concurrency) {
  const inFlight = new Set();
  let index = 0;
  let done = 0;
  const start = Date.now();

  async function spawn() {
    const next = await producer();
    if (next === undefined) return;
    const myIndex = ++index;
    const p = (async () => {
      try {
        await worker(next, myIndex);
      } finally {
        done++;
      }
    })();
    inFlight.add(p);
    p.finally(() => inFlight.delete(p)).then(spawn, spawn);
  }

  // start initial workers
  const starters = [];
  for (let i = 0; i < concurrency; i++) starters.push(spawn());

  // wait for all to finish
  await Promise.all(starters);
  await Promise.all([...inFlight]);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`⏱️  Concurrency ${concurrency} completed. Processed ${done} items in ${elapsed}s.`);
}

// --------- main ---------
(async () => {
  const t0 = Date.now();
  const { products, matches } = await getCollections();

  // 1) Drop matches (fast) unless --no-drop or dry-run
  if (DRY_RUN || NO_DROP) {
    log(`🧹 Skipping drop of 'matches' (DRY_RUN=${DRY_RUN}, NO_DROP=${NO_DROP}).`);
  } else {
    try {
      await matches.drop();
      log('🧹 Dropped matches collection.');
    } catch (e) {
      // If it doesn't exist, fallback to deleteMany
      if (e && /ns not found|NamespaceNotFound/i.test(e.message || '')) {
        log('ℹ️ matches collection not found. Continuing.');
      } else {
        log('⚠️ drop() failed, falling back to deleteMany({})...');
        const del = await matches.deleteMany({});
        log(`🧹 Deleted ${del.deletedCount ?? 0} from matches.`);
      }
    }
  }

  // 2) Build a streaming producer of product IDs
  let cursor = products.find({}, { projection: { _id: 1 } });
  if (LIMIT && Number.isFinite(LIMIT)) cursor = cursor.limit(LIMIT);

  const idsQueue = [];
  let cursorDone = false;
  (async () => {
    for await (const doc of cursor) {
      idsQueue.push(String(doc._id instanceof ObjectId ? doc._id : doc._id));
    }
    cursorDone = true;
  })();

  async function producer() {
    while (idsQueue.length === 0) {
      if (cursorDone) return undefined;
      await sleep(5);
    }
    return idsQueue.shift();
  }

  let totalCountKnown = false;
  let totalCount = 0;
  try {
    totalCount = await products.estimatedDocumentCount();
    if (LIMIT && Number.isFinite(LIMIT)) totalCount = Math.min(totalCount, LIMIT);
    totalCountKnown = true;
  } catch {}

  // 3) Worker with timeout + retries and progress/ETA
  let completed = 0;
  let lastLog = 0;

  async function withTimeout(promiseFactory, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(`Timeout ${ms}ms`), ms);
    try {
      return await promiseFactory(ac.signal);
    } finally {
      clearTimeout(t);
    }
  }

  async function worker(productId) {
    let attempt = 0;
    for (;;) {
      try {
        await withTimeout((signal) => matchesRepo.matchProduct(productId, { signal }), TIMEOUT_MS);
        break;
      } catch (err) {
        if (attempt >= RETRIES) throw err;
        const backoff = 300 * Math.pow(2, attempt); // 300ms, 600ms, 1200ms...
        await sleep(backoff);
        attempt++;
      }
    }

    completed++;
    const now = Date.now();
    if (now - lastLog > 1500) {
      lastLog = now;
      if (totalCountKnown) {
        const elapsed = (now - t0) / 1000;
        const rate = completed / Math.max(1, elapsed); // items/sec
        const remaining = Math.max(0, totalCount - completed);
        const etaSec = remaining / Math.max(0.1, rate);
        log(`[${completed}/${totalCount}] ✅ product ${productId} | rate ${rate.toFixed(1)}/s | ETA ${etaSec.toFixed(0)}s`);
      } else {
        log(`[${completed}] ✅ product ${productId}`);
      }
    }
  }

  log(`🚀 Starting rematch with concurrency=${CONCURRENCY}${LIMIT ? `, limit=${LIMIT}` : ''}${DRY_RUN ? ' (dry-run)' : ''}${NO_DROP ? ' (no-drop)' : ''}`);
  await runPool(producer, worker, CONCURRENCY);

  try { if (__client) await __client.close(); } catch {}

  log(`🏁 Done in ${((Date.now() - t0)/1000).toFixed(1)}s.`);
})().catch((err) => {
  console.error('Fatal error:', err?.message || err);
  process.exit(1);
});
