import type { Request, Response } from 'express';
import { aliasesService } from '../services/aliases.service';

export async function list(_req: Request, res: Response) {
  res.json(await aliasesService.list());
}

export async function create(req: Request, res: Response) {
  const body = (req as any).validated?.body ?? req.body;
  const result = await aliasesService.create(body as any);
  res.status(201).json(result);
}

export async function remove(req: Request, res: Response) {
  const p = (req as any).validated?.params ?? req.params;
  const ok = await aliasesService.remove((p as any).id);
  res.json(ok);
}
