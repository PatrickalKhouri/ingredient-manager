import { Router } from 'express';
import * as ctrl from '../controllers/aliases.controller';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../middlewares/asyncHandler';
import { createAliasBody, aliasIdParams } from '../schemas/aliases.schemas';

const r = Router();

r.get('/', asyncHandler(ctrl.list));
r.post('/', validate(createAliasBody), asyncHandler(ctrl.create));
r.delete('/:id', validate(aliasIdParams, 'params'), asyncHandler(ctrl.remove));

export default r;
