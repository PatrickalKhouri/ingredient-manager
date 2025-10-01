import { scoringRepo } from '../repos/scoring.repo';

export const scoringService = {
  evaluateRule1: (productId: string) =>
    scoringRepo.evaluateRule1AndPersist(productId),
};
