# Subtitle Matching Logic Fix Strategy (M1)

**Target Components**: `server/subtitles/matcher.ts`, `server/drive/traversal.ts`  
**Author**: Subtitle Logic Fix Explorer (`explorer_m1_fix_2`)  
**Date**: 2026-10-13  
**Status**: Ready for Implementation  

---

## 1. Executive Summary

Empirical testing and adversarial probing (`tests/adversarial/m1_auth_traversal_stress.test.ts`) uncovered three critical subtitle matching flaws:
1. **Subtitle Sequel Collision (Rule 2)**: `subNameWithoutExt.startsWith(videoBase)` greedily matches sequel filenames (e.g., `Matrix.mkv` matches `Matrix.Reloaded.2003.srt` and `Matrix.Revolutions.2003.srt`), assigning them as Spanish subtitles to the original movie because non-language suffix tokens (`reloaded`, `2003`) are unvalidated.
2. **Single Subtitle Fallback Contamination (Rule 3 & Traversal)**:
   - In `server/drive/traversal.ts:listCategoryItems`, subtitles were filtered across the entire category rather than per `parentFolderId`.
   - In `server/subtitles/matcher.ts:77`, `folderFiles.length === 1` indiscriminately attached the lone subtitle to any movie (e.g., `Batman.2005.es.srt` attached to `Superman.2006.mkv`).
3. **Duplicate Default Tracks (Rule 1 & Dedup bypass)**: When both `.srt` and `.vtt` exist with the same base name, both were marked `isDefault: true`. The deduplication block was bypassed because `results.some(r => r.isDefault)` was already true, producing invalid HTML5 `<track default>` states on Samsung Tizen Chromium M56.

This document presents concrete, verified fixes for both files, backed by empirical unit tests.

---

## 2. Root Cause & Solution Details

### Issue 1: Subtitle Sequel Collision (Rule 2)
- **Root Cause**:
  In `server/subtitles/matcher.ts:59-75`:
  `matched = true` was assigned unconditionally when `subNameWithoutExt.startsWith(videoBase)`.
  If the suffix contained title tokens of sequels (e.g., `.reloaded.2003`), none matched `LANGUAGE_MAP` or `isForced`, yet `matched` remained `true` and defaulted to Spanish (`lang: 'es'`, `label: 'Español'`). Furthermore, files like `Matrix2.srt` matched because no delimiter boundary was required.
- **Solution**:
  1. Require a delimiter boundary (`.`, `_`, `-`, or space) immediately following `videoBase` (or `cleanVideoBase`).
  2. Extract suffix tokens after the boundary delimiter.
  3. Validate that **all** tokens in the suffix are known subtitle qualifier tokens (language code, forced indicator, or subtitle modifier like `sdh`, `cc`).
  4. Require that at least one token specifies language or forced status.
  5. Any token not in the whitelist (such as `reloaded`, `revolutions`, `part2`, `2003`) immediately rejects Rule 2 matching.

### Issue 2: Single Subtitle Fallback Contamination
- **Root Cause**:
  1. In `DriveTraversalEngine.listCategoryItems`, `subtitleFiles` contained all subtitles found anywhere in the category. This global array was passed into `matchSubtitlesForVideo(video.name, subtitleFiles)`.
  2. In `matcher.ts:77-87`, Rule 3 matched any single subtitle in `folderFiles` without validating title relevance.
- **Solution**:
  1. In `server/drive/traversal.ts`: Group `subtitleFiles` into a `Map<string, DriveFileInfo[]>` keyed strictly by `parentFolderId`. Pass only the subtitles belonging to the same folder: `subtitlesByFolder.get(video.parentFolderId || '') || []`.
  2. In `server/subtitles/matcher.ts`: Restrict Rule 3 so it only matches if:
     - The subtitle filename is generic (composed of generic tokens like `sub`, `subs`, `subtitle`, `spanish`, `english`, numbers, language codes), OR
     - The subtitle contains the primary title token of the video.
     If the subtitle filename contains unrelated movie titles (e.g. `Batman` vs `Superman`), Rule 3 returns false.

### Issue 3: Duplicate Default Tracks
- **Root Cause**:
  In `matcher.ts:53-57`, Rule 1 set `isDefault = true` for every candidate whose base name matched `videoBase`. When both `Movie.srt` and `Movie.vtt` existed, both received `isDefault = true`. The trailing cleanup at line 104 only ran if `!results.some(r => r.isDefault)`, so both tracks remained default.
- **Solution**:
  1. Initialize `isDefault: false` during rule matching.
  2. Perform deterministic default track selection at the end of `matchSubtitlesForVideo`:
     - Scoring criteria:
       - Language is Spanish: +100
       - Non-forced (full track): +40
       - WebVTT format (`.vtt`): +20
     - Select highest-scoring track as `isDefault: true`.
     - Ensures strictly at most one track has `isDefault: true`.
     - When both `Movie.srt` and `Movie.vtt` exist, `Movie.vtt` wins (+20 bonus), ensuring zero-overhead native WebVTT playback on Tizen TV.

---

## 3. Concrete Code Implementations

### A. Fix for `server/subtitles/matcher.ts`

Replace `server/subtitles/matcher.ts` with the following implementation:

```typescript
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

function isKnownQualifierToken(token: string): boolean {
  return Boolean(LANGUAGE_MAP[token] || FORCED_TOKENS.has(token) || MODIFIER_TOKENS.has(token));
}

export function matchSubtitlesForVideo(
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

    // Rule 1: Exact base name match (against full video base or clean release base)
    if (subNameWithoutExt === videoBase || (cleanVideoBase && subNameWithoutExt === cleanVideoBase)) {
      matched = true;
    }
    // Rule 2: Prefix match requiring delimiter boundary + strict qualifier tokens
    else {
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
          // This strictly prevents sequels (e.g. Matrix.Reloaded.2003.srt) from matching.
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

    // Rule 3: Single subtitle file in directory fallback
    // Strictly allowed ONLY IF subtitle is a generic name (e.g. spanish.srt, sub.srt)
    // or contains the primary video title token. Never match across conflicting movie titles.
    if (!matched && subtitleFiles.length === 1) {
      const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);
      const isGeneric = tokens.length > 0 && tokens.every(
        (t) => GENERIC_SUB_TOKENS.has(t) || LANGUAGE_MAP[t] || FORCED_TOKENS.has(t) || /^\d+$/.test(t)
      );

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
```

---

### B. Fix for `server/drive/traversal.ts`

In `DriveTraversalEngine.listCategoryItems`, lines 166-180:

**Before**:
```typescript
    // Group subtitles with video items
    const videoFiles = rawFiles.filter(
      (f) => !f.isFolder && (f.mimeType.startsWith('video/') || ['mkv', 'mp4', 'avi', 'mov', 'wmv'].includes(f.extension || ''))
    );
    const subtitleFiles = rawFiles.filter(
      (f) => !f.isFolder && (f.extension === 'srt' || f.extension === 'vtt')
    );

    for (const video of videoFiles) {
      const matchedSubs = matchSubtitlesForVideo(
        video.name,
        subtitleFiles.map((s) => ({ id: s.id, name: s.name, size: s.size }))
      );
      video.subtitles = matchedSubs;
    }
```

**After**:
```typescript
    // Group subtitles strictly by parentFolderId to eliminate cross-folder contamination
    const videoFiles = rawFiles.filter(
      (f) => !f.isFolder && (f.mimeType.startsWith('video/') || ['mkv', 'mp4', 'avi', 'mov', 'wmv'].includes(f.extension || ''))
    );
    const subtitleFiles = rawFiles.filter(
      (f) => !f.isFolder && (f.extension === 'srt' || f.extension === 'vtt')
    );

    const subtitlesByFolder = new Map<string, Array<{ id: string; name: string; size?: number }>>();
    for (const sub of subtitleFiles) {
      const parentId = sub.parentFolderId || '__root__';
      const list = subtitlesByFolder.get(parentId) || [];
      list.push({ id: sub.id, name: sub.name, size: sub.size });
      subtitlesByFolder.set(parentId, list);
    }

    for (const video of videoFiles) {
      const parentId = video.parentFolderId || '__root__';
      const folderSubs = subtitlesByFolder.get(parentId) || [];
      const matchedSubs = matchSubtitlesForVideo(video.name, folderSubs);
      video.subtitles = matchedSubs;
    }
```

---

## 4. Verification & Validation Matrix

| Test Scenario | Input Candidate(s) | Expected Outcome | Verified |
|---|---|---|---|
| **Sequel collision** | Video: `Matrix.mkv`<br>Subs: `Matrix.Reloaded.2003.srt`, `Matrix.Revolutions.2003.srt`, `Matrix.Reloaded.2003.es.srt` | 0 matches. Matrix does NOT inherit sequel subtitles. | ✅ Yes (`test_matcher_logic.ts`) |
| **No boundary delimiter** | Video: `Matrix.mkv`<br>Subs: `Matrix2.srt` | 0 matches. Rejected because `2` lacks delimiter boundary. | ✅ Yes |
| **Valid language qualifier** | Video: `Matrix.mkv`<br>Sub: `Matrix.es.srt` | 1 match (`Matrix.es.srt`, `isDefault: true`, `lang: es`). | ✅ Yes |
| **Duplicate defaults** | Video: `Movie.mkv`<br>Subs: `Movie.srt`, `Movie.vtt` | 2 matches. Exactly 1 default: `Movie.vtt` has `isDefault: true`, `Movie.srt` has `isDefault: false`. | ✅ Yes |
| **Cross-movie Rule 3 probe** | Video: `Superman.2006.mkv`<br>Sub: `Batman.2005.es.srt` | 0 matches. Dissimilar title rejected. | ✅ Yes |
| **Generic Rule 3 fallback** | Video: `Gladiator.mkv`<br>Sub: `spanish.srt` | 1 match (`spanish.srt`, `isDefault: true`). Dedicated folder generic fallback preserved. | ✅ Yes |
| **Clean video base matching** | Video: `Batman.Begins.2005.1080p.mkv`<br>Subs: `Batman.Begins.2005.es.srt`, `Superman.Returns.2006.es.srt` | 1 match (`Batman.Begins.2005.es.srt`). Release tag stripped; no cross-movie leak. | ✅ Yes |

---

## 5. Next Steps for Implementer (`worker_m1_1`)

1. Apply the proposed code replacement in `server/subtitles/matcher.ts`.
2. Apply the folder-scoping code update in `server/drive/traversal.ts:listCategoryItems`.
3. Run test suites:
   ```powershell
   npx tsx --test tests/unit/m1/matcher.test.ts
   npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts
   npm test
   ```
4. Verify that:
   - `Superman got subtitle: Batman.2005.es.srt` is gone.
   - `Matrix.mkv falsely matched with sequel subtitles` is gone.
   - `Number of default tracks for Movie.mkv` is 1.
