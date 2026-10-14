// Reference Mock HTTP Server (Oracle Harness)
// Implements interface contracts from PROJECT.md and specification reports

const http = require('http');
const {
  FOLDERS,
  MOVIES,
  SERIES,
  FAMILY_VIDEOS,
  PHOTOS,
  MUSIC,
  TMDB_RECORDS,
  SAMPLE_SRT_UTF8,
  SAMPLE_SRT_WITH_BOM,
  SAMPLE_SRT_LATIN1_BUFFER,
  SAMPLE_SRT_CORRUPT_TAGS,
  sampleVideoBuffer,
  SAMPLE_VIDEO_BUFFER_SIZE
} = require('./mock-data');

const CHUNK_SIZE_LIMIT = 8 * 1024 * 1024; // 8MB bounded chunks

function sanitizeMediaFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return { cleanTitle: '', year: null, isSeries: false, season: null, episode: null };
  }
  let base = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  let isSeries = false;
  let season = null;
  let episode = null;

  const tvPattern = /(?:[._\s-]|^)(?:s(\d{1,2})e(\d{1,2})|(\d{1,2})x(\d{1,2})|season[._\s-]*(\d{1,2})[._\s-]*episode[._\s-]*(\d{1,2}))(?:[._\s-]|$)/i;
  const tvMatch = base.match(tvPattern);
  if (tvMatch) {
    isSeries = true;
    season = parseInt(tvMatch[1] || tvMatch[3] || tvMatch[5], 10);
    episode = parseInt(tvMatch[2] || tvMatch[4] || tvMatch[6], 10);
    base = base.substring(0, tvMatch.index);
  }

  let year = null;
  const yearMatches = [];
  const yearRegex = /(?:^|[._\s\(\[-])(19\d{2}|20\d{2})(?=[._\s\)\]-]|$)/g;
  let m;
  while ((m = yearRegex.exec(base)) !== null) {
    yearMatches.push({
      year: parseInt(m[1], 10),
      index: m.index + (m[0].length - m[1].length)
    });
  }

  if (yearMatches.length > 0) {
    const lastYear = yearMatches[yearMatches.length - 1];
    if (lastYear.index > 0) {
      year = lastYear.year;
      let cutIdx = lastYear.index;
      if (cutIdx > 0 && /[\(\[\{]/.test(base[cutIdx - 1])) {
        cutIdx--;
      }
      base = base.substring(0, cutIdx);
    }
  }

  const noiseTokens = [
    '2160p', '4k', 'uhd', '1080p', '1080i', '720p', '576p', '480p', 'hd', 'sd',
    'x264', 'h264', 'h\\.264', 'x265', 'h265', 'h\\.265', 'hevc', 'avc', 'xvid', 'divx', 'vc1', 'vp9', 'av1',
    'bluray', 'blu-ray', 'bdrip', 'brrip', 'web-dl', 'webdl', 'web-rip', 'webrip', 'hdtv', 'pdtv', 'dvdrip', 'dvd', 'remux', 'cam', 'telesync', 'hdrip',
    'dts-hd', 'dts-hd-ma', 'dts', 'truehd', 'atmos', 'ac3', 'eac3', 'ddp5\\.1', 'ddp', 'dd5\\.1', 'dd\\+', 'aac', 'flac', 'mp3', '5\\.1', '7\\.1', '2\\.0', 'dual-audio', 'dual',
    'latino', 'castellano', 'spanish', 'espanol', 'multi', 'subbed', 'subpack', 'subs', 'esub', 'vostfr', 'french', 'ita', 'german',
    'remastered', 'proper', 'repack', 'extended', 'unrated', 'directors-cut', 'imax', 'internal', 'hdr', 'hdr10', 'hdr10\\+', 'dv', 'dolby-vision', 'ma', 'nf',
    'sparks', 'yify', 'rarbg', 'fgt', 'terminal', 'psa', 'flux', 'tepes', 'ion10', 'galaxytv', 'ettv'
  ];

  const noiseRegex = new RegExp(`(?:[._\\s\\(\\[-]|^)(?:${noiseTokens.join('|')})(?:[._\\s\\)\\]-]|$)`, 'gi');
  let cleaned = base;
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(noiseRegex, ' ');
  } while (cleaned !== prev);

  cleaned = cleaned.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, ' ');
  cleaned = cleaned.replace(/[._]/g, ' ');
  cleaned = cleaned.replace(/\s+-\s+/g, ' ');
  cleaned = cleaned.replace(/\s+-/g, ' ');
  cleaned = cleaned.replace(/-\s+/g, ' ');
  cleaned = cleaned.replace(/-[a-zA-Z0-9]+$/, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return {
    cleanTitle: cleaned,
    year,
    isSeries,
    season,
    episode
  };
}

function convertSrtToVtt(srtBuffer) {
  let text;
  try {
    const utf8Attempt = srtBuffer.toString('utf8');
    if (/[\uFFFD]/.test(utf8Attempt)) {
      text = srtBuffer.toString('latin1');
    } else {
      text = utf8Attempt;
    }
  } catch {
    text = srtBuffer.toString('latin1');
  }

  // Remove BOM and normalize line endings
  let cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Convert comma timestamps to dot timestamps: 00:01:23,456 -> 00:01:23.456
  cleaned = cleaned.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2 --> $3.$4'
  );

  // Strip font tags and ASS/SSA positioning tags
  cleaned = cleaned.replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '');
  cleaned = cleaned.replace(/\{\\[^}]+\}/g, '');

  return `WEBVTT\n\n${cleaned.trim()}\n`;
}

class MockServer {
  constructor(port = 3099) {
    this.port = port;
    this.server = null;
    this.tmdbCache = new Map();
    this.authInvalidated = false;
    this.rateLimited = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        resolve(`http://localhost:${this.port}`);
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Standard CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Accept-Ranges, Content-Type, Authorization',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
    };

    // Preflight OPTIONS handler
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      return res.end();
    }

    // Healthcheck endpoint
    if (pathname === '/api/health') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'ok',
        version: '1.0.0',
        driveConnected: !this.authInvalidated,
        serviceAccountConfigured: true,
        timestamp: new Date().toISOString()
      }));
    }

    // Fault Injection Flags
    if (req.headers['x-simulate-auth-failure'] === 'true' || this.authInvalidated || url.searchParams.get('auth') === 'invalid') {
      res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing Service Account credentials' }));
    }

    if (req.headers['x-simulate-rate-limit'] === 'true' || this.rateLimited) {
      res.writeHead(429, { ...corsHeaders, 'Retry-After': '5', 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'User rate limit exceeded on Google Drive API' }));
    }

    // 1. GET /api/drive/folders
    if (pathname === '/api/drive/folders') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ folders: FOLDERS }));
    }

    // 2. GET /api/drive/files/:category
    if (pathname.startsWith('/api/drive/files/')) {
      let categoryRaw = pathname.replace('/api/drive/files/', '').replace(/\/$/, '');
      try {
        categoryRaw = decodeURIComponent(categoryRaw);
      } catch {}
      const category = categoryRaw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      let canonicalCategory = category;
      let items = [];
      if (category === 'peliculas' || category === 'cine' || category === 'movies') {
        items = MOVIES;
        canonicalCategory = 'peliculas';
      } else if (category === 'series' || category === 'tv') {
        items = SERIES;
        canonicalCategory = 'series';
      } else if (category === 'familiares' || category === 'videos_familiares' || category === 'videos familiares') {
        // Strict Isolation: Family videos contain native Drive metadata, thumbnail upgraded to =s800
        items = FAMILY_VIDEOS.map(v => ({
          ...v,
          thumbnailLink: v.thumbnailLink.replace(/=s\d+$/, '=s800'),
          // Hard barrier: no TMDB properties
          tmdbEnriched: false
        }));
        canonicalCategory = 'familiares';
      } else if (category === 'fotos' || category === 'photos') {
        items = PHOTOS;
        canonicalCategory = 'fotos';
      } else if (category === 'musica' || category === 'music') {
        items = MUSIC;
        canonicalCategory = 'musica';
      } else if (category === 'empty') {
        items = [];
        canonicalCategory = 'empty';
      } else {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Category '${categoryRaw}' not found` }));
      }

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ category: canonicalCategory, total: items.length, items }));
    }

    // 3. GET /api/stream/:fileId
    if (pathname.startsWith('/api/stream/')) {
      const fileId = pathname.replace('/api/stream/', '');
      const allMedia = [...MOVIES, ...SERIES, ...FAMILY_VIDEOS, ...MUSIC];
      const mediaItem = allMedia.find(m => m.id === fileId);

      if (!mediaItem) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Media item '${fileId}' not found` }));
      }

      const totalSize = mediaItem.size || SAMPLE_VIDEO_BUFFER_SIZE;
      const mimeType = mediaItem.mimeType || 'video/mp4';

      // HEAD Request handling
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          ...corsHeaders,
          'Accept-Ranges': 'bytes',
          'Content-Length': totalSize.toString(),
          'Content-Type': mimeType
        });
        return res.end();
      }

      // Range header parsing
      const rangeHeader = req.headers.range;
      let start = 0;
      let end = Math.min(CHUNK_SIZE_LIMIT - 1, totalSize - 1);

      if (rangeHeader) {
        if (!/^bytes=\d*-\d*$/.test(rangeHeader)) {
          // Invalid range syntax
          res.writeHead(416, {
            ...corsHeaders,
            'Content-Range': `bytes */${totalSize}`
          });
          return res.end();
        }

        const matches = rangeHeader.replace(/bytes=/, '').split('-');
        const parsedStart = matches[0] !== '' ? parseInt(matches[0], 10) : NaN;
        const parsedEnd = matches[1] !== '' ? parseInt(matches[1], 10) : NaN;

        if (!isNaN(parsedStart)) {
          start = parsedStart;
          if (start >= totalSize) {
            res.writeHead(416, {
              ...corsHeaders,
              'Content-Range': `bytes */${totalSize}`
            });
            return res.end();
          }

          if (!isNaN(parsedEnd)) {
            if (parsedEnd < start) {
              res.writeHead(416, {
                ...corsHeaders,
                'Content-Range': `bytes */${totalSize}`
              });
              return res.end();
            }
            end = Math.min(parsedEnd, start + CHUNK_SIZE_LIMIT - 1);
          } else {
            end = Math.min(start + CHUNK_SIZE_LIMIT - 1, totalSize - 1);
          }
        }
      }

      const chunkSize = end - start + 1;
      const bufferSlice = Buffer.alloc(chunkSize);
      sampleVideoBuffer.copy(
        bufferSlice,
        0,
        start % SAMPLE_VIDEO_BUFFER_SIZE,
        Math.min(SAMPLE_VIDEO_BUFFER_SIZE, (start % SAMPLE_VIDEO_BUFFER_SIZE) + chunkSize)
      );

      res.writeHead(206, {
        ...corsHeaders,
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600, no-transform'
      });

      return res.end(bufferSlice);
    }

    // 4. GET /api/subtitles/:fileId
    if (pathname.startsWith('/api/subtitles/')) {
      const subId = pathname.replace('/api/subtitles/', '');

      if (subId.startsWith('list/')) {
        const fileId = subId.replace('list/', '');
        const movie = MOVIES.find(m => m.id === fileId);
        const subs = movie ? movie.subtitles : [];
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ fileId, subtitles: subs }));
      }

      let srtContentBuffer = Buffer.from(SAMPLE_SRT_UTF8, 'utf8');

      if (subId.includes('bom')) {
        srtContentBuffer = Buffer.from(SAMPLE_SRT_WITH_BOM, 'utf8');
      } else if (subId.includes('latin1')) {
        srtContentBuffer = SAMPLE_SRT_LATIN1_BUFFER;
      } else if (subId.includes('corrupt')) {
        srtContentBuffer = Buffer.from(SAMPLE_SRT_CORRUPT_TAGS, 'utf8');
      } else if (subId.includes('empty')) {
        srtContentBuffer = Buffer.from('', 'utf8');
      }

      const vttContent = convertSrtToVtt(srtContentBuffer);

      res.writeHead(200, {
        ...corsHeaders,
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400'
      });
      return res.end(vttContent);
    }

    // 5. GET /api/metadata/enrich
    if (pathname === '/api/metadata/enrich') {
      const title = url.searchParams.get('title') || '';
      const year = url.searchParams.get('year') || '';
      let category = url.searchParams.get('category') || '';
      try {
        category = decodeURIComponent(category);
      } catch {}
      category = category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      // STRICT ISOLATION BARRIER: Reject or block family video enrichment
      if (category === 'familiares' || category === 'videos familiares' || category === 'videos_familiares' || /familia|home[-_ ]?video/i.test(title)) {
        res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'Strict Isolation Barrier: Family media is barred from external TMDB enrichment'
        }));
      }

      const cacheKey = `${title.toLowerCase()}_${year || 'none'}`;
      if (this.tmdbCache.has(cacheKey)) {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          ...this.tmdbCache.get(cacheKey),
          cached: true
        }));
      }

      // Find in mock records
      let record = null;
      if (title && title.trim()) {
        for (const [key, val] of Object.entries(TMDB_RECORDS)) {
          if (key.includes(title.toLowerCase())) {
            record = val;
            break;
          }
        }
      }

      if (!record) {
        // Fallback response for unmatched items
        const fallback = {
          title,
          year: year ? parseInt(year, 10) : null,
          overview: 'Sinopsis no disponible en TMDB.',
          posterUrl: 'https://via.placeholder.com/500x750.png?text=' + encodeURIComponent(title),
          backdropUrl: null,
          rating: 0,
          director: 'Desconocido',
          cast: [],
          cached: false
        };
        this.tmdbCache.set(cacheKey, fallback);
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(fallback));
      }

      const enriched = { ...record, cached: false };
      this.tmdbCache.set(cacheKey, enriched);

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(enriched));
    }

    // 6. GET /api/metadata/clean-title
    if (pathname === '/api/metadata/clean-title') {
      const filename = url.searchParams.get('filename') || '';
      const result = sanitizeMediaFilename(filename);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    // Default 404
    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: `Route '${pathname}' not found` }));
  }
}

module.exports = {
  MockServer,
  sanitizeMediaFilename,
  convertSrtToVtt
};
