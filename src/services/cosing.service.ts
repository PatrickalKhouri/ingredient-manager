import { cosingRepo } from '../repos/cosing.repo';

export const cosingService = {
  search: (q: { q: string }) => cosingRepo.search(q),
  list:   (q: any) => cosingRepo.list(q),
};
