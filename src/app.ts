import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import next from 'next';
import { routes } from './routes/index';
import { notFound } from './middlewares/notFound';
import { errorHandler } from './middlewares/errorHandler';
import { env } from './config/env';

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev, dir: '.' });
const handle = nextApp.getRequestHandler();

async function createApp() {
  await nextApp.prepare();
  
  const app = express();
  
  // Security middleware - configured for Next.js compatibility
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }));
  
  // CORS configuration - no longer needed for same-origin requests
  app.use(cors({
    origin: false, // Disable CORS for same-origin requests
    methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  }));
  
  // Body parsing and logging
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  // API routes
  app.use('/api', routes);

  // Serve Next.js app for all other routes
  app.use((req, res) => {
    return handle(req, res);
  });

  // Error handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// Start the server
createApp().then((app) => {
  app.listen(env.PORT, () => {
    console.log({ port: env.PORT }, `Server listening on :${env.PORT}`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
