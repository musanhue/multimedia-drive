# Implementation Blueprint: Strict HTTP Range 206 Streaming Proxy

**Target Component**: `server/proxy/` (Streaming Proxy & Range Chunker)  
**Milestone**: M1 (Feature F3 — Strict HTTP Range 206 Streaming Proxy)  
**Author**: Streaming Proxy Explorer (`explorer_m1_2`)  
**Date**: 2026-10-13  
**Target Environment**: Node.js / TypeScript, Serverless-ready (Vercel Hobby / Cloud Functions), Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)

---

## 1. Executive Summary & Problem Formulation

### 1.1 The Challenge of Streaming on Samsung Smart TV (Chromium M56)
On the Samsung Smart TV UN50NU7400, video playback is mediated by **Chromium M56** (`media::BufferedDataSource` inside Blink). Chromium M56 imposes non-negotiable requirements on media playback:
1. **Rejection of Full HTTP 200 Responses**: If a media server returns `200 OK` for a video file rather than `206 Partial Content`, Chromium M56 either:
   - Immediately halts playback with `MEDIA_ERR_SRC_NOT_SUPPORTED` or a black screen.
   - Attempts to buffer the entire file (frequently 2GB to 8GB) sequentially into RAM, causing an out-of-memory kernel panic or process kill within 30–60 seconds on the TV's 1.5GB shared RAM hardware.
   - Disables timeline scrubbing (seek forward/backward), preventing fast-forward and rewind controls.
2. **Failure of Direct Google Drive URLs**: Direct Google Drive links (`uc?export=download`) cannot be used:
   - Private folders require Google Cloud Service Account OAuth bearer tokens.
   - Files >100MB trigger Google's virus-scan warning confirmation HTML page (`"Google Drive can't scan this file for viruses"`), which breaks HTML5 `<video src="...">`.
   - Cross-Origin Resource Sharing (CORS) blocks direct media and subtitle loading.
3. **Serverless Execution Limits**: On serverless platforms like Vercel (Hobby tier), functions are terminated after **10 seconds**. A naive proxy trying to stream a 2-hour movie through a single persistent connection will be abruptly terminated after 10 seconds.
4. **Google Drive Download Quotas & Concurrency Locks**: Unbounded streaming connections or unclosed sockets upon timeline seeks trigger Google Drive's `403: User rate limit exceeded` or `Download quota exceeded for this file`.

### 1.2 The Solution: Strict Bounded HTTP Range 206 Proxy
The streaming proxy implements **Bounded HTTP Range Chunking (8MB max)** compliant with RFC 7233 and RFC 9110:
- Parses all client `Range` headers (closed, open, suffix, and missing).
- Clamps every request to a maximum chunk window of **8MB** (`8,388,608 bytes`).
- Requests only that 8MB slice from Google Drive API v3 via `drive.files.get({ fileId, alt: 'media' }, { headers: { Range: ... }, responseType: 'stream' })`.
- Emits exact HTTP 206 response headers (`Content-Range`, `Content-Length`, `Content-Type`, `Accept-Ranges`, `Cache-Control: no-cache`, CORS).
- Handles socket aborts (`req.on('close')`) by immediately destroying the upstream Drive stream to protect download quota and prevent unhandled server exceptions.
- Caches file metadata in memory to reduce Drive API queries by over 99.5%.

---

## 2. Architecture & Call Flow

```
+---------------------------------------------------------------------------------------+
|                                    SAMSUNG SMART TV                                   |
|                      HTML5 <video> / Chromium M56 Media Pipeline                      |
+---------------------------------------------------------------------------------------+
        |                                                        ^
   1. Probe / Seek                                          6. 206 Stream
      Range: bytes=0-                                          Content-Range: 0-8388607/Total
      (or bytes=1258291200-)                                   8MB Bounded Payload
        |                                                        |
        v                                                        |
+---------------------------------------------------------------------------------------+
|                             BACKEND STREAMING PROXY (M1)                              |
|                              `server/proxy/streamHandler.ts`                          |
+---------------------------------------------------------------------------------------+
  |  2. Resolve Metadata (Size, Mime)        |  4. Request 8MB Bounded Chunk
  |     Check In-Memory Cache                |     drive.files.get(alt='media', Range)
  v                                          v
+---------------------+             +---------------------------------------------------+
| Metadata RAM Cache  |             |              GOOGLE DRIVE API v3                  |
| (TTL: 2 Hours)      |             |             `drive.files.get`                     |
+---------------------+             +---------------------------------------------------+
                                             |                     |
                                    5. Upstream 206        7. Socket Abort (Seek)
                                       Binary Stream          req.on('close')
                                             |                stream.destroy()
                                             v                     v
                                    [Piped to TV Client]   [Kill Upstream Stream]
```

---

## 3. Specification Blueprint: 5 Core Components

### 3.1 Component 1: HTTP Range 206 Parser & Validator (`rangeParser.ts`)

#### 3.1.1 Supported Range Formats
RFC 7233 / RFC 9110 defines multiple range formats that clients may transmit. The parser handles all four variants:

| Format Name | Client Header Example | Interpretation | Handling Logic |
|---|---|---|---|
| **Closed Range** | `bytes=0-1048575` | Explicit start and end | Clamped: `end = Math.min(reqEnd, start + MAX_CHUNK - 1, totalSize - 1)` |
| **Open Range** | `bytes=0-` or `bytes=52428800-` | Start offset to EOF | Clamped: `end = Math.min(start + MAX_CHUNK - 1, totalSize - 1)` |
| **Suffix Range** | `bytes=-1048576` | Last N bytes of file | `start = Math.max(0, totalSize - suffix)`, `end = Math.min(start + MAX_CHUNK - 1, totalSize - 1)` |
| **Missing Range** | *(Header absent)* | Full representation | Handled as implicit `bytes=0-`, clamped to first 8MB chunk (`206 Partial Content`) |
| **Multiple Ranges** | `bytes=0-100, 200-300` | Multipart range | Discard extras; parse and serve the first range specifier |

#### 3.1.2 Invalid Ranges & HTTP 416 (Range Not Satisfiable)
An HTTP 416 response is issued if:
- `start >= totalSize` (e.g. seeking past end of file).
- `start > end` (e.g. `bytes=500-200`).
- `start < 0` or NaN.
- Suffix length is 0 or NaN (e.g. `bytes=-0` or `bytes=-abc`).
- Header syntax does not begin with `bytes=`.
- `totalSize <= 0`.

**HTTP 416 Response Specification**:
```http
HTTP/1.1 416 Range Not Satisfiable
Content-Range: bytes */totalSize
Content-Length: 0
Content-Type: text/plain; charset=utf-8
Accept-Ranges: bytes
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: Content-Range, Accept-Ranges
```

#### 3.1.3 Range Parser Code Contract
```typescript
// server/proxy/rangeParser.ts

export interface ParsedRange {
  start: number;
  end: number;
  chunkSize: number;
  totalSize: number;
}

export type RangeParseResult =
  | { status: 206; range: ParsedRange }
  | { status: 416; contentRange: string };

/**
 * Parses, validates, and bounds an HTTP Range request header against total file size.
 * 
 * @param rangeHeader The raw 'Range' header string from the client
 * @param totalSize Total file size in bytes
 * @param maxChunkSize Maximum chunk bounding limit (default: 8MB)
 */
export function parseHttpRange(
  rangeHeader: string | undefined,
  totalSize: number,
  maxChunkSize: number = 8 * 1024 * 1024
): RangeParseResult {
  // Boundary check: file has no content
  if (totalSize <= 0 || isNaN(totalSize)) {
    return { status: 416, contentRange: 'bytes */0' };
  }

  // Case 1: Missing Range header -> Treat as implicit bytes=0-
  if (!rangeHeader || !rangeHeader.trim()) {
    const start = 0;
    const end = Math.min(start + maxChunkSize - 1, totalSize - 1);
    return {
      status: 206,
      range: {
        start,
        end,
        chunkSize: end - start + 1,
        totalSize,
      },
    };
  }

  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith('bytes=')) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const byteSet = trimmed.substring(6).trim();
  // Handle multiple ranges by selecting the first specifier
  const spec = byteSet.split(',')[0].trim();

  // Case 2: Suffix range (e.g. bytes=-1048576)
  if (spec.startsWith('-')) {
    const suffixLength = parseInt(spec.substring(1).trim(), 10);
    if (isNaN(suffixLength) || suffixLength <= 0) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }

    const clampedSuffix = Math.min(suffixLength, totalSize);
    const start = totalSize - clampedSuffix;
    const end = Math.min(start + maxChunkSize - 1, totalSize - 1);
    return {
      status: 206,
      range: {
        start,
        end,
        chunkSize: end - start + 1,
        totalSize,
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

  const start = parseInt(startStr, 10);
  if (isNaN(start) || start < 0 || start >= totalSize) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  let end: number;
  if (endStr.length > 0) {
    const reqEnd = parseInt(endStr, 10);
    if (isNaN(reqEnd) || reqEnd < start) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
    // Clamp by requestedEnd, maxChunkSize, and totalSize - 1
    const boundedEnd = Math.min(reqEnd, start + maxChunkSize - 1);
    end = Math.min(boundedEnd, totalSize - 1);
  } else {
    // Open range
    end = Math.min(start + maxChunkSize - 1, totalSize - 1);
  }

  return {
    status: 206,
    range: {
      start,
      end,
      chunkSize: end - start + 1,
      totalSize,
    },
  };
}
```

---

### 3.2 Component 2: Chunk Bounding (8MB Clamp Math, Serverless & TV Hardware Constraints)

#### 3.2.1 Why Exactly 8MB (`8,388,608` Bytes)?
The `8MB` constant is derived from three intersecting technical limits:

1. **Vercel Serverless Function Execution Timeout**:
   - Vercel Hobby plan has a strict **10-second timeout**.
   - Datacenter-to-datacenter transfer between Google Cloud Drive and Vercel achieves ~500 Mbps (< 150ms).
   - Residential broadband to the TV:
     - At 20 Mbps: 8MB = 3.2 seconds.
     - At 50 Mbps: 8MB = 1.28 seconds.
     - At 100 Mbps: 8MB = 0.64 seconds.
   - Every single 8MB chunk completes comfortably in < 3.5 seconds, ensuring 0% timeout failures.
   - If chunks were 32MB: on a 20 Mbps connection, execution would require ~13 seconds, terminating the serverless lambda.

2. **Chromium M56 Memory Architecture on Samsung UN50NU7400**:
   - Hardware: Quad-core ARM CPU, Mali GPU, 1.5GB total system RAM.
   - The Tizen OS web engine process is memory-capped. Holding uncompressed video frames and buffering multi-hundred megabyte network streams triggers memory pressure and kills the web process.
   - An 8MB sliding window keeps buffered media in RAM under ~16MB (current playing chunk + pre-buffered chunk).

3. **Buffering Continuity & Seek Responsiveness**:
   - Standard 1080p movie bitrate: ~4.5 Mbps (~0.56 MB/sec).
   - An 8MB chunk holds ~14.2 seconds of video.
   - Chromium M56 requests the next chunk when its buffer drops below ~50% (~7 seconds before playback starvation).
   - When the user presses Fast-Forward or jumps to a new chapter, aborting an in-flight 8MB request drops at most 8MB of data, ensuring near-instantaneous (< 400ms) seek recovery.

#### 3.2.2 Chunk Boundary Mathematics
```
Given:
  start        = parsed byte start index (0 <= start < totalSize)
  reqEnd       = requested byte end index (optional)
  totalSize    = total file size in bytes
  MAX_CHUNK    = 8 * 1024 * 1024 (8,388,608 bytes)

Mathematical Formulation:
  upperLimit   = (reqEnd !== undefined) ? Math.min(reqEnd, start + MAX_CHUNK - 1) : (start + MAX_CHUNK - 1)
  end          = Math.min(upperLimit, totalSize - 1)
  chunkSize    = end - start + 1

Invariants:
  1. 0 <= start <= end < totalSize
  2. 1 <= chunkSize <= MAX_CHUNK
  3. chunkSize == end - start + 1
  4. Content-Range == "bytes " + start + "-" + end + "/" + totalSize
```

---

### 3.3 Component 3: Upstream Drive Download Stream (`driveStream.ts`)

#### 3.3.1 Google Drive API v3 Call Structure
The streaming proxy interacts with Google Drive API v3 using the `drive.files.get` method configured for media downloads:

```typescript
const drive = getDriveClient(); // Authenticated googleapis drive_v3 instance
const driveRes = await drive.files.get(
  {
    fileId: fileId,
    alt: 'media',
    supportsAllDrives: true,
  },
  {
    headers: {
      Range: `bytes=${start}-${end}`,
    },
    responseType: 'stream',
  }
);
```

#### 3.3.2 Two-Tier Metadata Resolution & In-Memory Cache
To validate ranges and calculate `Content-Range: bytes start-end/totalSize`, the proxy must know `totalSize` and `mimeType`.
- **Anti-Pattern**: Calling `drive.files.get({ fileId, fields: 'size, mimeType' })` on every chunk request. For a 4GB movie (512 chunks), this generates 512 metadata API queries, causing ~150ms extra latency per chunk and triggering Google API rate limiting (`403: User rate limit exceeded`).
- **Required Pattern**: Maintain an in-memory metadata cache with a TTL of 2 hours (`7,200,000 ms`).

```typescript
interface FileMetadataCacheItem {
  timestamp: number;
  data: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
  };
}

const fileMetadataCache = new Map<string, FileMetadataCacheItem>();

export async function resolveFileMetadata(fileId: string): Promise<{ size: number; mimeType: string; name: string }> {
  const cached = fileMetadataCache.get(fileId);
  const now = Date.now();
  if (cached && (now - cached.timestamp < 7200000)) {
    return cached.data;
  }

  const drive = getDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true,
  });

  const size = parseInt(res.data.size || '0', 10);
  const mimeType = res.data.mimeType || 'video/mp4';
  const name = res.data.name || 'media';

  const metadata = { id: fileId, name, mimeType, size };
  fileMetadataCache.set(fileId, { timestamp: now, data: metadata });
  return metadata;
}
```

#### 3.3.3 Resilience, Retries, and Exponential Backoff
When Google Drive responds with transient rate limit errors (`429 Too Many Requests` or `503 Service Unavailable`), the proxy executes up to 3 retries with jittered exponential backoff:

```typescript
async function fetchDriveStreamWithRetry(fileId: string, rangeHeader: string, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const drive = getDriveClient();
      return await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { headers: { Range: rangeHeader }, responseType: 'stream' }
      );
    } catch (err: any) {
      attempt++;
      const status = err.status || err.code || (err.response && err.response.status);
      if ((status === 429 || status === 503) && attempt < retries) {
        const delay = Math.pow(2, attempt) * 200 + Math.random() * 100; // 400ms-500ms, 800ms-900ms
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}
```

---

### 3.4 Component 4: Exact Response Headers Specification

#### 3.4.1 Strict HTTP 206 Partial Content Headers
For every successful partial content request, the server emits the following verbatim headers:

```http
HTTP/1.1 206 Partial Content
Content-Range: bytes ${start}-${end}/${totalSize}
Content-Length: ${chunkSize}
Content-Type: ${mimeType}
Accept-Ranges: bytes
Cache-Control: no-cache
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Content-Type, Accept-Ranges
Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges
```

**Header Rationale & Critical Details**:
1. `Content-Range: bytes start-end/totalSize`:
   - Exact format required: `bytes 0-8388607/1073741824`.
   - Single space after `bytes`, hyphen between `start` and `end`, slash before `totalSize`.
2. `Content-Length: chunkSize`:
   - Must strictly match `end - start + 1`.
   - If `Content-Length` differs from actual streamed byte count by even 1 byte, Chromium M56 throws fatal `net::ERR_CONTENT_LENGTH_MISMATCH`.
3. `Accept-Ranges: bytes`:
   - Signals byte-range support. Without this, the TV player disables seeking.
4. `Cache-Control: no-cache`:
   - Prevents edge CDN proxies and browser caches from storing partial video chunks out of sequence.
5. `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`:
   - In Chromium M56, cross-origin security rules hide custom/non-simple headers from media engines unless explicitly exposed via this header.

#### 3.4.2 HTTP HEAD Request Handling
Chromium M56 often performs an initial `HEAD` request to inspect container size and confirm range support:

```typescript
if (req.method === 'HEAD') {
  res.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': totalSize.toString(),
    'Content-Type': mimeType,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods:': 'GET, HEAD, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Length, Accept-Ranges',
  });
  return res.end();
}
```

#### 3.4.3 HTTP OPTIONS Request (CORS Preflight)
```typescript
if (req.method === 'OPTIONS') {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Accept-Ranges',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'Access-Control-Max-Age': '86400',
  });
  return res.end();
}
```

---

### 3.5 Component 5: Socket Disconnect & Client Abort Lifecycle (`streamLifecycle.ts`)

#### 3.5.1 The Socket Disconnect Problem
During video playback on Samsung Smart TV:
- When the user presses Fast-Forward, Rewind, or scrubs the seek bar, Chromium M56 aborts the active HTTP connection by sending a TCP FIN or RST packet.
- When the user presses the physical Return button (keycode 10009) to return to the catalog, the video element is unmounted and the active socket is closed immediately.
- If the backend proxy does not monitor client socket disconnects:
  1. The upstream Google Drive connection continues downloading data into memory.
  2. Bandwidth and Drive API download quota are wasted.
  3. Node.js piping to a closed socket throws `ERR_STREAM_PREMATURE_CLOSE`, `EPIPE`, or unhandled stream errors that can crash the server process.

#### 3.5.2 Complete Stream Abort Implementation
The proxy tracks socket closure events on both `req` and `res`, and immediately calls `.destroy()` on the upstream Google Drive `ReadableStream`:

```typescript
// server/proxy/streamHandler.ts

let isClientDisconnected = false;
let upstreamStream: any = null;

const cleanupUpstream = () => {
  if (upstreamStream && !upstreamStream.destroyed) {
    try {
      upstreamStream.destroy();
    } catch (e) {
      // Ignore destruction errors
    }
  }
};

// Listen for client socket disconnect
req.on('close', () => {
  if (!res.writableEnded) {
    isClientDisconnected = true;
    cleanupUpstream();
  }
});

res.on('close', () => {
  if (!res.writableEnded) {
    isClientDisconnected = true;
    cleanupUpstream();
  }
});

// Attach upstream stream and error handlers
upstreamStream = driveRes.data;

upstreamStream.on('error', (err: any) => {
  if (isClientDisconnected) {
    // Expected abort when TV scrubs or exits - do NOT log as fatal error
    return;
  }
  console.error('[StreamProxy] Upstream stream error:', err);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream Drive stream failure' }));
  } else {
    res.destroy(err);
  }
});

// Pipe upstream data to client
upstreamStream.pipe(res);
```

---

## 4. Complete Reference Implementation: `server/proxy/streamHandler.ts`

Below is the complete, self-contained reference implementation uniting all 5 components:

```typescript
// server/proxy/streamHandler.ts

import type { IncomingMessage, ServerResponse } from 'http';
import { parseHttpRange } from './rangeParser';
import { getDriveClient } from '../drive/client';

export interface StreamHandlerConfig {
  maxChunkSize?: number; // Default: 8 * 1024 * 1024 (8MB)
  cacheTtlMs?: number;   // Default: 2 hours (7,200,000 ms)
}

const DEFAULT_CONFIG: Required<StreamHandlerConfig> = {
  maxChunkSize: 8 * 1024 * 1024,
  cacheTtlMs: 2 * 60 * 60 * 1000,
};

// In-memory file metadata cache
interface CachedMetadata {
  timestamp: number;
  size: number;
  mimeType: string;
  name: string;
}

const metadataCache = new Map<string, CachedMetadata>();

/**
 * Resolves file size, MIME type, and name using in-memory cache with Drive API fallback.
 */
export async function getStreamMetadata(fileId: string, ttlMs: number): Promise<CachedMetadata> {
  const cached = metadataCache.get(fileId);
  const now = Date.now();
  if (cached && now - cached.timestamp < ttlMs) {
    return cached;
  }

  const drive = getDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true,
  });

  const size = parseInt(res.data.size || '0', 10);
  const mimeType = res.data.mimeType || 'video/mp4';
  const name = res.data.name || 'media';

  const entry: CachedMetadata = {
    timestamp: now,
    size,
    mimeType,
    name,
  };

  metadataCache.set(fileId, entry);
  return entry;
}

/**
 * Main HTTP request handler for the streaming proxy.
 * Accessible via GET/HEAD /api/stream/:fileId or /api/stream?id=:fileId
 */
export async function handleStreamRequest(
  req: IncomingMessage,
  res: ServerResponse,
  fileId: string,
  config?: StreamHandlerConfig
): Promise<void> {
  const options = { ...DEFAULT_CONFIG, ...config };

  // 1. CORS Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept-Ranges',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (!fileId || typeof fileId !== 'string') {
    res.writeHead(400, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify({ error: 'Missing required fileId parameter' }));
  }

  try {
    // 2. Resolve File Metadata
    const metadata = await getStreamMetadata(fileId, options.cacheTtlMs);
    const totalSize = metadata.size;

    // 3. Handle HEAD Requests
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': totalSize.toString(),
        'Content-Type': metadata.mimeType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Expose-Headers': 'Content-Length, Accept-Ranges',
      });
      return res.end();
    }

    // Only GET requests proceed to binary streaming
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }

    // 4. Parse, Validate, and Bound HTTP Range
    const rangeHeader = req.headers.range;
    const parsed = parseHttpRange(rangeHeader, totalSize, options.maxChunkSize);

    if (parsed.status === 416) {
      res.writeHead(416, {
        'Content-Range': parsed.contentRange,
        'Content-Length': '0',
        'Content-Type': 'text/plain; charset=utf-8',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges',
      });
      return res.end();
    }

    const { start, end, chunkSize } = parsed.range;

    // 5. Request Bounded Chunk from Google Drive API v3
    const drive = getDriveClient();
    const driveRes = await drive.files.get(
      {
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      {
        headers: {
          Range: `bytes=${start}-${end}`,
        },
        responseType: 'stream',
      }
    );

    // 6. Write Strict HTTP 206 Response Headers
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize.toString(),
      'Content-Type': metadata.mimeType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept-Ranges',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    });

    const upstreamStream = driveRes.data as NodeJS.ReadableStream;
    let isClientClosed = false;

    // 7. Socket Disconnect Lifecycle Management
    const terminateUpstream = () => {
      if (upstreamStream && !(upstreamStream as any).destroyed) {
        try {
          (upstreamStream as any).destroy();
        } catch {
          // Ignore
        }
      }
    };

    req.on('close', () => {
      if (!res.writableEnded) {
        isClientClosed = true;
        terminateUpstream();
      }
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        isClientClosed = true;
        terminateUpstream();
      }
    });

    upstreamStream.on('error', (err: any) => {
      if (isClientClosed) {
        // Expected client abort during seek/pause
        return;
      }
      console.error('[StreamProxy] Drive stream error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to stream media from Google Drive' }));
      } else {
        res.destroy(err);
      }
    });

    // 8. Pipe Upstream Stream to Response
    upstreamStream.pipe(res);
  } catch (err: any) {
    console.error('[StreamProxy] Handler error:', err.message);
    if (!res.headersSent) {
      const statusCode = err.code === 404 || err.status === 404 ? 404 : 500;
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ error: err.message || 'Streaming proxy internal error' }));
    }
  }
}
```

---

## 5. Edge Cases & Boundary Scenarios Matrix

| # | Edge Case | Client Header / Input | Expected Behavior | Verification Assertions |
|---|---|---|---|---|
| **E1** | Open range from byte 0 | `Range: bytes=0-` (File: 100MB) | Return bytes `0` to `8,388,607` with status `206` | `status == 206`, `Content-Range == "bytes 0-8388607/104857600"`, `Content-Length == 8388608` |
| **E2** | Open range from mid-file (Seeking) | `Range: bytes=50000000-` (File: 100MB) | Return bytes `50,000,000` to `58,388,607` with status `206` | `status == 206`, `Content-Range == "bytes 50000000-58388607/104857600"`, `Content-Length == 8388608` |
| **E3** | Suffix range (Tail atom inspection) | `Range: bytes=-1048576` (File: 100MB) | Return last 1MB (`99,358,024` to `100,406,599`) with status `206` | `status == 206`, `start == 100MB - 1MB`, `Content-Length == 1048576` |
| **E4** | Closed small chunk | `Range: bytes=0-1` (Probing atom) | Return exactly 2 bytes with status `206` | `status == 206`, `Content-Range == "bytes 0-1/104857600"`, `Content-Length == 2` |
| **E5** | Closed chunk > 8MB | `Range: bytes=0-20000000` (20MB requested) | Clamp chunk to 8MB max | `status == 206`, `Content-Range == "bytes 0-8388607/104857600"`, `Content-Length == 8388608` |
| **E6** | Near end-of-file chunk | `Range: bytes=100000000-` (File: 102,000,000 bytes) | Return remaining 2MB to EOF with status `206` | `status == 206`, `Content-Range == "bytes 100000000-101999999/102000000"`, `Content-Length == 2000000` |
| **E7** | Missing Range header | *(None provided)* | Implicitly serve first 8MB with status `206` | `status == 206`, `Content-Range == "bytes 0-8388607/Total"`, `Accept-Ranges == "bytes"` |
| **E8** | Invalid Range: start >= totalSize | `Range: bytes=104857600-` (File: 100MB) | Reject with HTTP `416` | `status == 416`, `Content-Range == "bytes */104857600"`, `Content-Length == 0` |
| **E9** | Invalid Range: start > end | `Range: bytes=5000-2000` | Reject with HTTP `416` | `status == 416`, `Content-Range == "bytes */104857600"` |
| **E10** | Invalid Range: malformed string | `Range: bytes=foo-bar` or `Range: characters=0-10` | Reject with HTTP `416` | `status == 416`, `Content-Range == "bytes */Total"` |
| **E11** | Zero-length file | File `size == 0` | Reject with HTTP `416` | `status == 416`, `Content-Range == "bytes */0"` |
| **E12** | Client disconnect mid-stream | Socket emits `'close'` before payload finished | Destroy upstream Drive stream, log no fatal errors | `upstreamStream.destroyed == true`, no unhandled rejection |
| **E13** | HEAD request probe | `HEAD /api/stream/:fileId` | Return HTTP `200` with file metadata, no body | `status == 200`, `Content-Length == totalSize`, `Accept-Ranges == "bytes"`, empty body |
| **E14** | OPTIONS CORS preflight | `OPTIONS /api/stream/:fileId` | Return HTTP `204` with CORS headers | `status == 204`, `Access-Control-Allow-Methods` contains `GET, HEAD, OPTIONS` |

---

## 6. Integration Contract & File Layout

### 6.1 Placement in Repository Layout
Following `PROJECT.md` layout:
```
server/
├── proxy/
│   ├── rangeParser.ts        # Pure functional range parsing and bounding
│   └── streamHandler.ts      # HTTP 206 handler, Drive streaming, socket lifecycle
├── drive/
│   └── client.ts             # Service Account auth and Google Drive client (from explorer_m1_1)
├── routes/
│   └── api.ts                # Express/Node router binding GET/HEAD /api/stream/:fileId
└── index.ts                  # Server entry point
```

### 6.2 Express / Node HTTP Route Binding
```typescript
// server/routes/api.ts
import { Router } from 'express';
import { handleStreamRequest } from '../proxy/streamHandler';

const router = Router();

// Route supports both path parameter and query string
router.all('/stream/:fileId?', async (req, res) => {
  const fileId = req.params.fileId || (req.query.id as string);
  await handleStreamRequest(req, res, fileId);
});

export default router;
```

---

## 7. Verification & Automated Test Strategy

To allow independent verification by test runners (`test_writer_e2e_1` / `explorer_m1_3`):

### 7.1 Unit Tests for `rangeParser.ts`
1. **Test Standard Ranges**:
   - `parseHttpRange('bytes=0-1048575', 50000000, 8388608)` -> `status: 206, start: 0, end: 1048575, chunkSize: 1048576`.
2. **Test Bounding Clamp**:
   - `parseHttpRange('bytes=0-', 50000000, 8388608)` -> `status: 206, start: 0, end: 8388607, chunkSize: 8388608`.
   - `parseHttpRange('bytes=0-20000000', 50000000, 8388608)` -> `status: 206, start: 0, end: 8388607, chunkSize: 8388608`.
3. **Test Suffix Ranges**:
   - `parseHttpRange('bytes=-1048576', 50000000, 8388608)` -> `status: 206, start: 48951424, end: 49999999, chunkSize: 1048576`.
4. **Test Missing Header**:
   - `parseHttpRange(undefined, 50000000, 8388608)` -> `status: 206, start: 0, end: 8388607, chunkSize: 8388608`.
5. **Test 416 Errors**:
   - `parseHttpRange('bytes=50000000-', 50000000)` -> `status: 416`.
   - `parseHttpRange('bytes=100-50', 50000000)` -> `status: 416`.
   - `parseHttpRange('invalid', 50000000)` -> `status: 416`.

### 7.2 Integration Tests for `streamHandler.ts` (Mocked Drive API)
1. **Mock Drive Stream**: Mock `drive.files.get` to return a `PassThrough` stream yielding a deterministic byte buffer.
2. **Verify Headers**: Assert `res.statusCode === 206`, `res.getHeader('Content-Range') === 'bytes 0-8388607/50000000'`, `res.getHeader('Accept-Ranges') === 'bytes'`, `res.getHeader('Cache-Control') === 'no-cache'`.
3. **Verify Socket Abort**: Emit `'close'` on mock `req` before `PassThrough` ends; assert `upstreamStream.destroyed === true`.
4. **Verify HEAD Request**: Send `HEAD` method; assert `res.statusCode === 200`, `res.getHeader('Content-Length') === '50000000'`, and body length is 0.

---

## 8. Conclusion

This blueprint provides an airtight specification for Feature F3. By strictly enforcing **Bounded HTTP Range Requests (8MB)**, **In-Memory Metadata Caching**, **Accurate Response Headers**, and **Eager Socket Abort Cleanup**, the proxy fulfills all performance, memory, and compatibility requirements for the Samsung Smart TV UN50NU7400 on Vercel Serverless and Node.js environments.
