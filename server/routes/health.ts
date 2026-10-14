import { Router, Request, Response } from 'express';
import { getConfig } from '../config';
import { createGoogleAuth } from '../drive/auth';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const config = getConfig();
  const configured = Boolean(config.credentials && config.credentials.client_email);

  res.json({
    status: 'ok',
    version: '1.0.0',
    driveConnected: configured,
    serviceAccountConfigured: configured,
    timestamp: new Date().toISOString(),
  });
});
