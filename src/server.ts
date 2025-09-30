import { createServer } from 'http';
import { env } from './config/env';
import { logger } from './config/logger';
import { getDb } from './config/db';

async function main() {
  // warm up DB connection at boot (optional but nice)
  await getDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
