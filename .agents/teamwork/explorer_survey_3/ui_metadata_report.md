# Architecture & Technical Investigation Report: Metadata Enrichment (R2) & 10-Foot Smart TV UI (R3)

**Target Device**: Samsung Smart TV UN50NU7400 (50" 4K UHD, Tizen 4.0, Chromium M56)  
**Agent**: `explorer_survey_3`  
**Date**: 2026-10-13  
**Status**: Authoritative Technical Blueprint  

---

## Executive Summary

This report establishes the complete architecture and technical specifications for:
1. **Metadata Enrichment (R2)**: A deterministic filename sanitization engine that accurately isolates movie/series titles and release years while stripping release scene noise, coupled with The Movie Database (TMDB v3) integration in Spanish (`es-ES`) and a zero-leak isolation barrier for private family media (`Videos familiares`).
2. **10-Foot Smart TV UI (R3)**: A lightweight, hardware-accelerated user interface designed for a 3-meter viewing distance on Samsung Tizen 4.0, powered by a custom 2D Spatial Navigation Engine compatible with the physical Samsung TV remote control (D-pad, OK/Enter `13`, Return `10009`, and media keys), engineered strictly within the constraints of the Chromium M56 rendering engine.

---

## 1. Filename Sanitization & Title/Year Extraction Algorithm

### 1.1 Problem Analysis
Media files stored in Google Drive often come from diverse sources with irregular naming conventions:
- Scene/P2P standard: `Inception.2010.1080p.BluRay.x264-SPARKS.mkv`
- Parenthetical/Bracketed tags: `El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4`
- Multi-audio & language tags: `Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv`
- Titles containing numbers/years: `Blade.Runner.2049.2017.2160p.UHD.HDR.x265-GROUP.mkv`, `2001.A.Space.Odyssey.1968.REMASTERED.1080p.BluRay.x264.mkv`
- Television episodes: `Stranger.Things.S04E09.1080p.NF.WEB-DL.DDP5.1.Atmos.x264-TEPES.mkv`, `La.Casa.de.Papel.4x08.1080p.NF.WEB-DL.DDP5.1.x264.mkv`
- Spanish diacritics and symbols: `Amélie.(2001)`, `El.laberinto.del.fauno.(Pan's.Labyrinth).2006.1080p.BRRip.x264.mkv`

### 1.2 Noise Tag Classification Matrix
The sanitization engine filters noise across six distinct categories:

| Category | Targeted Noise Tokens |
|---|---|
| **Resolutions & Displays** | `2160p`, `4k`, `uhd`, `1080p`, `1080i`, `720p`, `576p`, `480p`, `hd`, `sd`, `hdr`, `hdr10`, `hdr10+`, `dv`, `dolby-vision`, `imax` |
| **Video Codecs** | `x264`, `h264`, `h.264`, `x265`, `h265`, `h.265`, `hevc`, `avc`, `xvid`, `divx`, `vc1`, `vp9`, `av1` |
| **Audio Formats** | `dts-hd`, `dts-hd-ma`, `dts`, `truehd`, `atmos`, `ac3`, `eac3`, `ddp5.1`, `ddp`, `dd5.1`, `dd+`, `aac`, `flac`, `mp3`, `5.1`, `7.1`, `2.0`, `ch` |
| **Sources & Encodes** | `bluray`, `blu-ray`, `bdrip`, `brrip`, `web-dl`, `webdl`, `web-rip`, `webrip`, `hdtv`, `pdtv`, `dvdrip`, `dvd`, `remux`, `cam`, `telesync`, `hdrip` |
| **Editions & Rips** | `remastered`, `proper`, `repack`, `extended`, `unrated`, `directors-cut`, `internal`, `multi`, `dual`, `dual-audio`, `latino`, `castellano`, `spanish`, `espanol`, `ita`, `french`, `subbed`, `subs`, `subpack`, `esub`, `vostfr`, `nf`, `ma` |
| **Release Groups** | `-SPARKS`, `-YIFY`, `-RARBG`, `-FGT`, `-TERMINAL`, `-PSA`, `-FLUX`, `-TEPES`, `-ION10`, `-GALAXYTV`, `-ETTV` |

### 1.3 Parsing & Sanitization Pipeline
The algorithm operates as an 8-stage pipeline:

```
Raw Filename 
   │
   ▼
[1. Strip Extension] (.mkv, .mp4, .avi)
   │
   ▼
[2. TV Episode Detection] (SxxExx, Season x Episode x, xxXxx)
   │
   ▼
[3. Release Year Extraction] (Lookahead 4-digit token 19xx/20xx)
   │
   ▼
[4. Noise Tag Stripping] (Iterative dictionary regex)
   │
   ▼
[5. Bracket Normalization] (Clean empty brackets or secondary subtitles)
   │
   ▼
[6. Delimiter Translation] (Replace dots/underscores with spaces, preserve hyphens in compound words)
   │
   ▼
[7. Release Group Pruning] (Remove trailing hyphenated group tag)
   │
   ▼
[8. Diacritic & Space Normalization] (Collapse whitespace, preserve Spanish accents ñ, á, é, í, ó, ú, ü)
```

### 1.4 Verified JavaScript Implementation

```javascript
/**
 * Sanitizes a media filename to extract clean title, release year, and TV episode info.
 * Fully compatible with Node.js and Chromium M56.
 */
function sanitizeMediaFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return { cleanTitle: '', year: null, isSeries: false, season: null, episode: null, originalFilename: filename };
  }

  // 1. Strip file extension
  let base = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');

  let isSeries = false;
  let season = null;
  let episode = null;

  // 2. Detect TV Show patterns: S01E01, 1x01, Season 1 Episode 1
  const tvPattern = /(?:[._\s-]|^)(?:s(\d{1,2})e(\d{1,2})|(\d{1,2})x(\d{1,2})|season[._\s-]*(\d{1,2})[._\s-]*episode[._\s-]*(\d{1,2}))(?:[._\s-]|$)/i;
  const tvMatch = base.match(tvPattern);
  if (tvMatch) {
    isSeries = true;
    season = parseInt(tvMatch[1] || tvMatch[3] || tvMatch[5], 10);
    episode = parseInt(tvMatch[2] || tvMatch[4] || tvMatch[6], 10);
    base = base.substring(0, tvMatch.index);
  }

  // 3. Extract Year (1900 - 2099)
  // Use lookahead to avoid eating delimiters of adjacent tokens (handles "Blade Runner 2049 2017")
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
    // If multiple years are present, the last one preceding technical tags is the release year
    const lastYear = yearMatches[yearMatches.length - 1];
    if (lastYear.index > 0) {
      year = lastYear.year;
      let cutIdx = lastYear.index;
      // Also trim opening bracket/parenthesis preceding the year
      if (cutIdx > 0 && /[\(\[\{]/.test(base[cutIdx - 1])) {
        cutIdx--;
      }
      base = base.substring(0, cutIdx);
    }
  }

  // 4. Noise tags regex
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

  // 5. Clean empty brackets or leftover noise brackets
  cleaned = cleaned.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g, ' ');

  // 6. Delimiter cleanup: replace dots and underscores with spaces
  cleaned = cleaned.replace(/[._]/g, ' ');

  // Preserve hyphen in names like Spider-Man, but remove standalone hyphens
  cleaned = cleaned.replace(/\s+-\s+/g, ' ');
  cleaned = cleaned.replace(/\s+-/g, ' ');
  cleaned = cleaned.replace(/-\s+/g, ' ');

  // 7. Strip trailing group tag e.g. "-SPARKS"
  cleaned = cleaned.replace(/-[a-zA-Z0-9]+$/, '');

  // 8. Collapse whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return {
    originalFilename: filename,
    cleanTitle: cleaned,
    year: year,
    isSeries: isSeries,
    season: season,
    episode: episode
  };
}
```

---

## 2. TMDB API Integration & Strict Isolation Rules

### 2.1 TMDB API v3 Architecture
The application queries The Movie Database (TMDB) API v3 strictly for cinematic media (`Películas`, `Series`).

#### Core Endpoints

1. **Movie Search**:
   ```http
   GET https://api.themoviedb.org/3/search/movie?api_key={KEY}&query={TITLE}&year={YEAR}&language=es-ES&include_adult=false
   ```
   - **Multi-stage Fallback Strategy**:
     - *Stage 1*: Search with sanitized `cleanTitle` and extracted `year`.
     - *Stage 2*: If zero results returned, search with `cleanTitle` alone (compensates for release year mismatches between festival releases and commercial theater debuts).
     - *Stage 3*: If still zero results and title contains parenthetical secondary phrases (e.g. `(Pan's Labyrinth)`), strip the parentheses and search the core Spanish title.

2. **Movie Details & Credits (Unified Single-Roundtrip Request)**:
   ```http
   GET https://api.themoviedb.org/3/movie/{id}?api_key={KEY}&language=es-ES&append_to_response=credits
   ```
   - Utilizes `append_to_response=credits` to retrieve movie metadata, director, and top cast in a single HTTP request, eliminating an extra roundtrip.

3. **TV Series Search & Details**:
   ```http
   GET https://api.themoviedb.org/3/search/tv?api_key={KEY}&query={TITLE}&first_air_date_year={YEAR}&language=es-ES
   GET https://api.themoviedb.org/3/tv/{id}?api_key={KEY}&language=es-ES&append_to_response=credits
   ```

### 2.2 Data Extraction & Schema Mapping

| TMDB Property | Field Extracted | Presentation in 10-Foot UI |
|---|---|---|
| `poster_path` | `https://image.tmdb.org/t/p/w500${poster_path}` | Vertical 2:3 card in carousel & left column of detail modal |
| `backdrop_path` | `https://image.tmdb.org/t/p/w1280${backdrop_path}` | Fullscreen ambient backdrop in movie detail modal |
| `overview` | `movie.overview` | Spanish synopsis paragraph (22px text) |
| `vote_average` | `movie.vote_average.toFixed(1)` | Rating badge (e.g., `⭐ 8.4 / 10`) |
| `release_date` | `movie.release_date.substring(0, 4)` | Year tag (e.g., `2010`) |
| `runtime` | `Math.floor(m/60) + 'h ' + (m%60) + 'm'` | Duration badge (e.g., `2h 28m`) |
| `genres` | `movie.genres.map(g => g.name).slice(0, 3).join(' • ')` | Genre pill list (e.g., `Ciencia ficción • Acción`) |
| `credits.crew` | `crew.find(c => c.job === 'Director').name` | Director credit (`Director: Christopher Nolan`) |
| `credits.cast` | `cast.slice(0, 5).map(c => c.name).join(', ')` | Top 5 actors (`Reparto: Leonardo DiCaprio, ...`) |

### 2.3 Caching & Rate-Limiting Strategy
TMDB enforces rate limits (~40 requests per 10-second window). A large Drive library could trigger HTTP 429 if unthrottled.
- **Two-Tier Architecture**:
  1. **Server/Cloud Tier**: In-memory LRU map + persistent disk cache (`cache/tmdb_cache.json` or KV store in serverless) with a **30-day TTL**. Key format: `tmdb_${mediaType}_${cleanTitle.toLowerCase()}_${year || 'none'}`.
  2. **Client Tier**: `localStorage` cached responses to prevent refetching during session navigation.
- **Concurrency Throttling**: Batch background requests with a max concurrency of 4, inserting a 100ms pause between queries.

---

### 2.4 Strict Isolation Barrier: 'Videos familiares'
**Critical Constraint**: Under NO circumstances may any item located in the `Videos familiares` folder or flagged with home video category trigger an external TMDB API call.

#### Privacy, Performance & Accuracy Rationale:
1. **Privacy Protection**: Prevents personal family file names (e.g., `Cumpleaños_de_Lucas_2021.mp4`, `Vacaciones_Bariloche_2019.mov`) from being leaked into third-party query logs.
2. **False Positives**: Generic queries like `Vacaciones` or `Cumpleaños` return unrelated commercial films, polluting the UI.
3. **Bandwidth Optimization**: Zero external network overhead for personal media.

#### Isolation Code Gate
```javascript
/**
 * Strict evaluation rule: guarantees family videos never contact TMDB.
 */
function isFamilyVideoFolder(folderPath, folderName) {
  const normalized = (String(folderPath || '') + '/' + String(folderName || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip diacritics
  return /videos?\s*familiares?|familia|home[-_ ]?videos?/i.test(normalized);
}

// Router dispatcher
async function resolveMetadata(driveFile, parentFolderPath) {
  if (isFamilyVideoFolder(parentFolderPath, driveFile.parentName)) {
    // HARD BARRIER: TMDB IS NEVER INVOKED
    return extractNativeDriveMetadata(driveFile);
  }
  return fetchTMDBMetadataWithCache(driveFile);
}
```

#### Native Google Drive Metadata Schema
For family media, metadata is synthesized purely from Google Drive API v3 attributes:

1. **Title Formatting**:
   ```javascript
   function formatCleanFamilyTitle(filename) {
     const withoutExt = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
     const spaced = withoutExt.replace(/[._-]+/g, ' ').trim();
     // Title Case formatting
     return spaced.replace(/\b\w/g, char => char.toUpperCase());
   }
   ```
2. **Recorded Date**:
   - Extracted from `driveFile.createdTime` or `driveFile.videoMediaMetadata.date`.
   - Localized to Spanish format: e.g., `"14 de octubre de 2022"`.
3. **Duration**:
   - Extracted from `driveFile.videoMediaMetadata.durationMillis`.
   - Converted to `MM:SS` (or `Hh MMm` for long recordings).
4. **Resolution Badge**:
   - Extracted from `driveFile.videoMediaMetadata.height`.
   - Displays `4K` (height >= 2160), `1080p` (height >= 1080), or `720p`.
5. **High-Definition Thumbnail Optimization**:
   - Google Drive provides `thumbnailLink` ending with `=s220` (low resolution).
   - By replacing `=s220` with `=s800`, Google's edge CDN returns a sharp 800px preview card directly, with no server proxying required:
   ```javascript
   const hdThumbnail = driveFile.thumbnailLink 
     ? driveFile.thumbnailLink.replace(/=s\d+$/, '=s800') 
     : '/assets/placeholder_video.png';
   ```

---

## 3. 10-Foot UI for Smart TV Architecture

### 3.1 Hardware Target & Environment Constraints
- **Model**: Samsung Smart TV UN50NU7400
- **Screen**: 50 inches, 4K UHD (3840x2160 native, 1920x1080 CSS reference viewport)
- **Viewing Distance**: ~3 meters (10 feet)
- **Web Runtime**: Samsung Tizen 4.0 Platform running Chromium M56 (V8 5.6)

#### Chromium M56 Compatibility Boundaries
| Feature | Status in Chromium M56 | Architectural Rule |
|---|---|---|
| **Flexbox Layout** | Full Support | **MANDATORY**: All carousels, cards, and modal layouts must use Flexbox |
| **CSS Grid** | Experimental only (shipped in Chrome 57) | **FORBIDDEN**: Do not use CSS Grid; use Flexbox + percentage/calc widths |
| **CSS Variables** | Full Support (`var(--name)`) | Used for unified theming and color palettes |
| **3D Transforms** | Hardware-accelerated GPU layers | Use `transform: translate3d(x, y, 0)` and `transform: scale(1.08)` |
| **Optional Chaining (`?.`)** | Unsupported (Chrome 80+) | **FORBIDDEN**: Will cause fatal SyntaxError; use standard boolean guards |
| **Nullish Coalescing (`??`)**| Unsupported (Chrome 80+) | **FORBIDDEN**: Use ternary or `||` fallbacks |
| **Array `flat()` / `flatMap()`** | Unsupported (Chrome 69+) | Use standard loops or `reduce` |
| **ES6 Syntax** | Full Support (`const`, `let`, `class`, `() => {}`, `Promise`) | Transpile to ES6 or author ES6 cleanly |

---

### 3.2 10-Foot UI Design Principles
- **Base Reference Canvas**: 1920 x 1080 CSS pixels.
- **Typography Scale** (Legible from 3 meters):
  - Category Titles: 32px (font-weight: 700)
  - Card Titles: 20px (font-weight: 600)
  - Modal Heading: 44px (font-weight: 800)
  - Synopsis & Details: 22px (line-height: 1.5)
  - Meta Badges: 18px (font-weight: 600)
- **Contrast & Palette**:
  - Background: Deep Obsidian `#0d0f14`
  - Surface/Cards: Dark Slate `#181b22`
  - High Contrast Text: Pure White `#ffffff` (primary), Muted Gray `#a0a5b5` (secondary)
  - Accent / Focus: Electric Cyan `#00a8ff` (or Gold `#f5a623`)
- **Unmistakable Focus State**:
  ```css
  .nav-item {
    transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s, border-color 0.2s;
    outline: none;
  }
  .nav-item.focused {
    transform: scale(1.08);
    border: 3px solid #00a8ff;
    box-shadow: 0 0 25px rgba(0, 168, 255, 0.8), 0 0 50px rgba(0, 168, 255, 0.35);
    z-index: 100;
  }
  ```

---

### 3.3 2D Spatial Navigation Engine (D-pad)

#### Remote Key Mapping
```javascript
const TV_KEYS = {
  ARROW_LEFT: 37,
  ARROW_UP: 38,
  ARROW_RIGHT: 39,
  ARROW_DOWN: 40,
  ENTER: 13,
  RETURN: 10009,       // Samsung Tizen Hardware Return Key
  BACKSPACE: 8,
  ESCAPE: 27,
  MEDIA_PLAY: 415,
  MEDIA_PAUSE: 19,
  MEDIA_STOP: 413,
  MEDIA_FF: 417,
  MEDIA_RW: 412,
  MEDIA_PLAY_PAUSE: 10252
};
```

#### Directional Spatial Navigation Algorithm
Rather than relying on DOM linear tab order, the Spatial Navigation Engine calculates 2D geometric proximity with perpendicular directional penalties:

```javascript
class SpatialNavEngine {
  constructor() {
    this.currentFocused = null;
    this.activeLayer = 'catalog'; // 'catalog' | 'modal' | 'player' | 'slideshow' | 'audio'
    this.layerHistory = [];
  }

  calculateDirectionalDistance(srcRect, targetRect, direction) {
    const srcCenter = { x: srcRect.left + srcRect.width / 2, y: srcRect.top + srcRect.height / 2 };
    const tgtCenter = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };

    let primaryDist, secondaryDist;

    switch (direction) {
      case 'right':
        if (targetRect.left <= srcRect.left + 5) return Infinity;
        primaryDist = targetRect.left - (srcRect.left + srcRect.width);
        secondaryDist = Math.abs(tgtCenter.y - srcCenter.y);
        break;
      case 'left':
        if (targetRect.left + targetRect.width >= srcRect.left + srcRect.width - 5) return Infinity;
        primaryDist = srcRect.left - (targetRect.left + targetRect.width);
        secondaryDist = Math.abs(tgtCenter.y - srcCenter.y);
        break;
      case 'down':
        if (targetRect.top <= srcRect.top + 5) return Infinity;
        primaryDist = targetRect.top - (srcRect.top + srcRect.height);
        secondaryDist = Math.abs(tgtCenter.x - srcCenter.x);
        break;
      case 'up':
        if (targetRect.top + targetRect.height >= srcRect.top + srcRect.height - 5) return Infinity;
        primaryDist = srcRect.top - (targetRect.top + targetRect.height);
        secondaryDist = Math.abs(tgtCenter.x - srcCenter.x);
        break;
      default:
        return Infinity;
    }

    if (primaryDist < 0) primaryDist = 0;
    // 2.5x penalty on perpendicular displacement preserves row/column affinity
    return primaryDist + 2.5 * secondaryDist;
  }

  move(direction) {
    if (!this.currentFocused) {
      this.focusFirstAvailable();
      return;
    }

    const currentRect = this.currentFocused.getBoundingClientRect();
    // Scope candidates exclusively to the currently active UI layer
    const candidates = Array.from(document.querySelectorAll(`[data-layer="${this.activeLayer}"] .nav-item`))
      .filter(el => el !== this.currentFocused && el.offsetParent !== null);

    let bestCandidate = null;
    let minDistance = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const dist = this.calculateDirectionalDistance(currentRect, cand.getBoundingClientRect(), direction);
      if (dist < minDistance) {
        minDistance = dist;
        bestCandidate = cand;
      }
    }

    if (bestCandidate) {
      this.setFocus(bestCandidate);
      this.ensureVisible(bestCandidate);
    }
  }

  setFocus(element) {
    if (this.currentFocused) {
      this.currentFocused.classList.remove('focused');
    }
    this.currentFocused = element;
    if (element) {
      element.classList.add('focused');
      element.focus();
    }
  }

  ensureVisible(element) {
    const row = element.closest('.carousel-row');
    if (row) {
      const container = row.querySelector('.carousel-track');
      const cardRect = element.getBoundingClientRect();
      const parentRect = row.getBoundingClientRect();
      // Center the card in the viewport
      const offset = (cardRect.left + cardRect.width / 2) - (window.innerWidth / 2);
      const currentTransform = container._currentTranslate || 0;
      const targetTransform = Math.min(0, currentTransform - offset);
      container._currentTranslate = targetTransform;
      container.style.transform = `translate3d(${targetTransform}px, 0, 0)`;
    }
  }
}
```

---

## 4. Specialized Views Architecture

### 4.1 View Hierarchy & State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    Catalog Carousel View                    │
│  [Películas]  [Series]  [Videos familiares] [Fotos] [Música] │
└─────────────┬───────────────────────────────┬───────────────┘
              │ (Enter on Movie)              │ (Enter on Video)
              ▼                               ▼
┌──────────────────────────────┐  ┌───────────────────────────┐
│      Movie Detail Modal      │  │    HTML5 Video Player     │
│  Backdrop, HD Poster, Cast,  │  │   Direct Stream (206),    │
│  Synopsis, [▶ Reproducir]    │  │   Custom Controls, Subs   │
└─────────────┬────────────────┘  └─────────────┬─────────────┘
              │ (Enter on Play)                 │ (Return 10009)
              ▼                                 ▼
┌──────────────────────────────┐  ┌───────────────────────────┐
│      HTML5 Video Player      │  │ Back to Previous Focused  │
│                              │  │           Card            │
└──────────────────────────────┘  └───────────────────────────┘
```

---

### 4.2 Detailed Specifications of Views

#### a. Catalog Carousel View
- **Header**: App Brand (`MULTIMEDIA DRIVE`), Live Clock (`20:45`), Cloud Connection Status Dot.
- **5 Horizontal Carousel Rows**:
  1. 🎬 **Películas** (Poster card 2:3 aspect ratio, 200px x 300px, TMDB `w500` art, title, year badge).
  2. 📺 **Series** (Poster card 2:3, season/episode tags).
  3. 👨‍👩‍👧‍👦 **Videos familiares** (Landscape card 16:9, 320px x 180px, Drive HD thumbnail `=s800`, duration badge, formatted date).
  4. 📷 **Fotos** (Square card 1:1, 220px x 220px, photo thumbnail).
  5. 🎵 **Música** (Square card 1:1, 200px x 200px, album artwork, track title, artist).
- **Navigation**: Left/Right shifts row cards; Up/Down transitions vertically across categories with memorized row indices.

#### b. Movie Detail Modal
- **Trigger**: Enter (`13`) on any movie card.
- **Visual Composition**:
  - Fullscreen backdrop background (`TMDB backdrop w1280` with dark gradient overlay: `linear-gradient(to right, rgba(13,15,20,0.95) 45%, rgba(13,15,20,0.6) 100%)`).
  - Left panel: Large poster (320px x 480px) with subtle ambient drop-shadow.
  - Right panel:
    - Title (44px, bold).
    - Meta Bar: Release Year, Runtime (`2h 28m`), Rating (`⭐ 8.8 / 10`), Genres (`Ciencia ficción • Acción`).
    - Credits: Director (`Christopher Nolan`), Reparto (`Leonardo DiCaprio, Joseph Gordon-Levitt, ...`).
    - Sinopsis: Multi-line Spanish overview text (22px).
    - Action Controls:
      - `[ ▶ Reproducir ]` (Primary focus on modal launch).
      - `[ ✕ Volver ]` (Secondary button).
- **Return Key Handling**: Return (`10009`) gracefully closes modal and restores focus to the invoking card.

#### c. Home Video Card
- **Layout**: 16:9 widescreen card (320px x 180px).
- **Metadata Badges**:
  - Top-left: Clean date (e.g. `15 Oct 2022`).
  - Bottom-right: Duration pill (`14:32`).
  - Bottom-left: Resolution pill (`1080p` or `4K`).
- **Interaction**: Enter (`13`) bypasses detail modal and directly boots the HTML5 Video Player for instantaneous playback.

#### d. Custom HTML5 Video Player
- **Core Video Element**: Native HTML5 `<video>` rendered full viewport (`position: fixed; inset: 0; z-index: 1000;`).
- **Streaming Pipeline**: Streams directly through Google Drive HTTP 206 Partial Content proxy.
- **Custom TV Overlay UI**:
  - Top Bar: Media Title, Clock, Category Indicator.
  - Bottom Scrubber Bar:
    - Play / Pause indicator icon.
    - Time readouts (`00:45:12 / 02:18:00`).
    - Progress Bar: Background track, Buffer bar (`video.buffered` visualization), Playhead thumb.
    - Subtitle Selector Menu button (`[ Subtítulos: Español ]`).
- **Auto-Hide Controls Engine**:
  - Any remote key press displays overlay controls.
  - If no keys are pressed for **3000ms**, controls smoothly fade to `opacity: 0`.
  - While controls are hidden, the first D-pad key press only wakes up the controls without triggering jump actions.
- **Playback & Seeking Rules**:
  - ArrowLeft: Seek -10 seconds.
  - ArrowRight: Seek +10 seconds.
  - MediaFF (417) / MediaRW (412): Fast seek +/- 30 seconds.
  - OK / Enter (13) / PlayPause: Toggle Play/Pause.
  - Subtitle Selector: Opens popup modal listing `[ Desactivado ]`, `[ Español (SRT) ]`, `[ English (SRT) ]`. Selecting a track configures `<track mode="showing">`.
  - Return (`10009`): Pauses playback, releases video element source (`video.src = ''` to clear hardware memory), closes overlay, and returns to caller view.

#### e. Fullscreen Photo Slideshow
- **Architecture**: Dual-buffered image viewer (two `<img>` layers transitioning opacity for zero-flicker cross-fades).
- **Controls**:
  - ArrowLeft / ArrowRight: Navigate manual photos.
  - OK / Enter (13) or Play: Start / Pause automatic slideshow (5-second transition interval).
  - Return (`10009`): Exit slideshow back to photo carousel.

#### f. Audio Player
- **Composition**:
  - Left: 360px x 360px album art cover.
  - Right: Track title (36px), Artist, Album, Year.
  - Bottom: Interactive playback scrubber bar and transport controls (`[ Anterior ]`, `[ Play/Pausa ]`, `[ Siguiente ]`).
  - Playlist Queue: Right-hand drawer showing upcoming tracks in the album folder.

---

## 5. Implementation Recommendations for Developer Agents

1. **Strict Chromium M56 Linter/Babel Setup**: Ensure the build pipeline parses all client code to ES6, strictly rejecting syntax errors (`?.`, `??`).
2. **Tizen Hardware Key Registration**: Include native Tizen key registration snippet in `app.js` initialization to enable remote media keys (`MediaPlay`, `MediaPause`, `MediaFastForward`, `MediaRewind`).
3. **CSS Performance**: Do not use CSS blur filters (`backdrop-filter`) on Tizen 4.0 as they overload the TV SoC. Rely on solid semi-transparent colors (`rgba(13, 15, 20, 0.95)`).
4. **Google Drive Thumbnail CDN**: Always rewrite Drive `=s220` thumbnail URLs to `=s800` for crisp TV rendering with zero proxy load.
5. **Verified Test Scripts Available**: Developer agents can consult and run `test_sanitizer.js` and `test_spatial_nav.js` in `.agents/teamwork/explorer_survey_3/` for unit-level verification.

---
*End of Report — Metadata & UI Architecture Survey complete.*
