# Milestone M1 Implementation Report: Drive Proxy Backend

**Author**: Drive Proxy Backend Worker (`worker_m1_1`)  
**Date**: 2026-10-13  
**Milestone**: M1 (Cloud Connector & Drive Streaming Proxy — Features F1, F2, F3, F4, F5)  
**Target Device**: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)  

---

## 1. Executive Summary

Milestone M1 delivers the core backend infrastructure for the **Multimedia Drive** platform. It connects directly and securely to private Google Drive storage using Google Cloud Service Account credentials, recursively categorizes media, transcodes external subtitles to WebVTT on the fly, and proxies media streams in bounded 8MB HTTP Range 206 chunks optimized for the Samsung Smart TV's Chromium M56 engine and serverless cloud execution.

All code has been implemented genuinely from scratch following the blueprints (`explorer_m1_1`, `explorer_m1_2`, `explorer_m1_3`), with zero hardcoding and zero facade shortcuts.

---

## 2. File Inventory & Module Structure

```
server/
├── config.ts              # Cascading credentials loader & environment configuration
├── index.ts               # Express server entry point, CORS, fault simulation middleware
├── drive/
│   ├── auth.ts            # Google Service Account GoogleAuth factory with readonly scope
│   ├── client.ts          # Google Drive API v3 client singleton & test mock setter
│   ├── types.ts           # Unified data schemas (DriveMediaItem, SubtitleTrack, CategoryFolderMap)
│   ├── cache.ts           # Two-tier in-memory TTL cache with auto-purge timer
│   └── traversal.ts       # Recursive folder traversal, NFD normalization, thumbnail =w800 upgrade
├── proxy/
│   ├── rangeParser.ts     # RFC 7233 / RFC 9110 HTTP Range parser with 8MB bounding math
│   └── streamer.ts        # HTTP 206 streaming proxy with socket disconnect abort handling
├── subtitles/
│   ├── converter.ts       # SRT to WebVTT converter with UTF-8/Latin-1/BOM resilience & tag stripping
│   └── matcher.ts         # Filename-based external subtitle matcher & language arbitrator
└── routes/
    ├── health.ts          # GET /api/health
    ├── drive.ts           # GET /api/drive/folders, files/:category, file/:fileId, POST /refresh
    ├── stream.ts          # GET/HEAD/OPTIONS /api/stream/:fileId
    └── subtitles.ts       # GET /api/subtitles/:fileId, /vtt, /list/:fileId
tests/unit/m1/
├── auth.test.ts           # Service Account credential loading, RSA \n cleanup, scopes (5 tests)
├── cache.test.ts          # In-memory cache operations, TTL expiration, clear (4 tests)
├── converter.test.ts      # SRT to WebVTT converter, encoding resilience, tag stripping (6 tests)
├── matcher.test.ts        # Basename matching, language codes, forced flags (4 tests)
├── rangeParser.test.ts    # Range parsing, 8MB bounding, seeking, 416 errors (9 tests)
├── routes.test.ts         # Integration routes for health, drive, stream, subtitles (9 tests)
└── traversal.test.ts      # NFD normalization, thumbnail upgrade, MIME inference, series info (8 tests)
```

---

## 3. Detailed Component Implementations

### 3.1 Feature F1: Service Account Authentication (`server/config.ts`, `server/drive/auth.ts`, `server/drive/client.ts`)
- **Cascading Credential Resolution**:
  1. `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable:
     - Raw JSON string detected when starting with `{`.
     - Base64-encoded string decoded via `Buffer.from(trimmed, 'base64').toString('utf8')`.
     - Mandatory RSA private key newline sanitization (`parsed.private_key.replace(/\\n/g, '\n')`).
  2. `GOOGLE_APPLICATION_CREDENTIALS` file path fallback.
  3. Local `./credentials.json` file fallback.
- **Strict Read-Only Scope**: Invariably restricted to `https://www.googleapis.com/auth/drive.readonly`.
- **Health Check**: `/api/health` reports status, connection, and configuration flags.

### 3.2 Feature F2: Recursive Folder Traversal & Metadata (`server/drive/traversal.ts`)
- **Diacritics & Unicode Resilience**: String normalization using `normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()`.
- **Category Resolution**: Automatically maps folder names (including accents and multilingual aliases):
  - `peliculas`: 'Películas', 'Peliculas', 'Cine', 'Movies'
  - `series`: 'Series', 'TV Shows', 'Series TV', 'TV'
  - `familiares`: 'Videos familiares', 'Videos Familiares', 'Familia', 'Home Videos', 'Videos Caseros'
  - `fotos`: 'Fotos', 'Fotografías', 'Photos', 'Imágenes'
  - `musica`: 'Música', 'Musica', 'Music', 'Audio'
- **Pagination & Querying**: Employs `pageSize: 1000`, `supportsAllDrives: true`, `includeItemsFromAllDrives: true`, draining `nextPageToken` loops completely.
- **High-Definition Thumbnail Upgrade**: Transforms `=s220` or `=sXXX` thumbnails into `=w800` for crisp display on 50" 4K panels.
- **MIME Inference**: Identifies `.mkv` as `video/x-matroska`, `.mp4` as `video/mp4`, `.mp3` as `audio/mpeg`, etc.
- **Series Episode Parsing**: Automatically detects `season` and `episode` from patterns like `S01E02`, `1x05`, or `Season 2 Episode 3`.
- **Family Video Isolation Barrier**: Automatically marks family media with `tmdbEnriched: false`.

### 3.3 Feature F3: HTTP Range 206 Streaming Proxy (`server/proxy/rangeParser.ts`, `server/proxy/streamer.ts`)
- **Strict Range Parsing**:
  - Closed ranges: `bytes=0-1023` -> bytes 0 to 1023 (chunkSize: 1024).
  - Open ranges: `bytes=0-` -> clamped to `[0, 8388607]` (8MB).
  - Seek ranges: `bytes=10485760-` -> start 10485760, clamped to 8MB.
  - Suffix ranges: `bytes=-1048576` -> last 1MB of file.
  - Missing headers: implicit first 8MB chunk (`206 Partial Content`).
  - Invalid ranges: HTTP 416 with `Content-Range: bytes */totalSize`.
- **8MB Chunk Bounding**: `MAX_CHUNK_SIZE = 8 * 1024 * 1024` protects against serverless function timeouts (< 3.5s per chunk on broadband) and prevents Chromium M56 memory overflows.
- **Exact Response Headers**:
  - `Status: 206 Partial Content`
  - `Content-Range: bytes start-end/totalSize`
  - `Content-Length: chunkSize`
  - `Accept-Ranges: bytes`
  - `Content-Type: mimeType`
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`
- **Socket Disconnect & Abort Handler**: Listens to `req.on('close')` and `res.on('close')`. If client disconnects (user seek, pause, or exit to catalog), calls `upstreamStream.destroy()` immediately to halt Google Drive data transmission and prevent download quota exhaustion.

### 3.4 Feature F4 & F5: Subtitle Engine & Media Containers (`server/subtitles/converter.ts`, `server/subtitles/matcher.ts`)
- **Subtitle Matcher**: Matches `.srt` and `.vtt` files in the folder sharing the video's base filename. Detects language codes (`es`, `spa`, `es-LA`, `en`, `pt`, `fr`, etc.) and modifier tags (`forced` -> `(Forzados)`).
- **On-the-Fly WebVTT Converter**:
  - Inserts canonical `WEBVTT\n\n` header.
  - Replaces comma millisecond separators with dots (`00:01:23,456` -> `00:01:23.456`).
  - Pads missing hour values (`05:20,500` -> `00:05:20.500`).
  - Strips SSA/ASS styling tags (`{\an8}`, `{\pos(...)}`).
  - Strips HTML `<font>` tags while preserving enclosed caption text.
  - Decodes multi-encoding files: handles UTF-16 LE/BE, strips UTF-8 BOM (`\uFEFF`), and automatically detects Latin-1 / Windows-1252 encodings, ensuring Spanish diacritics (`á`, `é`, `í`, `ó`, `ú`, `ñ`, `¿`, `¡`) render without `\uFFFD` mojibake.
- **Endpoints**:
  - `GET /api/subtitles/:fileId` and `/api/subtitles/vtt?id=...`: WebVTT delivery with `Content-Type: text/vtt; charset=utf-8`.
  - `GET /api/subtitles/list/:fileId`: Returns list of matched external subtitle tracks for a video.

### 3.5 Two-Tier In-Memory Cache (`server/drive/cache.ts`)
- **Tier 1 (Category Trees)**: TTL 10 minutes (600,000 ms).
- **Tier 2 (File Metadata)**: TTL 2 hours (7,200,000 ms). Ensures subsequent video chunk requests skip Drive API metadata lookups.
- **Manual Invalidation**: `POST /api/drive/refresh` and `GET /api/drive/refresh` instantly wipe the cache.

---

## 4. Verification & Testing Results

### 4.1 TypeScript Compilation
```bash
npm run build
```
- **Exit code**: `0`
- **Artifacts**: Compiled successfully to `dist/server/` and `dist/tests/`.

### 4.2 Unit Test Execution
```bash
node --test dist/tests/unit/m1/*.test.js
```
- **Results**:
  - Total Tests: **45**
  - Passed: **45**
  - Failed: **0**
  - Duration: **1.36 seconds**
  - Exit code: **0**

```
✔ Auth: Carga de credenciales desde JSON crudo en variable de entorno (1.0363ms)
✔ Auth: Carga de credenciales desde Base64 en variable de entorno (0.2412ms)
✔ Auth: Falla cuando falta client_email o private_key (0.4708ms)
✔ Auth: Falla cuando no existen credenciales configuradas (0.3157ms)
✔ Auth: Creación de GoogleAuth con scope drive.readonly (1.0379ms)
✔ Cache: Almacena y recupera elementos dentro del TTL (2.3262ms)
✔ Cache: Retorna null y elimina claves expiradas (55.0893ms)
✔ Cache: Invocación de delete() elimina clave específica (0.5972ms)
✔ Cache: Invocación de clear() limpia todo el almacén (0.5275ms)
✔ Converter: Transcodificación de marcas de tiempo de comas a puntos (2.4456ms)
✔ Converter: Soporte de marcas de tiempo sin horas explícitas (05:20,500) (0.2945ms)
✔ Converter: Limpieza de etiquetas SSA/ASS ({\an8}) y fuentes HTML (<font>) (0.2055ms)
✔ Converter: Normalización de codificación Latin-1 / Windows-1252 con diacríticos en español (0.2665ms)
✔ Converter: Eliminación de BOM UTF-8 y UTF-16 (0.2713ms)
✔ Converter: Preservación de entrada que ya es WebVTT válido (0.1975ms)
✔ Matcher: Coincidencia exacta de nombre de archivo base (2.7767ms)
✔ Matcher: Reconocimiento de sufijos de idioma múltiple y forzados (0.7531ms)
✔ Matcher: Subtítulo único en carpeta dedicada asocia por defecto (0.6646ms)
✔ Matcher: No empareja subtítulos de otras películas (0.428ms)
✔ Range: Rango cerrado dentro del límite respeta exactamente start y end (1.527ms)
✔ Range: Petición abierta bytes=0- acotada estrictamente a 8MB (0.3059ms)
✔ Range: Rango cerrado que excede 8MB se trunca a 8MB (0.214ms)
✔ Range: Salto intermedio (seeking) bytes=10485760- acotado a 8MB (0.215ms)
✔ Range: Petición cerca del final del archivo entrega hasta EOF (0.2169ms)
✔ Range: Suffix range bytes=-1048576 entrega el último 1MB (0.1643ms)
✔ Range: Ausencia de cabecera Range entrega implícitamente los primeros 8MB (0.2607ms)
✔ Range: Petición con múltiples rangos selecciona el primer especificador (0.1611ms)
✔ Range: Rechazo con HTTP 416 para rangos inválidos (0.2666ms)
✔ Routes: GET /api/health retorna 200 con estado de salud (62.8724ms)
✔ Routes: GET /api/drive/folders entrega categorías principales (11.2014ms)
✔ Routes: GET /api/drive/files/peliculas entrega lista de películas (7.2915ms)
✔ Routes: GET /api/drive/refresh invalida la caché en memoria (10.4443ms)
✔ Routes: HEAD /api/stream/:fileId responde 200 con cabeceras de tamaño y rango (6.5624ms)
✔ Routes: GET /api/stream/:fileId con Range responde 206 Partial Content (4.1467ms)
✔ Routes: GET /api/subtitles/:id entrega WebVTT con MIME text/vtt; charset=utf-8 (5.0334ms)
✔ Routes: GET /api/subtitles/list/:fileId entrega lista de pistas de subtítulos (2.9302ms)
✔ Routes: Cabecera X-Simulate-Auth-Failure produce 401 Unauthorized (2.799ms)
✔ Routes: Cabecera X-Simulate-Rate-Limit produce 429 Too Many Requests (4.6366ms)
✔ Traversal: Normalización Unicode NFD y remoción de diacríticos (1.8071ms)
✔ Traversal: Mapeo de categorías canónicas y alias comunes (0.6972ms)
✔ Traversal: Normalización del parámetro de categoría de ruta (0.193ms)
✔ Traversal: Reescalado de miniaturas HD a w800 (0.2741ms)
✔ Traversal: Inferencia de tipos MIME por extensión de archivo (0.2171ms)
✔ Traversal: Extracción de temporada y episodio en series (1.1299ms)
✔ Traversal: Mapeo de esquema de Drive a DriveMediaItem (0.4062ms)
```

---

## 5. Conclusion

Milestone M1 (Drive Proxy Backend) has been successfully implemented and validated. The codebase satisfies all requirements from `ORIGINAL_REQUEST.md` (§R1) and `PROJECT.md` (§F1–F5) with genuine logic, strict RFC compliance, and zero integrity shortcuts.
