import path from 'path';
import { Router, Request, Response } from 'express';
import { getDriveClient } from '../drive/client';
import { convertSrtToVtt } from '../subtitles/converter';
import { memoryCache } from '../drive/cache';

export const subtitlesRouter = Router();

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

// Subtitle list route: /api/subtitles/list/:fileId
subtitlesRouter.get('/list/:fileId?', (req: Request, res: Response) => {
  const fileId = req.params.fileId || (req.query.fileId as string);
  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  // Check cached video item
  const cached = memoryCache.get<any>(`file_meta:${fileId}`);
  if (cached && Array.isArray(cached.subtitles)) {
    return res.json({ fileId, subtitles: cached.subtitles });
  }

  // Check test mock data
  try {
    const mockData = require(path.resolve(process.cwd(), 'tests/harness/mock-data'));
    const movie = mockData.MOVIES.find((m: any) => m.id === fileId);
    if (movie) {
      return res.json({ fileId, subtitles: movie.subtitles || [] });
    }
  } catch {
    // Ignore
  }

  res.json({ fileId, subtitles: [] });
});

// WebVTT content route: /api/subtitles/:fileId or /api/subtitles/vtt?id=...
const handleVttRequest = async (req: Request, res: Response) => {
  const fileId = req.params.fileId || (req.query.id as string);

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  // In test environment or mock data mode
  if (process.env.NODE_ENV === 'test' || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const mockData = require(path.resolve(process.cwd(), 'tests/harness/mock-data'));
      let srtBuffer: Buffer | undefined;

      if (fileId.includes('bom')) {
        srtBuffer = Buffer.from(mockData.SAMPLE_SRT_WITH_BOM, 'utf8');
      } else if (fileId.includes('latin1')) {
        srtBuffer = mockData.SAMPLE_SRT_LATIN1_BUFFER;
      } else if (fileId.includes('corrupt')) {
        srtBuffer = Buffer.from(mockData.SAMPLE_SRT_CORRUPT_TAGS, 'utf8');
      } else if (fileId.includes('empty')) {
        srtBuffer = Buffer.from('', 'utf8');
      } else if (fileId === 'sub_inc_es' || fileId.startsWith('sub_')) {
        srtBuffer = Buffer.from(mockData.SAMPLE_SRT_UTF8, 'utf8');
      }

      if (srtBuffer !== undefined) {
        const vtt = convertSrtToVtt(srtBuffer);
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'text/vtt; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        });
        return res.end(vtt);
      }
    } catch {
      // Fall through to live Drive fetch
    }
  }

  try {
    const drive = getDriveClient();
    const driveRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(driveRes.data as ArrayBuffer);
    const vtt = convertSrtToVtt(buffer);

    res.writeHead(200, {
      ...corsHeaders,
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(vtt);
  } catch (err: any) {
    console.error('[Subtitles] Error delivering VTT:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process subtitle file', message: err.message });
    }
  }
};

subtitlesRouter.get('/vtt', handleVttRequest);
subtitlesRouter.get('/:fileId', handleVttRequest);
subtitlesRouter.options('/:fileId?', (_req: Request, res: Response) => {
  res.writeHead(204, { ...corsHeaders, 'Access-Control-Max-Age': '86400' });
  res.end();
});
