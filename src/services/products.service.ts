import { productsRepo } from '../repos/products.repo';
import { matchesRepo } from '../repos/matches.repo';

export const productsService = {
  esc(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  async list(query: {
    search?: string;
    sort?: 'createdTime'|'matched_pct'|'found_percents'|'soldCount'|'rating_100';
    dir?: 'asc'|'desc';
    page?: number;
    limit?: number;
    brand?: string;
  }) {
    return productsRepo.list(query);
  },

  async listBrands() {
    return productsRepo.listBrands();
  },

  async getMatchingSummary(filter: Record<string, any> = {}) {
    return productsRepo.getMatchingSummary(filter);
  },

  async detail(productId: string) {
    return productsRepo.detail(productId);
  },

  async matchProduct(productId: string) {
    return matchesRepo.matchProduct(productId);
  },
};
