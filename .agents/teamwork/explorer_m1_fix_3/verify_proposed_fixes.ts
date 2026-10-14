// Verification of proposed fixes for:
// 1. stream.ts mock payload length matching Content-Length
// 2. converter.ts subtitle timestamp normalization
// 3. rangeParser.ts case-insensitivity and strict numeric validation

const DEFAULT_MAX_CHUNK_SIZE = 8 * 1024 * 1024;

// Proposed rangeParser implementation
function fixedParseHttpRange(
  rangeHeader: string | undefined,
  totalSize: number,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE
) {
  if (totalSize <= 0 || isNaN(totalSize)) {
    return { status: 416, contentRange: 'bytes */0' };
  }

  if (!rangeHeader || !rangeHeader.trim()) {
    const start = 0;
    const end = Math.min(start + maxChunkSize - 1, totalSize - 1);
    const chunkSize = end - start + 1;
    return {
      status: 206,
      range: {
        start,
        end,
        chunkSize,
        totalSize,
        contentRange: `bytes ${start}-${end}/${totalSize}`,
      },
    };
  }

  const trimmed = rangeHeader.trim();
  if (!/^bytes=/i.test(trimmed)) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const byteSet = trimmed.substring(6).trim();
  const spec = byteSet.split(',')[0].trim();

  // Case 2: Suffix range (e.g. bytes=-1048576)
  if (spec.startsWith('-')) {
    const suffixStr = spec.substring(1).trim();
    if (!/^\d+$/.test(suffixStr)) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
    const suffixLength = parseInt(suffixStr, 10);
    if (suffixLength <= 0) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }

    const clampedSuffix = Math.min(suffixLength, totalSize);
    const start = totalSize - clampedSuffix;
    const end = Math.min(start + maxChunkSize - 1, totalSize - 1);
    const chunkSize = end - start + 1;
    return {
      status: 206,
      range: {
        start,
        end,
        chunkSize,
        totalSize,
        contentRange: `bytes ${start}-${end}/${totalSize}`,
      },
    };
  }

  // Case 3: Closed or Open range
  const parts = spec.split('-');
  if (parts.length !== 2) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const startStr = parts[0].trim();
  const endStr = parts[1].trim();

  if (!/^\d+$/.test(startStr)) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const start = parseInt(startStr, 10);
  if (start >= totalSize) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  let end: number;
  if (endStr.length > 0) {
    if (!/^\d+$/.test(endStr)) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
    const reqEnd = parseInt(endStr, 10);
    if (reqEnd < start) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
    const boundedEnd = Math.min(reqEnd, start + maxChunkSize - 1);
    end = Math.min(boundedEnd, totalSize - 1);
  } else {
    end = Math.min(start + maxChunkSize - 1, totalSize - 1);
  }

  const chunkSize = end - start + 1;
  return {
    status: 206,
    range: {
      start,
      end,
      chunkSize,
      totalSize,
      contentRange: `bytes ${start}-${end}/${totalSize}`,
    },
  };
}

// Proposed converter timestamp normalization
function fixedConvertSrtToVtt(rawText: string): string {
  let normalized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (normalized.trimStart().startsWith('WEBVTT')) {
    let body = normalized.trimStart().replace(/^WEBVTT[^\n]*\n*/, '');
    body = body.replace(/\{\\[^}]*\}/g, '').replace(/<\/?font[^>]*>/gi, '');
    return `WEBVTT\n\n${body.trim()}\n`;
  }

  normalized = normalized.replace(/\{\\[^}]*\}/g, '');
  normalized = normalized.replace(/<\/?font[^>]*>/gi, '');

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

// Proposed stream.ts payload generation
function generateMockStreamBuffer(mockBuffer: Buffer, start: number, chunkSize: number): Buffer {
  const bufferSlice = Buffer.alloc(chunkSize);
  if (mockBuffer && mockBuffer.length > 0) {
    const sampleBufLen = mockBuffer.length;
    const sourceOffset = start % sampleBufLen;
    const firstCopyLen = Math.min(chunkSize, sampleBufLen - sourceOffset);
    mockBuffer.copy(bufferSlice, 0, sourceOffset, sourceOffset + firstCopyLen);
    if (firstCopyLen < chunkSize) {
      mockBuffer.copy(bufferSlice, firstCopyLen, 0, chunkSize - firstCopyLen);
    }
  }
  return bufferSlice;
}

console.log('--- TEST 1: Bytes=0-100 ---');
console.log(fixedParseHttpRange('Bytes=0-100', 1000));

console.log('--- TEST 2: bytes=0-100abc (garbage) ---');
console.log(fixedParseHttpRange('bytes=0-100abc', 1000));

console.log('--- TEST 3: bytes=-100abc (garbage suffix) ---');
console.log(fixedParseHttpRange('bytes=-100abc', 1000));

console.log('--- TEST 4: 5:20,500 ---');
console.log(fixedConvertSrtToVtt('1\n5:20,500 --> 5:25,800\nTexto'));

console.log('--- TEST 5: Stream mock buffer length ---');
const sampleBuf = Buffer.alloc(16 * 1024 * 1024);
sampleBuf.write('TEST_PATTERN', 0);
const chunk8MB = 8 * 1024 * 1024;
const streamSlice = generateMockStreamBuffer(sampleBuf, 0, chunk8MB);
console.log('Generated streamSlice length:', streamSlice.length, 'matches 8MB:', streamSlice.length === chunk8MB);
