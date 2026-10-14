import assert from 'node:assert/strict';

export interface DriveFileInfo {
  id: string;
  name: string;
  size?: number;
}

export interface SubtitleTrack {
  id: string;
  name: string;
  lang: string;
  label: string;
  format: 'srt' | 'vtt';
  isDefault: boolean;
  isForced: boolean;
  vttUrl: string;
}

const LANGUAGE_MAP: Record<string, { code: string; label: string }> = {
  es: { code: 'es', label: 'Español' },
  spa: { code: 'es', label: 'Español' },
  esp: { code: 'es', label: 'Español' },
  spanish: { code: 'es', label: 'Español' },
  castellano: { code: 'es', label: 'Español' },
  'es-la': { code: 'es-LA', label: 'Español (Latino)' },
  'es-419': { code: 'es-LA', label: 'Español (Latino)' },
  lat: { code: 'es-LA', label: 'Español (Latino)' },
  latino: { code: 'es-LA', label: 'Español (Latino)' },
  en: { code: 'en', label: 'Inglés' },
  eng: { code: 'en', label: 'Inglés' },
  english: { code: 'en', label: 'Inglés' },
  pt: { code: 'pt', label: 'Portugués' },
  por: { code: 'pt', label: 'Portugués' },
  fr: { code: 'fr', label: 'Francés' },
  fra: { code: 'fr', label: 'Francés' },
  de: { code: 'de', label: 'Alemán' },
  ger: { code: 'de', label: 'Alemán' },
  it: { code: 'it', label: 'Italiano' },
  ita: { code: 'it', label: 'Italiano' },
};

const FORCED_TOKENS = new Set(['forced', 'forzado', 'forzados', 'force']);
const MODIFIER_TOKENS = new Set([
  'sdh', 'cc', 'hi', 'default', 'predeterminado', 'sub', 'subs', 'subtitles',
  'completo', 'full', 'la', '419', 'latam', 'mx', 'ar'
]);
const GENERIC_SUB_TOKENS = new Set([
  'sub', 'subs', 'subtitle', 'subtitles', 'subtitulo', 'subtitulos',
  'video', 'movie', 'film', 'track', 'pista'
]);

const RELEASE_TAGS_REGEX = /[._ -]+(?:1080p|720p|480p|2160p|4k|bluray|bdrip|brrip|web-?dl|webrip|dvdrip|hdrip|x264|x265|h264|h265|hevc|aac|ac3|dts|remux)(?:[._ -]+.*)?$/i;

function isKnownQualifierToken(token: string): boolean {
  return Boolean(LANGUAGE_MAP[token] || FORCED_TOKENS.has(token) || MODIFIER_TOKENS.has(token));
}

export function matchSubtitlesForVideoProposed(
  videoFileName: string,
  folderFiles: DriveFileInfo[]
): SubtitleTrack[] {
  const videoBase = videoFileName.replace(/\.[^/.]+$/, '').toLowerCase();
  const cleanVideoBase = videoBase.replace(RELEASE_TAGS_REGEX, '');
  const subtitleFiles = folderFiles.filter((f) => /\.(srt|vtt)$/i.test(f.name));
  const results: SubtitleTrack[] = [];

  for (const sub of subtitleFiles) {
    const extMatch = sub.name.match(/\.(srt|vtt)$/i);
    if (!extMatch) continue;
    const format = extMatch[1].toLowerCase() as 'srt' | 'vtt';
    const subNameWithoutExt = sub.name.slice(0, -(format.length + 1)).toLowerCase();

    let matched = false;
    let lang = 'es';
    let label = 'Español';
    let isForced = false;

    // Rule 1: Exact base name match (against videoBase or cleanVideoBase)
    if (subNameWithoutExt === videoBase || (cleanVideoBase && subNameWithoutExt === cleanVideoBase)) {
      matched = true;
    }
    // Rule 2: Prefix match requiring delimiter boundary + valid qualifier tokens
    else {
      // Check prefix against videoBase or cleanVideoBase
      const baseToMatch = subNameWithoutExt.startsWith(videoBase)
        ? videoBase
        : (cleanVideoBase && subNameWithoutExt.startsWith(cleanVideoBase) ? cleanVideoBase : null);

      if (baseToMatch) {
        const rest = subNameWithoutExt.substring(baseToMatch.length);
        const delimiterMatch = rest.match(/^[._ -]+/);

        if (delimiterMatch) {
          const suffix = rest.slice(delimiterMatch[0].length);
          const tokens = suffix.split(/[._ -]+/).filter(Boolean);

          // Subtitle must contain at least one token, all tokens must be known qualifier tokens,
          // and at least one token must specify language or forced status.
          if (
            tokens.length > 0 &&
            tokens.every(isKnownQualifierToken) &&
            tokens.some((t) => LANGUAGE_MAP[t] || FORCED_TOKENS.has(t))
          ) {
            matched = true;
            for (const token of tokens) {
              if (FORCED_TOKENS.has(token)) {
                isForced = true;
              } else if (LANGUAGE_MAP[token]) {
                lang = LANGUAGE_MAP[token].code;
                label = LANGUAGE_MAP[token].label;
              }
            }
            if (isForced) {
              label += ' (Forzados)';
            }
          }
        }
      }
    }

    // Rule 3: Single subtitle file fallback in dedicated folder
    // Strictly allowed ONLY IF subtitle is a generic name (e.g. spanish.srt, sub.srt)
    // or contains the primary video title token. Never match across conflicting movie titles.
    if (!matched && subtitleFiles.length === 1) {
      const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);
      const isGeneric = tokens.length > 0 && tokens.every(
        (t) => GENERIC_SUB_TOKENS.has(t) || LANGUAGE_MAP[t] || FORCED_TOKENS.has(t) || /^\d+$/.test(t)
      );

      // Check title overlap if not purely generic
      const videoTokens = cleanVideoBase.split(/[._ -]+/).filter((t) => t.length > 2);
      const hasTitleOverlap = tokens.some((t) => videoTokens.includes(t));

      if (isGeneric || hasTitleOverlap) {
        matched = true;
        for (const token of tokens) {
          if (FORCED_TOKENS.has(token)) {
            isForced = true;
          } else if (LANGUAGE_MAP[token]) {
            lang = LANGUAGE_MAP[token].code;
            label = LANGUAGE_MAP[token].label;
          }
        }
        if (isForced) {
          label += ' (Forzados)';
        }
      }
    }

    if (matched) {
      results.push({
        id: sub.id,
        name: sub.name,
        lang,
        label,
        format,
        isDefault: false,
        isForced,
        vttUrl: `/api/subtitles/${sub.id}`,
      });
    }
  }

  // Ensure AT MOST ONE track is default (preferring Spanish, WebVTT, and non-forced)
  if (results.length > 0) {
    let bestIndex = 0;
    let bestScore = -1;

    for (let i = 0; i < results.length; i++) {
      const track = results[i];
      let score = 0;

      // Primary language preference: Spanish
      if (track.lang.startsWith('es')) score += 100;

      // Full subtitles preferred over forced for default playback
      if (!track.isForced) score += 40;

      // Native WebVTT format preferred over SRT (zero conversion needed)
      if (track.format === 'vtt') score += 20;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    results[bestIndex].isDefault = true;
    if (results[bestIndex].lang.startsWith('es') && !results[bestIndex].isForced && !results[bestIndex].label.includes('(')) {
      results[bestIndex].label = 'Español (Predeterminado)';
    }
  }

  return results;
}

// Check Batman with 1080p video and multiple videos in directory:
const candidates = [
  { id: 'sub_bat_es', name: 'Batman.Begins.2005.es.srt' },
  { id: 'sub_bat_en', name: 'Batman.Begins.2005.en.srt' },
  { id: 'sub_sup_es', name: 'Superman.Returns.2006.es.srt' },
  { id: 'sub_sup_en', name: 'Superman.Returns.2006.en.srt' },
];

const batMatches = matchSubtitlesForVideoProposed('Batman.Begins.2005.1080p.mkv', candidates);
const supMatches = matchSubtitlesForVideoProposed('Superman.Returns.2006.1080p.mp4', candidates);

console.log('Batman matches:', batMatches.map(m => m.name));
console.log('Superman matches:', supMatches.map(m => m.name));
assert.equal(batMatches.length, 2, 'Batman should match both bat subs');
assert.equal(supMatches.length, 2, 'Superman should match both sup subs');

console.log('Matrix sequel rejection test:');
const matrixMatches = matchSubtitlesForVideoProposed('Matrix.mkv', [
  { id: '1', name: 'Matrix.Reloaded.2003.srt' },
  { id: '2', name: 'Matrix.Revolutions.2003.srt' },
  { id: '3', name: 'Matrix.Reloaded.2003.es.srt' },
  { id: '4', name: 'Matrix2.srt' },
  { id: '5', name: 'Matrix.es.srt' },
]);
console.log('Matrix matches:', matrixMatches.map(m => m.name));
assert.equal(matrixMatches.length, 1);
assert.equal(matrixMatches[0].name, 'Matrix.es.srt');

console.log('All advanced tests passed successfully!');
