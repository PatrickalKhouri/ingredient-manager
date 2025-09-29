export const COLL = {
    PRODUCTS: 'shop_products',
    MATCHES: 'matches',
    COSING: 'cosing_ingredients',
    ALIASES: 'cosing_aliases',
  } as const;
  
  export type CollectionKey = keyof typeof COLL;
  export type CollectionName = typeof COLL[CollectionKey];
  