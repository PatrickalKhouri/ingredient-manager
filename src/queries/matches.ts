import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { manualMatch, clearMatch, getUnmatchedIngredients, markNonIngredient, unclassifyNonIngredient } from '../api/config';
import { useCallback } from 'react';
import { Suggestion, UnmatchedIngredient, UnmatchedIngredientsParams } from '../types/matches';

export type MatchMethod = 'exact' | 'alias' | 'fuzzy' | 'manual' | null;

// helper to invalidate a product detail by id
function useInvalidateProductDetail() {
  const qc = useQueryClient();
  return useCallback(
    (productId: string) =>
      qc.invalidateQueries({ queryKey: ['products', 'detail', productId] }),
    [qc]
  );
}

export function useManualMatch(productId: string, onSuccess?: () => void) {
  const invalidate = useInvalidateProductDetail();
  return useMutation({
    mutationFn: (payload: {
      label: string;
      cosingId: string;
      score?: number | null;
      method?: MatchMethod;
      suggestions?: Suggestion[];
    }) => manualMatch({ productId, ...payload }),
    onSuccess: () => {
      invalidate(productId);
      onSuccess?.();
    },
  });
}

export function useReject(productId: string) {
  const invalidate = useInvalidateProductDetail();
  return useMutation({
    mutationFn: (payload: { label: string; suggestions?: Suggestion[] }) =>
      reject({ productId, ...payload }),
    onSuccess: () => invalidate(productId),
  });
}

export function useClearMatch(productId: string) {
  const invalidate = useInvalidateProductDetail();
  return useMutation({
    mutationFn: (payload: { label: string }) =>
      clearMatch({ productId, ...payload }),
    onSuccess: () => invalidate(productId),
  });
}

/** ✅ Unmatched ingredients query with filters + pagination */
export function useGetUnmatchedIngredients(params?: UnmatchedIngredientsParams) {
  return useQuery({
    queryKey: ['matches', 'unmatched', params],
    queryFn: () =>
      getUnmatchedIngredients(params) as Promise<{
        items: UnmatchedIngredient[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      }>,
  });
}

export function useMarkNonIngredient(onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    // pass { matchId, productId? } so we can invalidate product detail if provided
    mutationFn: (args: { matchId: string; productId?: string }) => markNonIngredient(args.matchId),
    onSuccess: (_data, vars) => {
      // refresh unmatched list and (optionally) product detail
      qc.invalidateQueries({ queryKey: ['matches', 'unmatched'] });
      if (vars.productId) {
        qc.invalidateQueries({ queryKey: ['products', 'detail', vars.productId] });
      }
      onSuccess?.();
    },
  });
}

// (already added earlier)
// Unclassify (reset back to unmatched)
export function useUnclassifyNonIngredient(onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => unclassifyNonIngredient(matchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches', 'unmatched'] });
      onSuccess?.();
    },
  });
}
