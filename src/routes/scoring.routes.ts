import { Router } from 'express';
import { ScoringController } from '../controllers/scoring.controller';

const router = Router();

/**
 * POST /v1/scoring/rules/R01/evaluate
 * Body: { product_id: string }
 * - Computes Rule 1 for the given product
 * - Saves into products_scores.rules[rule_index:1]
 * - Recomputes total_score
 */
router.post('/v1/scoring/rules/R01/evaluate', ScoringController.evaluateRule1);

export default router;
