import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { computeAndSaveR01ForProduct } from '../services/scoring/r01.service';

export class ScoringController {
  static async evaluateRule1(req: Request, res: Response) {
    try {
      const productId = String(req.body?.product_id || req.params?.product_id || '');
      if (!ObjectId.isValid(productId)) {
        return res.status(400).json({ error: 'invalid product_id' });
      }

      const result = await computeAndSaveR01ForProduct(productId);

      return res.json({
        rule_id: result.rule_id,
        version: result.version,
        points_awarded: result.points_awarded,
        verdict: result.verdict,
        observed_inputs: result.observed_inputs,
        saved: true,
        total_score: result._persistence.total_score
      });
    } catch (err: any) {
      return res.status(err?.status || 500).json({ error: err?.message || 'internal_error' });
    }
  }
}
