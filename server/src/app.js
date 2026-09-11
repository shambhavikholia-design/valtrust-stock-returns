import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import stockRoutes from './routes/stockRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Builds and returns the Express app, without starting a listener and without
 * checking for INDIANAPI_KEY. Split out from server.js so tests can import
 * and exercise the app directly (e.g. with supertest) without needing a real
 * API key or an actual open port - only routes that call IndianAPI directly
 * need the key; validation, health, and 404 handling don't.
 */
export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || '*',
    })
  );
  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[${req.method}] ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  app.use('/api', stockRoutes);

  const clientDir = path.join(__dirname, '..', '..', 'client');
  app.use(express.static(clientDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
