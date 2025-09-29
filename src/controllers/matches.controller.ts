import type { Request, Response } from 'express';
import { matchesService } from '../services/matches.service';

export async function getUnmatched(req: Request, res: Response) {
  const q = (req as any).validated?.query ?? req.query;
  res.json(await matchesService.getUnmatched(q as any));
}

export async function manualMatch(req: Request, res: Response) {
  const b = (req as any).validated?.body ?? req.body;
  res.json(await matchesService.manualMatch(b));
}

export async function rejectMatch(req: Request, res: Response) {
  const b = (req as any).validated?.body ?? req.body;
  res.json(await matchesService.reject(b));
}

export async function clearMatch(req: Request, res: Response) {
  const b = (req as any).validated?.body ?? req.body;
  res.json(await matchesService.clear(b));
}

export async function unclassifyNonIngredient(req: Request, res: Response) {
  const p = (req as any).validated?.params ?? req.params;
  res.json(await matchesService.setClassification(String((p as any).matchId), 'ingredient'));
}

export async function markNonIngredient(req: Request, res: Response) {
  const p = (req as any).validated?.params ?? req.params;
  res.json(await matchesService.setClassification(String((p as any).matchId), 'non_ingredient'));
}
