import { z } from 'zod';

const suggestionInput = z.object({
  cosingId: z.string(),
  inciName: z.string().optional(),
  score: z.number().optional(),
}).transform((s) => ({
  cosingId: s.cosingId,
  inciName: s.inciName ?? '',
  score: s.score ?? 0,
}));

export const setMatchBody = z.object({
  productId: z.string().min(1),
  cosingId: z.string().nullable().optional(),
  status: z.enum(['auto','manual','rejected']).default('manual'),
  method: z.enum(['exact','alias','fuzzy','manual']).nullable().optional(),
  label: z.string().optional(),
  inciName: z.string().optional(),
  score: z.number().nullable().optional(),
  suggestions: z.array(suggestionInput).optional(),
}).transform((b) => ({
  productId: b.productId,
  cosingId: b.cosingId ?? null,
  status: b.status,
  method: b.method ?? 'manual',
  label: b.label ?? b.inciName ?? '',
  score: b.score ?? null,
  suggestions: b.suggestions ?? [],
}));

export const rematchBody = z.object({
  productId: z.string().min(1),
  label: z.string().min(1),
});

export const unmatchedQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  brand: z.string().trim().optional(),
  ingredient: z.string().trim().optional(),
  productName: z.string().trim().optional(),
});

export const matchIdParams = z.object({
  matchId: z.string().min(1),
});
