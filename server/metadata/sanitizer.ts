/**
 * server/metadata/sanitizer.ts
 *
 * High-performance 8-stage regex sanitization and metadata extraction engine
 * for media filenames. Fully compatible with Node.js and Chromium M56 environments.
 */

export interface SanitizedMediaInfo {
  originalFilename: string;
  cleanTitle: string;
  year: number | null;
  isSeries: boolean;
  season: number | null;
  episode: number | null;
}

const NOISE_TOKENS = [
  // Quality & Resolution
  '4320p', '8k', '2160p', '4k', 'uhd', '1440p', '2k', '1080p', '1080i', '720p', '720i', '576p', '576i', '480p', '480i',
  'fhd', 'qhd', 'hd', 'sd',
  // HDR & Display tech
  'hdr10\\+', 'hdr10plus', 'hdr10', 'hdr', 'dolby-vision', 'dolbyvision', 'dv', 'hlg', 'imax-enhanced', 'imax',
  // Video Codecs
  'x264', 'h264', 'h\\.264', 'x-264', 'h-264', 'x265', 'h265', 'h\\.265', 'x-265', 'h-265',
  'hevc', 'avc', 'xvid', 'divx', 'vc1', 'vc-1', 'vp9', 'vp8', 'av1', '10bit', '10-bit', '12bit', '8bit',
  // Sources
  'bluray', 'blu-ray', 'bdrip', 'brrip', 'bd-rip', 'br-rip', 'bdisk',
  'web-dl', 'webdl', 'web-rip', 'webrip', 'web', 'dl-web',
  'remux', 'bd-remux', 'uhd-remux',
  'hdtv', 'pdtv', 'dsr', 'dsrip', 'tvrip',
  'dvdrip', 'dvd-rip', 'dvd', 'dvd5', 'dvd9', 'r5',
  'camrip', 'cam', 'telesync', 'telecine', 'tc', 'ts', 'screener', 'scr', 'dvdscr', 'hdrip', 'vodrip',
  // Audio Formats & Channels
  'dts-hd-ma', 'dts-hd', 'dts-x', 'dtshd', 'dts',
  'truehd', 'true-hd', 'atmos', 'dolby-atmos',
  'ddp5\\.1', 'ddp7\\.1', 'ddp2\\.0', 'ddp', 'dd\\+', 'eac3', 'e-ac3', 'ac3', 'dd5\\.1', 'dd2\\.0',
  'aac2\\.0', 'aac5\\.1', 'aac', 'flac2\\.0', 'flac5\\.1', 'flac', 'mp3', 'opus', 'vorbis', 'lpcm', 'pcm',
  '7\\.1ch', '5\\.1ch', '2\\.0ch', '7\\.1', '5\\.1', '2\\.1', '2\\.0',
  // Languages, Audio Tracks & Subs
  'latino', 'castellano', 'spanish', 'espanol', 'español',
  'english', 'french', 'vostfr', 'ita', 'italian', 'german', 'deutsch', 'portuguese', 'russian',
  'dual-audio', 'dualaudio', 'dual', 'multi-audio', 'multisubs', 'multisub', 'multi',
  'subbed', 'subpack', 'subs', 'sub', 'esub', 'hardsub', 'softsub',
  // Editions, Cuts & Releases
  'remastered', 'remaster', 'restored', 'proper', 'repack', 'rerip', 'real-proper',
  'extended-cut', 'extended-edition', 'extended',
  'unrated', 'uncut', 'censored', 'uncensored',
  'directors-cut', 'director-cut', 'directors_cut',
  'theatrical-cut', 'theatrical', 'special-edition',
  'criterion-collection', 'criterion', 'internal',
  // Streaming networks
  'netflix', 'nf', 'amzn', 'amazon', 'atvp', 'dsnp', 'disney\\+', 'disney', 'hmax', 'hbo-max', 'hbo', 'paramount\\+', 'paramount', 'peacock', 'hulu', 'itunes', 'ma',
  // Release groups
  'sparks', 'yify', 'yts(?:\\.mx|\\.lt)?', 'rarbg', 'fgt', 'terminal', 'psa', 'flux', 'tepes', 'ion10', 'galaxytv', 'galaxyrg', 'ettv', 'evo', 'cmrg', 'cahoots'
];

const NOISE_REGEX = new RegExp(`(?:[._\\s\\(\\[-]|^)(?:${NOISE_TOKENS.join('|')})(?:[._\\s\\)\\]-]|$)`, 'gi');

/**
 * Strips container, video, audio, and subtitle extensions.
 * Guards against stripping 4-digit years like .2049.
 */
export function stripFileExtension(filename: string): string {
  return filename.replace(/\.(?!(?:19\d{2}|20\d{2})$)[a-zA-Z0-9]{2,5}$/, '');
}

/**
 * Detects TV Series patterns: S01E02, 1x02, Season 1 Episode 2, Temporada 1 Episodio 2, T01E02.
 */
export function detectTvEpisode(base: string): {
  isSeries: boolean;
  season: number | null;
  episode: number | null;
  titleBase: string;
} {
  const tvPattern = /(?:[._\s\(\[-]|^)(?:(?:s|t|season|temporada)[._\s-]*(\d{1,2})[._\s-]*(?:e|ep|episode|episodio)[._\s-]*(\d{1,3})|(\d{1,2})x(\d{1,3}))(?:[._\s\)\]-]|$)/i;
  const match = base.match(tvPattern);
  if (match) {
    const season = parseInt(match[1] || match[3], 10);
    const episode = parseInt(match[2] || match[4], 10);
    const titleBase = base.substring(0, match.index);
    return { isSeries: true, season, episode, titleBase };
  }
  return { isSeries: false, season: null, episode: null, titleBase: base };
}

/**
 * Extracts 4-digit release year (1900-2099) using regex lookahead.
 */
export function extractReleaseYear(base: string): {
  year: number | null;
  titleBase: string;
} {
  let year: number | null = null;
  const yearMatches: Array<{ year: number; rawIndex: number; yearIndex: number }> = [];
  const yearRegex = /(?:^|[._\s\(\[-])(19\d{2}|20\d{2})(?=[._\s\)\]-]|$)/g;
  let m: RegExpExecArray | null;

  while ((m = yearRegex.exec(base)) !== null) {
    yearMatches.push({
      year: parseInt(m[1], 10),
      rawIndex: m.index,
      yearIndex: m.index + (m[0].length - m[1].length),
    });
  }

  let titleBase = base;
  if (yearMatches.length > 0) {
    const lastYear = yearMatches[yearMatches.length - 1];
    const isSingleYearAtStartWithText =
      yearMatches.length === 1 &&
      lastYear.rawIndex === 0 &&
      base.length > 4 &&
      /[a-zA-Z]/.test(base.substring(4));

    if (!isSingleYearAtStartWithText) {
      year = lastYear.year;
      let cutIdx = lastYear.yearIndex;
      if (cutIdx > 0 && /[\(\[\{]/.test(base[cutIdx - 1])) {
        cutIdx--;
      }
      const candidate = base.substring(0, cutIdx).replace(/[._\s\(\[-]+$/, '').trim();
      if (candidate.length > 0 || yearMatches.length > 1) {
        titleBase = candidate;
      }
    }
  }

  return { year, titleBase };
}

/**
 * Iteratively removes technical noise tokens using classified dictionary.
 */
export function stripNoiseTags(text: string): string {
  let cleaned = text;
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(NOISE_REGEX, ' ');
  } while (cleaned !== prev);
  return cleaned;
}

/**
 * Normalizes delimiters, preserves compound hyphens, cleans brackets and release groups.
 */
export function cleanDelimitersAndHyphens(text: string): string {
  let cleaned = text;
  // Clean empty brackets
  cleaned = cleaned.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, ' ');
  // Dots and underscores to spaces
  cleaned = cleaned.replace(/[._]/g, ' ');
  // Remove hyphens surrounded by spaces or isolated delimiters, keeping compound words like Spider-Man
  cleaned = cleaned.replace(/\s+-\s+/g, ' ');
  cleaned = cleaned.replace(/\s+-(?=[^\w]|$)/g, ' ');
  cleaned = cleaned.replace(/(?:^[^\w]|(?<=\s))-+/g, ' ');
  // Prune trailing hyphen release group (must be preceded by whitespace or non-word)
  cleaned = cleaned.replace(/(?<=\s)-[a-zA-Z0-9]+$/, '');
  // Trim outer non-alphanumeric punctuation, preserving Spanish inverted marks
  cleaned = cleaned.replace(/^[^\wáéíóúÁÉÍÓÚñÑüÜ¿¡]+|[^\wáéíóúÁÉÍÓÚñÑüÜ!?)]+$/g, '');
  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Main 8-stage sanitization function.
 */
export function sanitizeMediaFilename(filename: string): SanitizedMediaInfo {
  if (!filename || typeof filename !== 'string') {
    return {
      originalFilename: String(filename || ''),
      cleanTitle: '',
      year: null,
      isSeries: false,
      season: null,
      episode: null,
    };
  }

  // Stage 0: Unicode NFC normalization
  let base = filename.normalize('NFC').trim();

  // Stage 1: Strip extension
  base = stripFileExtension(base);

  // Strip leading catalog/scene codes (e.g. "2218b-Beethoven 2" -> "Beethoven 2")
  base = base.replace(/^\d+[a-zA-Z]{0,4}[-_ ]+(?=[a-zA-ZáéíóúÁÉÍÓÚñÑ])/, '');

  // Stage 2: TV Show Detection
  const tvResult = detectTvEpisode(base);
  const isSeries = tvResult.isSeries;
  const season = tvResult.season;
  const episode = tvResult.episode;
  base = tvResult.titleBase;

  // Stage 3: Release Year Extraction
  const yearResult = extractReleaseYear(base);
  const year = yearResult.year;
  base = yearResult.titleBase;

  // Stage 4: Noise Tag Stripping
  base = stripNoiseTags(base);

  // Stages 5-7: Delimiter, Hyphen, Bracket, and Diacritic normalization
  let cleanTitle = cleanDelimitersAndHyphens(base);

  // Stage 8: Fallback for pure numeric titles (e.g. "1984.mkv" or "1917.mkv")
  if (!cleanTitle && year !== null && filename.startsWith(String(year))) {
    cleanTitle = String(year);
  }

  return {
    originalFilename: filename,
    cleanTitle,
    year,
    isSeries,
    season,
    episode,
  };
}
