import { onRequest } from 'firebase-functions/v2/https';
import { app } from './index';

export const api = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 3600,
    cors: true,
  },
  app
);
