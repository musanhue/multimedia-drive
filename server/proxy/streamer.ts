import type { IncomingMessage, ServerResponse } from 'http';
import { parseHttpRange, DEFAULT_MAX_CHUNK_SIZE } from './rangeParser';
import { getDriveClient } from '../drive/client';
import { memoryCache } from '../drive/cache';
import { inferMimeType } from '../drive/traversal';
import { DriveMediaItem } from '../drive/types';

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export async function resolveStreamMetadata(fileId: string): Promise<FileMetadata> {
  const cacheKey = `file_meta:${fileId}`;
  const cached = memoryCache.get<DriveMediaItem | FileMetadata>(cacheKey);
  if (cached && typeof cached.size === 'number' && cached.size > 0) {
    return {
      id: cached.id,
      name: cached.name,
      mimeType: cached.mimeType || inferMimeType(cached.name),
      size: cached.size,
    };
  }

  const drive = getDriveClient();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true,
  });

  const file = res.data;
  if (!file.id) {
    throw new Error(`Media file not found: ${fileId}`);
  }

  const name = file.name || 'media';
  const size = parseInt(file.size || '0', 10);
  const mimeType = inferMimeType(name, file.mimeType);

  const meta: FileMetadata = {
    id: file.id,
    name,
    mimeType,
    size,
  };

  memoryCache.set(cacheKey, meta, 7200000); // 2 hours
  return meta;
}

export async function streamMedia(
  req: IncomingMessage,
  res: ServerResponse,
  fileId: string,
  maxChunkSize: number = Infinity
): Promise<void> {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  };

  // 1. OPTIONS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...corsHeaders, 'Access-Control-Max-Age': '86400' });
    res.end();
    return;
  }

  if (!fileId || typeof fileId !== 'string') {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing fileId parameter' }));
    return;
  }

  try {
    // 2. Resolve metadata
    const metadata = await resolveStreamMetadata(fileId);
    const totalSize = metadata.size;
    const mimeType = metadata.mimeType;

    // 3. HEAD request probe
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        ...corsHeaders,
        'Accept-Ranges': 'bytes',
        'Content-Length': totalSize.toString(),
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600, no-transform',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    // 4. Parse Range
    const rangeHeader = req.headers.range;
    const parsed = parseHttpRange(rangeHeader, totalSize, maxChunkSize);

    if (parsed.status === 416) {
      res.writeHead(416, {
        ...corsHeaders,
        'Content-Range': parsed.contentRange,
        'Content-Length': '0',
        'Content-Type': 'text/plain; charset=utf-8',
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    const { start, end, chunkSize } = parsed.range;

    // 5. Fetch chunk from Drive API v3
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

    // 6. Write HTTP 206 Partial Content Response with continuous streaming headers
    // When chunkSize > 30MB, omit Content-Length so Cloud Run streams via Transfer-Encoding: chunked without 32MB buffer cutoff
    const isSmallBoundedChunk = chunkSize <= 30 * 1024 * 1024;
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    };

    if (isSmallBoundedChunk) {
      responseHeaders['Content-Length'] = chunkSize.toString();
    }

    res.writeHead(206, responseHeaders);

    const upstreamStream = driveRes.data as NodeJS.ReadableStream;
    let isClientClosed = false;

    // 7. Socket Disconnect Management
    const cleanupUpstream = () => {
      if (upstreamStream && !(upstreamStream as any).destroyed) {
        try {
          (upstreamStream as any).destroy();
        } catch {
          // Ignore destruction errors
        }
      }
    };

    req.on('close', () => {
      if (!res.writableEnded) {
        isClientClosed = true;
        cleanupUpstream();
      }
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        isClientClosed = true;
        cleanupUpstream();
      }
    });

    upstreamStream.on('error', (err: any) => {
      if (isClientClosed) {
        return;
      }
      console.error('[StreamProxy] Upstream error:', err?.message || err);
      if (!res.headersSent) {
        res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to stream media from Google Drive' }));
      } else {
        res.destroy(err);
      }
    });

    upstreamStream.pipe(res);
  } catch (err: any) {
    const isNotFound = err.code === 404 || err.status === 404 || /not found/i.test(err.message);
    const statusCode = isNotFound ? 404 : 500;
    if (!res.headersSent) {
      res.writeHead(statusCode, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Stream proxy error' }));
    }
  }
}
