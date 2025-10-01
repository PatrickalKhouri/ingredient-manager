try { require('dotenv').config(); } catch {}

const path = require('path');
const { MongoClient } = require('mongodb');

// ---------- tiny util ----------
function tryRequire(p) {
  try { return require(p); } catch { return null; }
}

// ---------- resolve imports (no build, no ts-node) ----------
let getCollections =
  // try compiled JS if it exists
  tryRequire(path.join(process.cwd(), 'dist', 'config', 'get-collections'))?.getCollections ||
  tryRequire(path.join(process.cwd(), 'build', 'config', 'get-collections'))?.getCollections ||
  // try plain JS in src (only works if those files are JS)
  tryRequire(path.join(process.cwd(), 'src', 'config', 'get-collections.js'))?.getCollections ||
  null;

let splitIngredients =
  tryRequire(path.join(process.cwd(), 'dist', 'common', 'text.util'))?.splitIngredients ||
  tryRequire(path.join(process.cwd(), 'build', 'common', 'text.util'))?.splitIngredients ||
  tryRequire(path.join(process.cwd(), 'src', 'common', 'text.util.js'))?.splitIngredients ||
  null;

// Fallback: make our own getCollections() if not found
let __client = null;
if (!getCollections) {
  const MONGO_URL = process.env.MONGO_URL || process.env.MONGODB_URI;
  const DB_NAME = process.env.MONGO_DB || 'olis_lab';
  const COLLECTION = process.env.MONGO_PRODUCTS_COLLECTION || 'products';

  if (!MONGO_URL) {
    console.error('❌ MONGO_URL (or MONGODB_URI) not set in env.');
    process.exit(1);
  }

  getCollections = async () => {
    __client ||= new MongoClient(MONGO_URL);
    await __client.connect();
    const db = __client.db(DB_NAME);
    return {
      products: db.collection(COLLECTION),
    };
  };
}

// Fallback: make our own splitIngredients() if not found
if (typeof splitIngredients !== 'function') {
  splitIngredients = (raw) => {
    if (!raw || typeof raw !== 'string') return [];
    return raw
      .replace(/[;|/]/g, ',')            // treat ; | / as commas
      .split(',')
      .map(s => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
  };
}

// ---------- small helpers ----------
const argv = process.argv.slice(2);
const limitArg = argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const DRY_RUN = argv.includes('--dry-run');

function shallowEqualArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------- main ----------
(async () => {
  const { products } = await getCollections();

  // Fetch only needed fields
  const cursor = products.find(
    {},
    { projection: { _id: 1, inci: 1, original_inci_list: 1 } }
  );

  const all = LIMIT ? await cursor.limit(LIMIT).toArray() : await cursor.toArray();
  const total = all.length;
  console.log(`Found ${total} products to process...`);
  if (DRY_RUN) console.log('(dry-run mode: no writes will be performed)');

  let i = 0;
  for (const product of all) {
    i += 1;

    try {
      const inci = Array.isArray(product.inci) ? product.inci : null;
      if (!inci) {
        console.log(`[${i}/${total}] ⏩ No change for product ${product._id}`);
        continue;
      }

      const rawInciString = inci.join(', ');
      const cleanedInciList = splitIngredients(rawInciString);

      const isDifferent = !shallowEqualArray(cleanedInciList, inci);

      if (isDifferent) {
        const updatePayload = {
          $set: {
            inci: cleanedInciList,
          },
        };

        // Only set original_inci_list the first time
        if (!product.original_inci_list) {
          updatePayload.$set.original_inci_list = inci;
        }

        if (!DRY_RUN) {
          await products.updateOne({ _id: product._id }, updatePayload);
        }

        console.log(
          `[${i}/${total}] ✅ Updated product ${product._id}`
        );
      } else {
        console.log(
          `[${i}/${total}] ⏩ No change for product ${product._id}`
        );
      }
    } catch (error) {
      console.error(
        `[${i}/${total}] ❌ Error updating product ${product._id}:`,
        error?.message || String(error)
      );
    }
  }

  // best-effort close if we used our own client
  try { if (__client) await __client.close(); } catch {}

  console.log('🏁 Done.');
})().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
