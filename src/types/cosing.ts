export interface CosIngSearchItem {
    id: string;            // COSING _id
    inciName: string;      // INCI display name
    score?: number;        // optional relevance/score (backend may include it)
  }
  