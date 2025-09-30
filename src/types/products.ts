// src/types/products.ts

export type SortKey =
  | 'matched_pct'
  | 'createdTime'
  | 'found_percents'
  | 'soldCount'
  | 'rating_100';

export type SortDir = 'asc' | 'desc';

export interface ProductListParams {
  search?: string;
  sort?: SortKey;
  dir?: SortDir;
  page?: number;
  limit?: number;
  brand?: string;
}

export interface ProductListItem {
  _id: string;
  brand: string | null;
  slug: string | null;
  createdTime: string | null;     // or Date if you convert
  found_percents: number | null;
  matchedPct: number;
  matched: number;
  total: number;
  title: string | null;
  translations: Translations;
  manualCount?: number;
}

interface Translations {
  en: { title: string };
  fr: { title: string };
  es: { title: string };
  it: { title: string };
}

export interface ProductsListResponse {
  items: ProductListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ✅ Product detail used by the Product page after the Mongo refactor
// Stats fields are optional for now (you said we’ll add stats later)
import type { MatchRow, UnmatchedRow, Suggestion } from './matches';

export interface ProductDetail {
  id: string;
  brand: string | null;
  name: string | null;     // ← keep name; header renders "brand — name"
  slug: string | null;
  createdTime: string | null;

  // Product ingredients we show read-only
  ingredientsRaw: string[];

  // Matching payload
  matches: MatchRow[];
  unmatched: UnmatchedRow[];
  nonIngredients?: NonIngredientRow[];
  // Suggestions keyed by piId
  suggestions: Record<string, Suggestion[]>;

  // Optional stats (not shown yet, but keep to avoid breaking callers)
  matchedCount?: number;
  total?: number;
  matchedPct?: number;
  found_percents?: number | null;
}

export interface NonIngredientRow {
  product_ingredient: string;
  matchId: string;
}

export type ProductsMatchingSummary = {
  totalProducts: number;
  fullyMatched: number;
  percentFullyMatched: number; // 0–100
};