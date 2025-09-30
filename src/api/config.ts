import { Suggestion, UnmatchedIngredientsParams } from '../types/matches';
import type {
  ProductListParams,
  ProductsListResponse,
  ProductDetail,
  ProductsMatchingSummary,
} from '../types/products';
import { MatchMethod } from '../queries/matches';

export const API = process.env.NEXT_PUBLIC_API_URL ?? '/api';

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// Products
export async function getProducts(params?: ProductListParams) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.sort)   qs.set('sort', params.sort);
  if (params?.dir)    qs.set('dir', params.dir);
  if (params?.page)   qs.set('page', String(params.page));
  if (params?.limit)  qs.set('limit', String(params.limit));
  if (params?.brand)  qs.set('brand', params.brand);
  const url = `${API}/products${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  return asJson<ProductsListResponse>(res);
}

export async function getProduct(productId: string) {
  const res = await fetch(`${API}/products/${productId}`, { cache: 'no-store' });
  return asJson<ProductDetail>(res);
}

export const matchProduct = (id: string) => fetch(`${API}/products/${id}/match`, { method:'POST' }).then(asJson);


export async function getBrands(): Promise<string[]> {
  const res = await fetch(`${API}/products/brands`);
  if (!res.ok) throw new Error('Failed to fetch brands');
  return res.json() as Promise<string[]>;
}

// Matches
export const manualMatch = (payload: {
  productId: string;
  label: string;        // ingredient label as shown in the product
  cosingId: string;
  score?: number | null;
  method?: MatchMethod;
  suggestions?: Suggestion[]; 
}) =>
fetch(`${API}/matches/manual`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
}).then(asJson);


export const reject = (payload: {
productId: string;
label: string;
suggestions?: Suggestion[];
}) =>
fetch(`${API}/matches/reject`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
}).then(asJson);


export const clearMatch = (payload: {
  productId: string;
  label: string;
}) =>
  fetch(`${API}/matches/rematch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(asJson);


export const getUnmatchedIngredients = async (
  params?: UnmatchedIngredientsParams
) => {
  const query = new URLSearchParams();

  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.brand) query.set('brand', params.brand);
  if (params?.ingredient) query.set('ingredient', params.ingredient);
  if (params?.productName) query.set('productName', params.productName);

  const res = await fetch(`${API}/matches/unmatched?${query.toString()}`, {
    method: 'GET',
  });

  return asJson(res);
};

export const unclassifyNonIngredient = async (matchId: string) => {
  const res = await fetch(`${API}/matches/${matchId}/unclassify`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const markNonIngredient = async (matchId: string) => {
  const res = await fetch(`${API}/matches/${matchId}/non-ingredient`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

// CosIng search + Aliases
export const searchCosing = (q: string) =>
  fetch(`${API}/cosing/search?q=${encodeURIComponent(q)}`).then(asJson);

export const createAlias = (alias: string, cosingId: string) =>
  fetch(`${API}/aliases`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ alias, cosingId }) }).then(asJson);

export async function getAliases() {
    const res = await fetch(`${API}/aliases`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch aliases');
    return res.json();
  }
  
export async function deleteAlias(id: string) {
  const res = await fetch(`${API}/aliases/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete alias');
  return res.json();
}
  

export async function getProductsMatchingSummary(params?: { brand?: string }) {
  const qs = new URLSearchParams();
  if (params?.brand) qs.set('brand', params.brand);
  const url = `${API}/products/matching-summary${qs.toString() ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  return asJson<ProductsMatchingSummary>(res);
}