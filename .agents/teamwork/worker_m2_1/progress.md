# Progress Log - worker_m2_1

Last visited: 2026-10-13T12:05:00Z

## Completed Work
1. Initialized workspace metadata: `DISPATCH.md`, `BRIEFING.md`, `progress.md`.
2. Reviewed authoritative specifications from `sanitizer_spec.md`, `tmdb_spec.md`, and `isolator_routes_spec.md`.
3. Extended `DriveMediaItem` in `server/drive/types.ts` with synthesized/enriched fields (`cleanTitle`, `dateFormatted`, `durationFormatted`, `resolutionBadge`, `overview`, `director`, `cast`, `genres`, `rating`, `runtime`, `year`, `posterUrl`, `backdropUrl`, `createdTime`).
4. Implemented `server/metadata/sanitizer.ts`:
   - 8-stage filename cleaning pipeline.
   - TV episode extraction (`SxxExx`, `1x02`, `Season x Episode y`, `Temporada x Episodio y`, `TxEy`).
   - Release year extraction (1900-2099) with regex lookahead to preserve numbers in titles (e.g., Blade Runner 2049, 1917, 2001).
   - Classified noise token dictionary with convergence loop.
   - Delimiter translation and compound hyphen preservation (`Spider-Man`, `WALL-E`, `X-Men`).
   - Spanish diacritics and inverted punctuation preservation (`á`, `é`, `í`, `ó`, `ú`, `ñ`, `ü`, `¿`, `¡`).
5. Implemented `server/metadata/tmdb.ts`:
   - TMDB v3 API client in Spanish (`language=es-ES`) with single-roundtrip `append_to_response=credits`.
   - 4-stage search fallback hierarchy (year, relaxed title, parenthetical pruning, offline mock fallback).
   - 2-tier caching: In-memory LRU (1000 items) + persistent file cache (`cache/tmdb_cache.json` with 30-day TTL, atomic `.tmp` writes, 500ms debounce).
   - Concurrency throttling (max 4 concurrent, 100ms pause) and in-flight request deduplication.
   - Graceful offline and mock fallback without exceptions or 500 errors.
6. Implemented `server/metadata/isolator.ts`:
   - Multi-vector family content detection (`isFamilyCategory`, `isFamilyFolder`, `containsFamilyKeywords`, `isFamilyContent`).
   - Strict isolation barrier (`assertFamilyIsolation` throwing `IsolationBarrierError` with HTTP 403).
   - Native Google Drive metadata synthesis: Title Case formatting, Spanish dates (`"15 de octubre de 2021"`), duration (`"MM:SS"`), resolution badge (`4K`, `1080p`, `720p`, `SD`), and HD thumbnail upgrade (`=s800`).
   - `synthesizeFamilyMetadata` ensuring zero TMDB commercial fields and `tmdbEnriched: false`.
7. Implemented `server/routes/metadata.ts`:
   - `GET /api/metadata/clean-title`: query `filename`, returns clean media info.
   - `GET /api/metadata/enrich`: query `title`, `year`, `category`. Strict isolation barrier rejects family queries with 403, and queries TMDB for commercial media.
8. Integrated `server/routes/drive.ts`:
   - `GET /api/drive/files/:category` dispatches `synthesizeFamilyMetadata` for `familiares`, TMDB enrichment for `peliculas`/`series`, and native schemas for `fotos`/`musica`.
9. Mounted `metadataRouter` under `/api/metadata` in `server/index.ts`.
10. Created test suites:
    - `tests/unit/m2/sanitizer.test.ts`: 7 tests passing.
    - `tests/unit/m2/tmdb.test.ts`: 7 tests passing.
    - `tests/unit/m2/isolator.test.ts`: 18 tests passing (including Express live HTTP route tests).
11. Build and Test Verification:
    - `npm run build` (tsc) -> exit code 0.
    - `npm run test:unit` -> 95/95 pass.
    - `npx tsx --test tests/unit/m2/*.test.ts` -> 32/32 pass.
    - `node tests/run-e2e.js` -> 207/207 pass (100% PASS).
