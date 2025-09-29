import { Router } from 'express';
import * as ctrl from '../controllers/cosing.controller';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../middlewares/asyncHandler';
import { cosingSearchQuery, cosingListQuery } from '../schemas/cosing.schemas';

const r = Router();

r.get('/search', validate(cosingSearchQuery, 'query'), asyncHandler(ctrl.search));
r.get('/', validate(cosingListQuery, 'query'), asyncHandler(ctrl.list));

export default r;
