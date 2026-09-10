import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import stockRoutes from './routes/stockRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

// Fail fast and loud if the API key is missing, rather than silently running broken.
if (!process.env.INDIANAPI_KEY) {
  console.error(
    '\n[startup error] INDIANAPI_KEY is not set.\n' +
      'Copy server/.env.example to server/.env and add your key from https://indianapi.in/dashboard\n'
  );
  process.exit(1);
}

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
  })
);
app.use(express.json());

// Simple request log (info-level) - not a replacement for a real logging library,
// but enough to see traffic and upstream call patterns for this assignment's scope.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${req.method}] ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use('/api', stockRoutes);

// Serve the built frontend as static files, so the whole app is one deployable unit.
const clientDir = path.join(__dirname, '..', '..', 'client');
app.use(express.static(clientDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
