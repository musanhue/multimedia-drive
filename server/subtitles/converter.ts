export function decodeSubtitleBuffer(buf: Buffer): string {
  if (buf.length >= 2) {
    // UTF-16 Little Endian
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      return buf.subarray(2).toString('utf16le');
    }
    // UTF-16 Big Endian
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.alloc(buf.length - 2);
      for (let i = 2; i < buf.length; i += 2) {
        swapped[i - 2] = buf[i + 1] || 0;
        swapped[i - 1] = buf[i];
      }
      return swapped.toString('utf16le');
    }
  }

  let offset = 0;
  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    offset = 3;
  }
  const slice = buf.subarray(offset);

  // Try decoding as UTF-8
  const utf8Text = slice.toString('utf8');

  // If contains Unicode replacement character \uFFFD, fallback to Latin-1 / Windows-1252
  if (/[\uFFFD]/.test(utf8Text)) {
    return slice.toString('latin1');
  }

  return utf8Text;
}

export function convertSrtToVtt(input: Buffer | string): string {
  const rawText = Buffer.isBuffer(input) ? decodeSubtitleBuffer(input) : input;

  // 1. Normalize line breaks to LF and strip residual BOM
  let normalized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // 2. If already valid WebVTT, clean tags and ensure standard format
  if (normalized.trimStart().startsWith('WEBVTT')) {
    let body = normalized.trimStart().replace(/^WEBVTT[^\n]*\n*/, '');
    body = body.replace(/\{\\[^}]*\}/g, '').replace(/<\/?font[^>]*>/gi, '');
    return `WEBVTT\n\n${body.trim()}\n`;
  }

  // 3. Strip SSA/ASS tags ({\an8}, {\pos(..)}, etc.)
  normalized = normalized.replace(/\{\\[^}]*\}/g, '');

  // 4. Strip HTML font tags while preserving enclosed text
  normalized = normalized.replace(/<\/?font[^>]*>/gi, '');

  // 5. Convert timestamp lines: comma to dot, ensure HH:MM:SS.mmm
  normalized = normalized.replace(
    /(?:^|\n)(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d+)\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d+)(.*)/g,
    (_match, h1, m1, s1, ms1, h2, m2, s2, ms2, extra) => {
      const hour1 = (h1 !== undefined ? h1 : '00').padStart(2, '0');
      const hour2 = (h2 !== undefined ? h2 : '00').padStart(2, '0');
      const min1 = m1.padStart(2, '0');
      const min2 = m2.padStart(2, '0');
      const sec1 = s1.padStart(2, '0');
      const sec2 = s2.padStart(2, '0');
      const mill1 = ms1.padEnd(3, '0').slice(0, 3);
      const mill2 = ms2.padEnd(3, '0').slice(0, 3);
      const cueSettings = extra ? extra.trim() : '';
      const suffix = cueSettings ? ` ${cueSettings}` : '';
      return `\n${hour1}:${min1}:${sec1}.${mill1} --> ${hour2}:${min2}:${sec2}.${mill2}${suffix}`;
    }
  );

  const cleanBody = normalized.trim();
  return `WEBVTT\n\n${cleanBody}\n`;
}
