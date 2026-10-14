import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface ServiceAccountCredentials {
  type?: string;
  project_id?: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
}

export interface AppConfig {
  port: number;
  driveRootFolderId: string;
  credentials?: ServiceAccountCredentials;
  cacheTtlSeconds: number;
  streamChunkSizeBytes: number;
  tmdbApiKey?: string;
}

function validateAndNormalizeCredentials(parsed: any): ServiceAccountCredentials {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid credentials: expected JSON object');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
    throw new Error('Invalid credentials: client_email and private_key must be strings');
  }
  if (parsed.client_email.trim().length === 0 || parsed.private_key.trim().length === 0) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed as ServiceAccountCredentials;
}

export function loadCredentials(customKey?: string, customFilePath?: string): ServiceAccountCredentials {
  const envKey = customKey !== undefined ? customKey : process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (envKey && envKey.trim().length > 0) {
    const trimmed = envKey.trim();
    let jsonStr: string;

    if (trimmed.startsWith('{')) {
      jsonStr = trimmed;
    } else {
      try {
        jsonStr = Buffer.from(trimmed, 'base64').toString('utf8');
      } catch (err: any) {
        throw new Error(`Failed to decode GOOGLE_SERVICE_ACCOUNT_KEY from Base64: ${err.message}`);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return validateAndNormalizeCredentials(parsed);
    } catch (err: any) {
      throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON: ${err.message}`);
    }
  }

  // Fallback 1: GOOGLE_APPLICATION_CREDENTIALS path
  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleAppCreds && fs.existsSync(googleAppCreds)) {
    try {
      const raw = fs.readFileSync(googleAppCreds, 'utf8');
      const parsed = JSON.parse(raw);
      return validateAndNormalizeCredentials(parsed);
    } catch (err: any) {
      throw new Error(`Failed to parse GOOGLE_APPLICATION_CREDENTIALS file: ${err.message}`);
    }
  }

  // Fallback 2: Local credentials.json
  const localFile = customFilePath || path.resolve(process.cwd(), 'credentials.json');
  if (fs.existsSync(localFile)) {
    try {
      const raw = fs.readFileSync(localFile, 'utf8');
      const parsed = JSON.parse(raw);
      return validateAndNormalizeCredentials(parsed);
    } catch (err: any) {
      throw new Error(`Failed to parse credentials.json: ${err.message}`);
    }
  }

  throw new Error(
    'No Google Service Account credentials found. ' +
    'Set GOOGLE_SERVICE_ACCOUNT_KEY (JSON or Base64) or place credentials.json in project root.'
  );
}

export function getConfig(): AppConfig {
  let credentials: ServiceAccountCredentials | undefined;
  try {
    credentials = loadCredentials();
  } catch {
    // If running in development without credentials yet, credentials stays undefined
    credentials = undefined;
  }

  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID || '';

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    driveRootFolderId: rootFolderId.trim(),
    credentials,
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '600', 10),
    streamChunkSizeBytes: parseInt(process.env.STREAM_CHUNK_SIZE_MB || '8', 10) * 1024 * 1024,
    tmdbApiKey: process.env.TMDB_API_KEY?.trim(),
  };
}
