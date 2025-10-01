import { Router } from 'express';
import * as ctrl from '../controllers/products.controller';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../middlewares/asyncHandler';
import { listProductsQuery, productIdParams, matchingSummaryQuery, updateIngredientsBody } from '../schemas/products.schemas';


const r = Router();

r.get('/', validate(listProductsQuery, 'query'), asyncHandler(ctrl.listProducts));
r.get('/brands', asyncHandler(ctrl.listBrands));
r.get('/matching-summary', validate(matchingSummaryQuery, 'query'), asyncHandler(ctrl.matchingSummary));
r.get('/:productId', validate(productIdParams, 'params'), asyncHandler(ctrl.detail));
r.post('/:productId/match', validate(productIdParams, 'params'), asyncHandler(ctrl.match));
r.put(
    '/:productId/ingredients',
    validate(productIdParams, 'params'),
    validate(updateIngredientsBody, 'body'),
    asyncHandler(ctrl.updateIngredientsAndRematch),
  );


export default r;
