import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProductListParams } from '../types/products';
import {
  getProducts,
  getProduct,
  matchProduct,
  getBrands,
  getProductsMatchingSummary,
  updateIngredients,
} from '../api/config';

const keys = {
  all: ['products'] as const,
  list: (params?: ProductListParams) => [...keys.all, 'list', params] as const,
  detail: (id: string) => [...keys.all, 'detail', id] as const,
  brands: ['products', 'brands'] as const,
  matchingSummary: (params?: { brand?: string }) => [...keys.all, 'matching-summary', params] as const,
};

export function useProductsQuery(params?: ProductListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => getProducts(params),
  });
}

export function useProductDetailQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: keys.detail(id),
    queryFn: () => getProduct(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useMatchProduct(id: string, onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => matchProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.detail(id) });
      onSuccess?.();
    },
  });
}

export function useBrandsQuery() {
  return useQuery({
    queryKey: keys.brands,
    queryFn: () => getBrands(),
  });
}

export function useProductsMatchingSummary(params?: { brand?: string }) {
  return useQuery({
    queryKey: keys.matchingSummary(params),
    queryFn: () => getProductsMatchingSummary(params),
    staleTime: 60_000,
  });
}

export function useUpdateIngredients(productId: string, onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ingredientsText: string) => updateIngredients(productId, ingredientsText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.detail(productId) });
      onSuccess?.();
    },
  });
}