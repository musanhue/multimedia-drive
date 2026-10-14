process.env.NODE_ENV = 'test';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { app } from '../../server/index';
import { parseHttpRange, DEFAULT_MAX_CHUNK_SIZE } from '../../server/proxy/rangeParser';
import { convertSrtToVtt, decodeSubtitleBuffer } from '../../server/subtitles/converter';
import { matchSubtitlesForVideo } from '../../server/subtitles/matcher';
import { MemoryCache } from '../../server/drive/cache';
import { normalizeString, matchCategory, normalizeCategoryParam } from '../../server/drive/traversal';

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

// Helper for HTTP requests
function request(
  method: string,
  reqPath: string,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
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
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ============================================================================
// 1. HTTP RANGE PARSER DEEP ADVERSARIAL FUZZING
// ============================================================================

test('Range Parser Fuzz: 1,000 malformed, boundary, and extreme range inputs', () => {
  const total = 50 * 1024 * 1024; // 50MB
  const adversarialRanges = [
    '',
    '   ',
    'bytes=',
    'bytes=-',
    'bytes=-0',
    'bytes=-1',
    'bytes=--5',
    'bytes=0-',
    'bytes=0-0',
    'bytes=0-1',
    'bytes=100-50',
    'bytes=50-50',
    'bytes=-9999999999999999999999999',
    'bytes=9999999999999999999999999-',
    'bytes=0-9999999999999999999999999',
    'bytes=NaN-NaN',
    'bytes=Infinity-Infinity',
    'bytes=undefined-undefined',
    'bytes=null-null',
    'bytes=0-100,200-300',
    'bytes=   0 - 500  ',
    'bytes=0 - 500',
    'bytes=0- 500',
    'bytes=0-500 ',
    'BYTES=0-500',
    'Bytes=0-500',
    'bytes = 0-500',
    'characters=0-500',
    'seconds=0-500',
    'bytes=1-2-3',
    'bytes=1..2',
    'bytes=1,2,3',
    'bytes=0-500; charset=utf-8',
    'bytes=0x10-0x20',
    'bytes=1e5-1e6',
    'bytes=-1000',
    `bytes=0-${total - 1}`,
    `bytes=0-${total}`,
    `bytes=${total - 1}-${total - 1}`,
    `bytes=${total}-${total}`,
  ];

  for (const r of adversarialRanges) {
    const res = parseHttpRange(r, total);
    assert.ok(
      res.status === 206 || res.status === 416,
      `Range ${r} must return either 206 or 416, got ${res.status}`
    );
    if (res.status === 206) {
      assert.ok(res.range.start >= 0, `start >= 0 for ${r}`);
      assert.ok(res.range.end >= res.range.start, `end >= start for ${r}`);
      assert.ok(res.range.end < total, `end < total for ${r}`);
      assert.ok(res.range.chunkSize <= DEFAULT_MAX_CHUNK_SIZE, `chunkSize <= 8MB for ${r}`);
      assert.equal(res.range.chunkSize, res.range.end - res.range.start + 1);
      assert.equal(res.range.contentRange, `bytes ${res.range.start}-${res.range.end}/${total}`);
    } else {
      assert.ok(res.contentRange.startsWith('bytes */'), `Content-Range must start with bytes */ for 416`);
    }
  }

  // Pseudo-random fuzzing (1000 random range strings)
  for (let i = 0; i < 1000; i++) {
    const s = Math.floor(Math.random() * (total * 2)) - Math.floor(Math.random() * 1000);
    const e = Math.floor(Math.random() * (total * 2)) - Math.floor(Math.random() * 1000);
    const rangeHeader = Math.random() > 0.5 ? `bytes=${s}-${e}` : `bytes=${s}-`;
    const res = parseHttpRange(rangeHeader, total);
    assert.ok(res.status === 206 || res.status === 416);
    if (res.status === 206) {
      assert.ok(res.range.chunkSize <= DEFAULT_MAX_CHUNK_SIZE);
      assert.ok(res.range.end < total);
    }
  }
});

// ============================================================================
// 2. PATH TRAVERSAL & INJECTION ATTACKS ACROSS ALL API ENDPOINTS
// ============================================================================

test('Path Traversal: Attacks across /api/drive/files/:category are blocked/sanitized', async () => {
  const attackVectors = [
    '..',
    '../..',
    '..%2f..',
    '..%2f..%2fetc%2fpasswd',
    '..\\..\\windows\\system32',
    '%2e%2e%2f',
    '%252e%252e%252f',
    '....//',
    '....\\\\',
    '/etc/passwd',
    'C:\\Windows\\System32',
    'peliculas/../../secret',
    'peliculas\0malicious',
    '<script>alert(1)</script>',
    "' OR '1'='1",
    '; DROP TABLE users;',
  ];

  for (const vector of attackVectors) {
    const res = await request('GET', `/api/drive/files/${encodeURIComponent(vector)}`);
    // Non-canonical categories must be rejected with 400 or return 404/structured error, never 500 or file leak
    assert.ok([400, 404, 200].includes(res.statusCode), `Status was ${res.statusCode} for vector ${vector}`);
    if (res.statusCode === 400) {
      const json = JSON.parse(res.body);
      assert.ok(json.error.includes('Invalid category'), 'Must cleanly state invalid category');
    }
  }
});

test('Path Traversal: Stream route /api/stream/:fileId handles traversal vectors gracefully', async () => {
  const attackFileIds = [
    '../../etc/passwd',
    '..\\..\\windows\\win.ini',
    '%2e%2e%2fcredentials.json',
    '....//....//package.json',
    '/etc/shadow',
  ];

  for (const id of attackFileIds) {
    const res = await request('GET', `/api/stream/${encodeURIComponent(id)}`);
    // Should return 404 or structured error, never leak server files
    assert.ok([400, 404, 500, 502].includes(res.statusCode));
    assert.ok(!res.body.includes('root:x:0:0'), 'Must never leak passwd');
    assert.ok(!res.body.includes('[extensions]'), 'Must never leak win.ini');
    assert.ok(!res.body.includes('GOOGLE_SERVICE_ACCOUNT_KEY'), 'Must never leak credentials');
  }
});

// ============================================================================
// 3. SUBTITLE ENGINE MASSIVE CUES & REGEX SPECIAL CHARACTERS
// ============================================================================

test('Subtitle Converter: 10,000 cues stress test executes rapidly without OOM', () => {
  const cueLines: string[] = [];
  for (let i = 1; i <= 10000; i++) {
    const startSec = (i * 2) % 3600;
    const endSec = startSec + 1;
    cueLines.push(
      `${i}\n00:00:${String(startSec).padStart(2, '0')},000 --> 00:00:${String(endSec).padStart(2, '0')},000\nCue text #${i} with <i>italic</i> and <font color="red">color</font>`
    );
  }
  const hugeSrt = cueLines.join('\n\n');

  const start = Date.now();
  const vtt = convertSrtToVtt(hugeSrt);
  const duration = Date.now() - start;

  assert.ok(vtt.startsWith('WEBVTT\n\n'), 'Must start with WEBVTT');
  assert.ok(!vtt.includes('<font'), 'Must strip <font> tags');
  assert.ok(vtt.includes('<i>italic</i>'), 'Must preserve <i> tags');
  assert.ok(vtt.includes('Cue text #10000'), 'Must contain last cue');
  assert.ok(duration < 2000, `Must convert 10,000 cues in < 2000ms, took ${duration}ms`);
});

test('Subtitle Matcher: File names with regex metacharacters do not crash with SyntaxError', () => {
  const specialVideoNames = [
    'Movie [2021] (1080p).mkv',
    'Movie + Special $100 ^version.mkv',
    'Movie (Director\'s Cut) [Remux] {4K}.mkv',
    'Movie.with.dots.and...extra...dots.mkv',
    'Movie?With*Wildcards.mkv',
    'Movie|Pipes|And|Bars.mkv',
    'Movie\\With\\Backslashes.mkv',
    'Movie/With/Slashes.mkv',
    'Movie [1] (2) {3} + 4 $ 5 ^ 6 .mkv',
  ];

  for (const name of specialVideoNames) {
    assert.doesNotThrow(() => {
      const matched = matchSubtitlesForVideo(name, [
        { id: 's1', name: 'Movie [2021] (1080p).es.srt' },
        { id: 's2', name: 'other.srt' },
      ]);
      assert.ok(Array.isArray(matched));
    }, `Matching for ${name} must not throw SyntaxError`);
  }
});

// ============================================================================
// 4. MEMORY CACHE CONCURRENCY & PROTOTYPE POLLUTION IMMUNITY
// ============================================================================

test('Memory Cache: Prototype pollution attempts (__proto__, constructor) are safe', () => {
  const cache = new MemoryCache();
  const evilKeys = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'];

  for (const key of evilKeys) {
    cache.set(key, { payload: 'safe' });
    const val = cache.get<{ payload: string }>(key);
    assert.ok(val && val.payload === 'safe');
    assert.equal(cache.has(key), true);
    cache.delete(key);
    assert.equal(cache.has(key), false);
  }

  // Ensure Object prototype was not contaminated
  assert.equal(({} as any).payload, undefined);
  cache.destroy();
});

test('Memory Cache: 10,000 high-frequency concurrent operations', async () => {
  const cache = new MemoryCache();
  const operations: Promise<void>[] = [];

  for (let i = 0; i < 5000; i++) {
    operations.push(
      (async (idx) => {
        const key = `key_${idx}`;
        cache.set(key, { idx });
        const res = cache.get<{ idx: number }>(key);
        assert.equal(res?.idx, idx);
        if (idx % 2 === 0) {
          cache.delete(key);
          assert.equal(cache.get(key), null);
        }
      })(i)
    );
  }

  await Promise.all(operations);
  cache.destroy();
});

// ============================================================================
// 5. CLIENT SOCKET ABORT & PREMATURE DISCONNECT RESILIENCE
// ============================================================================

test('Socket Resilience: Immediate client disconnect during stream does not crash server', async () => {
  // Open raw TCP socket, send HTTP GET for stream, and immediately destroy socket
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.write('GET /api/stream/vid_inc HTTP/1.1\r\n');
        socket.write('Host: 127.0.0.1\r\n');
        socket.write('Range: bytes=0-1048575\r\n');
        socket.write('\r\n');
        // Abruptly destroy socket before receiving full response
        socket.destroy();
        resolve();
      });
      socket.on('error', (err) => {
        // Socket errors on client side are expected upon destroy
        resolve();
      });
    });
  }

  // Verify server is still alive and responsive after socket aborts
  const healthCheck = await request('GET', '/api/health');
  assert.equal(healthCheck.statusCode, 200);
  const healthJson = JSON.parse(healthCheck.body);
  assert.equal(healthJson.status, 'ok');
});

// ============================================================================
// 6. BURST HIGH CONCURRENCY HTTP STRESS
// ============================================================================

test('Concurrency Stress: 100 concurrent HTTP Range and Subtitle requests succeed cleanly', async () => {
  const requests: Promise<any>[] = [];

  for (let i = 0; i < 50; i++) {
    requests.push(
      request('GET', '/api/stream/vid_inc', {
        Range: `bytes=${i * 1024}-${i * 1024 + 1023}`,
      }).then((res) => {
        assert.equal(res.statusCode, 206);
        assert.equal(res.headers['content-length'], '1024');
        assert.equal(res.headers['content-range'], `bytes ${i * 1024}-${i * 1024 + 1023}/4294967296`);
      })
    );

    requests.push(
      request('GET', '/api/subtitles/sub_inc_es').then((res) => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'text/vtt; charset=utf-8');
        assert.ok(res.body.startsWith('WEBVTT\n\n'));
      })
    );
  }

  await Promise.all(requests);
});
