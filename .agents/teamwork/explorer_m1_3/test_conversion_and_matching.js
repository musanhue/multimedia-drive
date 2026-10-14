const assert = require('node:assert/strict');

// 1. Encoding Detection & Normalization
function decodeSubtitleBuffer(buf) {
  // Check UTF-16 BOMs
  if (buf.length >= 2) {
    if (buf[0] === 0xFF && buf[1] === 0xFE) {
      return buf.subarray(2).toString('utf16le');
    }
    if (buf[0] === 0xFE && buf[1] === 0xFF) {
      // UTF-16 BE swap bytes
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
  // If replacement char \uFFFD is present, or if it looks like Windows-1252 / ISO-8859-1
  if (/[\uFFFD]/.test(utf8Str)) {
    return slice.toString('latin1');
  }

  // Check if buffer contains high-byte characters without valid UTF-8 multibyte markers
  // e.g. single 0xE1 (á) in Latin-1 will be rendered as replacement char in utf8.
  return utf8Str;
}

// 2. SRT to WebVTT Converter
function convertSrtToVtt(srtBuffer) {
  const text = decodeSubtitleBuffer(srtBuffer);

  // Normalize line endings to \n
  let normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Strip SSA/ASS tags: {\an8}, {\pos(x,y)}, etc.
  normalized = normalized.replace(/\{\\[^}]*\}/g, '');

  // Strip font tags: <font ...> and </font>
  normalized = normalized.replace(/<\/?font[^>]*>/gi, '');

  // Convert SRT timestamps: 00:01:23,456 --> 00:01:26,789
  // Also handle 2-part timestamps: 01:23,456 --> 01:26,789 -> 00:01:23.456 --> 00:01:26.789
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

  // Ensure clean separation and trim
  const cleanBody = normalized.trim();
  return `WEBVTT\n\n${cleanBody}\n`;
}

// 3. Subtitle Matcher Algorithm
const KNOWN_LANG_CODES = {
  'es': 'Español',
  'spa': 'Español',
  'esp': 'Español',
  'spanish': 'Español',
  'castellano': 'Español',
  'es-la': 'Español (Latino)',
  'es-419': 'Español (Latino)',
  'lat': 'Español (Latino)',
  'latino': 'Español (Latino)',
  'en': 'Inglés',
  'eng': 'Inglés',
  'english': 'Inglés',
  'pt': 'Portugués',
  'por': 'Portugués',
  'fr': 'Francés',
  'fra': 'Francés',
  'de': 'Alemán',
  'ger': 'Alemán',
  'it': 'Italiano',
  'ita': 'Italiano',
};

function matchSubtitles(videoFileName, candidateFiles) {
  // videoFileName: e.g. "Inception.2010.1080p.BluRay.x264.mkv"
  // candidateFiles: list of files in the same directory { id, name, size }
  const videoBase = videoFileName.replace(/\.[^/.]+$/, '').toLowerCase();

  const results = [];
  const subtitleFiles = candidateFiles.filter(f => /\.(srt|vtt)$/i.test(f.name));

  for (const sub of subtitleFiles) {
    const subExtMatch = sub.name.match(/\.(srt|vtt)$/i);
    const subExt = subExtMatch ? subExtMatch[1].toLowerCase() : 'srt';
    const subNameWithoutExt = sub.name.slice(0, -(subExt.length + 1)).toLowerCase();

    let matched = false;
    let langCode = 'es';
    let label = 'Español';
    let isForced = false;
    let isDefault = false;

    // Check exact base match: videoBase === subNameWithoutExt
    if (subNameWithoutExt === videoBase) {
      matched = true;
      isDefault = true;
      label = 'Español (Predeterminado)';
    } else if (subNameWithoutExt.startsWith(videoBase)) {
      // e.g. videoBase + ".es" or videoBase + ".spa.forced"
      const suffix = subNameWithoutExt.substring(videoBase.length).replace(/^[._ -]+/, '');
      const parts = suffix.split(/[._ -]+/);

      matched = true;
      for (const part of parts) {
        if (part === 'forced' || part === 'forzados') {
          isForced = true;
        } else if (KNOWN_LANG_CODES[part]) {
          langCode = part;
          label = KNOWN_LANG_CODES[part];
        }
      }
      if (isForced) {
        label += ' (Forzados)';
      }
    } else if (subtitleFiles.length === 1) {
      // Fallback: If only one subtitle file in directory, match it even if named "subs.srt"
      matched = true;
      isDefault = true;
      const lower = subNameWithoutExt;
      for (const [code, name] of Object.entries(KNOWN_LANG_CODES)) {
        if (lower.includes(code)) {
          langCode = code;
          label = name;
          break;
        }
      }
    }

    if (matched) {
      results.push({
        id: sub.id,
        name: sub.name,
        lang: langCode.startsWith('es') ? 'es' : langCode,
        label,
        format: subExt,
        isDefault,
        isForced,
        vttUrl: `/api/subtitles/vtt?id=${sub.id}`
      });
    }
  }

  // Ensure at least one is default if list not empty
  if (results.length > 0 && !results.some(r => r.isDefault)) {
    // Prefer Spanish
    const esSub = results.find(r => r.lang === 'es' && !r.isForced);
    if (esSub) {
      esSub.isDefault = true;
    } else {
      results[0].isDefault = true;
    }
  }

  return results;
}

// 4. HTTP Range Math
function parseRangeHeader(rangeHeader, totalSize, maxChunkSize = 8 * 1024 * 1024) {
  if (!rangeHeader) {
    return {
      status: 200, // or 206 for stream chunks
      start: 0,
      end: Math.min(maxChunkSize - 1, totalSize - 1),
      chunkSize: Math.min(maxChunkSize, totalSize),
      totalSize,
      isRange: false,
    };
  }

  const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!matches) {
    return { error: 'invalid_range', status: 416 };
  }

  const rawStart = matches[1];
  const rawEnd = matches[2];

  let start = 0;
  let end = totalSize - 1;

  if (rawStart === '' && rawEnd !== '') {
    // Suffix range: bytes=-500000 (last 500,000 bytes)
    const suffixLen = parseInt(rawEnd, 10);
    if (isNaN(suffixLen) || suffixLen <= 0) return { error: 'invalid_range', status: 416 };
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else if (rawStart !== '') {
    start = parseInt(rawStart, 10);
    if (isNaN(start) || start >= totalSize || start < 0) {
      return { error: 'range_not_satisfiable', status: 416 };
    }
    if (rawEnd !== '') {
      const requestedEnd = parseInt(rawEnd, 10);
      if (isNaN(requestedEnd) || requestedEnd < start) {
        return { error: 'range_not_satisfiable', status: 416 };
      }
      end = Math.min(requestedEnd, start + maxChunkSize - 1, totalSize - 1);
    } else {
      end = Math.min(start + maxChunkSize - 1, totalSize - 1);
    }
  } else {
    return { error: 'invalid_range', status: 416 };
  }

  const chunkSize = end - start + 1;
  return {
    status: 206,
    start,
    end,
    chunkSize,
    totalSize,
    contentRange: `bytes ${start}-${end}/${totalSize}`,
    isRange: true,
  };
}

// RUN TESTS
console.log('Testing SRT to WebVTT conversion with Spanish diacritics & tags...');

// Test 1: Latin-1 buffer with Spanish characters
const latin1Buffer = Buffer.from(
  '1\r\n00:00:01,000 --> 00:00:04,500\r\n{\\an8}<font color="#ffff00">¡Hola, señor! ¿Cómo estás?</font>\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nCanción de cuna para el niño.\r\n',
  'latin1'
);
const vtt1 = convertSrtToVtt(latin1Buffer);
console.log('--- Result 1 (Latin-1 conversion) ---');
console.log(vtt1);
assert(vtt1.startsWith('WEBVTT\n\n'));
assert(vtt1.includes('00:00:01.000 --> 00:00:04.500'));
assert(vtt1.includes('¡Hola, señor! ¿Cómo estás?'));
assert(vtt1.includes('Canción de cuna para el niño.'));
assert(!vtt1.includes('{\\an8}'));
assert(!vtt1.includes('<font'));

// Test 2: Subtitle matcher
const video = 'Gladiator.2000.1080p.mkv';
const candidates = [
  { id: 'sub1', name: 'Gladiator.2000.1080p.srt', size: 50000 },
  { id: 'sub2', name: 'Gladiator.2000.1080p.es.forced.srt', size: 10000 },
  { id: 'sub3', name: 'Gladiator.2000.1080p.en.srt', size: 48000 },
  { id: 'unrelated', name: 'AnotherMovie.srt', size: 30000 }
];
const matched = matchSubtitles(video, candidates);
console.log('--- Matched Subtitles ---', JSON.stringify(matched, null, 2));
assert.equal(matched.length, 3);
assert.equal(matched[0].name, 'Gladiator.2000.1080p.srt');
assert.equal(matched[0].isDefault, true);
assert.equal(matched[1].isForced, true);
assert.equal(matched[1].label, 'Español (Forzados)');
assert.equal(matched[2].lang, 'en');

// Test 3: Range math
const total = 50 * 1024 * 1024; // 50MB
const r1 = parseRangeHeader('bytes=0-', total);
assert.equal(r1.status, 206);
assert.equal(r1.start, 0);
assert.equal(r1.end, 8 * 1024 * 1024 - 1);
assert.equal(r1.chunkSize, 8 * 1024 * 1024);

const r2 = parseRangeHeader('bytes=52428800-', total); // out of bounds
assert.equal(r2.status, 416);

console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
