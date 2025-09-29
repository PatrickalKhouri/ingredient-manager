import { Router } from 'express';
import health from './health.routes';
import products from './products.routes';
import matches from './matches.routes';
import aliases from './aliases.routes';
import cosing from './cosing.routes';

export const routes = Router();
routes.use('/health', health);
routes.use('/products', products);
routes.use('/matches', matches);
routes.use('/aliases', aliases);
routes.use('/cosing', cosing);