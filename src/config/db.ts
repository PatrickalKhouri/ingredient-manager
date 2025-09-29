import { MongoClient, Db } from 'mongodb';
import { env } from './env';
import { logger } from './logger';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  client = await MongoClient.connect(env.MONGO_URI);
  db = client.db(); // uses DB from URI
  logger.info('MongoDB connected');
  return db;
}

export async function pingDb(): Promise<boolean> {
  const d = await getDb();
  const admin = d.admin();
  await admin.ping();
  return true;
}
