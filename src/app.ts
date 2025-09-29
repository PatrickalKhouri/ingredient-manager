import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { routes } from './routes';
import { notFound } from './middlewares/notFound';
import { errorHandler } from './middlewares/errorHandler';

export async function buildApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({
    origin: ['http://localhost:4001'], // add your FE origin(s)
    methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false, // flip to true only if you need cookies
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
