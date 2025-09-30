// /queries/cosing.ts
import { useQuery } from '@tanstack/react-query';
import { searchCosing } from '@/api/config';

export function useSearchCosing(q: string) {
  return useQuery({
    queryKey: ['cosing', 'search', q],
    queryFn: () => searchCosing(q),
    enabled: q.trim().length >= 2,
    staleTime: 60_000, // cache short-term to reduce calls while typing
  });
}
