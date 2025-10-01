// src/repos/products.repo.ts
import { ObjectId } from 'mongodb';
import { getCollections } from '../config/get-collections';
import { COLL } from '../config/collections';
import { normalizeLabel, splitIngredients } from '../common/text.util';

type ListQuery = {
  search?: string;
  sort?: 'createdTime'|'matched_pct'|'found_percents'|'soldCount'|'rating_100';
  dir?: 'asc'|'desc';
  page?: number;
  limit?: number;
  brand?: string;
};

const ALLOWED_SORT = new Set(['createdTime','matched_pct','found_percents','soldCount','rating_100']);

export const productsRepo = {
  async list(query: ListQuery) {
    const { products } = await getCollections();

    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const sortDir = (query.dir ?? 'desc') === 'asc' ? 1 : -1;

    const requested = query.sort ?? 'createdTime';
    const sortKey = ALLOWED_SORT.has(requested) ? requested : 'createdTime';

    const filter: any = {};
    const term = query.search?.trim();
    if (term) {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { brand: new RegExp(esc, 'i') },
        { slug: new RegExp(esc, 'i') },
        { ean: new RegExp(esc, 'i') },
        { sku: new RegExp(esc, 'i') },
        { 'translations.en.title': new RegExp(esc, 'i') },
      ];
    }
    if (query.brand?.trim()) filter.brand = query.brand.trim();

    const sortStage: Record<string, 1 | -1> =
      sortKey === 'matched_pct' ? { matchedPct: sortDir } : { [sortKey]: sortDir };

    const pipeline = [
      { $match: filter },

      // join matches for each product
      {
        $lookup: {
          from: COLL.MATCHES,
          let: { pid: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$productId', '$$pid'] } } },
            { $project: { cosingId: 1, classification: 1, method: 1, status: 1 } },
          ],
          as: 'matchDocs',
        },
      },

      // compute totals/manualCount
      {
        $addFields: {
          total: {
            $size: {
              $filter: {
                input: '$matchDocs',
                as: 'm',
                cond: { $ne: ['$$m.classification', 'non_ingredient'] },
              },
            },
          },
          matched: {
            $size: {
              $filter: {
                input: '$matchDocs',
                as: 'm',
                cond: {
                  $and: [
                    { $ne: ['$$m.cosingId', null] },
                    { $ne: ['$$m.classification', 'non_ingredient'] },
                  ],
                },
              },
            },
          },
          manualCount: {
            $size: {
              $filter: {
                input: '$matchDocs',
                as: 'm',
                cond: {
                  $or: [
                    { $eq: ['$$m.method', 'alias'] },
                    { $eq: ['$$m.status', 'manual'] },
                  ],
                },
              },
            },
          },
        },
      },

      // matched percentage
      {
        $addFields: {
          matchedPct: {
            $cond: [
              { $gt: ['$total', 0] },
              { $round: [{ $multiply: [{ $divide: ['$matched', '$total'] }, 100] }, 0] },
              0,
            ],
          },
        },
      },

      { $sort: sortStage },
      { $skip: (page - 1) * limit },
      { $limit: limit },

      {
        $project: {
          _id: 1,
          brand: 1,
          slug: 1,
          createdTime: 1,
          found_percents: 1,
          matchedPct: 1,
          matched: 1,
          total: 1,
          manualCount: 1,
          translations: 1,
        },
      },
    ];

    const [items, total] = await Promise.all([
      products.aggregate(pipeline).toArray(),
      products.countDocuments(filter),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async listBrands() {
    const { products } = await getCollections();
    const brands = await products.distinct('brand', { brand: { $ne: null } });
    return (brands as string[]).sort();
  },

  async getMatchingSummary(filter: Record<string, any> = {}) {
    const { products } = await getCollections();

    const pipeline = [
      { $match: filter },

      {
        $lookup: {
          from: COLL.MATCHES,
          let: { pid: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$productId', '$$pid'] } } },
            { $project: { cosingId: 1, classification: 1, method: 1, status: 1 } },
          ],
          as: 'matchDocs',
        },
      },

      {
        $addFields: {
          total: {
            $size: {
              $filter: {
                input: '$matchDocs',
                as: 'm',
                cond: { $ne: ['$$m.classification', 'non_ingredient'] },
              },
            },
          },
          matched: {
            $size: {
              $filter: {
                input: '$matchDocs',
                as: 'm',
                cond: {
                  $and: [
                    { $ne: ['$$m.cosingId', null] },
                    { $ne: ['$$m.classification', 'non_ingredient'] },
                  ],
                },
              },
            },
          },
        },
      },

      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          fullyMatched: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$total', 0] }, { $eq: ['$matched', '$total'] }] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          totalProducts: 1,
          fullyMatched: 1,
          percentFullyMatched: {
            $cond: [
              { $gt: ['$totalProducts', 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ['$fullyMatched', '$totalProducts'] }, 100] },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
    ];

    const [row] = await products.aggregate(pipeline).toArray();
    return row ?? { totalProducts: 0, fullyMatched: 0, percentFullyMatched: 0 };
  },

  async detail(productId: string) {
    const { products, matches } = await getCollections();

    if (!ObjectId.isValid(productId)) {
      const err = new Error('Invalid product id') as any;
      err.status = 400;
      throw err;
    }

    const _id = new ObjectId(productId);
    const product = await products.findOne({ _id });
    if (!product) {
      const err = new Error('Product not found') as any;
      err.status = 404;
      throw err;
    }

    const ingredientsRaw: string[] = Array.isArray((product as any).ingredientsRaw)
      ? (product as any).ingredientsRaw
      : Array.isArray((product as any).inci)
        ? (product as any).inci
        : [];

    // Load matches with optional cosing join
    const matchDocs = await matches.aggregate([
      { $match: { productId: String((product as any)._id) } },
      {
        $addFields: {
          cosOid: {
            $cond: [
              { $eq: [{ $type: '$cosingId' }, 'string'] },
              { $toObjectId: '$cosingId' },
              '$cosingId',
            ],
          },
        },
      },
      {
        $lookup: {
          from: COLL.COSING,
          localField: 'cosOid',
          foreignField: '_id',
          as: 'cos',
        },
      },
      { $unwind: { path: '$cos', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          matchId: '$_id',
          label: 1,
          labelNormalized: 1,
          cosingId: 1,
          status: 1,
          method: 1,
          classification: 1,
          score: 1,
          suggestions: 1,
          cosing_ingredient: { $ifNull: ['$cos.inci_name', '$cosingInciName'] },
          cos_functions: '$cos.functions',
          cos_concerns: '$cos.commonConcerns',
          cos_manualClassification: '$cos.manual_classification',
        },
      },
    ]).toArray();

    const matchByNorm = new Map<string, any>();
    for (const m of matchDocs) {
      const norm = (m.labelNormalized && String(m.labelNormalized)) || normalizeLabel(m.label ?? '');
      matchByNorm.set(norm, m);
    }

    type Suggestion = { cosingId: string; inciName: string; score: number };

    const matchesArr: any[] = [];
    const unmatched: Array<{ product_ingredient: string; position: number; suggestions: Suggestion[]; matchId?: string; }> = [];
    const nonIngredients: Array<{ product_ingredient: string; position: number; matchId: string; }> = [];

    for (let idx = 0; idx < ingredientsRaw.length; idx++) {
      const label = ingredientsRaw[idx];
      const norm = normalizeLabel(label);
      const m = matchByNorm.get(norm);

      if (m && m.classification === 'non_ingredient') {
        nonIngredients.push({ product_ingredient: label, position: idx, matchId: String(m.matchId) });
      } else if (m && m.cosingId) {
        matchesArr.push({
          matchId: String(m.matchId),
          product_ingredient: label,
          cosingId: String(m.cosingId),
          cosing_ingredient: m.cosing_ingredient ?? null,
          status: m.status ?? 'auto',
          method: m.method ?? null,
          classification: m.classification ?? 'ingredient',
          score: typeof m.score === 'number' ? m.score : (m.score ? Number(m.score) : null),
          suggestions: m.suggestions ?? null,
          functions: Array.isArray(m.cos_functions) ? m.cos_functions : undefined,
          concerns: Array.isArray(m.cos_concerns) ? m.cos_concerns : undefined,
          manualClassification: m.cos_manualClassification !== undefined ? m.cos_manualClassification : undefined,
        });
      } else {
        const sugg: Suggestion[] = (m?.suggestions ?? []).map((s: any) => ({
          cosingId: String(s.cosingId ?? s.id ?? ''),
          inciName: s.inciName ?? s.inci_name ?? '',
          score: typeof s.score === 'number' ? s.score : (s.score ? Number(s.score) : 0),
        }));
        unmatched.push({ product_ingredient: label, position: idx, suggestions: sugg, matchId: m ? String(m.matchId) : undefined });
      }
    }

    const total = ingredientsRaw.length - nonIngredients.length;
    const matchedCount = matchesArr.length;
    const matchedPct = total ? Math.round((matchedCount / total) * 100) : 0;

    return {
      id: String((product as any)._id),
      brand: (product as any).brand ?? null,
      name: (product as any).name ?? (product as any)?.translations?.en?.title ?? null,
      slug: (product as any).slug ?? null,
      createdTime: (product as any).createdTime ?? null,
      translations: (product as any).translations ?? null,
      suggestions: (product as any).suggestions ?? null,
      ingredientsRaw,
      matches: matchesArr,
      unmatched,
      nonIngredients,
      matchedCount,
      total,
      matchedPct,
      found_percents: (product as any).found_percents ?? matchedPct,
    };
  },

  async updateInciFromInput(
    productId: string,
    body: { ingredientsText?: string; ingredients?: string[] },
  ): Promise<{ savedList: string[] }> {
    const { products } = await getCollections();

    if (!ObjectId.isValid(productId)) {
      const err = new Error('Invalid product id') as any;
      err.status = 400;
      throw err;
    }
    const _id = new ObjectId(productId);

    // Load current to know whether original_inci_list is set
    const existing = await products.findOne(
      { _id },
      { projection: { _id: 1, inci: 1, original_inci_list: 1 } },
    );
    if (!existing) {
      const err = new Error('Product not found') as any;
      err.status = 404;
      throw err;
    }

    // Build the clean list
    let incoming: string[] = [];
    if (Array.isArray(body.ingredients) && body.ingredients.length) {
      incoming = body.ingredients.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof body.ingredientsText === 'string' && body.ingredientsText.trim()) {
      incoming = splitIngredients(body.ingredientsText);
    }

    // Normalize whitespace and remove empties/dupes (preserve order)
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of incoming) {
      const v = raw.replace(/\s+/g, ' ').trim();
      if (!v) continue;
      if (seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      cleaned.push(v);
    }

    const updatePayload: any = {
      $set: { inci: cleaned },
    };

    if (!existing.original_inci_list && Array.isArray(existing.inci)) {
      updatePayload.$set.original_inci_list = existing.inci;
    }

    await products.updateOne({ _id }, updatePayload);

    return { savedList: cleaned };
  },
};
