process.env.NODE_ENV = 'test';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../../server/index';

let server: http.Server;
let port: number;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

function request(
  method: string,
  reqPath: string,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string; json?: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let json: any = undefined;
          try {
            json = JSON.parse(body);
          } catch {}
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body,
            json,
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('Adversarial M4: OPTIONS preflight requests across multiple endpoints', async (t) => {
  const routes = [
    '/api/stream/123',
    '/api/stream/vid_inc',
    '/api/subtitles/abc',
    '/api/subtitles/sub_inc_es',
    '/api/metadata/enrich?title=Inception&year=2010',
    '/api/drive/folders',
    '/api/drive/files/peliculas',
  ];

  for (const route of routes) {
    await t.test(`OPTIONS preflight for ${route}`, async () => {
      const res = await request('OPTIONS', route, {
        Origin: 'https://smart-tv.samsung.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Range, Accept-Ranges, Content-Type',
      });

      assert.ok(
        res.statusCode === 200 || res.statusCode === 204,
        `Expected status 200 or 204 for ${route}, got ${res.statusCode}`
      );
      assert.equal(
        res.headers['access-control-allow-origin'],
        '*',
        `Missing or invalid Access-Control-Allow-Origin header for ${route}`
      );
      assert.ok(
        res.headers['access-control-allow-methods'],
        `Missing Access-Control-Allow-Methods for ${route}`
      );
    });
  }
});

test('Adversarial M4: Arbitrary unsupported routes return 404 with structured JSON and CORS', async (t) => {
  const arbitrary404Routes = [
    '/api/undefined_route_xyz',
    '/api/deep/nested/404',
    '/api/drive/unknown_category_endpoint',
    '/api/stream/nested/invalid/path',
    '/api/subtitles/nested/unsupported/route',
    '/api/metadata/enrich/extra/invalid',
    '/api/nonexistent-action-fuzz-12345',
  ];

  for (const route of arbitrary404Routes) {
    await t.test(`404 check for ${route}`, async () => {
      const res = await request('GET', route, {
        Origin: 'https://smart-tv.samsung.com',
      });

      assert.equal(res.statusCode, 404, `Expected 404 for ${route}, got ${res.statusCode}`);
      assert.ok(res.json, `Response for ${route} must be valid JSON: "${res.body}"`);
      assert.ok(res.json.error, `Response JSON for ${route} must have "error" property`);
      assert.equal(
        res.headers['access-control-allow-origin'],
        '*',
        `CORS must be preserved on 404 for ${route}`
      );
    });
  }
});

test('Adversarial M4: Cache-Control header compliance on streams and subtitles', async (t) => {
  await t.test('Stream endpoint responds with public, max-age=3600, no-transform', async () => {
    // Range request to stream endpoint
    const res = await request('GET', '/api/stream/vid_inc', {
      Range: 'bytes=0-1024',
    });

    assert.equal(res.statusCode, 206, `Expected 206 Partial Content, got ${res.statusCode}`);
    const cacheControl = res.headers['cache-control'];
    assert.ok(cacheControl, 'Missing Cache-Control header on stream response');
    assert.match(
      cacheControl as string,
      /public,\s*max-age=3600,\s*no-transform/,
      `Cache-Control header does not match required contract: ${cacheControl}`
    );
  });

  await t.test('HEAD request to stream endpoint includes Cache-Control', async () => {
    const res = await request('HEAD', '/api/stream/vid_inc');
    assert.equal(res.statusCode, 200);
    const cacheControl = res.headers['cache-control'];
    assert.ok(cacheControl, 'Missing Cache-Control header on HEAD stream response');
    assert.match(cacheControl as string, /public,\s*max-age=3600,\s*no-transform/);
  });

  await t.test('Subtitle endpoint responds with public, max-age=86400', async () => {
    const res = await request('GET', '/api/subtitles/sub_inc_es');
    assert.equal(res.statusCode, 200, `Expected 200 OK for subtitle, got ${res.statusCode}`);
    const cacheControl = res.headers['cache-control'];
    assert.ok(cacheControl, 'Missing Cache-Control header on subtitles response');
    assert.match(
      cacheControl as string,
      /public,\s*max-age=86400/,
      `Subtitle Cache-Control header does not match required contract: ${cacheControl}`
    );
  });
});

test('Adversarial M4: Health check response time and container readiness', async (t) => {
  await t.test('GET /api/health responds within strict 500ms serverless SLA', async () => {
    const start = Date.now();
    const res = await request('GET', '/api/health');
    const elapsed = Date.now() - start;

    assert.equal(res.statusCode, 200);
    assert.ok(res.json, 'Healthcheck response must be JSON');
    assert.equal(res.json.status, 'ok');
    assert.equal(res.json.version, '1.0.0');
    assert.ok('driveConnected' in res.json);
    assert.ok('serviceAccountConfigured' in res.json);
    assert.ok('timestamp' in res.json);
    assert.ok(elapsed < 500, `Healthcheck response time ${elapsed}ms exceeded 500ms SLA`);
  });

  await t.test('Rapid burst health check (50 concurrent requests) maintains latency SLA', async () => {
    const start = Date.now();
    const promises = Array.from({ length: 50 }).map(() => request('GET', '/api/health'));
    const results = await Promise.all(promises);
    const elapsed = Date.now() - start;

    for (const res of results) {
      assert.equal(res.statusCode, 200);
      assert.equal(res.json?.status, 'ok');
    }
    const avgLatency = elapsed / 50;
    assert.ok(avgLatency < 50, `Average burst latency ${avgLatency}ms exceeds threshold`);
  });
});
