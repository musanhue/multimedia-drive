export interface ParsedRange {
  start: number;
  end: number;
  chunkSize: number;
  totalSize: number;
  contentRange: string;
}

export type RangeParseResult =
  | { status: 206; range: ParsedRange }
  | { status: 416; contentRange: string };

export const DEFAULT_MAX_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

/**
 * Parses, validates, and bounds an HTTP Range header against total file size.
 *
 * @param rangeHeader The raw 'Range' header string from the client
 * @param totalSize Total file size in bytes
 * @param maxChunkSize Maximum chunk bounding limit (default: 8MB)
 */
export function parseHttpRange(
  rangeHeader: string | undefined,
  totalSize: number,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE
): RangeParseResult {
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
