try { require('dotenv').config(); } catch {}

const path = require('path');
const { ObjectId } = require('mongodb');

function tryRequire(p) {
  try { return require(p); } catch { return null; }
}

// Prefer compiled build/* if present
let getCollections = tryRequire(path.join(process.cwd(), 'build', 'src', 'config', 'get-collections'))?.getCollections;
let matchesRepo = tryRequire(path.join(process.cwd(), 'build', 'src', 'repos', 'matches.repo'))?.matchesRepo;

// Fallback to TS sources via ts-node (no app changes needed)
if (!getCollections || !matchesRepo) {
  try {
    require('ts-node/register/transpile-only'); // allow importing TS directly
  } catch (e) {
    console.error('Unable to load ts-node/register. Install it with: npm i -D ts-node typescript');
    process.exit(1);
  }
  if (!getCollections) {
    getCollections = tryRequire(path.join(process.cwd(), 'src', 'config', 'get-collections'))?.getCollections;
  }
  if (!matchesRepo) {
    matchesRepo = tryRequire(path.join(process.cwd(), 'src', 'repos', 'matches.repo'))?.matchesRepo;
  }
}

if (!getCollections || !matchesRepo?.matchProduct) {
  console.error('❌ Could not import required modules.');
  console.error('   Expected: src/config/get-collections.ts exporting getCollections()');
  console.error('             src/repos/matches.repo.ts exporting matchesRepo.matchProduct(productId)');
  process.exit(1);
}

(async () => {
  const { products, matches } = await getCollections();

  // 1) wipe matches
  const del = await matches.deleteMany({});
  console.log(`🧹 Deleted ${del.deletedCount ?? 0} existing matches. Starting fresh...`);

  // 2) fetch all product ids (lean)
  const cursor = products.find({}, { projection: { _id: 1 } });
  const ids = await cursor.toArray();
  console.log(`📦 Found ${ids.length} products, starting rematch...`);

  // 3) sequentially rematch
  let i = 0;
  for (const doc of ids) {
    i += 1;
    const id = String(doc._id instanceof ObjectId ? doc._id : doc._id);
    try {
      await matchesRepo.matchProduct(id);
      console.log(`[${i}/${ids.length}] ✅ Matched product ${id}`);
    } catch (err) {
      console.error(
        `[${i}/${ids.length}] ❌ Error matching product ${id}:`,
        err?.message || String(err)
      );
    }
  }

  console.log('🏁 Done.');
})().catch((err) => {
  console.error('Fatal error in rematch-all-products:', err);
  process.exit(1);
});
