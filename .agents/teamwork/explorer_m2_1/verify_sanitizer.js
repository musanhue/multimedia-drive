// Expanded test suite for edge cases
const assert = require('assert');

function sanitizeMediaFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return {
      originalFilename: String(filename || ''),
      cleanTitle: '',
      year: null,
      isSeries: false,
      season: null,
      episode: null
    };
  }

  // Stage 0: Unicode normalization (NFC)
  let base = filename.normalize('NFC').trim();

  // Stage 1: Strip file extension
  // Matches 2-5 letter alphanumeric extension, but NOT 4-digit years like .2049
  base = base.replace(/\.(?!(?:19\d{2}|20\d{2})$)[a-zA-Z0-9]{2,5}$/, '');

  let isSeries = false;
  let season = null;
  let episode = null;

  // Stage 2: TV Episode & Series Detection
  // Matches S01E02, s01e02, 1x02, Season 1 Episode 2, Temporada 1 Episodio 2, T01E02
  const tvPattern = /(?:[._\s\(\[-]|^)(?:(?:s|t|season|temporada)[._\s-]*(\d{1,2})[._\s-]*(?:e|ep|episode|episodio)[._\s-]*(\d{1,3})|(\d{1,2})x(\d{1,3}))(?:[._\s\)\]-]|$)/i;
  const tvMatch = base.match(tvPattern);
  if (tvMatch) {
    isSeries = true;
    season = parseInt(tvMatch[1] || tvMatch[3], 10);
    episode = parseInt(tvMatch[2] || tvMatch[4], 10);
    // Isolate title prefix before TV episode marker
    base = base.substring(0, tvMatch.index);
  }

  // Stage 3: Release Year Extraction (1900-2099) with lookahead
  let year = null;
  const yearMatches = [];
  const yearRegex = /(?:^|[._\s\(\[-])(19\d{2}|20\d{2})(?=[._\s\)\]-]|$)/g;
  let m;
  while ((m = yearRegex.exec(base)) !== null) {
    yearMatches.push({
      year: parseInt(m[1], 10),
      rawIndex: m.index,
      yearIndex: m.index + (m[0].length - m[1].length)
    });
  }

  if (yearMatches.length > 0) {
    // When multiple years appear, the last one before noise tags is the release year
    // E.g. Blade Runner 2049 2017 -> 2017 is release year
    const lastYear = yearMatches[yearMatches.length - 1];
    
    // Check if the only match is at index 0 followed by text (e.g. "2001.A.Space.Odyssey")
    const isSingleYearAtStartWithText = yearMatches.length === 1 && 
      lastYear.rawIndex === 0 && 
      base.length > 4 && 
      /[a-zA-Z]/.test(base.substring(4));

    if (!isSingleYearAtStartWithText) {
      year = lastYear.year;
      let cutIdx = lastYear.yearIndex;
      // Also trim opening parenthesis/bracket preceding the year
      if (cutIdx > 0 && /[\(\[\{]/.test(base[cutIdx - 1])) {
        cutIdx--;
      }
      const candidateTitle = base.substring(0, cutIdx).trim();
      // If cutting would leave empty title and this was the only token, keep candidate
      if (candidateTitle.length > 0 || yearMatches.length > 1) {
        base = candidateTitle;
      }
    }
  }

  // Stage 4: Noise Tag Stripping
  const noiseTokens = [
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
    'netflix', 'nf', 'amzn', 'amazon', 'atvp', 'dsnp', 'disney\\+', 'disney', 'hmax', 'hbo-max', 'hbo', 'paramount\\+', 'paramount', 'peacock', 'hulu', 'itunes',
    // Release groups
    'sparks', 'yify', 'yts(?:\\.mx|\\.lt)?', 'rarbg', 'fgt', 'terminal', 'psa', 'flux', 'tepes', 'ion10', 'galaxytv', 'galaxyrg', 'ettv', 'evo', 'cmrg', 'cahoots'
  ];

  const noiseRegex = new RegExp(`(?:[._\\s\\(\\[-]|^)(?:${noiseTokens.join('|')})(?:[._\\s\\)\\]-]|$)`, 'gi');
  let cleaned = base;
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(noiseRegex, ' ');
  } while (cleaned !== prev);

  // Stage 5: Empty bracket & delimiter cleanup
  cleaned = cleaned.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, ' ');
  // Replace dots and underscores with spaces
  cleaned = cleaned.replace(/[._]/g, ' ');

  // Preserve compound words (e.g. Spider-Man, WALL-E, X-Men), but remove isolated hyphens
  cleaned = cleaned.replace(/\s+-\s+/g, ' ');
  cleaned = cleaned.replace(/\s+-(?=[^\w]|$)/g, ' ');
  cleaned = cleaned.replace(/(?:^[^\w]|(?<=\s))-+/g, ' ');

  // Stage 6: Release Group Pruning (trailing hyphen-separated tag like -SPARKS or -RARBG)
  cleaned = cleaned.replace(/-[a-zA-Z0-9]+$/, '');

  // Stage 7: Strip leading/trailing non-alphanumeric punctuation except Spanish inverted marks
  cleaned = cleaned.replace(/^[^\wáéíóúÁÉÍÓÚñÑüÜ¿¡]+|[^\wáéíóúÁÉÍÓÚñÑüÜ!?)]+$/g, '');

  // Stage 8: Whitespace collapse and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If cleaning stripped everything (e.g. "1984.mkv" where candidate title was empty), restore year if it was the full name
  if (!cleaned && year !== null) {
    if (filename.startsWith(String(year))) {
      cleaned = String(year);
    }
  }

  return {
    originalFilename: filename,
    cleanTitle: cleaned,
    year,
    isSeries,
    season,
    episode
  };
}

const moreTests = [
  { input: 'Game.of.Thrones.Season.1.Episode.05.mkv', title: 'Game of Thrones', isSeries: true, s: 1, e: 5 },
  { input: 'Los.Simpsons.Temporada.12.Episodio.03.mkv', title: 'Los Simpsons', isSeries: true, s: 12, e: 3 },
  { input: 'Breaking.Bad.S01E01.Pilot.720p.HDTV.x264.mkv', title: 'Breaking Bad', isSeries: true, s: 1, e: 1 },
  { input: 'Doctor.Who.2005.S01E01.mkv', title: 'Doctor Who', year: 2005, isSeries: true, s: 1, e: 1 },
  { input: 'WALL-E.2008.1080p.mkv', title: 'WALL-E', year: 2008, isSeries: false },
  { input: 'X-Men.First.Class.2011.1080p.mkv', title: 'X-Men First Class', year: 2011, isSeries: false },
  { input: 'Volver.2006.SPANISH.1080p.WEB-DL.DD5.1.H.264.mkv', title: 'Volver', year: 2006, isSeries: false },
  { input: 'The.Matrix.Resurrections.2021.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HEVC-FLUX.mkv', title: 'The Matrix Resurrections', year: 2021, isSeries: false },
  { input: 'Granizo.2022.NF.WEB-DL.1080p.mkv', title: 'Granizo', year: 2022, isSeries: false },
  { input: '¡Asu.Mare!.2013.1080p.mkv', title: '¡Asu Mare!', year: 2013, isSeries: false },
  { input: '¿Quién.engañó.a.Roger.Rabbit.1988.mkv', title: '¿Quién engañó a Roger Rabbit', year: 1988, isSeries: false },
  { input: 'Spider-Man - Far From Home (2019) [1080p] [BluRay] [5.1] [YTS.MX].mp4', title: 'Spider-Man Far From Home', year: 2019, isSeries: false },
  { input: 'Se7en.1995.1080p.mkv', title: 'Se7en', year: 1995, isSeries: false },
  { input: 'Movie Name - 2023 - 1080p.mkv', title: 'Movie Name', year: 2023, isSeries: false },
  { input: '', title: '', year: null, isSeries: false, s: null, e: null },
  { input: null, title: '', year: null, isSeries: false, s: null, e: null },
  { input: undefined, title: '', year: null, isSeries: false, s: null, e: null }
];

let failed = 0;
for (const t of moreTests) {
  const res = sanitizeMediaFilename(t.input);
  console.log(`[MORE] "${t.input}" -> title="${res.cleanTitle}", year=${res.year}, isSeries=${res.isSeries}, s=${res.season}, e=${res.episode}`);
  if (t.title !== undefined && res.cleanTitle !== t.title) {
    console.error(`  FAIL: expected title "${t.title}", got "${res.cleanTitle}"`);
    failed++;
  }
  if (t.year !== undefined && res.year !== t.year) {
    console.error(`  FAIL: expected year ${t.year}, got ${res.year}`);
    failed++;
  }
  if (t.isSeries !== undefined && res.isSeries !== t.isSeries) {
    console.error(`  FAIL: expected isSeries ${t.isSeries}, got ${res.isSeries}`);
    failed++;
  }
  if (t.s !== undefined && res.season !== t.s) {
    console.error(`  FAIL: expected season ${t.s}, got ${res.season}`);
    failed++;
  }
  if (t.e !== undefined && res.episode !== t.e) {
    console.error(`  FAIL: expected episode ${t.e}, got ${res.episode}`);
    failed++;
  }
}

if (failed === 0) {
  console.log('ALL EXTENDED TESTS PASSED!');
} else {
  process.exit(1);
}

module.exports = { sanitizeMediaFilename };
