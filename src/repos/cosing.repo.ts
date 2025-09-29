import { getCollections } from '../config/get-collections';
import { normalizeLabel } from '../common/text.util';

// same normalization behavior as your Nest CosingService.normalize
function normalizeForCosing(s: string) {
  // normalizeLabel already strips diacritics, removes parens, non-word chars to space, squeezes spaces, UPPERCASE
  return normalizeLabel(s);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const cosingRepo = {
  // GET /cosing/search?q=...
  async search(q: { q: string }) {
    const { cosing } = await getCollections();
    const raw = (q.q || '').trim();
    if (!raw) return [];

    const norm = normalizeForCosing(raw);
    const reNorm = new RegExp(escapeRegex(norm), 'i');
    const reRaw  = new RegExp(escapeRegex(raw),  'i');

    const filter = {
      $or: [
        { search_key: reNorm },
        { inci_name: reRaw },
        { cas: reRaw },
        { ec: reRaw },
        { functions: reRaw }, // regex against array matches any element
      ],
    };

    const docs = await cosing.find(filter).limit(20).toArray();

    return docs.map((d: any) => ({
      id: String(d._id),
      inciName: d.inci_name,
    }));
  },

  // GET /cosing?q=&page=&limit=
  async list(params: { q?: string; page?: number; limit?: number }) {
    const { cosing } = await getCollections();

    const page  = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(params.limit ?? 20)));

    const filter = params.q?.trim()
      ? { inci_name: new RegExp(escapeRegex(params.q.trim()!), 'i') }
      : {};

    const [items, total] = await Promise.all([
      cosing
        .find(filter)
        .sort({ inci_name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      cosing.countDocuments(filter),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },
};
