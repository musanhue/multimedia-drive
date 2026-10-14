# BRIEFING — 2026-10-13T11:49:00Z

## Mission
Analyze and design the exact technical specification for `server/metadata/tmdb.ts` with Spanish TMDB API v3, 2-tier caching, concurrency throttle, and offline fallback.

## 🔒 My Identity
- Archetype: explorer
- Roles: TMDB & 2-Tier Caching Explorer
- Working directory: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_2
- Original parent: a3fbfcdc-1b0f-4f67-9e44-0e15f1241a0c
- Milestone: M2 (Metadata & Media Intelligence)

## 🔒 Key Constraints
- Read-only investigation — do NOT modify application source code directly
- Design technical blueprint for `server/metadata/tmdb.ts`
- Spanish TMDB API v3 client (`language=es-ES`)
- 2-tier cache (LRU in-memory + file JSON `cache/tmdb_cache.json` with 30-day TTL)
- Concurrency throttler (max 4 concurrent, 100ms pacing)
- Graceful offline/mock fallback without crashing or throwing unhandled errors

## Current Parent
- Conversation ID: a3fbfcdc-1b0f-4f67-9e44-0e15f1241a0c
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `tests/e2e/tier1-feature-coverage/f07-tmdb-metadata-enrichment.test.js`
  - `tests/e2e/tier2-boundary-corner/f07-tmdb-boundaries.test.js`
  - `tests/e2e/tier1-feature-coverage/f08-family-video-isolation.test.js`
  - `tests/e2e/tier3-cross-feature/cross-feature-combinations.test.js`
  - `tests/e2e/tier4-real-world/real-world-scenarios.test.js`
  - `tests/harness/mock-data.js` & `tests/harness/mock-server.js`
  - `server/config.ts`, `server/drive/cache.ts`, `server/drive/types.ts`, `server/index.ts`
  - Peer explorer assignments (`explorer_m2_1` for sanitizer, `explorer_m2_3` for isolator & routes)
- **Key findings**:
  - TMDB v3 API search endpoints are distinct for movies (`/search/movie`, parameter `year`) and series (`/search/tv`, parameter `first_air_date_year`). Both must specify `language=es-ES` and `include_adult=false`.
  - Single-roundtrip detail optimization via `append_to_response=credits` fetches movie/series details, director, and top 5 cast simultaneously.
  - Multi-stage fallback resolves missing years, festival year mismatches (tested in `F7-B05`), and parenthetical alternate titles.
  - 2-Tier caching requires in-memory LRU + disk JSON `cache/tmdb_cache.json` with 30-day TTL and `cached: true` flag on repeat queries (`F7-05`, `T4-08`).
  - In-flight request deduplication prevents duplicate external TMDB calls during concurrent identical queries (`F7-B04`).
  - Throttler bounds external requests to max 4 concurrent with a 100ms pause to respect TMDB rate limits.
  - Graceful fallback returns clean title, year, placeholder poster, and rating 0 for unmatched or empty queries (`F7-B01`, `F7-B03`) without throwing 500 errors.
- **Unexplored areas**: None within the scope of `server/metadata/tmdb.ts`.

## Key Decisions Made
- Implemented `TwoTierCache` combining an in-memory `Map` (LRU ordering via deletion/re-insertion) and atomic disk persistence (`.tmp` write + atomic rename) with a 500ms debounce.
- Implemented `RequestThrottler` using a promise-based queue ensuring at most 4 simultaneous HTTP requests and 100ms pacing delay.
- In-flight promise map `inFlightPromises: Map<string, Promise<EnrichedMetadata>>` dedicated to eliminating cache stampedes.
- Designed 4-stage search fallback: (1) title + year, (2) title alone, (3) title stripped of parentheticals, (4) mock/offline fallback.
- Authored production-ready blueprint in `tmdb_spec.md` with complete TypeScript implementation and test suite.

## Artifact Index
- `.agents/teamwork/explorer_m2_2/DISPATCH.md` — Initial task assignment
- `.agents/teamwork/explorer_m2_2/BRIEFING.md` — Persistent working memory
- `.agents/teamwork/explorer_m2_2/progress.md` — Heartbeat and step tracking
- `.agents/teamwork/explorer_m2_2/tmdb_spec.md` — Authoritative technical blueprint
- `.agents/teamwork/explorer_m2_2/handoff.md` — 5-component handoff report
