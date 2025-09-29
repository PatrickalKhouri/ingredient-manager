import { aliasesRepo } from '../repos/aliases.repo';

export const aliasesService = {
  list:   () => aliasesRepo.list(),
  create: (b: any) => aliasesRepo.create(b),
  remove: (id: string) => aliasesRepo.remove(id),
};
