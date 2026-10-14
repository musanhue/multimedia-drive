import { Router, Request, Response } from 'express';
import { getConfig } from '../config';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const config = getConfig();
  const configured = Boolean(config.credentials && config.credentials.client_email);
  const pk = config.credentials?.private_key || '';

  res.json({
    status: 'ok',
    version: '1.0.0',
    driveConnected: configured,
    serviceAccountConfigured: configured,
    email: config.credentials?.client_email,
    keyDebug: {
      length: pk.length,
      prefix: pk.slice(0, 32),
      suffix: pk.slice(-32),
      hasAscii10: pk.includes('\n'),
      hasLiteralBackslashN: pk.includes('\\n'),
      backslashCount: (pk.match(/\\/g) || []).length,
    },
    timestamp: new Date().toISOString(),
  });
});
