const DEFAULT_MAX_CHUNK_SIZE = 8 * 1024 * 1024;

function parseHttpRangeSim(rangeHeader, totalSize, maxChunkSize = DEFAULT_MAX_CHUNK_SIZE) {
  if (totalSize <= 0 || isNaN(totalSize)) {
    return { status: 416, contentRange: 'bytes */0' };
  }

  // Case 1: Missing Range header -> Treat as implicit bytes=0-
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
  // Handle multiple ranges by selecting the first specifier
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

  // Case 3: Closed or Open range (e.g. bytes=0-1048575 or bytes=0-)
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

  let end;
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
    // Open range
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

const tests = [
  { header: 'bytes=0-100', total: 1000, expectedStatus: 206 },
  { header: 'Bytes=0-100', total: 1000, expectedStatus: 206 },
  { header: 'BYTES=0-100', total: 1000, expectedStatus: 206 },
  { header: 'bytes=0-100abc', total: 1000, expectedStatus: 416 },
  { header: 'bytes=0abc-100', total: 1000, expectedStatus: 416 },
  { header: 'bytes=-100abc', total: 1000, expectedStatus: 416 },
  { header: 'bytes=-100', total: 1000, expectedStatus: 206 },
  { header: 'Bytes=-100', total: 1000, expectedStatus: 206 },
  { header: 'bytes=0-', total: 1000, expectedStatus: 206 },
  { header: 'bytes=0-0', total: 1000, expectedStatus: 206 },
  { header: 'bytes=500-100', total: 1000, expectedStatus: 416 },
  { header: 'bytes=abc-def', total: 1000, expectedStatus: 416 },
  { header: 'bytes=,', total: 1000, expectedStatus: 416 },
  { header: 'bytes=-', total: 1000, expectedStatus: 416 },
  { header: 'bytes=-0', total: 1000, expectedStatus: 416 },
  { header: 'bytes=--100', total: 1000, expectedStatus: 416 },
  { header: 'bytes=10-20-30', total: 1000, expectedStatus: 416 },
  { header: 'characters=0-10', total: 1000, expectedStatus: 416 },
];

for (const t of tests) {
  const res = parseHttpRangeSim(t.header, t.total);
  const pass = res.status === t.expectedStatus;
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${t.header} -> ${res.status} (expected ${t.expectedStatus})`);
}
