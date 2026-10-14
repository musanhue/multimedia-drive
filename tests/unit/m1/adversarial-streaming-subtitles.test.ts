process.env.NODE_ENV = 'test';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../../../server/index';
import { parseHttpRange, DEFAULT_MAX_CHUNK_SIZE } from '../../../server/proxy/rangeParser';
import { convertSrtToVtt, decodeSubtitleBuffer } from '../../../server/subtitles/converter';

const MAX_8MB = 8 * 1024 * 1024; // 8,388,608 bytes

// =========================================================================
// SECTION 1: Extreme & Malformed Range Headers (Unit / Parser Level)
// =========================================================================

test('Adversarial Range: bytes=0-0 (single byte request)', () => {
  const total = 100 * 1024 * 1024;
  const res = parseHttpRange('bytes=0-0', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, 0);
    assert.equal(res.range.chunkSize, 1);
    assert.equal(res.range.totalSize, total);
    assert.equal(res.range.contentRange, `bytes 0-0/${total}`);
  }
});

test('Adversarial Range: bytes=0-1 (two byte request)', () => {
  const total = 50 * 1024 * 1024;
  const res = parseHttpRange('bytes=0-1', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, 1);
    assert.equal(res.range.chunkSize, 2);
    assert.equal(res.range.totalSize, total);
    assert.equal(res.range.contentRange, `bytes 0-1/${total}`);
  }
});

test('Adversarial Range: bytes=999999999- against 50MB file returns 416', () => {
  const total = 50 * 1024 * 1024; // 50MB < 999999999
  const res = parseHttpRange('bytes=999999999-', total);
  assert.equal(res.status, 416);
  assert.equal(res.contentRange, `bytes */${total}`);
});

test('Adversarial Range: bytes=999999999- against 4GB file is valid seeking offset clamped to 8MB', () => {
  const total = 4294967296; // 4GB > 999999999
  const res = parseHttpRange('bytes=999999999-', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 999999999);
    assert.equal(res.range.end, 999999999 + MAX_8MB - 1);
    assert.equal(res.range.chunkSize, MAX_8MB);
    assert.equal(res.range.contentRange, `bytes 999999999-${999999999 + MAX_8MB - 1}/${total}`);
  }
});

test('Adversarial Range: bytes=-1000 (suffix range last 1000 bytes)', () => {
  const total = 20 * 1024 * 1024;
  const res = parseHttpRange('bytes=-1000', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, total - 1000);
    assert.equal(res.range.end, total - 1);
    assert.equal(res.range.chunkSize, 1000);
    assert.equal(res.range.contentRange, `bytes ${total - 1000}-${total - 1}/${total}`);
  }
});

test('Adversarial Range: bytes=500-100 (inverted range returns 416)', () => {
  const total = 10 * 1024 * 1024;
  const res = parseHttpRange('bytes=500-100', total);
  assert.equal(res.status, 416);
  assert.equal(res.contentRange, `bytes */${total}`);
});

test('Adversarial Range: bytes=abc-def (non-numeric returns 416)', () => {
  const total = 10 * 1024 * 1024;
  const res = parseHttpRange('bytes=abc-def', total);
  assert.equal(res.status, 416);
  assert.equal(res.contentRange, `bytes */${total}`);
});

test('Adversarial Range: bytes=, (empty range specifier returns 416)', () => {
  const total = 10 * 1024 * 1024;
  const res = parseHttpRange('bytes=,', total);
  assert.equal(res.status, 416);
  assert.equal(res.contentRange, `bytes */${total}`);
});

test('Adversarial Range: multipart ranges selects first range', () => {
  const total = 50 * 1024 * 1024;
  const res = parseHttpRange('bytes=0-499, 1000-1499', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, 499);
    assert.equal(res.range.chunkSize, 500);
    assert.equal(res.range.contentRange, `bytes 0-499/${total}`);
  }
});

test('Adversarial Range: Other malformed headers rejected with 416', () => {
  const total = 10 * 1024 * 1024;
  assert.equal(parseHttpRange('bytes=', total).status, 416);
  assert.equal(parseHttpRange('bytes=-', total).status, 416);
  assert.equal(parseHttpRange('bytes=--100', total).status, 416);
  assert.equal(parseHttpRange('bytes=10-20-30', total).status, 416);
  assert.equal(parseHttpRange('bytes=-0', total).status, 416);
  assert.equal(parseHttpRange('items=0-10', total).status, 416);
  assert.equal(parseHttpRange('bytes=   ', total).status, 416);
  assert.equal(parseHttpRange('bytes=NaN-10', total).status, 416);
  assert.equal(parseHttpRange('bytes=0-NaN', total).status, 416);
  assert.equal(parseHttpRange('bytes=0-', 0).status, 416);
  assert.equal(parseHttpRange('bytes=0-', -100).status, 416);
});

// =========================================================================
// SECTION 2: 8MB Chunk Clamping Verification
// =========================================================================

test('Chunk Clamping: Open-ended bytes=0- on 100MB strictly clamped to 8MB', () => {
  const total = 100 * 1024 * 1024;
  const res = parseHttpRange('bytes=0-', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, MAX_8MB - 1);
    assert.equal(res.range.chunkSize, MAX_8MB);
    assert.equal(res.range.contentRange, `bytes 0-${MAX_8MB - 1}/${total}`);
  }
});

test('Chunk Clamping: Explicit request for 20MB (bytes=0-20971519) strictly clamped to 8MB', () => {
  const total = 100 * 1024 * 1024;
  const res = parseHttpRange('bytes=0-20971519', total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, 0);
    assert.equal(res.range.end, MAX_8MB - 1);
    assert.equal(res.range.chunkSize, MAX_8MB);
    assert.equal(res.range.contentRange, `bytes 0-${MAX_8MB - 1}/${total}`);
  }
});

test('Chunk Clamping: Mid-file seeking (bytes=10485760-) strictly clamped to 8MB', () => {
  const total = 100 * 1024 * 1024;
  const start = 10485760;
  const res = parseHttpRange(`bytes=${start}-`, total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, start);
    assert.equal(res.range.end, start + MAX_8MB - 1);
    assert.equal(res.range.chunkSize, MAX_8MB);
    assert.equal(res.range.contentRange, `bytes ${start}-${start + MAX_8MB - 1}/${total}`);
  }
});

test('Chunk Clamping: Suffix range exceeding 8MB (bytes=-16777216) on 50MB file strictly clamped to 8MB', () => {
  const total = 50 * 1024 * 1024;
  const suffix16MB = 16 * 1024 * 1024;
  const res = parseHttpRange(`bytes=-${suffix16MB}`, total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    const expectedStart = total - suffix16MB;
    assert.equal(res.range.start, expectedStart);
    assert.equal(res.range.end, expectedStart + MAX_8MB - 1);
    assert.equal(res.range.chunkSize, MAX_8MB);
    assert.equal(res.range.contentRange, `bytes ${expectedStart}-${expectedStart + MAX_8MB - 1}/${total}`);
  }
});

test('Chunk Clamping: Request near EOF delivers exact remainder without padding', () => {
  const total = 10 * 1024 * 1024; // 10MB
  const start = 9 * 1024 * 1024 + 512 * 1024; // 9.5MB -> 512KB left
  const res = parseHttpRange(`bytes=${start}-`, total);
  assert.equal(res.status, 206);
  if (res.status === 206) {
    assert.equal(res.range.start, start);
    assert.equal(res.range.end, total - 1);
    assert.equal(res.range.chunkSize, 512 * 1024);
    assert.equal(res.range.contentRange, `bytes ${start}-${total - 1}/${total}`);
  }
});

test('Content-Range exactness: Format verification across 100 pseudo-random ranges', () => {
  const total = 250 * 1024 * 1024; // 250MB
  for (let i = 0; i < 100; i++) {
    const randomStart = Math.floor(Math.random() * (total - 1000));
    const randomSpan = Math.floor(Math.random() * 20 * 1024 * 1024); // 0 to 20MB
    const reqEnd = randomStart + randomSpan;
    const res = parseHttpRange(`bytes=${randomStart}-${reqEnd}`, total);
    assert.equal(res.status, 206);
    if (res.status === 206) {
      assert.ok(res.range.chunkSize <= MAX_8MB, `Chunk ${res.range.chunkSize} must be <= 8MB`);
      assert.equal(res.range.chunkSize, res.range.end - res.range.start + 1);
      assert.equal(res.range.contentRange, `bytes ${res.range.start}-${res.range.end}/${total}`);
      assert.match(res.range.contentRange, /^bytes \d+-\d+\/\d+$/);
    }
  }
});

// =========================================================================
// SECTION 3: Subtitle Engine Adversarial Tests
// =========================================================================

test('Adversarial Subtitles: Windows CRLF vs Unix LF vs Mac CR normalization', () => {
  const srtMixed = '1\r\n00:00:01,000 --> 00:00:02,000\r\nLínea CRLF\r\n\r2\n00:00:03,000 --> 00:00:04,000\nLínea LF\n\r3\r00:00:05,000 --> 00:00:06,000\rLínea CR\r';
  const vtt = convertSrtToVtt(srtMixed);
  assert.ok(vtt.startsWith('WEBVTT\n\n'), 'Must start with WEBVTT header and double LF');
  assert.ok(!vtt.includes('\r'), 'Must contain zero CR characters');
  assert.ok(vtt.includes('00:00:01.000 --> 00:00:02.000'));
  assert.ok(vtt.includes('00:00:03.000 --> 00:00:04.000'));
  assert.ok(vtt.includes('00:00:05.000 --> 00:00:06.000'));
  assert.ok(vtt.includes('Línea CRLF'));
  assert.ok(vtt.includes('Línea LF'));
  assert.ok(vtt.includes('Línea CR'));
});

test('Adversarial Subtitles: Missing indices and non-numeric indices', () => {
  const srtNoIndices = `00:00:01,234 --> 00:00:03,456
Primer texto sin índice numérico

00:00:04,567 --> 00:00:06,789
Segundo texto sin índice numérico`;

  const vtt = convertSrtToVtt(srtNoIndices);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:00:01.234 --> 00:00:03.456'));
  assert.ok(vtt.includes('00:00:04.567 --> 00:00:06.789'));
  assert.ok(vtt.includes('Primer texto sin índice numérico'));
  assert.ok(vtt.includes('Segundo texto sin índice numérico'));
});

test('Adversarial Subtitles: Corrupted timestamps (1-digit hours, missing hours, spaces)', () => {
  const srtWeirdTimestamps = `1
1:02:03,456 --> 1:02:05,678
Hora de un solo dígito

2
05:20,500   -->   05:25,800
Sin horas explícitas y espacios amplios

3
00:10:00.123 --> 00:10:02.456
Ya venía con punto en lugar de coma`;

  const vtt = convertSrtToVtt(srtWeirdTimestamps);
  assert.ok(vtt.includes('01:02:03.456 --> 01:02:05.678'), 'Debe rellenar 1 a 01');
  assert.ok(vtt.includes('00:05:20.500 --> 00:05:25.800'), 'Debe anteponer 00: para minutos');
  assert.ok(vtt.includes('00:10:00.123 --> 00:10:02.456'), 'Debe preservar marcas con punto');
});

test('Adversarial Subtitles: HTML tags (<b>, <i>, <font>) and SSA tags ({\\an8}, {\\pos})', () => {
  const srtTags = `1
00:00:01,000 --> 00:00:04,000
{\\an8}{\\pos(192,200)}<font color="#ffff00"><b>Texto importante</b></font> e <i>itálica</i>

2
00:00:05,000 --> 00:00:08,000
{\\b1\\c&H0000FF&}Subtítulo rojo con <font face="Arial">fuente personalizada</font>`;

  const vtt = convertSrtToVtt(srtTags);
  assert.ok(!vtt.includes('<font'), 'Must strip <font> open tags');
  assert.ok(!vtt.includes('</font>'), 'Must strip </font> close tags');
  assert.ok(!vtt.includes('{\\an8}'), 'Must strip {\\an8}');
  assert.ok(!vtt.includes('{\\pos(192,200)}'), 'Must strip {\\pos}');
  assert.ok(!vtt.includes('{\\b1\\c&H0000FF&}'), 'Must strip {\\b1...}');
  assert.ok(vtt.includes('<b>Texto importante</b>'), 'Must preserve <b> tag');
  assert.ok(vtt.includes('<i>itálica</i>'), 'Must preserve <i> tag');
  assert.ok(vtt.includes('fuente personalizada'), 'Must preserve inner text from font tag');
});

test('Adversarial Subtitles: ISO-8859-1 accented characters (á, é, í, ó, ú, ñ, ¿, ¡, Á, É, Í, Ó, Ú, Ñ)', () => {
  const spanishText = '1\r\n00:00:01,000 --> 00:00:03,000\r\n¿Quién habló? ¡El señor Martínez comió ñandú en Málaga! Árbol, Época, Índigo, Órbita, Úvula, Ñoqui.\r\n';
  const latin1Buf = Buffer.from(spanishText, 'latin1');
  const vtt = convertSrtToVtt(latin1Buf);

  assert.ok(vtt.includes('¿Quién habló?'), 'Must decode ¿ and í');
  assert.ok(vtt.includes('¡El señor Martínez comió ñandú en Málaga!'), 'Must decode ¡, ñ, í, ó, ú, á');
  assert.ok(vtt.includes('Árbol, Época, Índigo, Órbita, Úvula, Ñoqui.'), 'Must decode uppercase Spanish accents');
  assert.ok(!vtt.includes('\uFFFD'), 'Must not contain any replacement characters');
});

test('Adversarial Subtitles: Edge cases - Empty, whitespace-only, residual BOM', () => {
  const emptyVtt = convertSrtToVtt(Buffer.from(''));
  assert.equal(emptyVtt, 'WEBVTT\n\n\n');

  const wsVtt = convertSrtToVtt(Buffer.from('   \n\r\n\t  '));
  assert.equal(wsVtt, 'WEBVTT\n\n\n');

  const alreadyVtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n{\\an8}<font color="red">Limpio</font>';
  const cleanVtt = convertSrtToVtt(alreadyVtt);
  assert.ok(cleanVtt.startsWith('WEBVTT\n\n'));
  assert.ok(!cleanVtt.includes('{\\an8}'));
  assert.ok(!cleanVtt.includes('<font'));
  assert.ok(cleanVtt.includes('Limpio'));
});

// =========================================================================
// SECTION 4: Live HTTP Endpoint Adversarial Stress Tests
// =========================================================================

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

function httpStreamRequest(path: string, headers: Record<string, string> = {}): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  error?: Error;
}> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on('error', (err) => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            error: err,
          });
        });
      }
    );
    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        headers: {},
        body: Buffer.alloc(0),
        error: err,
      });
    });
    req.end();
  });
}

test('HTTP Route Stress: bytes=0-0 returns 206 with Content-Length 1 and exact Content-Range', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=0-0' });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-length'], '1');
  assert.equal(res.body.length, 1);
  assert.match(res.headers['content-range'] || '', /^bytes 0-0\/\d+$/);
  assert.equal(res.headers['accept-ranges'], 'bytes');
});

test('HTTP Route Stress: bytes=0-1 returns 206 with Content-Length 2 and exact Content-Range', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=0-1' });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-length'], '2');
  assert.equal(res.body.length, 2);
  assert.match(res.headers['content-range'] || '', /^bytes 0-1\/\d+$/);
});

test('HTTP Route Stress: bytes=999999999- returns 416 against file smaller than 999999999 (mus_001)', async () => {
  const res = await httpStreamRequest('/api/stream/mus_001', { Range: 'bytes=999999999-' });
  assert.equal(res.statusCode, 416);
  assert.match(res.headers['content-range'] || '', /^bytes \*\/\d+$/);
  assert.equal(res.headers['content-length'], '0');
});

test('HTTP Route Stress: bytes=5000000000- returns 416 against 4GB file (vid_inc)', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=5000000000-' });
  assert.equal(res.statusCode, 416);
  assert.match(res.headers['content-range'] || '', /^bytes \*\/4294967296$/);
  assert.equal(res.headers['content-length'], '0');
});

test('HTTP Route Stress: bytes=-1000 returns 206 with Content-Length 1000 and valid suffix Content-Range', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=-1000' });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-length'], '1000');
  const match = (res.headers['content-range'] || '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  assert.ok(match, 'Must match Content-Range syntax');
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  const total = parseInt(match[3], 10);
  assert.equal(end, total - 1);
  assert.equal(start, total - 1000);
  assert.equal(end - start + 1, 1000);
});

test('HTTP Route Stress: bytes=500-100 returns 416', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=500-100' });
  assert.equal(res.statusCode, 416);
  assert.match(res.headers['content-range'] || '', /^bytes \*\/\d+$/);
});

test('HTTP Route Stress: bytes=abc-def returns 416', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=abc-def' });
  assert.equal(res.statusCode, 416);
  assert.match(res.headers['content-range'] || '', /^bytes \*\/\d+$/);
});

test('HTTP Route Stress: bytes=, returns 416', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=,' });
  assert.equal(res.statusCode, 416);
  assert.match(res.headers['content-range'] || '', /^bytes \*\/\d+$/);
});

test('HTTP Route Stress: Multipart range bytes=0-50, 100-200 selects first range', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=0-50, 100-200' });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-length'], '51');
  assert.match(res.headers['content-range'] || '', /^bytes 0-50\/\d+$/);
});

test('HTTP Route Stress: Open-ended bytes=0- clamps declared Content-Range and Content-Length to 8MB', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=0-' });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-length'], MAX_8MB.toString());
  assert.match(res.headers['content-range'] || '', new RegExp(`^bytes 0-${MAX_8MB - 1}/\\d+$`));

  // EMPIRICAL BUG DETECTION:
  // In server/routes/stream.ts mock fallback:
  // Content-Length declares 8MB (8388608), but bodyBuffer is truncated to Math.min(chunkSize, 65536) = 65536!
  // This produces an HTTP/1.1 protocol violation: declared 8388608 bytes vs actual 65536 bytes transferred!
  const declaredContentLength = parseInt(res.headers['content-length'] || '0', 10);
  const actualTransferredBytes = res.body.length;
  assert.equal(actualTransferredBytes, declaredContentLength, 'Transferred body bytes must exactly match declared Content-Length');
  assert.equal(declaredContentLength, MAX_8MB, 'Header must declare clamped 8MB chunk');
});

test('HTTP Route Subtitles: GET /api/subtitles/sub_inc_es returns clean WebVTT', async () => {
  const res = await httpStreamRequest('/api/subtitles/sub_inc_es');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type']?.includes('text/vtt'));
  const bodyText = res.body.toString('utf8');
  assert.ok(bodyText.startsWith('WEBVTT\n\n'));
  assert.ok(!bodyText.includes('\r'));
});

test('HTTP Route Subtitles: GET /api/subtitles/sub_latin1 returns Spanish diacritics decoded', async () => {
  const res = await httpStreamRequest('/api/subtitles/sub_latin1');
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type']?.includes('text/vtt'));
  const bodyText = res.body.toString('utf8');
  assert.ok(!bodyText.includes('\uFFFD'), 'Must not contain unicode replacement character');
});

test('Adversarial Range: Case-insensitive Bytes= and BYTES= headers', () => {
  const total = 50 * 1024 * 1024;
  const r1 = parseHttpRange('Bytes=0-100', total);
  assert.equal(r1.status, 206);
  const r2 = parseHttpRange('BYTES=0-100', total);
  assert.equal(r2.status, 206);
  const r3 = parseHttpRange('bYtEs=10-20', total);
  assert.equal(r3.status, 206);
  if (r3.status === 206) {
    assert.equal(r3.range.start, 10);
    assert.equal(r3.range.end, 20);
    assert.equal(r3.range.chunkSize, 11);
  }
});

test('Adversarial Range: Alphanumeric and malformed offsets rejected with 416', () => {
  const total = 50 * 1024 * 1024;
  assert.equal(parseHttpRange('bytes=0-100abc', total).status, 416);
  assert.equal(parseHttpRange('bytes=0abc-100', total).status, 416);
  assert.equal(parseHttpRange('bytes=-100abc', total).status, 416);
  assert.equal(parseHttpRange('bytes=0x10-0x20', total).status, 416);
  assert.equal(parseHttpRange('bytes=100b-200', total).status, 416);
  assert.equal(parseHttpRange('bytes=0-100MB', total).status, 416);
  assert.equal(parseHttpRange('bytes=-500B', total).status, 416);
  assert.equal(parseHttpRange('bytes=1e6-2e6', total).status, 416);
  assert.equal(parseHttpRange('bytes=1.5-3.5', total).status, 416);
  assert.equal(parseHttpRange('bytes=foo-bar', total).status, 416);
  assert.equal(parseHttpRange('bytes=foo-', total).status, 416);
  assert.equal(parseHttpRange('bytes=-bar', total).status, 416);
  assert.equal(parseHttpRange('bytes=-0', total).status, 416);
  assert.equal(parseHttpRange('bytes=10-20-30', total).status, 416);
  assert.equal(parseHttpRange('bytes=--50', total).status, 416);
  assert.equal(parseHttpRange('bytes=+-50', total).status, 416);
  assert.equal(parseHttpRange('bytes=null-100', total).status, 416);
  assert.equal(parseHttpRange('bytes=undefined-', total).status, 416);
});

test('Adversarial Subtitles: Single-digit hours, minutes, and seconds normalization', () => {
  // Case A: Single-digit minutes (5:20,500)
  const vttA = convertSrtToVtt('1\n5:20,500 --> 5:25,800\nTexto');
  assert.ok(vttA.includes('00:05:20.500 --> 00:05:25.800'), 'Minutes must be 2-digit zero-padded and prefixed with 00: hours');

  // Case B: Single-digit hours (1:02:03,456)
  const vttB = convertSrtToVtt('1\n1:02:03,456 --> 2:03:04,567\nTexto');
  assert.ok(vttB.includes('01:02:03.456 --> 02:03:04.567'), 'Hours must be 2-digit zero-padded');

  // Case C: Single-digit seconds (00:01:2,500)
  const vttC = convertSrtToVtt('1\n00:01:2,500 --> 00:01:4,500\nTexto');
  assert.ok(vttC.includes('00:01:02.500 --> 00:01:04.500'), 'Seconds must be 2-digit zero-padded');

  // Case D: Single-digit minutes and single-digit seconds (1:2,300)
  const vttD = convertSrtToVtt('1\n1:2,300 --> 1:5,400\nTexto');
  assert.ok(vttD.includes('00:01:02.300 --> 00:01:05.400'), 'Single digit minutes and seconds must be zero-padded');
});

test('Adversarial Subtitles: Non-3-digit milliseconds normalization', () => {
  // 1-digit milliseconds (,5 -> .500)
  const vtt1 = convertSrtToVtt('1\n00:00:01,5 --> 00:00:02,8\nTexto');
  assert.ok(vtt1.includes('00:00:01.500 --> 00:00:02.800'), '1-digit ms should pad to 500ms');

  // 2-digit milliseconds (,23 -> .230)
  const vtt2 = convertSrtToVtt('1\n00:00:01,23 --> 00:00:02,45\nTexto');
  assert.ok(vtt2.includes('00:00:01.230 --> 00:00:02.450'), '2-digit ms should pad to 230ms');

  // 4-digit milliseconds (,2345 -> .234)
  const vtt4 = convertSrtToVtt('1\n00:00:01,2345 --> 00:00:02,6789\nTexto');
  assert.ok(vtt4.includes('00:00:01.234 --> 00:00:02.678'), '4-digit ms should truncate to 3 digits');

  // Dot separator with variable milliseconds
  const vttDot = convertSrtToVtt('1\n1:2:3.4 --> 1:2:5.67\nTexto');
  assert.ok(vttDot.includes('01:02:03.400 --> 01:02:05.670'), 'Dot separator with variable ms should normalize properly');
});

test('Adversarial Subtitles: Cue settings / extra positioning attributes preserved', () => {
  const srtCue = '1\n5:20,500 --> 5:25,800 line:0% position:50% align:left\nTexto posicionado';
  const vtt = convertSrtToVtt(srtCue);
  assert.ok(vtt.includes('00:05:20.500 --> 00:05:25.800 line:0% position:50% align:left'), 'Cue settings must be preserved after normalized timestamp');
});

test('HTTP Route Stress: Case-insensitive Bytes= range in live HTTP request returns 206', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc', { Range: 'Bytes=100-200' });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-length'], '101');
  assert.equal(res.body.length, 101);
  assert.match(res.headers['content-range'] || '', /^bytes 100-200\/\d+$/);
});

test('HTTP Route Stress: Alphanumeric and invalid Range headers in live HTTP request return 416', async () => {
  const r1 = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=0-100abc' });
  assert.equal(r1.statusCode, 416);
  assert.equal(r1.headers['content-length'], '0');
  assert.equal(r1.body.length, 0);

  const r2 = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=xyz-' });
  assert.equal(r2.statusCode, 416);
  assert.equal(r2.headers['content-length'], '0');
  assert.equal(r2.body.length, 0);

  const r3 = await httpStreamRequest('/api/stream/vid_inc', { Range: 'bytes=-500B' });
  assert.equal(r3.statusCode, 416);
  assert.equal(r3.headers['content-length'], '0');
  assert.equal(r3.body.length, 0);
});

test('HTTP Route Stress: Content-Length exactly matches transferred body bytes across diverse ranges', async () => {
  // Test distinct range spans to ensure zero discrepancy between Content-Length and body.length
  const testRanges = [
    'bytes=0-0',
    'bytes=0-15',
    'bytes=100-500',
    'bytes=65536-131071',
    'bytes=100000-200000',
    'bytes=-65536',
    'bytes=-1024',
    'bytes=1048576-', // 1MB onwards clamped to 8MB
  ];

  for (const range of testRanges) {
    const res = await httpStreamRequest('/api/stream/vid_inc', { Range: range });
    assert.equal(res.statusCode, 206, `Expected 206 for Range: ${range}`);
    const declaredLen = parseInt(res.headers['content-length'] || '0', 10);
    const actualLen = res.body.length;
    assert.equal(actualLen, declaredLen, `Content-Length (${declaredLen}) must match body length (${actualLen}) for ${range}`);
    assert.ok(actualLen > 0, `Body length must be > 0 for ${range}`);
  }
});

test('HTTP Route Stress: Stream request without Range header delivers clamped chunk with matching Content-Length', async () => {
  const res = await httpStreamRequest('/api/stream/vid_inc');
  assert.equal(res.statusCode, 206);
  const declaredLen = parseInt(res.headers['content-length'] || '0', 10);
  assert.equal(res.body.length, declaredLen);
  assert.equal(declaredLen, MAX_8MB);
  assert.match(res.headers['content-range'] || '', new RegExp(`^bytes 0-${MAX_8MB - 1}/\\d+$`));
});

