import { createServer } from 'http';
import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { getDb } from './config/db';

async function main() {
  // warm up DB connection at boot (optional but nice)
  await getDb();

  const app = await buildApp();
  createServer(app).listen(env.PORT, () => {
    logger.info({ port: env.PORT }, `API listening on :${env.PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
