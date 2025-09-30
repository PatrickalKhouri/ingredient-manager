export const COLL = {
  PRODUCTS: 'shop_products',
  MATCHES: 'matches',
  COSING: 'cosing_ingredients',
  ALIASES: 'cosing_aliases',
  PRODUCTS_SCORES: 'products_scores',
  SCORING_HISTORIES: 'scoring_histories',
} as const;
  
  export type CollectionKey = keyof typeof COLL;
  export type CollectionName = typeof COLL[CollectionKey];
  