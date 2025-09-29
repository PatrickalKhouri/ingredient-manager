import { Router } from 'express';
import { pingDb } from '../config/db';

const r = Router();

r.get('/', (_req, res) => res.json({ ok: true }));

r.get('/deep', async (_req, res, next) => {
  try {
    await pingDb();
    res.json({ ok: true, db: true });
  } catch (e) {
    next(Object.assign(new Error('DB not reachable'), { status: 503 }));
  }
});

export default r;
