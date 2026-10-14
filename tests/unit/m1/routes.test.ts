process.env.NODE_ENV = 'test';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../../../server/index';

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

async function makeRequest(path: string, options: any = {}) {
  const url = `${baseUrl}${path}`;
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

test('Routes: GET /api/health retorna 200 con estado de salud', async () => {
  const res = await makeRequest('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
  assert.equal(typeof res.json.version, 'string');
});

test('Routes: GET /api/drive/folders entrega categorías principales', async () => {
  const res = await makeRequest('/api/drive/folders');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.folders), 'folders debe ser un array');
  assert.ok(res.json.folders.length >= 5, 'Debe incluir al menos 5 categorías');
});

test('Routes: GET /api/drive/files/peliculas entrega lista de películas', async () => {
  const res = await makeRequest('/api/drive/files/peliculas');
  assert.equal(res.status, 200);
  assert.equal(res.json.category, 'peliculas');
  assert.ok(Array.isArray(res.json.items));
  assert.ok(res.json.items.length > 0);
  const first = res.json.items[0];
  assert.ok(first.id);
  assert.ok(first.name);
  assert.ok(first.mimeType);
});

test('Routes: GET /api/drive/refresh invalida la caché en memoria', async () => {
  const res = await makeRequest('/api/drive/refresh');
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ok');
});

test('Routes: HEAD /api/stream/:fileId responde 200 con cabeceras de tamaño y rango', async () => {
  const res = await makeRequest('/api/stream/vid_inc', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['accept-ranges'], 'bytes');
  assert.ok(parseInt(res.headers['content-length'], 10) > 0);
  assert.ok(res.headers['content-type'].includes('video/'));
});

test('Routes: GET /api/stream/:fileId con Range responde 206 Partial Content', async () => {
  const res = await makeRequest('/api/stream/vid_inc', {
    headers: { Range: 'bytes=0-1023' },
  });
  assert.equal(res.status, 206);
  assert.equal(res.headers['accept-ranges'], 'bytes');
  assert.equal(res.headers['content-length'], '1024');
  assert.match(res.headers['content-range'], /^bytes 0-1023\/\d+$/);
});

test('Routes: GET /api/subtitles/:id entrega WebVTT con MIME text/vtt; charset=utf-8', async () => {
  const res = await makeRequest('/api/subtitles/sub_inc_es');
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/vtt'));
  assert.ok(res.text.startsWith('WEBVTT\n\n') || res.text.startsWith('WEBVTT\r\n\r\n'));
});

test('Routes: GET /api/subtitles/list/:fileId entrega lista de pistas de subtítulos', async () => {
  const res = await makeRequest('/api/subtitles/list/vid_inc');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.subtitles));
  assert.ok(res.json.subtitles.length > 0);
});

test('Routes: Cabecera X-Simulate-Auth-Failure produce 401 Unauthorized', async () => {
  const res = await makeRequest('/api/drive/folders', {
    headers: { 'X-Simulate-Auth-Failure': 'true' },
  });
  assert.equal(res.status, 401);
  assert.ok(res.json.error);
});

test('Routes: Cabecera X-Simulate-Rate-Limit produce 429 Too Many Requests', async () => {
  const res = await makeRequest('/api/drive/folders', {
    headers: { 'X-Simulate-Rate-Limit': 'true' },
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers['retry-after'], '5');
  assert.ok(res.json.error);
});
