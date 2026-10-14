# Technical Specification: Family Video Isolator & API Route Integration (Feature F8 & Routes)

**Target System**: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)  
**Milestone**: M2 (Title Regex, TMDB Metadata & Strict Family Video Isolation)  
**Agent**: `explorer_m2_3`  
**Working Directory**: `.agents/teamwork/explorer_m2_3`  
**Date**: 2026-10-13  
**Status**: Authoritative Technical Specification  

---

## 1. Executive Summary & Architectural Scope

### 1.1 Objective
This specification establishes the exhaustive technical design for:
1. **The Strict Isolation Barrier (`server/metadata/isolator.ts`)** for Feature **F8**: A hard privacy and routing barrier guaranteeing that under **NO circumstance** may any personal video or folder classified under *Videos familiares* trigger an external network call to The Movie Database (TMDB). It synthesizes native metadata entirely from Google Drive API v3 attributes (Title Case title, Spanish formatted date, `MM:SS` duration, resolution badge, and `=s800` high-definition thumbnail).
2. **API Route Integration**:
   - `GET /api/metadata/enrich`: Standalone endpoint with query parameter enrichment (`?title=...&year=...&category=...`), enforcing the isolation barrier with HTTP `403 Forbidden` for any family queries.
   - `GET /api/drive/files/:category`: Comprehensive category dispatcher providing TMDB enrichment for `peliculas` and `series`, strict native synthesis for `familiares`, and native media schemas for `fotos` and `musica`.
3. **Zero-Leak Verification Test Suite**: Deterministic mock and spy test harnesses asserting exactly zero TMDB network requests when indexing or serving family media.

### 1.2 System Context & Relationship to Sibling Modules
```
                     ┌─────────────────────────────────────────────────────────────┐
                     │                 Client Request / Navigation                 │
                     │  GET /api/drive/files/:category  |  GET /api/metadata/enrich│
                     └──────────────────────────────┬──────────────────────────────┘
                                                    │
                                                    ▼
                     ┌─────────────────────────────────────────────────────────────┐
                     │            Express Router (drive.ts / metadata.ts)          │
                     └──────────────────────────────┬──────────────────────────────┘
                                                    │
                                    Is Category / Title Family?
                                   ┌────────────────┴────────────────┐
                             YES   │                                 │   NO
                                   ▼                                 ▼
         ┌───────────────────────────────────────┐ ┌──────────────────────────────────────┐
         │ Strict Isolation Barrier (F8)         │ │ TMDB Metadata Enricher (F7)          │
         │ server/metadata/isolator.ts           │ │ server/metadata/tmdb.ts              │
         ├───────────────────────────────────────┤ ├──────────────────────────────────────┤
         │ • ZERO external network calls         │ │ • Filename Regex Cleaning (F6)       │
         │ • HTTP 403 on direct enrich query     │ │ • TMDB API v3 in Spanish (es-ES)     │
         │ • Drive v3 native attribute synthesis │ │ • 2-tier caching (Memory + Disk)     │
         │ • Clean Title Case (no tech tags)     │ │ • Posters (w500), Backdrops (w1280)  │
         │ • Spanish localized recorded date     │ │ • Cast, Director, Overview, Genres   │
         │ • MM:SS duration & Resolution badge   │ └──────────────────────────────────────┘
         │ • Google CDN =s800 thumbnail          │
         └───────────────────────────────────────┘
```

---

## 2. Strict Isolation Barrier Architecture (`server/metadata/isolator.ts`)

### 2.1 Threat Model & Isolation Invariants

| Invariant | Description | Consequence of Failure |
|---|---|---|
| **INV-F8-1 (Zero TMDB Call)** | No family media item may ever initiate an HTTP/HTTPS call to TMDB or third-party movie scrapers. | **Severe Privacy Breach**: Family names, children's names, vacation locations leaked to external query logs. |
| **INV-F8-2 (Zero Commercial Pollution)** | Family items must never have commercial movie attributes (`director`, `cast`, `overview`, `genres`, `rating`). `tmdbEnriched` must strictly equal `false`. | **Corrupted UI**: Commercial film overviews randomly attributed to personal family videos. |
| **INV-F8-3 (403 Rejection Gate)** | Direct requests to `/api/metadata/enrich` with `category=familiares` or containing family keywords must immediately return HTTP `403 Forbidden` with `"Isolation Barrier"`. | **Accidental Enrichment**: Client frontend bugs could leak family titles to the enrichment route. |
| **INV-F8-4 (Deterministic Drive Synthesis)** | Family media items must be enriched with native Drive metadata: `cleanTitle` in Title Case, `dateFormatted` in Spanish, `durationFormatted` in `MM:SS`, and `thumbnailLink` upgraded to `=s800`. | **Broken 10-Foot UI**: Family video cards require these exact attributes for Smart TV presentation. |

---

### 2.2 Category & Content Detection Heuristics

The barrier must recognize family media across three vectors:
1. **Category Slugs**: `familiares`, `videos familiares`, `videos_familiares`, `familia`, `home videos`, `home_videos`, `home-videos`, `videos caseros`, `videos`.
2. **Folder Path & Parent Folder Name**: Any item located inside a folder hierarchy whose path or folder name matches family identifiers.
3. **Query Keywords in Titles**: Any title query containing `familia`, `home video`, or `videos familiares` (e.g., `"Paseo en familia"`, `"Cumpleaños en familia"`).

#### Normalization Function
To prevent bypasses via diacritics, casing, or trailing slashes, inputs are normalized:
```typescript
export function normalizeText(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accents (á -> a, ñ -> n for keyword check)
    .trim()
    .toLowerCase();
}
```

#### Predicates
```typescript
const FAMILY_CATEGORY_REGEX = /^(videos?\s*familiares?|familiares|familia|home[-_ ]?videos?|videos[-_ ]?caseros?|videos)$/i;
const FAMILY_KEYWORD_REGEX = /\b(familia|familiares|home[-_ ]?video|videos?[-_ ]?familiares?)\b/i;

export function isFamilyCategory(category?: string | null): boolean {
  if (!category) return false;
  const norm = normalizeText(category);
  return FAMILY_CATEGORY_REGEX.test(norm);
}

export function isFamilyFolder(folderPath?: string | null, folderName?: string | null): boolean {
  const combined = `${folderPath || ''}/${folderName || ''}`;
  const norm = normalizeText(combined);
  return FAMILY_KEYWORD_REGEX.test(norm);
}

export function containsFamilyKeywords(text?: string | null): boolean {
  if (!text) return false;
  const norm = normalizeText(text);
  return FAMILY_KEYWORD_REGEX.test(norm);
}

export function isFamilyContent(query: {
  category?: string | null;
  title?: string | null;
  folderPath?: string | null;
  folderName?: string | null;
}): boolean {
  if (query.category && isFamilyCategory(query.category)) return true;
  if (isFamilyFolder(query.folderPath, query.folderName)) return true;
  if (query.title && containsFamilyKeywords(query.title)) return true;
  return false;
}
```

---

### 2.3 The Hard Isolation Barrier Gate

```typescript
export class IsolationBarrierError extends Error {
  public readonly statusCode = 403;
  constructor(message: string = 'Strict Isolation Barrier: Family media is barred from external TMDB enrichment') {
    super(message);
    this.name = 'IsolationBarrierError';
  }
}

export function assertFamilyIsolation(query: {
  category?: string | null;
  title?: string | null;
  folderPath?: string | null;
  folderName?: string | null;
}): void {
  if (isFamilyContent(query)) {
    throw new IsolationBarrierError();
  }
}
```

---

## 3. Native Google Drive Metadata Synthesis Engine

Google Drive API v3 provides rich file attributes without invoking external APIs:
- `createdTime`: ISO 8601 string (e.g. `'2021-10-15T15:30:00Z'`).
- `modifiedTime`: ISO 8601 string.
- `thumbnailLink`: Google CDN URL (e.g. `https://lh3.googleusercontent.com/...=s220`).
- `videoMediaMetadata.durationMillis`: Duration in milliseconds (string or number).
- `videoMediaMetadata.width`: Video width in pixels (e.g. `1920` or `3840`).
- `videoMediaMetadata.height`: Video height in pixels (e.g. `1080` or `2160`).

### 3.1 Title Case Formatting
Personal video filenames often have technical extensions and underscores (`Cumpleaños_de_Lucas_2021.mp4`, `Navidad_En_Familia_2022.mov`).
Requirements from Tier 1 (`F8-05`) and Tier 2 (`F13-B03`):
- Strip extension (`.mp4`, `.mov`, `.mkv`, etc.).
- Replace delimiters (`_`, `.`, `-`) with spaces.
- Preserve Spanish accents (`ñ`, `á`, `é`, `í`, `ó`, `ú`, `ü`).
- Title Case every word (including short words: `"Cumpleaños De Lucas 2021"`, `"Navidad En Familia 2022"`).

```typescript
export function formatFamilyCleanTitle(filename: string): string {
  if (!filename || typeof filename !== 'string') return '';
  // 1. Strip file extension
  let base = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  // 2. Replace underscores, dots, hyphens with spaces
  let spaced = base.replace(/[._-]+/g, ' ').trim();
  // 3. Collapse multiple spaces
  spaced = spaced.replace(/\s+/g, ' ');
  // 4. Capitalize first letter of every word, preserving diacritics
  return spaced.replace(/\b([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, (char) => char.toUpperCase());
}
```

### 3.2 Spanish Localized Date Formatting
Requirements from Tier 1 (`F13-01`) and Mock Server (`mock-data.js`):
- Target output format: `"15 de octubre de 2021"`, `"20 de julio de 2019"`.
- Must include the Spanish preposition `"de"`.
- Fallbacks: check `driveFile.createdTime`, then `videoMediaMetadata.date`, then `driveFile.modifiedTime`, then current date.

```typescript
const SPANISH_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export function formatSpanishDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const day = d.getUTCDate();
  const month = SPANISH_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} de ${month} de ${year}`;
}
```

### 3.3 Duration Formatting (`MM:SS` & `Hh MMm`)
Requirements from Tier 1 (`F13-02`), Tier 2 (`F13-B02`), and Mock Data:
- `vid_fam_1`: 872,000 ms (14m 32s) -> `'14:32'`
- `vid_fam_2`: 1,950,000 ms (32m 30s) -> `'32:30'`
- `vid_fam_3`: 450,000 ms (7m 30s) -> `'07:30'`
- Boundary `F13-B02`: Even when duration is over 30 minutes, output must use `MM:SS` without truncation.
- For video recordings exceeding 60 minutes, `MM:SS` format (e.g. `'65:10'`) or standard duration representation is supported.

```typescript
export function formatFamilyDuration(durationMillis?: number | string | null): string {
  if (!durationMillis) return '00:00';
  const millis = typeof durationMillis === 'string' ? parseInt(durationMillis, 10) : durationMillis;
  if (isNaN(millis) || millis <= 0) return '00:00';

  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;

  return `${mm}:${ss}`;
}
```

### 3.4 Resolution Badge Classifier
Requirements from PROJECT.md:
- Height >= 2160: `'4K'`
- Height >= 1080: `'1080p'`
- Height >= 720: `'720p'`
- Otherwise: `'SD'`

```typescript
export function getResolutionBadge(height?: number | null): '4K' | '1080p' | '720p' | 'SD' | undefined {
  if (!height || typeof height !== 'number' || height <= 0) return undefined;
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  return 'SD';
}
```

### 3.5 High-Definition Thumbnail Optimization (`=s800`)
Requirements from Tier 1 (`F8-03`), Tier 2 (`F8-B05`, `F13-B05`):
- Drive's default `thumbnailLink` ends with `=s220` (220px low resolution).
- Replacing `=s\d+` (or `=[sw]\d+.*$`) with `=s800` directs Google's edge CDN to return a high-definition 800px card.
- If already ending in `=s800`, preserve it intact.
- If no size tag exists, append `=s800`.

```typescript
export function upgradeThumbnailToHD(thumbnailLink?: string | null): string | undefined {
  if (!thumbnailLink) return undefined;
  if (/=[sw]\d+.*$/.test(thumbnailLink)) {
    return thumbnailLink.replace(/=[sw]\d+.*$/, '=s800');
  }
  return `${thumbnailLink}=s800`;
}
```

---

### 3.6 Complete Module: `server/metadata/isolator.ts`

```typescript
import { DriveMediaItem } from '../drive/types';

export class IsolationBarrierError extends Error {
  public readonly statusCode = 403;
  constructor(message: string = 'Strict Isolation Barrier: Family media is barred from external TMDB enrichment') {
    super(message);
    this.name = 'IsolationBarrierError';
  }
}

const FAMILY_CATEGORY_REGEX = /^(videos?\s*familiares?|familiares|familia|home[-_ ]?videos?|videos[-_ ]?caseros?|videos)$/i;
const FAMILY_KEYWORD_REGEX = /\b(familia|familiares|home[-_ ]?video|videos?[-_ ]?familiares?)\b/i;

const SPANISH_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export function normalizeText(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isFamilyCategory(category?: string | null): boolean {
  if (!category) return false;
  const norm = normalizeText(category);
  return FAMILY_CATEGORY_REGEX.test(norm);
}

export function isFamilyFolder(folderPath?: string | null, folderName?: string | null): boolean {
  const combined = `${folderPath || ''}/${folderName || ''}`;
  const norm = normalizeText(combined);
  return FAMILY_KEYWORD_REGEX.test(norm);
}

export function containsFamilyKeywords(text?: string | null): boolean {
  if (!text) return false;
  const norm = normalizeText(text);
  return FAMILY_KEYWORD_REGEX.test(norm);
}

export function isFamilyContent(query: {
  category?: string | null;
  title?: string | null;
  folderPath?: string | null;
  folderName?: string | null;
}): boolean {
  if (query.category && isFamilyCategory(query.category)) return true;
  if (isFamilyFolder(query.folderPath, query.folderName)) return true;
  if (query.title && containsFamilyKeywords(query.title)) return true;
  return false;
}

export function assertFamilyIsolation(query: {
  category?: string | null;
  title?: string | null;
  folderPath?: string | null;
  folderName?: string | null;
}): void {
  if (isFamilyContent(query)) {
    throw new IsolationBarrierError();
  }
}

export function formatFamilyCleanTitle(filename: string): string {
  if (!filename || typeof filename !== 'string') return '';
  let base = filename.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
  let spaced = base.replace(/[._-]+/g, ' ').trim();
  spaced = spaced.replace(/\s+/g, ' ');
  return spaced.replace(/\b([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])/g, (char) => char.toUpperCase());
}

export function formatSpanishDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const day = d.getUTCDate();
  const month = SPANISH_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} de ${month} de ${year}`;
}

export function formatFamilyDuration(durationMillis?: number | string | null): string {
  if (!durationMillis) return '00:00';
  const millis = typeof durationMillis === 'string' ? parseInt(durationMillis, 10) : durationMillis;
  if (isNaN(millis) || millis <= 0) return '00:00';

  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;

  return `${mm}:${ss}`;
}

export function getResolutionBadge(height?: number | null): '4K' | '1080p' | '720p' | 'SD' | undefined {
  if (!height || typeof height !== 'number' || height <= 0) return undefined;
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  return 'SD';
}

export function upgradeThumbnailToHD(thumbnailLink?: string | null): string | undefined {
  if (!thumbnailLink) return undefined;
  if (/=[sw]\d+.*$/.test(thumbnailLink)) {
    return thumbnailLink.replace(/=[sw]\d+.*$/, '=s800');
  }
  return `${thumbnailLink}=s800`;
}

/**
 * Transforms a raw Drive media item into a strictly isolated family media item.
 * Guarantees zero TMDB fields and synthesizes native metadata.
 */
export function synthesizeFamilyMetadata(item: DriveMediaItem): DriveMediaItem {
  const cleanTitle = formatFamilyCleanTitle(item.name);
  const dateFormatted = formatSpanishDate(item.createdTime || item.modifiedTime);
  const durationFormatted = formatFamilyDuration(item.durationMillis);
  const resolutionBadge = getResolutionBadge(item.height);
  const hdThumbnail = upgradeThumbnailToHD(item.thumbnailLink || item.thumbnailUrl);

  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    createdTime: item.createdTime || item.modifiedTime,
    modifiedTime: item.modifiedTime,
    category: 'familiares',
    cleanTitle,
    dateFormatted,
    durationMillis: item.durationMillis,
    durationFormatted,
    width: item.width,
    height: item.height,
    resolutionBadge,
    thumbnailLink: hdThumbnail,
    thumbnailUrl: hdThumbnail,
    parentFolderId: item.parentFolderId,
    parentFolderName: item.parentFolderName,
    isFolder: false,
    extension: item.extension,
    subtitles: item.subtitles || [],
    // Hard Barrier Invariants:
    tmdbEnriched: false,
    // Explicitly undefined commercial fields
    director: undefined,
    cast: undefined,
    overview: undefined,
    genres: undefined,
    rating: undefined,
    posterUrl: undefined,
    backdropUrl: undefined,
  };
}
```

---

## 4. Extended TypeScript Types (`server/drive/types.ts`)

To ensure type-safety across all 5 categories, `DriveMediaItem` in `server/drive/types.ts` is extended with optional synthesized and enriched properties:

```typescript
export type MediaCategory = 'peliculas' | 'series' | 'familiares' | 'fotos' | 'musica';

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

export interface DriveMediaItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime?: string;
  modifiedTime: string;
  category: MediaCategory;
  thumbnailUrl?: string;
  thumbnailLink?: string;
  durationMillis?: number;
  width?: number;
  height?: number;
  parentFolderId?: string;
  parentFolderName?: string;
  isFolder: boolean;
  extension?: string;
  season?: number;
  episode?: number;
  subtitles?: SubtitleTrack[];
  tmdbEnriched?: boolean;

  // Synthesized Native & Cleaned Fields:
  cleanTitle?: string;
  dateFormatted?: string;
  durationFormatted?: string;
  resolutionBadge?: '4K' | '1080p' | '720p' | 'SD';

  // TMDB Cinematic Fields (Undefined for familiares, fotos, musica):
  overview?: string;
  director?: string;
  cast?: string[];
  genres?: string[];
  rating?: number;
  runtime?: string;
  year?: number;
  posterUrl?: string;
  backdropUrl?: string;
}
```

---

## 5. API Route Integration Specification

### 5.1 Route 1: `GET /api/metadata/enrich` (`server/routes/metadata.ts`)

#### Endpoint Contract
- **Method**: `GET`
- **Path**: `/api/metadata/enrich`
- **Query Parameters**:
  - `title`: `string` (required)
  - `year`: `string | number` (optional)
  - `category`: `string` (optional, e.g. `'peliculas'`, `'series'`, `'familiares'`)
- **Responses**:
  - `403 Forbidden`: If `category` or `title` satisfies `isFamilyContent()`.  
    Response payload: `{ "error": "Strict Isolation Barrier: Family media is barred from external TMDB enrichment" }`
  - `400 Bad Request`: If `title` is empty or missing.  
    Response payload: `{ "error": "Missing required query parameter: title" }`
  - `200 OK`: Enriched TMDB metadata (with `cached: boolean`).  
    Response payload:
    ```json
    {
      "id": 27205,
      "title": "Origen",
      "originalTitle": "Inception",
      "year": 2010,
      "overview": "Dom Cobb es un ladrón...",
      "posterUrl": "https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg",
      "backdropUrl": "https://image.tmdb.org/t/p/w1280/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg",
      "rating": 8.4,
      "runtime": "2h 28m",
      "director": "Christopher Nolan",
      "cast": ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"],
      "genres": ["Ciencia ficción", "Acción"],
      "cached": true
    }
    ```

#### Route Implementation
```typescript
import { Router, Request, Response } from 'express';
import { isFamilyContent } from '../metadata/isolator';
import { sanitizeMediaFilename } from '../metadata/sanitizer';
import { tmdbService } from '../metadata/tmdb';

export const metadataRouter = Router();

metadataRouter.get('/enrich', async (req: Request, res: Response) => {
  const title = (req.query.title as string) || '';
  const rawYear = req.query.year as string | undefined;
  const rawCategory = req.query.category as string | undefined;

  // 1. Strict Isolation Barrier Gate
  if (isFamilyContent({ category: rawCategory, title })) {
    return res.status(403).json({
      error: 'Strict Isolation Barrier: Family media is barred from external TMDB enrichment',
    });
  }

  // 2. Query Validation
  if (!title.trim()) {
    return res.status(400).json({
      error: 'Missing required query parameter: title',
    });
  }

  const parsedYear = rawYear ? parseInt(rawYear, 10) : undefined;
  const validYear = !isNaN(parsedYear as number) ? parsedYear : undefined;

  try {
    const enriched = await tmdbService.enrich({
      title,
      year: validYear,
      category: rawCategory,
    });
    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({
      error: 'Error enriching metadata from TMDB',
      message: err.message,
    });
  }
});

metadataRouter.get('/clean-title', (req: Request, res: Response) => {
  const filename = (req.query.filename as string) || '';
  const result = sanitizeMediaFilename(filename);
  return res.json(result);
});
```

---

### 5.2 Route 2: `GET /api/drive/files/:category` (`server/routes/drive.ts`)

#### Endpoint Contract
- **Method**: `GET`
- **Path**: `/api/drive/files/:category`
- **Path Parameters**:
  - `:category`: Category name (`peliculas`, `series`, `familiares`, `fotos`, `musica`, `empty`).
- **Processing Logic by Category**:

| Category | Processing & Isolation Rules |
|---|---|
| `familiares` | 1. Traversal loads items from family folder.<br>2. **Strict Family Isolator**: Maps every item via `synthesizeFamilyMetadata()`.<br>3. `tmdbEnriched` set to `false`. Zero TMDB calls.<br>4. High-definition `=s800` thumbnail links set.<br>5. `cleanTitle`, `dateFormatted`, `durationFormatted`, `resolutionBadge` set. |
| `peliculas` | 1. Traversal loads movie items.<br>2. Filename cleaned via `sanitizeMediaFilename()`.<br>3. Enriched with TMDB Spanish metadata (director, cast, overview, poster `w500`, backdrop `w1280`).<br>4. `tmdbEnriched` set to `true`. |
| `series` | 1. Traversal loads series items.<br>2. Parsed season & episode extracted via regex (`s01e02`).<br>3. Enriched with TMDB TV metadata.<br>4. `tmdbEnriched` set to `true`. |
| `fotos` | 1. Traversal loads image files (`jpg`, `png`, `webp`).<br>2. Native image dimensions (`width`, `height`).<br>3. Thumbnail links set.<br>4. `tmdbEnriched` set to `false`. |
| `musica` | 1. Traversal loads audio files (`mp3`, `flac`, `aac`, `m4a`).<br>2. Native duration and album art set.<br>3. `tmdbEnriched` set to `false`. |
| `empty` | Returns `{ category: 'empty', total: 0, count: 0, items: [] }`. |
| *unknown* | Returns HTTP `404` `{ error: "Category '${rawCategory}' not found" }`. |

#### Updated Controller in `server/routes/drive.ts`
```typescript
import { Router, Request, Response } from 'express';
import { DriveTraversalEngine, normalizeCategoryParam } from '../drive/traversal';
import { MediaCategory, DriveMediaItem } from '../drive/types';
import { synthesizeFamilyMetadata } from '../metadata/isolator';
import { sanitizeMediaFilename } from '../metadata/sanitizer';
import { tmdbService } from '../metadata/tmdb';

export const driveRouter = Router();
const traversalEngine = new DriveTraversalEngine();

driveRouter.get('/files/:category', async (req: Request, res: Response) => {
  const rawCategory = req.params.category;
  const matched = normalizeCategoryParam(rawCategory);

  if (!matched && rawCategory.toLowerCase() !== 'empty') {
    return res.status(404).json({
      error: `Category '${rawCategory}' not found`,
    });
  }

  if (rawCategory.toLowerCase() === 'empty') {
    return res.json({
      category: 'empty',
      total: 0,
      count: 0,
      items: [],
    });
  }

  const category = matched as MediaCategory;

  try {
    const rawItems = await traversalEngine.listCategoryItems(category);
    let processedItems: DriveMediaItem[] = [];

    // Category 1: Videos familiares (STRICT ISOLATION BARRIER)
    if (category === 'familiares') {
      processedItems = rawItems.map((item) => synthesizeFamilyMetadata(item));
    }
    // Category 2 & 3: Películas & Series (TMDB ENRICHMENT)
    else if (category === 'peliculas' || category === 'series') {
      processedItems = await Promise.all(
        rawItems.map(async (item) => {
          const parsed = sanitizeMediaFilename(item.name);
          const enriched = await tmdbService.enrich({
            title: parsed.cleanTitle,
            year: parsed.year || undefined,
            category,
          });

          return {
            ...item,
            cleanTitle: parsed.cleanTitle,
            year: parsed.year || undefined,
            season: parsed.season || item.season,
            episode: parsed.episode || item.episode,
            overview: enriched.overview,
            director: enriched.director,
            cast: enriched.cast,
            genres: enriched.genres,
            rating: enriched.rating,
            runtime: enriched.runtime,
            posterUrl: enriched.posterUrl,
            backdropUrl: enriched.backdropUrl,
            tmdbEnriched: true,
          };
        })
      );
    }
    // Category 4: Fotos (NATIVE DRIVE IMAGE ATTRIBUTES)
    else if (category === 'fotos') {
      processedItems = rawItems.map((item) => ({
        ...item,
        tmdbEnriched: false,
      }));
    }
    // Category 5: Música (NATIVE DRIVE AUDIO ATTRIBUTES)
    else if (category === 'musica') {
      processedItems = rawItems.map((item) => ({
        ...item,
        tmdbEnriched: false,
      }));
    } else {
      processedItems = rawItems;
    }

    return res.json({
      category,
      total: processedItems.length,
      count: processedItems.length,
      items: processedItems,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: `Error retrieving items for category ${category}`,
      message: err.message,
    });
  }
});
```

---

### 5.3 Server Wiring (`server/index.ts`)

In `server/index.ts`, register the metadata router:
```typescript
import { metadataRouter } from './routes/metadata';

// Register routes
app.use('/api', healthRouter);
app.use('/api/drive', driveRouter);
app.use('/api/stream', streamRouter);
app.use('/api/subtitles', subtitlesRouter);
app.use('/api/metadata', metadataRouter);
```

Endpoints listed in root `/` endpoint:
- `/api/metadata/enrich`
- `/api/metadata/clean-title`
- `/api/drive/files/:category`

---

## 6. Zero-Leak Verification Test Suite

### 6.1 Test Methodology
To guarantee mathematically zero network leaks:
1. **Mock Spy Assertion**: Wrap the TMDB API caller in a spy. Run full traversal and listing on `familiares`. Assert `expect(tmdbSpy).toHaveBeenCalledTimes(0)`.
2. **Network Interceptor Assertion**: Intercept HTTP requests at the Node.js `http`/`https`/`fetch` layer. Assert that no request to `api.themoviedb.org` or any external domain is dispatched.
3. **Payload Key Whitelist & Blacklist**: Inspect every returned item object from `/api/drive/files/familiares`:
   - Blacklist: `director`, `cast`, `overview`, `genres`, `rating`, `posterUrl`, `backdropUrl` must be `undefined`.
   - Whitelist: `cleanTitle`, `dateFormatted`, `durationFormatted`, `resolutionBadge`, `thumbnailLink` must be present.
   - Domain Check: `thumbnailLink` must not contain `image.tmdb.org`.
4. **Boundary 403 Rejection**: Verify that every variant of category or title with family keywords returns HTTP 403 with `"Isolation Barrier"`.

---

### 6.2 Unit Test Blueprint: `tests/unit/m2/isolator.test.ts`

```typescript
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFamilyCategory,
  isFamilyFolder,
  containsFamilyKeywords,
  isFamilyContent,
  assertFamilyIsolation,
  IsolationBarrierError,
  formatFamilyCleanTitle,
  formatSpanishDate,
  formatFamilyDuration,
  getResolutionBadge,
  upgradeThumbnailToHD,
  synthesizeFamilyMetadata,
} from '../../../server/metadata/isolator';
import { DriveMediaItem } from '../../../server/drive/types';

describe('Feature F8: Strict Family Video Isolation Barrier', () => {

  describe('Category & Keyword Detection', () => {
    test('identifies all canonical and edge-case family category slugs', () => {
      const familySlugs = [
        'familiares',
        'Videos familiares',
        'VIDEOS FAMILIARES',
        'videos_familiares',
        'familia',
        'home videos',
        'home-videos',
        'home_videos',
        'videos caseros',
      ];
      for (const slug of familySlugs) {
        assert.equal(isFamilyCategory(slug), true, `Slug '${slug}' should be detected as family category`);
      }

      assert.equal(isFamilyCategory('peliculas'), false);
      assert.equal(isFamilyCategory('series'), false);
      assert.equal(isFamilyCategory('fotos'), false);
      assert.equal(isFamilyCategory('musica'), false);
    });

    test('detects family folder hierarchy paths', () => {
      assert.equal(isFamilyFolder('/GoogleDrive/Root/Videos Familiares', '2021'), true);
      assert.equal(isFamilyFolder(undefined, 'Home Videos'), true);
      assert.equal(isFamilyFolder('/Peliculas/Accion', 'Matrix'), false);
    });

    test('detects family keywords in titles regardless of diacritics', () => {
      assert.equal(containsFamilyKeywords('Paseo en familia'), true);
      assert.equal(containsFamilyKeywords('Cumpleaños en familia 2021'), true);
      assert.equal(containsFamilyKeywords('Home video navidad'), true);
      assert.equal(containsFamilyKeywords('Inception 2010'), false);
    });

    test('assertFamilyIsolation throws IsolationBarrierError with 403 status', () => {
      assert.throws(
        () => assertFamilyIsolation({ category: 'familiares', title: 'Titanic_en_el_lago' }),
        (err: any) => err instanceof IsolationBarrierError && err.statusCode === 403 && err.message.includes('Isolation Barrier')
      );

      assert.throws(
        () => assertFamilyIsolation({ title: 'Paseo en familia' }),
        (err: any) => err instanceof IsolationBarrierError && err.statusCode === 403
      );

      // Non-family does not throw
      assert.doesNotThrow(() => assertFamilyIsolation({ category: 'peliculas', title: 'Inception' }));
    });
  });

  describe('Native Drive Metadata Synthesis', () => {
    test('formats clean title in Title Case preserving Spanish diacritics and numbers', () => {
      assert.equal(formatFamilyCleanTitle('Cumpleaños_de_Lucas_2021.mp4'), 'Cumpleaños De Lucas 2021');
      assert.equal(formatFamilyCleanTitle('Vacaciones_Bariloche_2019.mp4'), 'Vacaciones Bariloche 2019');
      assert.equal(formatFamilyCleanTitle('Navidad_En_Familia_2022.mov'), 'Navidad En Familia 2022');
      assert.equal(formatFamilyCleanTitle('bebe.primeros.pasos.mkv'), 'Bebe Primeros Pasos');
    });

    test('formats Spanish dates with "de" preposition', () => {
      assert.equal(formatSpanishDate('2021-10-15T15:30:00Z'), '15 de octubre de 2021');
      assert.equal(formatSpanishDate('2019-07-20T10:15:00Z'), '20 de julio de 2019');
      assert.equal(formatSpanishDate('2022-12-25T01:00:00Z'), '25 de diciembre de 2022');
      assert.equal(formatSpanishDate(''), '');
    });

    test('formats duration as MM:SS', () => {
      assert.equal(formatFamilyDuration(872000), '14:32');
      assert.equal(formatFamilyDuration(1950000), '32:30');
      assert.equal(formatFamilyDuration(450000), '07:30');
      assert.equal(formatFamilyDuration(0), '00:00');
    });

    test('classifies resolution badges accurately', () => {
      assert.equal(getResolutionBadge(2160), '4K');
      assert.equal(getResolutionBadge(1080), '1080p');
      assert.equal(getResolutionBadge(720), '720p');
      assert.equal(getResolutionBadge(480), 'SD');
      assert.equal(getResolutionBadge(undefined), undefined);
    });

    test('upgrades thumbnail link to =s800 edge CDN', () => {
      assert.equal(
        upgradeThumbnailToHD('https://lh3.googleusercontent.com/drive-thumb-1=s220'),
        'https://lh3.googleusercontent.com/drive-thumb-1=s800'
      );
      assert.equal(
        upgradeThumbnailToHD('https://lh3.googleusercontent.com/drive-thumb-1=s800'),
        'https://lh3.googleusercontent.com/drive-thumb-1=s800'
      );
      assert.equal(
        upgradeThumbnailToHD('https://lh3.googleusercontent.com/drive-thumb-1=w220'),
        'https://lh3.googleusercontent.com/drive-thumb-1=s800'
      );
    });

    test('synthesizeFamilyMetadata sets all native fields and omits commercial fields', () => {
      const mockRawItem: DriveMediaItem = {
        id: 'vid_fam_1',
        name: 'Cumpleaños_de_Lucas_2021.mp4',
        mimeType: 'video/mp4',
        size: 1073741824,
        createdTime: '2021-10-15T15:30:00Z',
        modifiedTime: '2021-10-15T15:30:00Z',
        category: 'familiares',
        durationMillis: 872000,
        width: 1920,
        height: 1080,
        thumbnailLink: 'https://lh3.googleusercontent.com/drive-fam-thumb-1=s220',
        isFolder: false,
      };

      const result = synthesizeFamilyMetadata(mockRawItem);

      // Positive assertions
      assert.equal(result.cleanTitle, 'Cumpleaños De Lucas 2021');
      assert.equal(result.dateFormatted, '15 de octubre de 2021');
      assert.equal(result.durationFormatted, '14:32');
      assert.equal(result.resolutionBadge, '1080p');
      assert.equal(result.thumbnailLink, 'https://lh3.googleusercontent.com/drive-fam-thumb-1=s800');
      assert.equal(result.tmdbEnriched, false);

      // Negative assertions (strictly undefined)
      assert.equal(result.director, undefined);
      assert.equal(result.cast, undefined);
      assert.equal(result.overview, undefined);
      assert.equal(result.genres, undefined);
      assert.equal(result.rating, undefined);
      assert.equal(result.posterUrl, undefined);
      assert.equal(result.backdropUrl, undefined);
    });
  });

  describe('Zero Network Leaks Assertion', () => {
    test('processing family items invokes TMDB client exactly 0 times', async () => {
      // Create a mock spy for TMDB fetch
      let tmdbCallsCount = 0;
      const fakeTmdbClient = {
        searchMovie: () => { tmdbCallsCount++; return Promise.resolve([]); },
        getDetails: () => { tmdbCallsCount++; return Promise.resolve({}); }
      };

      const familyItems: DriveMediaItem[] = [
        {
          id: 'vid_1',
          name: 'Cumpleaños_2021.mp4',
          mimeType: 'video/mp4',
          size: 1000,
          modifiedTime: '2021-10-15T15:30:00Z',
          category: 'familiares',
          isFolder: false,
        },
        {
          id: 'vid_2',
          name: 'Vacaciones_2019.mp4',
          mimeType: 'video/mp4',
          size: 2000,
          modifiedTime: '2019-07-20T10:15:00Z',
          category: 'familiares',
          isFolder: false,
        }
      ];

      // Process items through barrier
      const processed = familyItems.map((item) => {
        // Assert barrier
        assertFamilyIsolation({ category: item.category, title: item.name });
        return synthesizeFamilyMetadata(item);
      });

      // Assert zero calls
      assert.equal(tmdbCallsCount, 0, 'TMDB client must not be invoked for family items');
      assert.equal(processed.length, 2);
    });
  });
});
```

---

## 7. Traceability Matrix: Requirements to Verification

| Requirement ID | Code Location | Verification Method | Associated E2E Tests |
|---|---|---|---|
| **R2 / F8: Zero TMDB Leaks** | `server/metadata/isolator.ts:assertFamilyIsolation` | Unit test with spy asserting 0 calls | `F8-01`, `F8-04`, `T3-02` |
| **R2 / F8: Category Slugs** | `server/metadata/isolator.ts:isFamilyCategory` | Regex check covering 9 permutations | `F8-B01`, `F8-B02` |
| **R2 / F8: Query Keywords** | `server/metadata/isolator.ts:containsFamilyKeywords` | 403 on `"familia"`, `"home video"` | `F8-B04` |
| **R2 / F8: Clean Title Case** | `server/metadata/isolator.ts:formatFamilyCleanTitle` | Title Case without extension | `F8-05`, `F13-B03` |
| **R2 / F8: Spanish Date** | `server/metadata/isolator.ts:formatSpanishDate` | Format with `"de"` preposition | `F8-02`, `F13-01`, `F13-B04` |
| **R2 / F8: MM:SS Duration** | `server/metadata/isolator.ts:formatFamilyDuration` | Regex `^\d{1,2}:\d{2}$` | `F13-02`, `F13-B02` |
| **R2 / F8: Resolution Badge** | `server/metadata/isolator.ts:getResolutionBadge` | 4K (2160), 1080p, 720p, SD | `F8-02`, `F13-B01` |
| **R2 / F8: HD Thumbnail =s800** | `server/metadata/isolator.ts:upgradeThumbnailToHD` | URL ends with `=s800` | `F8-03`, `F8-B05`, `F13-B05` |
| **Interface: /api/metadata/enrich** | `server/routes/metadata.ts` | Supertest/E2E HTTP queries | `F7-01..F7-05`, `F8-04` |
| **Interface: /api/drive/files/:category**| `server/routes/drive.ts` | Category dispatcher | `F8-01..F8-05`, `F13-01..F13-03` |

---

## 8. Implementation Steps for Developer Agents

When implementing Milestone M2:
1. **Types Update**: Update `server/drive/types.ts` with extended `DriveMediaItem` properties (`cleanTitle`, `dateFormatted`, `durationFormatted`, `resolutionBadge`, `overview`, `director`, `cast`, `genres`, `rating`, `posterUrl`, `backdropUrl`).
2. **Isolator Module**: Create `server/metadata/isolator.ts` with the reference implementation in Section 3.6.
3. **Metadata Routes**: Create `server/routes/metadata.ts` implementing `GET /api/metadata/enrich` and `GET /api/metadata/clean-title`.
4. **Drive Routes Update**: Update `server/routes/drive.ts` `GET /api/drive/files/:category` to dispatch `synthesizeFamilyMetadata` for `familiares` and TMDB enrichment for `peliculas`/`series`.
5. **App Wiring**: Mount `metadataRouter` under `/api/metadata` in `server/index.ts`.
6. **Execute Tests**: Run unit tests (`node --test tests/unit/m2/isolator.test.ts`) and E2E suites (`node tests/run-e2e.js --tier=1` and `--tier=2`) to verify 100% pass rate.
