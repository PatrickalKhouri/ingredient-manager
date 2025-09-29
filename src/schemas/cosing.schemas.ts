import { z } from 'zod';

export const cosingSearchQuery = z.object({
  // allow empty string (Nest returns [] when blank)
  q: z.string().trim().default(''),
});

export const cosingListQuery = z.object({
  q: z.string().trim().optional(),                     // search by inci_name
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});
