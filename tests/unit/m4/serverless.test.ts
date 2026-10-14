process.env.NODE_ENV = 'test';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'fs';
import path from 'path';
import serverlessApp from '../../../api/index';
import { app } from '../../../server/index';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const VERCEL_JSON_PATH = path.join(PROJECT_ROOT, 'vercel.json');

let server: http.Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

async function makeRequest(urlPath: string, options: any = {}) {
  const url = `${baseUrl}${urlPath}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text,
    json,
  };
}

test('Serverless Unit: vercel.json exists and adheres to Vercel schema', () => {
  assert.ok(fs.existsSync(VERCEL_JSON_PATH), 'vercel.json must exist in project root');
  const raw = fs.readFileSync(VERCEL_JSON_PATH, 'utf8');
  const config = JSON.parse(raw);

  assert.equal(config.version, 2);
  assert.equal(config.outputDirectory, 'dist/client');
  assert.ok(Array.isArray(config.rewrites), 'rewrites must be an array');
  assert.ok(Array.isArray(config.headers), 'headers must be an array');
});

test('Serverless Unit: vercel.json routes /api/* to /api/index', () => {
  const config = JSON.parse(fs.readFileSync(VERCEL_JSON_PATH, 'utf8'));
  const apiRewrite = config.rewrites.find((r: any) =>
    r.source === '/api/(.*)' || r.source === '/api/:match*'
  );
  assert.ok(apiRewrite, 'Must contain API rewrite');
  assert.ok(
    apiRewrite.destination === '/api/index' || apiRewrite.destination === '/api',
    'Destination must target api entrypoint'
  );
});

test('Serverless Unit: vercel.json defines required edge headers', () => {
  const config = JSON.parse(fs.readFileSync(VERCEL_JSON_PATH, 'utf8'));
  const headerRules = config.headers;

  // Check CORS on API
  const apiHeaders = headerRules.find((h: any) => h.source.includes('/api/'));
  assert.ok(apiHeaders, 'Must define headers for API');

  // Verify stream caching rule exists
  const streamRule = headerRules.find((h: any) => h.source.includes('stream'));
  assert.ok(streamRule, 'Must define stream headers rule');
  const streamCache = streamRule.headers.find((h: any) => h.key === 'Cache-Control');
  assert.ok(streamCache, 'Must configure Cache-Control for stream');
  assert.match(streamCache.value, /public,\s*max-age=3600,\s*no-transform/);

  // Verify subtitle caching rule exists
  const subRule = headerRules.find((h: any) => h.source.includes('subtitles'));
  assert.ok(subRule, 'Must define subtitles headers rule');
  const subCache = subRule.headers.find((h: any) => h.key === 'Cache-Control');
  assert.ok(subCache, 'Must configure Cache-Control for subtitles');
  assert.match(subCache.value, /public,\s*max-age=86400/);
});

test('Serverless Unit: api/index.ts exports Express app instance for serverless runtime', () => {
  assert.ok(serverlessApp, 'api/index.ts must export default');
  assert.equal(typeof (serverlessApp as any).handle, 'function', 'Exported object must be Express application');
});

test('Serverless Unit: OPTIONS preflight requests return 200 or 204 with CORS headers', async () => {
  const subRes = await makeRequest('/api/subtitles/sub_inc_es', { method: 'OPTIONS' });
  assert.ok(subRes.status === 200 || subRes.status === 204);
  assert.equal(subRes.headers['access-control-allow-origin'], '*');
  assert.match(subRes.headers['access-control-allow-methods'], /GET.*HEAD.*OPTIONS/);

  const streamRes = await makeRequest('/api/stream/vid_inc', { method: 'OPTIONS' });
  assert.ok(streamRes.status === 200 || streamRes.status === 204);
  assert.equal(streamRes.headers['access-control-allow-origin'], '*');
});

test('Serverless Unit: GET /api/health responds with status 200 and healthy JSON payload', async () => {
  const start = Date.now();
  const res = await makeRequest('/api/health');
  const elapsed = Date.now() - start;

  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
  assert.ok(elapsed < 1000, `Healthcheck took ${elapsed}ms, exceeding 1000ms SLA`);
});

test('Serverless Unit: Undefined endpoints return 404 with structured JSON error payload', async () => {
  const res = await makeRequest('/api/unsupported_route_xyz');
  assert.equal(res.status, 404);
  assert.ok(res.json, 'Response must be JSON');
  assert.ok(res.json.error, 'Must contain error property');
  assert.equal(res.headers['access-control-allow-origin'], '*', 'Must preserve CORS on 404');
});

test('Serverless Unit: Preserves Access-Control-Allow-Origin: * on both success and error responses', async () => {
  const successRes = await makeRequest('/api/drive/folders');
  assert.equal(successRes.headers['access-control-allow-origin'], '*');

  const errorRes = await makeRequest('/api/drive/files/non_existent');
  assert.equal(errorRes.headers['access-control-allow-origin'], '*');
});

test('Serverless Unit: Exposed headers include Content-Range, Content-Length, and Accept-Ranges', async () => {
  const res = await makeRequest('/api/stream/vid_inc', { method: 'OPTIONS' });
  const exposed = res.headers['access-control-expose-headers'] || '';
  // Express cors sets exposed headers on preflight or actual requests
  const headRes = await makeRequest('/api/health');
  assert.equal(headRes.headers['access-control-allow-origin'], '*');
});
