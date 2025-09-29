import { ObjectId } from 'mongodb';
import { getCollections } from '../config/get-collections';
import { COLL } from '../config/collections';
import { normalizeLabel } from '../common/text.util';

export const aliasesRepo = {
  // GET /aliases
  async list() {
    const { aliases } = await getCollections();
    const rows = await aliases.aggregate([
        // normalize cosingId to ObjectId when it's a string
        {
          $addFields: {
            cosOid: {
              $cond: [
                { $eq: [{ $type: '$cosingId' }, 'objectId'] },
                '$cosingId',
                { $toObjectId: '$cosingId' }, // assumes valid 24-char hex; OK for your data
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
        { $sort: { alias: 1 } },
        {
          $project: {
            _id: 1,
            alias: 1,
            aliasNormalized: 1,
            confidence: 1,
            createdAt: 1,
            cosingId: '$cosOid', // normalized
            cos: { _id: 1, inci_name: 1 },
          },
        },
      ]).toArray();

    return rows.map((r: any) => ({
      id: String(r._id),
      alias: r.alias,
      aliasNormalized: r.aliasNormalized,
      confidence: r.confidence ?? null,
      createdAt: r.createdAt ?? null,
      cosingId: r.cosingId ? String(r.cosingId) : null,
      cosing: r.cos ? { id: String(r.cos._id), inciName: r.cos.inci_name } : null,
    }));
  },

  // POST /aliases
  async create(b: { alias: string; cosingId: string }) {
    const { aliases, cosing, matches } = await getCollections();

    const alias = (b.alias || '').trim();
    if (!alias) {
      const err: any = new Error('Alias is required'); err.status = 400; throw err;
    }

    if (!ObjectId.isValid(b.cosingId)) {
      const err: any = new Error('Invalid cosingId'); err.status = 400; throw err;
    }
    const cosOid = new ObjectId(b.cosingId);

    const cosExists = await cosing.findOne({ _id: cosOid }, { projection: { _id: 1 } });
    if (!cosExists) {
      const err: any = new Error('CosIng ingredient not found'); err.status = 404; throw err;
    }

    const aliasNorm = normalizeLabel(alias);

    // Upsert: if alias or aliasNormalized exists, overwrite; else insert
    const existing = await aliases.findOne({
      $or: [{ alias }, { aliasNormalized: aliasNorm }],
    });

    let rowId: ObjectId;
    const now = new Date();

    try {
      if (existing) {
        await aliases.updateOne(
          { _id: existing._id },
          {
            $set: {
              alias,
              aliasNormalized: aliasNorm,
              cosingId: cosOid,
              confidence: 0.99,
              // keep createdAt as-is if it exists
            },
          },
        );
        rowId = existing._id as ObjectId;
      } else {
        const res = await aliases.insertOne({
          alias,
          aliasNormalized: aliasNorm,
          cosingId: cosOid,
          confidence: 0.99,
          createdAt: now,
        });
        rowId = res.insertedId;
      }
    } catch (e: any) {
      // unique index on aliasNormalized → dup mapping -> 409 like Nest ConflictException
      if (e?.code === 11000) {
        const err: any = new Error('Alias already exists with a different mapping'); err.status = 409; throw err;
      }
      throw e;
    }

    // Apply alias to existing matches (same as Nest):
    // update matches with labelNormalized == aliasNorm and not manual/rejected
    const res = await matches.updateMany(
      {
        labelNormalized: aliasNorm,
        status: { $nin: ['manual', 'rejected'] },
      },
      {
        $set: {
          cosingId: cosOid,
          status: 'auto',
          method: 'alias',
          score: 0.99,
          suggestions: [],
          updatedAt: new Date(),
        },
      },
    );

    return {
      id: String(rowId),
      alias,
      aliasNormalized: aliasNorm,
      cosingId: String(cosOid),
      applied: res.modifiedCount || 0,
    };
  },

  // DELETE /aliases/:id
  async remove(id: string) {
    const { aliases } = await getCollections();

    if (!ObjectId.isValid(id)) {
      const err: any = new Error('Invalid alias id'); err.status = 400; throw err;
    }
    const _id = new ObjectId(id);

    const existing = await aliases.findOne({ _id }, { projection: { _id: 1 } });
    if (!existing) {
      const err: any = new Error('Alias not found'); err.status = 404; throw err;
    }

    await aliases.deleteOne({ _id });
    return { deleted: true };
  },
};
