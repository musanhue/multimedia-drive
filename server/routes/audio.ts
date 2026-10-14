import { Router, Request, Response } from 'express';
import { getDriveClient } from '../drive/client';
import { memoryCache } from '../drive/cache';

export const audioRouter = Router();

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

export interface AudioTrackMetadata {
  id: string;
  index: number;
  label: string;
  lang: string;
  codec: string;
  isDolby: boolean;
}

export function parseAudioTracksFromBuffer(buf: Buffer): AudioTrackMetadata[] {
  const tracks: AudioTrackMetadata[] = [];
  const str = buf.toString('latin1');
  const target = Buffer.from([0x16, 0x54, 0xAE, 0x6B]); // Tracks element in EBML
  
  // Find Tracks Header
  let tracksPos = -1;
  let offset = 0;
  while ((offset = buf.indexOf(target, offset)) !== -1) {
    if (offset > 50) {
      tracksPos = offset;
      break;
    }
    offset += 4;
  }

  // Scan for A_ audio codecs
  let pos = tracksPos > 0 ? tracksPos : 0;
  let idx = 0;
  const langNames: Record<string, string> = {
    spa: 'Español',
    lat: 'Español (Latino)',
    eng: 'Inglés',
    und: 'Principal',
    fre: 'Francés',
    ger: 'Alemán',
    ita: 'Italiano',
    por: 'Portugués',
    jpn: 'Japonés',
  };

  while ((pos = str.indexOf('A_', pos)) !== -1) {
    const codecMatch = str.slice(pos).match(/^A_[A-Z0-9_\/]+/);
    const rawCodec = codecMatch ? codecMatch[0].replace('A_', '') : 'Audio';

    const startWindow = Math.max(0, pos - 150);
    const endWindow = Math.min(buf.length, pos + 250);
    const windowSlice = buf.slice(startWindow, endWindow);
    const windowStr = windowSlice.toString('latin1');

    let lang = 'und';
    let trackTitle = '';

    // Check language tag (0x22 0xB5 0x9C followed by 3 chars)
    const langIdx = windowSlice.indexOf(Buffer.from([0x22, 0xB5, 0x9C]));
    if (langIdx !== -1) {
      lang = windowSlice.slice(langIdx + 4, langIdx + 7).toString('ascii').toLowerCase();
    } else {
      if (/spa|esp/i.test(windowStr)) lang = 'spa';
      else if (/eng|ing/i.test(windowStr)) lang = 'eng';
      else if (/lat/i.test(windowStr)) lang = 'lat';
    }

    // Check name tag (0x53 0x6E followed by len and string)
    const nameIdx = windowSlice.indexOf(Buffer.from([0x53, 0x6E]));
    if (nameIdx !== -1) {
      const nameLen = windowSlice[nameIdx + 2];
      if (nameLen > 0 && nameLen < 80) {
        trackTitle = windowSlice.slice(nameIdx + 3, nameIdx + 3 + nameLen).toString('utf8').trim();
      }
    }

    const friendlyLang = langNames[lang] || (lang !== 'und' ? lang.toUpperCase() : ('Pista ' + (idx + 1)));
    let finalLabel = '';
    if (trackTitle) {
      finalLabel = trackTitle + ' (' + rawCodec + ')';
    } else {
      finalLabel = friendlyLang + ' (' + rawCodec + ')';
    }

    tracks.push({
      id: 'audio_' + idx,
      index: idx,
      label: finalLabel,
      lang: lang,
      codec: rawCodec,
      isDolby: /AC3|EAC3|TRUEHD|DTS/i.test(rawCodec)
    });

    idx++;
    pos += 8;
  }

  // Fallback if no tracks detected
  if (tracks.length === 0) {
    tracks.push({
      id: 'audio_0',
      index: 0,
      label: 'Audio Principal (Predeterminado)',
      lang: 'und',
      codec: 'Estéreo',
      isDolby: false
    });
  }

  return tracks;
}

audioRouter.get('/list/:fileId', async (req: Request, res: Response) => {
  const fileId = req.params.fileId;
  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  const cacheKey = `audio_tracks:${fileId}`;
  const cached = memoryCache.get<AudioTrackMetadata[]>(cacheKey);
  if (cached) {
    return res.json({ fileId, tracks: cached });
  }

  try {
    const drive = getDriveClient();
    const driveRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream', headers: { Range: 'bytes=0-131071' } }
    );

    const chunks: Buffer[] = [];
    for await (const chunk of driveRes.data) {
      chunks.push(chunk as Buffer);
    }
    const buf = Buffer.concat(chunks);
    const tracks = parseAudioTracksFromBuffer(buf);

    memoryCache.set(cacheKey, tracks, 7200000); // Cache for 2 hours
    res.json({ fileId, tracks });
  } catch (err: any) {
    console.error(`[Audio] Error inspecting tracks for ${fileId}:`, err.message);
    res.json({
      fileId,
      tracks: [
        {
          id: 'audio_0',
          index: 0,
          label: 'Audio Principal (Predeterminado)',
          lang: 'und',
          codec: 'Estéreo',
          isDolby: false
        }
      ]
    });
  }
});
