import { SubtitleTrack } from '../drive/types';

export interface DriveFileInfo {
  id: string;
  name: string;
  size?: number;
}

const LANGUAGE_MAP: Record<string, { code: string; label: string }> = {
  es: { code: 'es', label: 'Español' },
  spa: { code: 'es', label: 'Español' },
  esp: { code: 'es', label: 'Español' },
  spanish: { code: 'es', label: 'Español' },
  espanol: { code: 'es', label: 'Español' },
  español: { code: 'es', label: 'Español' },
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

// Strip common video release/quality tags (e.g. 1080p, BluRay, x264)
const RELEASE_TAGS_REGEX = /[._ -]+(?:1080p|720p|480p|2160p|4k|bluray|bdrip|brrip|web-?dl|webrip|dvdrip|hdrip|x264|x265|h264|h265|hevc|aac|ac3|dts|remux)(?:[._ -]+.*)?$/i;
const YEAR_REGEX = /[._ -]+(?:19\d{2}|20\d{2})(?:[._ -]+.*)?$/i;

function isKnownQualifierToken(token: string): boolean {
  return Boolean(LANGUAGE_MAP[token] || FORCED_TOKENS.has(token) || MODIFIER_TOKENS.has(token));
}

function parseTokensQualifier(tokens: string[]): { lang: string; label: string; isForced: boolean } {
  let lang = 'es';
  let label = 'Español';
  let isForced = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (next && LANGUAGE_MAP[`${t}-${next}`]) {
      lang = LANGUAGE_MAP[`${t}-${next}`].code;
      label = LANGUAGE_MAP[`${t}-${next}`].label;
      i++;
    } else if (LANGUAGE_MAP[t]) {
      lang = LANGUAGE_MAP[t].code;
      label = LANGUAGE_MAP[t].label;
    } else if (FORCED_TOKENS.has(t)) {
      isForced = true;
    }
  }

  if (isForced) {
    label += ' (Forzados)';
  }

  return { lang, label, isForced };
}

export function matchSubtitlesForVideo(
  videoFileName: string,
  folderFiles: DriveFileInfo[]
): SubtitleTrack[] {
  const videoBase = videoFileName.replace(/\.[^/.]+$/, '').toLowerCase();
  const cleanVideoBase = videoBase.replace(RELEASE_TAGS_REGEX, '');
  const cleanVideoTitle = cleanVideoBase.replace(YEAR_REGEX, '');
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

    // Rule 1: Exact base name match (against full video base, clean release base, or clean video title)
    if (
      subNameWithoutExt === videoBase ||
      (cleanVideoBase && subNameWithoutExt === cleanVideoBase) ||
      (cleanVideoTitle && subNameWithoutExt === cleanVideoTitle)
    ) {
      matched = true;
    }
    // Rule 2: Prefix match requiring delimiter boundary + strict qualifier tokens
    else {
      const candidateBases = [videoBase];
      if (cleanVideoBase && cleanVideoBase !== videoBase) candidateBases.push(cleanVideoBase);
      if (cleanVideoTitle && cleanVideoTitle !== cleanVideoBase && cleanVideoTitle !== videoBase) candidateBases.push(cleanVideoTitle);

      for (const baseToMatch of candidateBases) {
        if (subNameWithoutExt.startsWith(baseToMatch)) {
          const rest = subNameWithoutExt.substring(baseToMatch.length);
          const delimiterMatch = rest.match(/^[._ -]+/);

          if (delimiterMatch) {
            const suffix = rest.slice(delimiterMatch[0].length);
            const tokens = suffix.split(/[._ -]+/).filter(Boolean);

            // Subtitle must contain at least one token, all tokens must be known qualifier tokens,
            // and at least one token must specify language or forced status.
            // This strictly prevents sequels (e.g. Matrix.Reloaded.2003.srt) from matching.
            if (
              tokens.length > 0 &&
              tokens.every(isKnownQualifierToken) &&
              tokens.some((t, idx) => LANGUAGE_MAP[t] || FORCED_TOKENS.has(t) || (tokens[idx + 1] && LANGUAGE_MAP[`${t}-${tokens[idx + 1]}`]))
            ) {
              matched = true;
              const parsed = parseTokensQualifier(tokens);
              lang = parsed.lang;
              label = parsed.label;
              isForced = parsed.isForced;
              break;
            }
          }
        }
      }
    }

    // Rule 3: Single subtitle file in directory fallback
    // Strictly allowed ONLY IF subtitle is a generic name (e.g. spanish.srt, sub.srt, es-la.srt)
    // or starts with cleanVideoBase / cleanVideoTitle followed by boundary delimiter and ONLY qualifier tokens.
    if (!matched && subtitleFiles.length === 1) {
      const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);
      const isGeneric =
        Boolean(LANGUAGE_MAP[subNameWithoutExt]) ||
        GENERIC_SUB_TOKENS.has(subNameWithoutExt) ||
        (tokens.length > 0 &&
          tokens.every(
            (t) =>
              GENERIC_SUB_TOKENS.has(t) ||
              Boolean(LANGUAGE_MAP[t]) ||
              FORCED_TOKENS.has(t) ||
              MODIFIER_TOKENS.has(t) ||
              /^\d+$/.test(t)
          ));

      if (isGeneric) {
        matched = true;
        if (LANGUAGE_MAP[subNameWithoutExt]) {
          lang = LANGUAGE_MAP[subNameWithoutExt].code;
          label = LANGUAGE_MAP[subNameWithoutExt].label;
        } else {
          const parsed = parseTokensQualifier(tokens);
          lang = parsed.lang;
          label = parsed.label;
          isForced = parsed.isForced;
        }
      } else {
        // Condition (b): Prefix match against cleanVideoBase or cleanVideoTitle with delimiter and ONLY qualifier tokens
        const candidateBases = [cleanVideoBase].filter(Boolean);
        if (cleanVideoTitle && cleanVideoTitle !== cleanVideoBase) candidateBases.push(cleanVideoTitle);

        for (const baseToMatch of candidateBases) {
          if (subNameWithoutExt.startsWith(baseToMatch)) {
            const rest = subNameWithoutExt.substring(baseToMatch.length);
            const delimiterMatch = rest.match(/^[._ -]+/);

            if (delimiterMatch) {
              const suffix = rest.slice(delimiterMatch[0].length);
              const suffixTokens = suffix.split(/[._ -]+/).filter(Boolean);

              if (
                suffixTokens.length > 0 &&
                suffixTokens.every(isKnownQualifierToken)
              ) {
                matched = true;
                const parsed = parseTokensQualifier(suffixTokens);
                lang = parsed.lang;
                label = parsed.label;
                isForced = parsed.isForced;
                break;
              }
            }
          }
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
        isDefault: false, // Default will be assigned deterministically
        isForced,
        vttUrl: `/api/subtitles/${sub.id}`,
      });
    }
  }

  // Ensure strictly AT MOST ONE track is default (preferring Spanish, full track, WebVTT)
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
