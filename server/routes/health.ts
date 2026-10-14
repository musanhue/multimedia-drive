import { Router, Request, Response } from 'express';
import { getConfig } from '../config';
import { createGoogleAuth } from '../drive/auth';

export const healthRouter = Router();

healthRouter.get('/health', async (_req: Request, res: Response) => {
  const config = getConfig();
  const configured = Boolean(config.credentials && config.credentials.client_email);
  const pk = config.credentials?.private_key || '';

  let cryptoTest = 'not run';
  let authTest = 'not run';
  let stack = '';

  try {
    const crypto = await import('crypto');
    crypto.createPrivateKey(pk);
    cryptoTest = 'SUCCESS';
  } catch (err: any) {
    cryptoTest = 'FAIL: ' + err.message;
    stack = err.stack;
  }

  try {
    const auth = createGoogleAuth();
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    authTest = 'SUCCESS: ' + (token ? 'has token' : 'no token');
  } catch (err: any) {
    authTest = 'FAIL: ' + err.message;
    if (!stack) stack = err.stack;
  }

  res.json({
    status: 'ok',
    version: '1.0.0',
    driveConnected: configured,
    serviceAccountConfigured: configured,
    email: config.credentials?.client_email,
    cryptoTest,
    authTest,
    charCodes: Array.from(pk.slice(0, 40)).map(c => c.charCodeAt(0)),
    rawEnvSample: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.slice(0, 30),
    rawEnvLen: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.length,
    nodeVersion: process.version,
    stack,
    timestamp: new Date().toISOString(),
  });
});
