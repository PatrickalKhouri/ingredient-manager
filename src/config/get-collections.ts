// src/config/get-collections.ts
import type { Collection } from 'mongodb';
import { getDb } from './db';
import { COLL } from './collections';

export async function getCollections(): Promise<{
  products: Collection;
  matches: Collection;
  cosing: Collection;
  aliases: Collection;
}> {
  const db = await getDb();
  return {
    products: db.collection(COLL.PRODUCTS),
    matches: db.collection(COLL.MATCHES),
    cosing: db.collection(COLL.COSING),
    aliases: db.collection(COLL.ALIASES),
  } as const;
}
