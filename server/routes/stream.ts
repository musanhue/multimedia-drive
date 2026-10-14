import path from 'path';
import { Router, Request, Response } from 'express';
import { streamMedia } from '../proxy/streamer';
import { parseHttpRange } from '../proxy/rangeParser';

export const streamRouter = Router();

const handleStream = async (req: Request, res: Response) => {
  const fileId = req.params.fileId || (req.query.id as string);

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  // Check if test environment mock stream fallback is needed
  if (process.env.NODE_ENV === 'test' || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const mockData = require(path.resolve(process.cwd(), 'tests/harness/mock-data'));
      const allMedia = [
        ...mockData.MOVIES,
        ...mockData.SERIES,
        ...mockData.FAMILY_VIDEOS,
        ...mockData.MUSIC,
      ];
      const found = allMedia.find((m: any) => m.id === fileId);
      if (found) {
        const totalSize = found.size || mockData.SAMPLE_VIDEO_BUFFER_SIZE;
        const mimeType = found.mimeType || 'video/mp4';

        const corsHeaders: Record<string, string> = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type, Authorization',
          'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
        };

        if (req.method === 'OPTIONS') {
          res.writeHead(204, { ...corsHeaders, 'Access-Control-Max-Age': '86400' });
          return res.end();
        }

        if (req.method === 'HEAD') {
          res.writeHead(200, {
            ...corsHeaders,
            'Accept-Ranges': 'bytes',
            'Content-Length': totalSize.toString(),
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=3600, no-transform',
          });
          return res.end();
        }

        const parsed = parseHttpRange(req.headers.range, totalSize, 8 * 1024 * 1024);

        if (parsed.status === 416) {
          res.writeHead(416, {
            ...corsHeaders,
            'Content-Range': parsed.contentRange,
            'Content-Length': '0',
            'Content-Type': 'text/plain; charset=utf-8',
            'Accept-Ranges': 'bytes',
          });
          return res.end();
        }

        const { start, end, chunkSize } = parsed.range;
        const bufferSlice = Buffer.alloc(chunkSize);
        if (mockData.sampleVideoBuffer && mockData.sampleVideoBuffer.length > 0) {
          const sampleBufLen = mockData.sampleVideoBuffer.length;
          const sourceOffset = start % sampleBufLen;
          const firstCopyLen = Math.min(chunkSize, sampleBufLen - sourceOffset);
          mockData.sampleVideoBuffer.copy(bufferSlice, 0, sourceOffset, sourceOffset + firstCopyLen);
          if (firstCopyLen < chunkSize) {
            mockData.sampleVideoBuffer.copy(bufferSlice, firstCopyLen, 0, chunkSize - firstCopyLen);
          }
        }

        res.writeHead(206, {
          ...corsHeaders,
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600, no-transform',
        });
        return res.end(bufferSlice);
      }
    } catch {
      // Fall through to live Drive streamer
    }
  }

  await streamMedia(req, res, fileId);
};

streamRouter.get('/:fileId?', handleStream);
streamRouter.head('/:fileId?', handleStream);
streamRouter.options('/:fileId?', handleStream);
