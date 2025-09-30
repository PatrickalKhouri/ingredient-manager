import 'dotenv/config';

const get = (k: string, d?: string) => process.env[k] ?? d ?? (() => { throw new Error(`Missing env ${k}`) })();

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4001),
  MONGO_URI: get('MONGO_URI'),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
};
