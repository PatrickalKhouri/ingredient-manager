import { z } from 'zod';

export const createAliasBody = z.object({
  alias: z.string().trim().min(1),
  cosingId: z.string().trim().min(1),
});

export const aliasIdParams = z.object({
  id: z.string().trim().min(1),
});
