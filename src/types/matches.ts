// src/types/matches.ts

export type MatchStatus = 'auto' | 'manual' | 'rejected';
export type MatchMethod = 'exact' | 'alias' | 'fuzzy' | 'token_set' | null;

export interface MatchRow {
  piId: string;                         // identifier for the product-ingredient “row”
  product_ingredient: string;           // raw label from the product
  cosingId: string | null;              // matched COSING _id or null
  cosing_ingredient: string | null;     // matched COSING INCI name or null
  status: MatchStatus;                  // auto | manual | rejected
  method: MatchMethod;                  // exact | alias | fuzzy | token_set | null
  score: number | null;                 // similarity/score if applicable
  position?: number;
  suggestions?: Suggestion[];
  // extra CosIng metadata
  functions?: string[];
  concerns?: Concerns[]; 
  manualClassification?: string | null; 
}

export interface Concerns {
  level: string;
  concern: string;
}

export interface UnmatchedRow {
  product_ingredient: string;
  position?: number;
  suggestions: Suggestion[];
}

export interface UnmatchedIngredient {
  _id: string;
  ingredient: string;
  suggestions?: Array<{
    cosingId: string;
    inciName: string;
    score: number;
  }>;
  product: {
    _id: string;
    translations: {
      en: {
        title: string;
      };
    };
    brand: string;
  };
}

export interface Suggestion {
  cosingId: string;
  inciName: string;
  score: number;                        // 0..1 (fuzzy) or whatever scale you use
}

export type UnmatchedIngredientsParams = {
  page?: number;
  limit?: number;
  brand?: string;
  ingredient?: string;
  productName?: string;
};