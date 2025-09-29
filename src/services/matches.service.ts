import { matchesRepo } from '../repos/matches.repo';

export const matchesService = {
  getUnmatched: (q: any) => matchesRepo.getUnmatched(q),
  manualMatch: (b: any) => matchesRepo.manualMatch(b),
  reject:      (b: any) => matchesRepo.reject(b),
  clear:       (b: any) => matchesRepo.clear(b),
  setClassification: (matchId: string, classification: 'ingredient' | 'non_ingredient') =>
    matchesRepo.setClassification(matchId, classification),
};
