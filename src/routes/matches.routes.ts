import { Router } from 'express';
import * as ctrl from '../controllers/matches.controller';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../middlewares/asyncHandler';
import { setMatchBody, unmatchedQuery, rematchBody, matchIdParams } from '../schemas/matches.schemas';

const r = Router();

r.get('/unmatched', validate(unmatchedQuery, 'query'), asyncHandler(ctrl.getUnmatched));
r.post('/manual', validate(setMatchBody), asyncHandler(ctrl.manualMatch));
r.post('/rematch', validate(rematchBody), asyncHandler(ctrl.clearMatch));
r.patch('/:matchId/unclassify', validate(matchIdParams, 'params'), asyncHandler(ctrl.unclassifyNonIngredient));
r.patch('/:matchId/non-ingredient', validate(matchIdParams, 'params'), asyncHandler(ctrl.markNonIngredient));

export default r;
