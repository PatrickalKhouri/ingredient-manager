import { Router } from 'express';
import health from './health.routes';

export const routes = Router();
routes.use('/health', health);
// (we’ll add /products, /matches, /cosing, /aliases next)
