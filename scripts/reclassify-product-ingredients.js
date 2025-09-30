try { require('dotenv').config(); } catch {}

const path = require('path');

function tryRequire(p) {
  try { return require(p); } catch { return null; }
}

// ---------- resolve imports (build first, then TS via ts-node) ----------
let getCollections =
  tryRequire(path.join(process.cwd(), 'build', 'src', 'config', 'get-collections'))?.getCollections;
let splitIngredients =
  tryRequire(path.join(process.cwd(), 'build', 'src', 'common', 'text.util'))?.splitIngredients;

if (!getCollections || !splitIngredients) {
  // Use ts-node for TS sources without changing your app
  try { require('ts-node/register/transpile-only'); } catch (e) {
    console.error('Unable to load ts-node/register. Install with: npm i -D ts-node typescript');
    process.exit(1);
  }
  if (!getCollections) {
    getCollections =
      tryRequire(path.join(process.cwd(), 'src', 'config', 'get-collections'))?.getCollections;
  }
  if (!splitIngredients) {
    splitIngredients =
      tryRequire(path.join(process.cwd(), 'src', 'common', 'text.util'))?.splitIngredients;
  }
}

if (!getCollections || typeof splitIngredients !== 'function') {
  console.error('❌ Could not import required modules.');
  console.error('   Expected: src/config/get-collections.ts exporting getCollections()');
  console.error('             src/common/text.util.ts exporting splitIngredients(string): string[]');
  process.exit(1);
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

  console.log('🏁 Done.');
})().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
