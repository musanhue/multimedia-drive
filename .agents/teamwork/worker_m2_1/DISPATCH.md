## 2026-10-13T11:52:07Z
You are the Milestone M2 Implementation Worker (`worker_m2_1`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\worker_m2_1
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md

Input architectural blueprints to guide your implementation:
1. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_1\sanitizer_spec.md (8-stage sanitization pipeline, noise token dictionary, series matching, year lookahead extraction, Spanish diacritics in server/metadata/sanitizer.ts)
2. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_2\tmdb_spec.md (TMDB v3 Spanish API client, append_to_response=credits, 4-stage search fallback, 2-tier cache with 30-day TTL and atomic writes, concurrency throttler in server/metadata/tmdb.ts)
3. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_3\isolator_routes_spec.md (Strict family video isolation barrier throwing 403 IsolationBarrierError, native Drive metadata synthesis, =s800 thumbnail upgrade, and API routes in server/metadata/isolator.ts, server/routes/metadata.ts, and server/routes/drive.ts)

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive file write ownership:
- server/metadata/sanitizer.ts
- server/metadata/tmdb.ts
- server/metadata/isolator.ts
- server/routes/metadata.ts
- server/routes/drive.ts (category enrichment integration)
- server/index.ts (register metadataRouter under /api/metadata)
- server/drive/types.ts (add optional synthesized fields if needed)
- tests/unit/m2/sanitizer.test.ts
- tests/unit/m2/tmdb.test.ts
- tests/unit/m2/isolator.test.ts

Tasks to execute:
1. Implement `server/metadata/sanitizer.ts`:
   - Follow the 8-stage pipeline from sanitizer_spec.md: extension stripping with lookahead, TV episode extraction (SxxExx, 1x02, etc.), 4-digit year extraction (1900-2099) with non-consuming lookahead (preserving numbers in titles like Blade Runner 2049), classified noise dictionary stripping, delimiter translation & compound hyphen preservation (Spider-Man), bracket/group pruning (-SPARKS), Spanish diacritics preservation (NFC normalization, preserving á, é, í, ó, ú, ñ, ü), whitespace collapse.
   - Export sanitizeMediaFilename().
2. Implement `server/metadata/tmdb.ts`:
   - Follow tmdb_spec.md: Spanish TMDB v3 API (language=es-ES) for movies and series, single-roundtrip append_to_response=credits (director, top 5 cast, overview, poster w500, backdrop w1280, rating, genres), 4-stage search fallback.
   - 2-tier caching: in-memory LRU (1000 items) + persistent file cache (cache/tmdb_cache.json with 30-day TTL, atomic .tmp write, 500ms debounce), signaling cached: true on repeat queries.
   - Concurrency throttling (max 4 concurrent, 100ms pause) and inFlightPromises deduplication.
   - Offline & mock fallback: use mock TMDB records when TMDB_API_KEY is unset or network fails, returning 200 with clean defaults without throwing exceptions or 500 errors.
   - Export tmdbClient and TMDBService.
3. Implement `server/metadata/isolator.ts`:
   - Follow isolator_routes_spec.md: multi-vector family content detection (category, folder name, keywords 'familia' or 'home video'), assertFamilyIsolation() throwing IsolationBarrierError (HTTP 403, message containing 'Isolation Barrier').
   - Native Google Drive metadata synthesis: formatFamilyCleanTitle() (Title Case), formatSpanishDate() ('15 de octubre de 2021'), formatFamilyDuration() ('MM:SS'), getResolutionBadge() (4K, 1080p, 720p), upgradeThumbnailToHD() (=s800).
   - Export isolator predicates, error classes, and synthesizeFamilyMetadata().
4. Implement `server/routes/metadata.ts` and integrate with Express:
   - Expose `GET /api/metadata/clean-title?filename=...` returning { cleanTitle, year, isSeries, season, episode }.
   - Expose `GET /api/metadata/enrich?title=...&year=...&category=...`:
     - If isFamilyContent() is true, immediately return HTTP 403 with error containing 'Isolation Barrier'.
     - Otherwise, query tmdbClient.enrich() and return enriched metadata with cached indicator.
   - Mount metadataRouter in `server/index.ts` under `/api/metadata`.
   - Update `server/routes/drive.ts` in `GET /api/drive/files/:category`:
     - If category is 'familiares', map items through synthesizeFamilyMetadata(), setting tmdbEnriched: false and undefined commercial fields.
     - If category is 'peliculas' or 'series', enrich items with tmdbClient and set tmdbEnriched: true.
     - If category is 'fotos' or 'musica', apply native Drive metadata.
5. Create unit test suites in `tests/unit/m2/`:
   - `tests/unit/m2/sanitizer.test.ts`: test 8 stages, series, lookahead year (Blade Runner 2049, 1917, 2001), noise tags, Spanish diacritics, ReDoS safety.
   - `tests/unit/m2/tmdb.test.ts`: test 4-stage fallback, caching (cached: true), in-flight deduplication, throttler, offline fallback.
   - `tests/unit/m2/isolator.test.ts`: test 403 rejection on family queries, Title Case formatting, Spanish dates, duration, =s800 thumbnails, zero TMDB invocations.
6. Build and Test:
   - Run `npm run build` (tsc) and ensure exit code 0.
   - Run unit tests: `npm run test:unit`.
   - Run full E2E test suite: `node tests/run-e2e.js`. Verify all 207 tests pass (100% PASS)!
7. Output:
   - Write your implementation report to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\worker_m2_1\implementation_report.md.
   - Write handoff.md in your working directory documenting all commands and test outputs.
   - Send completion message to parent.
