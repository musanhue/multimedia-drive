import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { getConfig } from './config';
import { healthRouter } from './routes/health';
import { driveRouter } from './routes/drive';
import { streamRouter } from './routes/stream';
import { subtitlesRouter } from './routes/subtitles';
import { metadataRouter } from './routes/metadata';
import { audioRouter } from './routes/audio';

export const app = express();
const config = getConfig();

// Enable CORS with full exposure of media streaming headers
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Range', 'Accept-Ranges', 'Content-Type', 'Authorization', 'X-Simulate-Auth-Failure', 'X-Simulate-Rate-Limit'],
    exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges'],
  })
);

app.use(express.json());

// Simulation middleware for testing environments
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    req.headers['x-simulate-auth-failure'] === 'true' ||
    req.query.auth === 'invalid'
  ) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing Service Account credentials',
    });
  }

  if (req.headers['x-simulate-rate-limit'] === 'true') {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({
      error: 'User rate limit exceeded on Google Drive API',
    });
  }

  next();
});

// Register routes
app.use('/api', healthRouter);
app.use('/api/drive', driveRouter);
app.use('/api/stream', streamRouter);
app.use('/api/subtitles', subtitlesRouter);
app.use('/api/audio', audioRouter);
app.use('/api/metadata', metadataRouter);

const clientDist = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Root endpoint: serve TV Web App if built, or API info fallback
app.get('/', (req: Request, res: Response) => {
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.json({
    app: 'Multimedia Drive Server',
    version: '1.0.0',
    target: 'Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)',
    status: 'online',
    endpoints: [
      '/api/health',
      '/api/drive/folders',
      '/api/drive/files/:category',
      '/api/drive/file/:fileId',
      '/api/drive/refresh',
      '/api/stream/:fileId',
      '/api/subtitles/:fileId',
      '/api/subtitles/list/:fileId',
      '/api/metadata/clean-title',
      '/api/metadata/enrich',
    ],
  });
});

// 404 JSON fallback middleware for unhandled endpoints
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Multimedia Drive] Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
    });
  }
});

if (require.main === module && process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`[Multimedia Drive] Server listening on port ${config.port}`);
  });
}

export default app;
