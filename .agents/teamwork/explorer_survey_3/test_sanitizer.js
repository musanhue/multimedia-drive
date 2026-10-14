// Prototype & Verification script for Filename Sanitization & Metadata Extraction
const TEST_FILENAMES = [
  "Inception.2010.1080p.BluRay.x264-SPARKS.mkv",
  "El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4",
  "Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv",
  "Blade.Runner.2049.2017.2160p.UHD.HDR.x265-GROUP.mkv",
  "2001.A.Space.Odyssey.1968.REMASTERED.1080p.BluRay.x264.mkv",
  "Amélie.(2001).[BluRay.720p.x264.DTS].mkv",
  "Volver.2006.SPANISH.1080p.WEB-DL.DD5.1.H.264.mkv",
  "El.laberinto.del.fauno.(Pan's.Labyrinth).2006.1080p.BRRip.x264.mkv",
  "Spider-Man.No.Way.Home.2021.PROPER.1080p.WEBRip.x264-RARBG.mp4",
  "Breaking.Bad.S01E01.Pilot.720p.HDTV.x264.mkv",
  "Stranger.Things.S04E09.1080p.NF.WEB-DL.DDP5.1.Atmos.x264-TEPES.mkv",
  "La.Casa.de.Papel.4x08.1080p.NF.WEB-DL.DDP5.1.x264.mkv",
  "Avengers.Endgame.2019.LATINO.1080p.Dual.Audio.mkv",
  "The.Matrix.Resurrections.2021.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HEVC-FLUX.mkv",
  "El Padrino (1972) [BluRay 1080p].mkv",
  "Granizo.2022.NF.WEB-DL.1080p.mkv"
];

function sanitizeMediaFilename(filename) {
  // 1. Strip file extension
  let base = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');

  let isSeries = false;
  let season = null;
  let episode = null;

  // 2. Detect TV Show patterns: S01E01, s01e01, 1x01, Season 1 Episode 1
  const tvPattern = /(?:[._\s-]|^)(?:s(\d{1,2})e(\d{1,2})|(\d{1,2})x(\d{1,2})|season[._\s-]*(\d{1,2})[._\s-]*episode[._\s-]*(\d{1,2}))(?:[._\s-]|$)/i;
  const tvMatch = base.match(tvPattern);
  if (tvMatch) {
    isSeries = true;
    season = parseInt(tvMatch[1] || tvMatch[3] || tvMatch[5], 10);
    episode = parseInt(tvMatch[2] || tvMatch[4] || tvMatch[6], 10);
    // Take title before the TV pattern
    base = base.substring(0, tvMatch.index);
  }

  // 3. Extract Year (1900 - 2099)
  // Look for 4-digit year. Using non-consuming lookaround or tokenizing avoids skipping consecutive year tokens.
  let year = null;
  // Match 4-digit years surrounded by delimiters without consuming both delimiters
  const yearMatches = [];
  const yearRegex = /(?:^|[._\s\(\[-])(19\d{2}|20\d{2})(?=[._\s\)\]-]|$)/g;
  let m;
  while ((m = yearRegex.exec(base)) !== null) {
    yearMatches.push({ year: parseInt(m[1], 10), index: m.index + (m[0].length - m[1].length) });
  }

  if (yearMatches.length > 0) {
    // If multiple years are found (e.g. "Blade Runner 2049 (2017)"),
    // the last one is the release year, unless it's the only one and at index 0.
    const lastYear = yearMatches[yearMatches.length - 1];
    if (lastYear.index > 0) {
      year = lastYear.year;
      // Also trim opening parenthesis/bracket immediately preceding the year
      let cutIdx = lastYear.index;
      if (cutIdx > 0 && /[\(\[\{]/.test(base[cutIdx - 1])) {
        cutIdx--;
      }
      base = base.substring(0, cutIdx);
    }
  }

  // 4. Noise tags list to strip (case-insensitive)
  const noiseTokens = [
    // Quality & Resolution
    '2160p', '4k', 'uhd', '1080p', '1080i', '720p', '576p', '480p', 'hd', 'sd',
    // Codecs
    'x264', 'h264', 'h\\.264', 'x265', 'h265', 'h\\.265', 'hevc', 'avc', 'xvid', 'divx', 'vc1', 'vp9', 'av1',
    // Source
    'bluray', 'blu-ray', 'bdrip', 'brrip', 'web-dl', 'webdl', 'web-rip', 'webrip', 'hdtv', 'pdtv', 'dvdrip', 'dvd', 'remux', 'cam', 'telesync', 'hdrip',
    // Audio
    'dts-hd', 'dts-hd-ma', 'dts', 'truehd', 'atmos', 'ac3', 'eac3', 'ddp5\\.1', 'ddp', 'dd5\\.1', 'dd\\+', 'aac', 'flac', 'mp3', '5\\.1', '7\\.1', '2\\.0', 'dual-audio', 'dual',
    // Languages & Subs
    'latino', 'castellano', 'spanish', 'espanol', 'multi', 'subbed', 'subpack', 'subs', 'esub', 'vostfr', 'french', 'ita', 'german',
    // Releases / Editions
    'remastered', 'proper', 'repack', 'extended', 'unrated', 'directors-cut', 'imax', 'internal', 'hdr', 'hdr10', 'hdr10\\+', 'dv', 'dolby-vision', 'ma', 'nf',
    // Common Release Groups (common suffix)
    'sparks', 'yify', 'rarbg', 'fgt', 'terminal', 'psa', 'flux', 'tepes', 'ion10', 'galaxytv', 'ettv'
  ];

  const noiseRegex = new RegExp(`(?:[._\\s\\(\\[-]|^)(?:${noiseTokens.join('|')})(?:[._\\s\\)\\]-]|$)`, 'gi');

  // Replace noise tags
  let cleaned = base;
  // Repeat noise stripping to catch consecutive tags
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(noiseRegex, ' ');
  } while (cleaned !== prev);

  // 5. Remove remaining bracketed tags e.g. [1080p] or (Pan's Labyrinth) if secondary
  // Clean empty brackets or brackets containing leftover noise
  cleaned = cleaned.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, ' ');

  // 6. Delimiter cleanup: replace dots and underscores with spaces
  cleaned = cleaned.replace(/[._]/g, ' ');

  // Preserve hyphen in names like Spider-Man, but remove standalone hyphens
  cleaned = cleaned.replace(/\s+-\s+/g, ' ');
  cleaned = cleaned.replace(/\s+-/g, ' ');
  cleaned = cleaned.replace(/-\s+/g, ' ');

  // 7. Strip trailing group tags like "-SPARKS" if still present
  cleaned = cleaned.replace(/-[a-zA-Z0-9]+$/, '');

  // 8. Trim and normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return {
    raw: filename,
    cleanTitle: cleaned,
    year: year,
    isSeries: isSeries,
    season: season,
    episode: episode
  };
}

console.log("=== RESULTS ===");
for (const file of TEST_FILENAMES) {
  console.log(JSON.stringify(sanitizeMediaFilename(file), null, 2));
}
