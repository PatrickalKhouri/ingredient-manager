// src/queries/keys.ts
import type { ProductListParams } from '../types/products';
import type { QueryKey } from '@tanstack/react-query';

export const qk = {
  products: {
    all: ['products'] as const,
    lists: () => [...qk.products.all, 'list'] as const,
    list: (params: ProductListParams = {}) =>
      [...qk.products.lists(), params] as const satisfies QueryKey,
    details: () => [...qk.products.all, 'detail'] as const,
    detail: (id: string) =>
      [...qk.products.details(), id] as const satisfies QueryKey,
  },
};
