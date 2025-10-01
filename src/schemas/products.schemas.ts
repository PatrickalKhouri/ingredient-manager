import { z } from 'zod';

export const listProductsQuery = z.object({
  search: z.string().trim().optional(),
  sort: z.enum(['createdTime','matched_pct','found_percents','soldCount','rating_100']).optional(),
  dir: z.enum(['asc','desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  brand: z.string().trim().optional(),
});

export const productIdParams = z.object({
  productId: z.string().min(1),
});

export const matchingSummaryQuery = z.object({
  brand: z.string().trim().optional(),
});
export const updateIngredientsBody = z.object({
  ingredientsText: z.string().optional(),
  ingredients: z.array(z.string().min(1)).optional(),
}).refine(
  (v) => (v.ingredientsText && v.ingredientsText.trim().length > 0) || (v.ingredients && v.ingredients.length > 0),
  { message: 'Provide ingredientsText or ingredients[]' },
);