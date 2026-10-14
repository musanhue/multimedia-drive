const assert = require('node:assert/strict');

function decodeSubtitleBuffer(buf) {
  // Check UTF-16 BOMs
  if (buf.length >= 2) {
    if (buf[0] === 0xFF && buf[1] === 0xFE) {
      return buf.subarray(2).toString('utf16le');
    }
    if (buf[0] === 0xFE && buf[1] === 0xFF) {
      const swapped = Buffer.alloc(buf.length - 2);
      for (let i = 2; i < buf.length; i += 2) {
        swapped[i - 2] = buf[i + 1] || 0;
        swapped[i - 1] = buf[i];
      }
      return swapped.toString('utf16le');
    }
  }

  // Check UTF-8 BOM
  let startIdx = 0;
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    startIdx = 3;
  }
  const slice = buf.subarray(startIdx);

  // Attempt UTF-8
  const utf8Str = slice.toString('utf8');
  // If replacement char \uFFFD is present, fallback to latin1 (Windows-1252 / ISO-8859-1)
  if (/[\uFFFD]/.test(utf8Str)) {
    return slice.toString('latin1');
  }

  return utf8Str;
}

function convertSrtToVtt(srtBuffer) {
  const text = decodeSubtitleBuffer(srtBuffer);

  // Normalize line endings to \n and strip BOM / leading garbage
  let normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // If already WebVTT, clean header and normalize
  if (normalized.trimStart().startsWith('WEBVTT')) {
    let body = normalized.trimStart().replace(/^WEBVTT[^\n]*\n+/, '');
    body = body.replace(/\{\\[^}]*\}/g, '').replace(/<\/?font[^>]*>/gi, '');
    return `WEBVTT\n\n${body.trim()}\n`;
  }

  // Strip SSA/ASS tags: {\an8}, {\pos(x,y)}, etc.
  normalized = normalized.replace(/\{\\[^}]*\}/g, '');

  // Strip font tags: <font ...> and </font>
  normalized = normalized.replace(/<\/?font[^>]*>/gi, '');

  // Convert SRT timestamps: 00:01:23,456 --> 00:01:26,789
  // Also handle 2-part timestamps or periods
  normalized = normalized.replace(
    /(?:^|\n)(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})(.*)/g,
    (match, h1, m1, s1, ms1, h2, m2, s2, ms2, extra) => {
      const hour1 = (h1 !== undefined ? h1 : '00').padStart(2, '0');
      const hour2 = (h2 !== undefined ? h2 : '00').padStart(2, '0');
      const cueSettings = extra ? extra.trim() : '';
      const settingsSuffix = cueSettings ? ` ${cueSettings}` : '';
      return `\n${hour1}:${m1}:${s1}.${ms1} --> ${hour2}:${m2}:${s2}.${ms2}${settingsSuffix}`;
    }
  );

  const cleanBody = normalized.trim();
  return `WEBVTT\n\n${cleanBody}\n`;
}

// Edge Case 1: UTF-8 with BOM
const utf8BomBuf = Buffer.concat([
  Buffer.from([0xEF, 0xBB, 0xBF]),
  Buffer.from('1\n00:01:00,100 --> 00:01:03,400\n<i>¿Dónde está la biblioteca?</i>\n', 'utf8')
]);
const vttBom = convertSrtToVtt(utf8BomBuf);
assert(vttBom.startsWith('WEBVTT\n\n'));
assert(!vttBom.includes('\uFEFF'));
assert(vttBom.includes('00:01:00.100 --> 00:01:03.400'));
assert(vttBom.includes('<i>¿Dónde está la biblioteca?</i>'));

// Edge Case 2: UTF-16 LE with BOM
const utf16leBuf = Buffer.concat([
  Buffer.from([0xFF, 0xFE]),
  Buffer.from('1\r\n00:02:00,000 --> 00:02:05,000\r\n¡Acción!\r\n', 'utf16le')
]);
const vtt16 = convertSrtToVtt(utf16leBuf);
assert(vtt16.startsWith('WEBVTT\n\n'));
assert(vtt16.includes('¡Acción!'));

// Edge Case 3: Already WebVTT file with extra headers
const alreadyVttBuf = Buffer.from('WEBVTT - Some author title\n\n1\n00:01:00.000 --> 00:01:05.000\nAlready formatted\n', 'utf8');
const vttAlready = convertSrtToVtt(alreadyVttBuf);
assert(vttAlready.startsWith('WEBVTT\n\n'));
assert(vttAlready.includes('Already formatted'));

// Edge Case 4: Timestamps with 2-digit minute only: 05:20,500 --> 05:22,800
const shortTsBuf = Buffer.from('1\n05:20,500 --> 05:22,800\nShort timestamp\n', 'utf8');
const vttShort = convertSrtToVtt(shortTsBuf);
assert(vttShort.includes('00:05:20.500 --> 00:05:22.800'));

console.log('ALL EDGE CASES PASSED!');
