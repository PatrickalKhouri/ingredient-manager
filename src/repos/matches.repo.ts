import { ObjectId } from 'mongodb';
import stringSimilarity from 'string-similarity';
import { getCollections } from '../config/get-collections';
import { COLL } from '../config/collections';
import { normalizeIngredient, generateCandidates, normalizeLabel } from '../common/text.util';

type Suggestion = { cosingId: string; inciName: string; score: number };

let cosingCache: Array<{ id: string; name: string }> | null = null;

export async function ensureCosingCache() {
  if (cosingCache) return cosingCache;
  const { cosing } = await getCollections();
  const docs = await cosing.find({}, { projection: { _id: 1, inci_name: 1 } }).toArray();
  cosingCache = docs.map((d) => ({ id: String(d._id), name: d.inci_name }));
  return cosingCache;
}

async function setMatch({
  productId,
  cosingId,
  status,
  method,
  label,
  score,
  suggestions,
}: {
  productId: string;
  cosingId: string | null;
  status: 'auto' | 'manual' ;
  method: 'exact' | 'alias' | 'fuzzy' | 'manual' | null;
  label: string;
  score?: number | null;
  suggestions?: Suggestion[];
}) {
  const { matches } = await getCollections();
  const labelNorm = normalizeLabel(label);

  const match = await matches.findOne({ productId, labelNormalized: labelNorm });
  await matches.deleteOne({ _id : match?._id });

  const now = new Date();
  const doc = {
    productId,
    label,
    labelNormalized: labelNorm,
    cosingId,
    cosingInciName: null as string | null, // optional: fill when known
    status,
    method,
    score: score ?? null,
    suggestions: suggestions ?? [],
    classification: match?.classification ? match.classification : 'ingredient' as const,
    createdAt: now,
    updatedAt: now,
  };
  const created = await matches.insertOne(doc);
  return created.insertedId;
}


export async function buildSuggestions(label: string, allCosings: Array<{ id: string; name: string }>) {

  console.log('label', label);
  console.log('allCosings', allCosings.length);
  
  const sims = allCosings.map((c) => ({
    cosingId: c.id,
    inciName: c.name,
    score: stringSimilarity.compareTwoStrings(label, c.name),
  }));

  sims.sort((a, b) => b.score - a.score);

  console.log('sims after sort', sims);
  
  // return top 5 suggestions with score >= 0.3
  return sims.filter((s) => s.score >= 0.3).slice(0, 5);
}

async function autoMatchOne(label: string, productId: string) {
  const { matches, cosing, aliases } = await getCollections();

  const candidates = generateCandidates(label);

  // A) exact cosing.inci_name
  for (const cand of candidates) {
    const exact = await cosing.findOne({ inci_name: cand }, { projection: { _id: 1 } });
    if (exact) {
      await setMatch({
        productId,
        cosingId: String(exact._id),
        status: 'auto',
        method: 'exact',
        label,
        score: 1.0,
      });
      return;
    }
  }

  // B) alias by aliasNormalized
  for (const cand of candidates) {
    const aliasNorm = normalizeLabel(cand);
    const aliasDoc = await aliases.findOne(
      { aliasNormalized: aliasNorm },
      { projection: { cosingId: 1, confidence: 1 } },
    );
    if (aliasDoc) {
      const cosingId = String(aliasDoc.cosingId);
      await setMatch({
        productId,
        label: cand,
        cosingId,
        status: 'auto',
        method: 'alias',
        score: typeof aliasDoc.confidence === 'number' ? aliasDoc.confidence : 0.99,
      });
      return;
    }
  }

  // C) fuzzy suggestions (cache)
  const cosingCache = await ensureCosingCache();

  for (const cand of candidates) {
    const sims = await buildSuggestions(cand, cosingCache);
    console.log('sims', sims);
    sims.sort((a, b) => b.score - a.score);
    const best = sims[0];

    if (best && best.score >= 0.45) {
      await setMatch({
        productId,
        cosingId: null,
        status: 'auto',
        method: 'fuzzy',
        label,
        score: best.score,
        suggestions: sims.slice(0, 5),
      });
      return;
    }

    // D) unmatched
    await setMatch({
      productId,
      cosingId: null,
      status: 'auto',
      method: null,
      label,
    });
  }
}

export const matchesRepo = {
  // used by POST /products/:id/match
  async matchProduct(productId: string) {
    const { products, matches } = await getCollections();

    if (!ObjectId.isValid(productId)) {
      const err = new Error('Invalid product id') as any;
      err.status = 400;
      throw err;
    }
    const _id = new ObjectId(productId);

    const product = await products.findOne({ _id }, { projection: { inci: 1 } });
    if (!product) {
      const err = new Error('Product not found') as any;
      err.status = 404;
      throw err;
    }

    const inciArr: string[] = Array.isArray((product as any).inci) ? (product as any).inci : [];
    const pis = inciArr.map((inci) => ({ normalizedText: normalizeIngredient(inci) }));
    


    for (const pi of pis) {
      await autoMatchOne(pi.normalizedText, String(_id));
    }

    return { productId: String(_id) };
  },

  async getUnmatched(filters: { page?: number; limit?: number; brand?: string; ingredient?: string; productName?: string }) {
    const { matches } = await getCollections();
  
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
  
    // --- product-level filters ---
    const productFilter: any = {};
    if (filters.brand?.trim()) {
      productFilter.brand = filters.brand.trim();
    }
    if (filters.productName?.trim()) {
      const esc = filters.productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      productFilter['translations.en.title'] = { $regex: esc, $options: 'i' };
    }
  
    // --- ingredient-level filter ---
    const ingredientFilter =
      filters.ingredient?.trim()
        ? { label: new RegExp(filters.ingredient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        : {};
  
    const baseStages = [
      {
        $match: {
          $and: [
            { $or: [{ cosingId: null }, { cosingId: { $exists: false } }] },
            { classification: { $ne: 'non_ingredient' } },
            ingredientFilter,
          ],
        },
      },
      {
        $addFields: {
          productIdObj: {
            $switch: {
              branches: [
                { case: { $eq: [{ $type: '$productId' }, 'objectId'] }, then: '$productId' },
                {
                  case: {
                    $and: [
                      { $eq: [{ $type: '$productId' }, 'string'] },
                      { $regexMatch: { input: '$productId', regex: /^[0-9a-fA-F]{24}$/ } },
                    ],
                  },
                  then: { $toObjectId: '$productId' },
                },
              ],
              default: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: COLL.PRODUCTS,
          localField: 'productIdObj',
          foreignField: '_id',
          as: 'product',
          pipeline: Object.keys(productFilter).length ? [{ $match: productFilter }] : [],
        },
      },
      { $unwind: '$product' },
    ] as any[];
  
    const itemsPipeline = [
      ...baseStages,
      {
        $project: {
          matchId: '$_id',                // ✅ expose match id
          ingredient: '$label',           // ✅ FE expects "ingredient"
          suggestions: { $ifNull: ['$suggestions', []] },
          'product._id': 1,
          'product.name': 1,
          'product.brand': 1,
          'product.translations.en.title': 1,
        },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    const countPipeline = [
      ...baseStages,
      { $count: 'total' },
    ];
  
    const [items, totalRow] = await Promise.all([
      matches.aggregate(itemsPipeline).toArray(),
      matches.aggregate(countPipeline).toArray(),
    ]);
  
    const total = totalRow?.[0]?.total ?? 0;
  
    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
  
  ,
  async manualMatch(b: {
    productId: string;
    label: string;
    cosingId: string;
    status?: 'auto'|'manual';
    method?: 'exact'|'alias'|'fuzzy'|'manual'|null;
    score?: number|null;
    suggestions?: Suggestion[];
  }) {
    console.log('productId', b.productId);
    await setMatch({
      productId: b.productId,
      cosingId: b.cosingId,
      status: 'manual',
      method: b.method ?? 'manual',
      label: b.label,
      score: b.score ?? null,
      suggestions: b.suggestions ?? [],
    });
    return { ok: true };
  },

  async clear(b: { productId: string; label: string }) {
    const { matches } = await getCollections();
    await matches.deleteOne({
      productId: b.productId,
      labelNormalized: normalizeLabel(b.label),
    });

    await autoMatchOne(normalizeLabel(b.label), b.productId);
    // re-create as unmatched (visible)
    // await setMatch({
    //   productId: b.productId,
    //   cosingId: null,
    //   status: 'auto',
    //   method: null,
    //   label: b.label,
    // });
    return { ok: true };
  },

  async setClassification(matchId: string, classification: 'ingredient' | 'non_ingredient') {
    const { matches } = await getCollections();
    const _id = ObjectId.isValid(matchId) ? new ObjectId(matchId) : (matchId as any);
  
    const match = await matches.findOne(
      { _id },
      { projection: { labelNormalized: 1 } }
    );
  
    if (!match) {
      const err: any = new Error('Match not found');
      err.status = 404;
      throw err;
    }
  
    const res = await matches.updateMany(
      { labelNormalized: match.labelNormalized },
      { $set: { classification, updatedAt: new Date() } }
    );
  
    return { ok: res.modifiedCount > 0, updated: res.modifiedCount };
  },

  async cleanupGhostMatches(productId: string, currentInciList: string[]) {
    const { matches } = await getCollections();
  
    const normalizedSet = new Set(currentInciList.map(normalizeIngredient));
  
    const ghostMatches = await matches.find({
      productId,
      labelNormalized: { $nin: Array.from(normalizedSet) },
    }).toArray();

    console.log('ghostMatches', ghostMatches);

    await matches.deleteMany({
      productId,
      labelNormalized: { $nin: Array.from(normalizedSet) },
    });
  }
};
