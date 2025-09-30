// /queries/aliases.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAliases, createAlias, deleteAlias } from '@/api/config';

const aliasKeys = {
  all: ['aliases'] as const,
};

export function useAliasesQuery() {
  return useQuery({
    queryKey: aliasKeys.all,
    queryFn: getAliases,
  });
}

export function useCreateAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alias, cosingId }: { alias: string; cosingId: string }) =>
      createAlias(alias, cosingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: aliasKeys.all }),
  });
}

export function useDeleteAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAlias(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: aliasKeys.all }),
  });
}
