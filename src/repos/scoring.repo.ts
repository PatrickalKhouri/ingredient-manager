import path from 'path';
import { ObjectId, type Document, type UpdateFilter } from 'mongodb';
import { getCollections } from '../config/get-collections';
import {
  evaluateR01,
  loadR01ConfigFromFile,
  loadExceptionsDataset,
  type R01Result,
} from '../services/scoring/r01.evaluator';

function normalize(value: string): string {
  return (value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Antioxidant positional override (R01 only) */
function isAntioxidantExcludedByPosition(ingredientIndex: number, listLength: number): boolean {
  if (listLength >= 15) {
    const secondThirdBoundary = Math.floor((2 * listLength) / 3);
    return ingredientIndex >= secondThirdBoundary; // last 1/3
  } else {
    const halfBoundary = Math.floor(listLength / 2);
    return ingredientIndex >= halfBoundary; // second half
  }
}

async function resolveProductsScoresKey(
    productObjectId: ObjectId,
    products: any,
    productsScores: any
  ): Promise<{ filter: Record<string, any>; linked: boolean } | null> {
    // 1) direct by _id
    const byId = await productsScores.findOne({ _id: productObjectId }, { projection: { _id: 1 } });
    if (byId) return { filter: { _id: productObjectId }, linked: true };
  
    // 2) has product_id already?
    const byPid = await productsScores.findOne({ product_id: productObjectId }, { projection: { _id: 1 } });
    if (byPid) return { filter: { product_id: productObjectId }, linked: true };
  
    // 3) fall back to (brand,name) if unique
    const product = await products.findOne(
      { _id: productObjectId },
      { projection: { brand: 1, name: 1, product_brand: 1, product_name: 1 } }
    );
    if (!product) return null;
  
    const brand = String(product.brand ?? product.product_brand ?? '').trim();
    const name  = String(product.name  ?? product.product_name  ?? '').trim();
    if (!brand || !name) return null;
  
    const candidates = await productsScores
      .find({ product_brand: brand, product_name: name }, { projection: { _id: 1 } })
      .toArray();
  
    if (candidates.length === 1) {
      // we’ll also stamp product_id once we choose this candidate
      return { filter: { _id: candidates[0]._id }, linked: false };
    }
  
    return null;
  }

export const scoringRepo = {
  /**
   * Compute Rule 1 for a product and persist into productsScores:
   * - Updates/creates rules[rule_index:1] (+ rule_version, updated_at, observed_inputs)
   * - Recomputes total_score
   */
  async evaluateRule1AndPersist(productId: string): Promise<R01Result & { _persistence: { total_score: number } }> {
    const { products, matches, cosing, productsScores } = await getCollections();

    if (!ObjectId.isValid(productId)) {
      const e = new Error('Invalid product id') as any;
      e.status = 400;
      throw e;
    }
    const productObjectId = new ObjectId(productId);

    // Load product for INCI length
    const productDoc = await products.findOne(
      { _id: productObjectId },
      { projection: { _id: 1, inci: 1 } }
    );
    if (!productDoc) {
      const e = new Error('Product not found') as any;
      e.status = 404;
      throw e;
    }
    const inciList: string[] = Array.isArray(productDoc.inci) ? productDoc.inci : [];
    const listLength = inciList.length;

    // Load rule config + exceptions dataset (versioning via filename for now)
    const ruleConfigPath = path.join(process.cwd(), 'data', 'rules', 'R01', '1.0.0.json');
    const ruleConfig = loadR01ConfigFromFile(ruleConfigPath);
    const exceptionsPath = path.join(process.cwd(), 'data', 'datasets', 'exceptions@1.0.0.json');
    const exceptions = loadExceptionsDataset(exceptionsPath);

    // Build actives using matches + cosing.manual_classification === 'active'
    // (first occurrence only) with antioxidant position override
    const matchDocs = await matches
      .find(
        { product_id: productObjectId },
        { projection: { product_inci_index: 1, cosing_id: 1 } }
      )
      .sort({ product_inci_index: 1 })
      .toArray();

    const uniqueCosingIds = Array.from(
      new Set(matchDocs.map((m) => m.cosing_id).filter(Boolean))
    ) as ObjectId[];

    const cosingInfoById = new Map<
      string,
      { inci_name: string; isActive: boolean; isAntioxidant: boolean }
    >();

    if (uniqueCosingIds.length) {
      const cosingDocs = await cosing
        .find(
          { _id: { $in: uniqueCosingIds } },
          { projection: { _id: 1, inci_name: 1, manual_classification: 1, functions: 1 } }
        )
        .toArray();

      for (const c of cosingDocs) {
        const functionsArray: string[] = Array.isArray((c as any).functions) ? (c as any).functions : [];
        const hasAntioxidant = functionsArray.some((f) => normalize(f) === 'antioxidant');

        cosingInfoById.set(String(c._id), {
          inci_name: (c as any).inci_name,
          isActive: (c as any).manual_classification === 'active',
          isAntioxidant: hasAntioxidant,
        });
      }
    }

    const seen = new Set<string>();
    const activeIngredients: Array<{ ingredientId: string; name: string; index: number }> = [];

    for (const m of matchDocs) {
      const cosingIdStr = m.cosing_id ? String(m.cosing_id) : '';
      if (!cosingIdStr || seen.has(cosingIdStr)) continue;
      seen.add(cosingIdStr);

      const info = cosingInfoById.get(cosingIdStr);
      if (!info) continue;
      if (!info.isActive) continue; // only globally active

      const firstIndex = typeof m.product_inci_index === 'number' ? m.product_inci_index : 0;

      // Antioxidant positional override for R01
      if (info.isAntioxidant && isAntioxidantExcludedByPosition(firstIndex, listLength)) {
        continue; // treat as excipient for R01 (skip)
      }

      activeIngredients.push({
        ingredientId: cosingIdStr,
        name: info.inci_name,
        index: firstIndex,
      });
    }

    // Evaluate R01
    const r01: R01Result = evaluateR01(
      {
        productId,
        listLength,
        actives: activeIngredients,
        exceptions,
      },
      ruleConfig
    );

    // Persist into productsScores.rules[rule_index:1] and recompute total_score
    const now = new Date();

    // We support either _id or product_id as key; prefer _id.
    let scoreDoc = await productsScores.findOne(
      { _id: productObjectId },
      { projection: { _id: 1, rules: 1 } }
    );

    let keyFilter: Record<string, any>;
    if (scoreDoc) {
      keyFilter = { _id: productObjectId };
    } else {
      scoreDoc = await productsScores.findOne(
        { product_id: productObjectId },
        { projection: { _id: 1, rules: 1, product_id: 1 } }
      );
      keyFilter = scoreDoc ? { product_id: productObjectId } : { _id: productObjectId };
    }

    const updateExisting = await productsScores.updateOne(
      keyFilter,
      {
        $set: {
          'rules.$[r].rule_score': r01.points_awarded,
          'rules.$[r].rule_version': r01.version,
          'rules.$[r].updated_at': now,
          'rules.$[r].related_inci': r01.observed_inputs.actives_detected.map((a) => a.name),
          'rules.$[r].observed_inputs': r01.observed_inputs,
        },
        $setOnInsert: { created_at: now },
      },
      { arrayFilters: [{ 'r.rule_index': 1 }], upsert: true }
    );

    const didInsertNewDoc = (updateExisting.upsertedCount ?? 0) > 0;
    const matchedButNoRule1 = updateExisting.matchedCount > 0 && updateExisting.modifiedCount === 0;

    if (didInsertNewDoc || matchedButNoRule1) {
      const ruleEntry = {
        rule_index: 1,
        rule_id: 'R01',
        rule_version: r01.version,
        related_inci: r01.observed_inputs.actives_detected.map((a) => a.name),
        rule_score: r01.points_awarded,
        updated_at: now,
        observed_inputs: r01.observed_inputs,
      };

      await productsScores.updateOne(keyFilter, { $push: { rules: { $each: [ruleEntry] } } } as any);
    }

    const fresh = await productsScores.findOne(keyFilter, { projection: { rules: 1 } });
    const totalScore = Array.isArray(fresh?.rules)
      ? fresh!.rules.reduce((sum: number, r: any) => sum + (Number(r.rule_score) || 0), 0)
      : Number(r01.points_awarded) || 0;

    await productsScores.updateOne(keyFilter, {
      $set: { total_score: totalScore, updated_at: now },
    });

    return Object.assign(r01, { _persistence: { total_score: totalScore } });
  },
};
