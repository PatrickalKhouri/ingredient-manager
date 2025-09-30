import path from 'path';
import { ObjectId } from 'mongodb';
import { getCollections } from '../../config/get-collections';
import {
  evaluateR01,
  loadR01ConfigFromFile,
  loadExceptionsDataset,
  type R01Result,
} from './r01.evaluator';

/**
 * Computes Rule 1 for a product and persists it into productScores:
 * - Updates/creates rules[rule_index:1] with rule_version and updated_at
 * - Recomputes total_score (sum of rules[*].rule_score)
 *
 * Assumptions:
 * - Product already has matches in the `matches` collection.
 * - CosIng documents have `manual_classification` set by your classifier script.
 */
export async function computeAndSaveR01ForProduct(
  productId: string
): Promise<R01Result & { _persistence: { total_score: number } }> {
  const { products, matches, cosing, productsScores } = await getCollections();

  if (!ObjectId.isValid(productId)) {
    const e = new Error('Invalid product id') as any;
    e.status = 400;
    throw e;
  }
  const productObjectId = new ObjectId(productId);

  // --- Load product INCI for list length ---
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

  // --- Load rule config & exceptions dataset (simple version pointer for now) ---
  const ruleConfigPath = path.join(process.cwd(), 'data', 'rules', 'R01', '1.0.0.json');
  const ruleConfig = loadR01ConfigFromFile(ruleConfigPath);
  const exceptionsPath = path.join(process.cwd(), 'data', 'datasets', 'exceptions@1.0.0.json');
  const exceptions = loadExceptionsDataset(exceptionsPath);

  // --- Build actives using matches + cosing.manual_classification === 'active' (first occurrence only) ---
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

  const cosingInfoById = new Map<string, { inci_name: string; isActive: boolean }>();
  if (uniqueCosingIds.length) {
    const cosingDocs = await cosing
      .find(
        { _id: { $in: uniqueCosingIds } },
        { projection: { _id: 1, inci_name: 1, manual_classification: 1 } }
      )
      .toArray();

    for (const c of cosingDocs) {
      cosingInfoById.set(String(c._id), {
        inci_name: c.inci_name,
        isActive: c.manual_classification === 'active',
      });
    }
  }

  const seenCosingIds = new Set<string>();
  const activeIngredients: Array<{ ingredientId: string; name: string; index: number }> = [];
  for (const m of matchDocs) {
    const cosingIdStr = m.cosing_id ? String(m.cosing_id) : '';
    if (!cosingIdStr || seenCosingIds.has(cosingIdStr)) continue;
    seenCosingIds.add(cosingIdStr);

    const info = cosingInfoById.get(cosingIdStr);
    if (info?.isActive) {
      activeIngredients.push({
        ingredientId: cosingIdStr,
        name: info.inci_name,
        index: typeof m.product_inci_index === 'number' ? m.product_inci_index : 0,
      });
    }
  }

  // --- Evaluate Rule 1 ---
  const r01: R01Result = evaluateR01(
    {
      productId,
      listLength,
      actives: activeIngredients,
      exceptions,
    },
    ruleConfig
  );

  // --- Persist into productScores.rules[rule_index:1] and recompute total_score ---
  const now = new Date();

  // Support either `_id` or `product_id` as the key in productScores
  // 1) Try doc keyed by _id == productId
  let scoreDoc = await productsScores.findOne(
    { _id: productObjectId },
    { projection: { _id: 1, rules: 1 } }
  );

  // 2) Else try doc keyed by product_id == productId
  let keyFilter: Record<string, any>;
  if (scoreDoc) {
    keyFilter = { _id: productObjectId };
  } else {
    scoreDoc = await productsScores.findOne(
      { product_id: productObjectId },
      { projection: { _id: 1, rules: 1, product_id: 1 } }
    );
    keyFilter = scoreDoc ? { product_id: productObjectId } : { _id: productObjectId }; // default to _id upsert
  }

  // Update existing rule_index:1 if present
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

  // If the array filter didn’t match any element, push a new rule object (fixes $push typing via $each)
  if (updateExisting.matchedCount > 0 && updateExisting.modifiedCount === 0) {
    const ruleEntry = {
      rule_index: 1,
      rule_id: 'R01',
      rule_version: r01.version,
      related_inci: r01.observed_inputs.actives_detected.map((a) => a.name),
      rule_score: r01.points_awarded,
      updated_at: now,
      observed_inputs: r01.observed_inputs,
    };

    await productsScores.updateOne(keyFilter, {
      $push: { rules: { $each: [ruleEntry] } },
    });
  }

  // Recompute total_score = sum(rules[*].rule_score)
  const fresh = await productsScores.findOne(keyFilter, { projection: { rules: 1 } });
  const totalScore = Array.isArray(fresh?.rules)
    ? fresh!.rules.reduce((sum: number, r: any) => sum + (Number(r.rule_score) || 0), 0)
    : Number(r01.points_awarded) || 0;

  await productsScores.updateOne(keyFilter, {
    $set: { total_score: totalScore, updated_at: now },
  });

  // Return result + persistence meta
  return Object.assign(r01, { _persistence: { total_score: totalScore } });
}
