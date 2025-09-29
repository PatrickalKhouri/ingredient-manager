import type { Request, Response } from 'express';
import { cosingService } from '../services/cosing.service';

export async function search(req: Request, res: Response) {
  const q = (req as any).validated?.query ?? req.query;     // { q }
  res.json(await cosingService.search(q as any));
}

export async function list(req: Request, res: Response) {
  const q = (req as any).validated?.query ?? req.query;     // { q?, page, limit }
  res.json(await cosingService.list(q as any));
}
