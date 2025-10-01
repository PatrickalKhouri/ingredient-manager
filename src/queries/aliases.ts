// /queries/aliases.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAliases, createAlias, deleteAlias } from '../api/config';

const aliasKeys = {
  all: ['aliases'] as const,
};

export function useAliasesQuery() {
  return useQuery({
    queryKey: aliasKeys.all,
    queryFn: getAliases,
  });
}

export function useCreateAlias(onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alias, cosingId }: { alias: string; cosingId: string }) =>
      createAlias(alias, cosingId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: aliasKeys.all });
      onSuccess?.();
    },
  });
}

export function useDeleteAlias(onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAlias(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: aliasKeys.all });
      onSuccess?.();
    },
  });
}
