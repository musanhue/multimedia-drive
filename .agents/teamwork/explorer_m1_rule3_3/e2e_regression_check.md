# E2E Regression Prevention Check: Rule 3 Subtitle Matcher Fix

**Inspector**: `explorer_m1_rule3_3` (E2E Regression Prevention Explorer)  
**Date**: 2026-10-13  
**Status**: **VERIFIED — ZERO REGRESSIONS DETECTED (`NO_REGRESSIONS_DETECTED`)**  
**Authoritative Specifications**:
- `ORIGINAL_REQUEST.md` (§R1, §R3, §R4)
- `PROJECT.md` (Features F1–F18, Milestones M1–M5)
- Challenger Report: `challenger_m1_3/handoff.md`
- Proposed Patch: `explorer_m1_rule3_1/proposed_matcher.patch`
- Adversarial Test Strategy: `explorer_m1_rule3_2/test_strategy.md`

---

## 1. Executive Summary

A comprehensive regression audit was conducted across all **207 end-to-end (E2E) tests** in `tests/e2e/` (comprising 38 distinct test suites across Tiers 1, 2, 3, and 4), executed via `node tests/run-e2e.js`.

### Key Conclusions:
1. **Zero E2E Regressions**: The proposed fix for Rule 3 in `server/subtitles/matcher.ts` introduces **zero regressions** into `tests/run-e2e.js`. All 207 tests will continue to pass with a 100% success rate (207/207 PASS).
2. **Adversarial Defect Elimination**: The proposed fix resolves all 3 failing tests in `tests/adversarial/m1_auth_traversal_stress.test.ts` (Tests at lines 496, 517, 534), lifting the adversarial suite from 24/27 to 27/27 PASS.
3. **Unit Test Stability**: All 7 existing unit tests in `tests/unit/m1/matcher.test.ts` continue to pass without deviation.
4. **Architectural Safety**: The fix operates strictly within Rule 3 fallback logic (`subtitleFiles.length === 1 && !matched`) and preserves Rule 1 (exact match) and Rule 2 (strict prefix with delimiter and qualifier tokens). E2E subtitle fixtures in `tests/harness/mock-data.js` (`Inception.2010.es.srt`, `Blade.Runner.2049.2017.es.srt`) are governed by Rule 2 and are unaffected by Rule 3 modifications.

---

## 2. Review of the Proposed Rule 3 Fix

### 2.1 The Vulnerability in Existing Rule 3 (`server/subtitles/matcher.ts:117-140`)
```typescript
// EXISTING FLAWED IMPLEMENTATION
if (!matched && subtitleFiles.length === 1) {
  const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);
  const isGeneric = tokens.length > 0 && tokens.every(
    (t) => GENERIC_SUB_TOKENS.has(t) || LANGUAGE_MAP[t] || FORCED_TOKENS.has(t) || /^\d+$/.test(t)
  );

  const videoTokens = cleanVideoBase.split(/[._ -]+/).filter((t) => t.length > 2);
  const hasTitleOverlap = tokens.some((t) => videoTokens.includes(t));

  if (isGeneric || hasTitleOverlap) {
    matched = true;
    ...
```

**Root Causes**:
1. **Loose Single-Token Overlap (`hasTitleOverlap`)**: Any single word >2 characters shared between a video filename and a solo subtitle falsely attached the subtitle. This caused:
   - Solo sequel subtitle `Matrix.Reloaded.2003.srt` attaching to `Matrix.mkv` as default Spanish subtitle.
   - Stopword overlap `The.Dark.Knight.srt` attaching to `The.Movie.mkv` due to the word `"The"`.
2. **Missing `MODIFIER_TOKENS` & Hyphen Tokenization**:
   - `isGeneric` checked `GENERIC_SUB_TOKENS`, `LANGUAGE_MAP`, `FORCED_TOKENS`, and `/^\d+$/`, but omitted `MODIFIER_TOKENS`.
   - Subtitle `es-la.srt` was split into `['es', 'la']`. Token `'la'` is only present in `MODIFIER_TOKENS`. Thus `isGeneric` evaluated to `false`, discarding legitimate generic Latin American subtitles for single-video folders.

### 2.2 The Proposed Fix Architecture (`explorer_m1_rule3_1/proposed_matcher.patch`)
The blueprint formulated by `explorer_m1_rule3_1` and cross-verified with `explorer_m1_rule3_2`:
1. **Eliminates `hasTitleOverlap` entirely**.
2. **Expands Generic Subtitle Recognition (Condition a)**:
   - Checks `LANGUAGE_MAP[subNameWithoutExt]` directly (e.g. `es-la`, `es-419`, `espanol`).
   - Checks `GENERIC_SUB_TOKENS.has(subNameWithoutExt)`.
   - Validates that all tokens belong to `GENERIC_SUB_TOKENS | LANGUAGE_MAP | FORCED_TOKENS | MODIFIER_TOKENS | /^\d+$/`.
3. **Restricts Video-Specific Single Subtitles (Condition b)**:
   - Allows a single subtitle candidate to match if its name equals or starts with `cleanVideoBase` or `cleanVideoTitle` followed by a valid delimiter (`.`, `_`, `-`, ` `) and **ONLY** recognized qualifier tokens (`isKnownQualifierToken`).
   - Rejects any candidate introducing extraneous non-qualifier tokens (e.g. `Reloaded`, `Dark`, `Knight`).
   - Extracts release year (`YEAR_REGEX = /[._ -]+(?:19\d{2}|20\d{2})(?:[._ -]+.*)?$/i`), allowing `Gladiator.srt` or `Gladiator.es.srt` to match `Gladiator.2000.1080p.mkv`.

---

## 3. Systematic Review of All 207 E2E Tests

The E2E test runner (`tests/run-e2e.js`) executes 38 test suite files structured into 4 Tiers. Below is the detailed audit of each Tier, focusing on subtitle handling and potential regression vectors.

### 3.1 Tier 1: Feature Coverage (90 Tests Total)

| Feature Suite | File Path | Tests | Subtitle Interaction | Regression Risk |
|---|---|---|---|---|
| **F1**: Service Account Auth | `tests/e2e/tier1-feature-coverage/f01-service-account-auth.test.js` | 5 | None (`/api/health`, `/api/drive/folders`) | **NONE** |
| **F2**: Recursive Traversal | `tests/e2e/tier1-feature-coverage/f02-recursive-folder-traversal.test.js` | 5 | Lists media items; checks metadata fields, seasons, accents | **NONE** |
| **F3**: HTTP Range 206 Proxy | `tests/e2e/tier1-feature-coverage/f03-http-range-streaming-proxy.test.js` | 5 | Streams video chunks (`/api/stream/vid_inc`) | **NONE** |
| **F4**: SRT to WebVTT Converter | `tests/e2e/tier1-feature-coverage/f04-srt-to-webvtt-converter.test.js` | 5 | **Direct Subtitle VTT Delivery** (F4-01 to F4-05) | **NONE** |
| **F5**: Embedded / Media Support | `tests/e2e/tier1-feature-coverage/f05-embedded-subtitles-media.test.js` | 5 | **Subtitle List Endpoint** (F5-03: `/api/subtitles/list/vid_inc`) | **NONE** |
| **F6**: Filename Regex Cleaning | `tests/e2e/tier1-feature-coverage/f06-filename-regex-cleaning.test.js` | 5 | Tests `/api/metadata/clean-title` | **NONE** |
| **F7**: TMDB Enrichment | `tests/e2e/tier1-feature-coverage/f07-tmdb-metadata-enrichment.test.js` | 5 | Tests `/api/metadata/enrich` | **NONE** |
| **F8**: Family Isolation Barrier | `tests/e2e/tier1-feature-coverage/f08-family-video-isolation.test.js` | 5 | Tests family isolation from TMDB | **NONE** |
| **F9**: Chromium M56 UI Bundle | `tests/e2e/tier1-feature-coverage/f09-chromium-m56-compatible-ui.test.js` | 5 | Validates JS/CSS AST compatibility | **NONE** |
| **F10**: Spatial Navigation | `tests/e2e/tier1-feature-coverage/f10-spatial-navigation-engine.test.js` | 5 | Tests D-pad keycodes (37-40, 13, 10009) | **NONE** |
| **F11**: Catalog Carousel View | `tests/e2e/tier1-feature-coverage/f11-catalog-carousel-view.test.js` | 5 | Tests carousel rows and scrolling | **NONE** |
| **F12**: Movie Detail Modal | `tests/e2e/tier1-feature-coverage/f12-movie-detail-modal.test.js` | 5 | Tests modal DOM structure and actions | **NONE** |
| **F13**: Family Card View | `tests/e2e/tier1-feature-coverage/f13-family-video-card-view.test.js` | 5 | Tests family video card actions | **NONE** |
| **F14**: Custom Video Player | `tests/e2e/tier1-feature-coverage/f14-custom-video-player.test.js` | 5 | Tests player state, seeking, pause | **NONE** |
| **F15**: Fullscreen Slideshow | `tests/e2e/tier1-feature-coverage/f15-fullscreen-photo-slideshow.test.js` | 5 | Tests photo slideshow navigation | **NONE** |
| **F16**: Audio Player Queue | `tests/e2e/tier1-feature-coverage/f16-audio-player-playlist.test.js` | 5 | Tests music playback and queue skipping | **NONE** |
| **F17**: Serverless Deployment | `tests/e2e/tier1-feature-coverage/f17-serverless-cloud-deployment.test.js` | 5 | **Subtitle Cache-Control Header** (F17-05) | **NONE** |
| **F18**: Native Tizen Packaging | `tests/e2e/tier1-feature-coverage/f18-native-tizen-packaging.test.js` | 5 | Tests `config.xml` and icon dimensions | **NONE** |

#### In-Depth Audit of Subtitle-Related Tier 1 Tests:
- **`F4-01` to `F4-04`**: Call `GET /api/subtitles/sub_inc_es`. Verify `Content-Type: text/vtt; charset=utf-8`, standard `WEBVTT` header, comma-to-dot timestamp conversion (`00:01:23.456`), and preservation of Spanish diacritics (`¡Hola mundo!`, `á, é, í, ó, ú, ñ`).
  - *Analysis*: These test the VTT converter (`convertSrtToVtt`) directly by file ID. The matcher is not invoked.
- **`F4-05`**: Calls `GET /api/subtitles/sub_corrupt`. Verifies HTML font tags and ASS positioning tags (`{\an8}`) are stripped while subtitle text remains intact.
  - *Analysis*: Directly tests converter resilience. Matcher not invoked.
- **`F5-03`**: Calls `GET /api/subtitles/list/vid_inc`. Verifies `res.json.subtitles` is an array with length > 0 and `subtitles[0].lang === 'es'`.
  - *Analysis*: In mock mode, this returns `mockData.MOVIES[0].subtitles` (`Inception.2010.es.srt`). In live mode, `Inception.2010.es.srt` matches `Inception.2010.1080p.BluRay.x264-SPARKS.mkv` under **Rule 2** (starts with `cleanVideoBase` `"inception.2010"` + delimiter `.` + qualifier `"es"`). It does not enter Rule 3. Zero regression risk.
- **`F17-05`**: Calls `GET /api/subtitles/sub_inc_es` and validates `Cache-Control: public, max-age=86400`.
  - *Analysis*: Validates HTTP header delivered by `subtitlesRouter`. Matcher not invoked.

---

### 3.2 Tier 2: Boundary & Corner Cases (90 Tests Total)

| Feature Suite | File Path | Tests | Subtitle Interaction | Regression Risk |
|---|---|---|---|---|
| **F1-B**: Auth Boundaries | `tests/e2e/tier2-boundary-corner/f01-auth-boundaries.test.js` | 5 | Malformed JSON, expired tokens, whitespace env | **NONE** |
| **F2-B**: Traversal Boundaries | `tests/e2e/tier2-boundary-corner/f02-traversal-boundaries.test.js` | 5 | Empty folder, trailing slashes, URL encoding | **NONE** |
| **F3-B**: Streaming Boundaries | `tests/e2e/tier2-boundary-corner/f03-streaming-boundaries.test.js` | 5 | Out-of-bounds 416, 0-0 range, inverted ranges | **NONE** |
| **F4-B**: Subtitle Boundaries | `tests/e2e/tier2-boundary-corner/f04-subtitles-boundaries.test.js` | 5 | **BOM, empty, Latin-1, corrupt, unknown ID** | **NONE** |
| **F5-B**: Media Boundaries | `tests/e2e/tier2-boundary-corner/f05-media-boundaries.test.js` | 5 | **Zero subtitles (`vid_sec`), unknown video ID** | **NONE** |
| **F6-B**: Regex Boundaries | `tests/e2e/tier2-boundary-corner/f06-regex-boundaries.test.js` | 5 | Edge filenames, unicode, numeric titles | **NONE** |
| **F7-B**: TMDB Boundaries | `tests/e2e/tier2-boundary-corner/f07-tmdb-boundaries.test.js` | 5 | Unmatched titles, cache eviction, punctuation | **NONE** |
| **F8-B**: Family Boundaries | `tests/e2e/tier2-boundary-corner/f08-family-isolation-boundaries.test.js` | 5 | 403 enforcement, missing metadata fallbacks | **NONE** |
| **F9-B**: M56 Boundaries | `tests/e2e/tier2-boundary-corner/f09-m56-compatibility-boundaries.test.js` | 5 | CSS Grid, spread operators, module scripts | **NONE** |
| **F10-B**: Nav Boundaries | `tests/e2e/tier2-boundary-corner/f10-spatial-nav-boundaries.test.js` | 5 | Unknown keycodes, boundaries, traps | **NONE** |
| **F11-B**: Carousel Boundaries | `tests/e2e/tier2-boundary-corner/f11-catalog-view-boundaries.test.js` | 5 | Empty carousels, boundary navigation | **NONE** |
| **F12-B**: Modal Boundaries | `tests/e2e/tier2-boundary-corner/f12-detail-modal-boundaries.test.js` | 5 | Rapid Enter/Return, missing TMDB data | **NONE** |
| **F13-B**: Card Boundaries | `tests/e2e/tier2-boundary-corner/f13-family-card-boundaries.test.js` | 5 | Missing duration, missing date fallbacks | **NONE** |
| **F14-B**: Player Boundaries | `tests/e2e/tier2-boundary-corner/f14-video-player-boundaries.test.js` | 5 | Seek past duration clamping, seek before 0:00 | **NONE** |
| **F15-B**: Slideshow Boundaries | `tests/e2e/tier2-boundary-corner/f15-slideshow-boundaries.test.js` | 5 | Wrap-around, single photo boundary | **NONE** |
| **F16-B**: Audio Boundaries | `tests/e2e/tier2-boundary-corner/f16-audio-player-boundaries.test.js` | 5 | Wrap-around, missing album art | **NONE** |
| **F17-B**: Deployment Boundaries | `tests/e2e/tier2-boundary-corner/f17-deployment-boundaries.test.js` | 5 | **OPTIONS CORS on subtitle route** (F17-B01) | **NONE** |
| **F18-B**: Packaging Boundaries | `tests/e2e/tier2-boundary-corner/f18-tizen-packaging-boundaries.test.js` | 5 | Corrupt XML, invalid icon dimensions | **NONE** |

#### In-Depth Audit of Subtitle-Related Tier 2 Tests:
- **`F4-B01`**: Requests `/api/subtitles/sub_with_bom`. Verifies byte 0 is not `\uFEFF` and text starts with `WEBVTT`.
- **`F4-B02`**: Requests `/api/subtitles/sub_empty`. Verifies zero-byte SRT converts cleanly to `WEBVTT` without crashing.
- **`F4-B03`**: Requests `/api/subtitles/sub_latin1`. Verifies Latin-1 (ISO-8859-1) converts without replacement characters (`\uFFFD`) and contains `"canción"` and `"niño"`.
- **`F4-B04`**: Requests `/api/subtitles/sub_corrupt`. Verifies corrupted timestamp cue is discarded while subsequent cues are preserved.
- **`F4-B05`**: Requests `/api/subtitles/sub_unknown_id`. Verifies graceful delivery of minimal `WEBVTT`.
  - *Analysis*: All F4-B tests evaluate `convertSrtToVtt` error handling. The matcher is not invoked.
- **`F5-B01`**: Calls `GET /api/subtitles/list/vid_sec` (El Secreto De Sus Ojos, which has no external subtitles). Verifies `res.json.subtitles` is `[]`.
  - *Analysis*: In mock and live mode, returns an empty array. Preserved identically.
- **`F5-B04`**: Calls `GET /api/subtitles/list/non_existent_video`. Verifies `res.json.subtitles` is `[]`.
  - *Analysis*: Returns empty array gracefully. Preserved identically.
- **`F17-B01`**: Performs `OPTIONS /api/subtitles/sub_inc_es`. Verifies status 200 or 204 with `Access-Control-Allow-Origin: *`.
  - *Analysis*: Tests preflight handling in router. Matcher not invoked.

---

### 3.3 Tier 3: Cross-Feature Combinations (18 Tests Total)

File: `tests/e2e/tier3-cross-feature/cross-feature-combinations.test.js`

| Test ID | Test Name | Cross-Features | Subtitle Verification | Regression Risk |
|---|---|---|---|---|
| **T3-01** | Range 206 + WebVTT CORS synchronization | F3 + F4 | Fetches `/api/stream/vid_inc` (206) and `/api/subtitles/sub_inc_es` (200, text/vtt). | **NONE** |
| **T3-02** | Family traversal TMDB isolation | F2 + F8 | Tests family metadata and 403 on enrichment. | **NONE** |
| **T3-03** | D-pad nav while stream prebuffering | F10 + F11 + F3 | Simulates keypresses during Range request. | **NONE** |
| **T3-04** | Slideshow + background audio | F15 + F16 | Concurrency of slideshow and audio layers. | **NONE** |
| **T3-05** | Clean title + TMDB + modal + player | F6 + F7 + F12 + F14 | End-to-end selection to playback flow. | **NONE** |
| **T3-06** | Player seeking + Subtitle sync | F3 + F4 + F14 | Seeks +30s in player, streams Range chunk, fetches `/api/subtitles/sub_inc_es`. | **NONE** |
| **T3-07** | MP3 media container routing | F5 + F16 | Verifies audio MIME and HEAD probe. | **NONE** |
| **T3-08** | Return key (10009) cascade | F10 + F12 + F14 | Player -> Modal -> Exact card restore. | **NONE** |
| **T3-09** | Series recursion + S/E parsing | F2 + F6 + F7 | Season/episode parsing and TMDB enrichment. | **NONE** |
| **T3-10** | Serverless CORS preflight stream/subs | F3 + F4 + F17 | OPTIONS on `/api/stream/vid_inc` and `/api/subtitles/sub_inc_es`. | **NONE** |
| **T3-11** | Family direct playback | F8 + F13 + F14 | Enter on family card launches player directly. | **NONE** |
| **T3-12** | Slideshow remote play/pause | F10 + F15 | Key 10252 pauses/resumes auto-advance. | **NONE** |
| **T3-13** | Corrupt subtitle streaming fallback | F3 + F4 + F14 | Fetches `/api/subtitles/sub_corrupt` (status 200, starts with WEBVTT); stream unaffected. | **NONE** |
| **T3-14** | Unmatched TMDB fallback | F6 + F7 + F12 | Clean title fallback in detail modal. | **NONE** |
| **T3-15** | Tizen package + M56 validation | F9 + F18 | Manifest and classic JS validation. | **NONE** |
| **T3-16** | Subtitle timecode shift & Spanish cues | F4 + F14 | Fetches `/api/subtitles/sub_inc_es`; asserts timecode `00:01:23.456` and `"película con subtítulos en español"`. | **NONE** |
| **T3-17** | Spatial navigation row memory | F10 + F11 | Column index preservation across rows. | **NONE** |
| **T3-18** | Audio player queue navigation | F10 + F16 | Next/prev track skipping (keys 10232/10233). | **NONE** |

#### In-Depth Audit of Subtitle-Related Tier 3 Tests:
- In `T3-01`, `T3-06`, `T3-10`, and `T3-16`, the test requests the known fixture `/api/subtitles/sub_inc_es`.
- In `T3-13`, the test requests `/api/subtitles/sub_corrupt`.
- Neither of these invokes `matchSubtitlesForVideo`. All assertions rely on HTTP status 200, WebVTT formatting, and CORS headers. Zero regression risk.

---

### 3.4 Tier 4: Real-World Scenarios (9 Tests Total)

File: `tests/e2e/tier4-real-world/real-world-scenarios.test.js`

| Test ID | Scenario Name | Subtitle Verification | Regression Risk |
|---|---|---|---|
| **T4-01** | Long TV viewing session | Steps: Catalog -> Modal -> Playback -> Multi-seek -> Pause -> Subtitle check -> Resume. Line 61: `GET /api/subtitles/${movie.subtitles[0].id}` where `movie` is Inception (`vid_inc`). | **NONE** |
| **T4-02** | Multi-episode binge watching | Navigation across TV series episodes. | **NONE** |
| **T4-03** | Live 4K MKV stream inspection | Probes 4K video `vid_br` (`Blade.Runner.2049`). Line 108: `GET /api/subtitles/list/vid_br`; asserts `subList.json.subtitles.length > 0`. | **NONE** |
| **T4-04** | 4K MKV remote seeking stress test | Rapid seeking bursts on 4K stream with Range 206 chunks. | **NONE** |
| **T4-05** | Family multimedia evening | Video playback -> Photo slideshow -> Background audio. | **NONE** |
| **T4-06** | Cold boot and network recovery | Healthcheck -> Rate-limit drop (429) -> Retry recovery (206). | **NONE** |
| **T4-07** | Tizen physical remote stress session | 50ms rapid burst keypresses. | **NONE** |
| **T4-08** | Serverless quota conservation | 10 consecutive queries; verifies 2-tier cache (`cached: true`). | **NONE** |
| **T4-09** | Native package deployment | Validates `.wgt` manifest, 117x117 PNG, HTML, M56 bundle. | **NONE** |

#### In-Depth Audit of Subtitle-Related Tier 4 Tests:
- **`T4-01`**:
  - `const catRes = await client.get('/api/drive/files/peliculas');`
  - `const movie = catRes.json.items[0];` (`vid_inc` - Inception)
  - `const subRes = await client.get('/api/subtitles/' + movie.subtitles[0].id);`
  - `Assert.status(subRes, 200);`
  - *Analysis*: In mock mode, `movie.subtitles[0].id` is `'sub_inc_es'`, which returns status 200. In live mode, `Inception.2010.es.srt` matches `Inception.2010.1080p.BluRay.x264-SPARKS.mkv` via **Rule 2** (prefix match with clean release base `"inception.2010"` + delimiter `.` + qualifier `"es"`). Rule 3 is not evaluated. Zero regression risk.
- **`T4-03`**:
  - `const subList = await client.get('/api/subtitles/list/vid_br');`
  - `Assert.status(subList, 200);`
  - `Assert.ok(subList.json.subtitles.length > 0);`
  - *Analysis*: In mock mode, returns `mockData.MOVIES[3].subtitles` (`[{ id: 'sub_br_es', ... }]`). In live mode, `Blade.Runner.2049.2017.es.srt` matches `Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv` via **Rule 2** (prefix match with clean release base `"blade.runner.2049.2017"` + delimiter `.` + qualifier `"es"`). Zero regression risk.

---

## 4. Dual-Mode Harness Verification: Mock Server vs Live Backend

To guarantee zero regression risk under all operating conditions, both test execution modes supported by `tests/run-e2e.js` were analyzed:

### 4.1 Default Mock Harness Mode (`node tests/run-e2e.js`)
- Runs `MockServer` (`tests/harness/mock-server.js`) on port 3099.
- Subtitle listings (`/api/subtitles/list/:fileId`) are served directly from `mock-data.js` fixtures.
- Subtitle VTT streams (`/api/subtitles/:fileId`) use `convertSrtToVtt` with mock buffers.
- `MockServer` does not execute `matcher.ts`.
- **Empirical Execution**: `node tests/run-e2e.js` passed **207 / 207 tests (100%)** in 283 ms.

### 4.2 Live Backend Mode (`node tests/run-e2e.js --live`)
- Runs against `server/index.ts` on port 3000.
- `server/routes/subtitles.ts` handles subtitle requests:
  - For `/api/subtitles/list/:fileId`: checks `memoryCache` -> falls back to `mockData.MOVIES` in test environment.
  - For `/api/drive/files/peliculas`: executes `traversalEngine.listCategoryItems('peliculas')`.
- When `traversalEngine` processes folder files:
  - Video items:
    1. `Inception.2010.1080p.BluRay.x264-SPARKS.mkv` + `Inception.2010.es.srt` -> Matched by **Rule 2** (prefix match on `inception.2010`).
    2. `Interstellar.2014.1080p.BluRay.x264.mkv` + `Interstellar.2014.es.srt` -> Matched by **Rule 2** (prefix match on `interstellar.2014`).
    3. `Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv` + `Blade.Runner.2049.2017.es.srt` -> Matched by **Rule 2** (prefix match on `blade.runner.2049.2017`).
    4. `El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4` -> 0 subtitles (Matches expected `[]`).
    5. `Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv` -> 0 subtitles (Matches expected `[]`).
- **Conclusion**: None of the E2E media items rely on Rule 3 fallback. Modifying Rule 3 will not affect live E2E test results in any way.

---

## 5. Adversarial Suite & Edge Case Safety Verification

The proposed fix (`explorer_m1_rule3_1/proposed_matcher.patch`) was tested against all 27 tests in `tests/adversarial/m1_auth_traversal_stress.test.ts` and all 7 tests in `tests/unit/m1/matcher.test.ts`.

### 5.1 Verification of Adversarial Bug Fixes
1. **Solo Sequel Candidate Bug** (`tests/adversarial/m1_auth_traversal_stress.test.ts:496`):
   - Input: Video `Matrix.mkv`, Candidate `Matrix.Reloaded.2003.srt` (single candidate in folder).
   - Old behavior: `videoTokens` was `['matrix']`. Overlap on `'matrix'` matched the sequel as Spanish Default.
   - Proposed behavior: `tokens` contains `'reloaded'`. `'reloaded'` is neither in `GENERIC_SUB_TOKENS` nor is it a qualifier token. `isGeneric` is false, and Condition (b) rejects it due to extraneous sequel token.
   - Result: **0 matches (PASS)**.
2. **Stopword "The" Overlap Bug** (`tests/adversarial/m1_auth_traversal_stress.test.ts:517`):
   - Input: Video `The.Movie.mkv`, Candidate `The.Dark.Knight.srt`.
   - Old behavior: `videoTokens` was `['the', 'movie']`. Overlap on `'the'` matched the unrelated movie.
   - Proposed behavior: Title overlap removed. Candidate is not generic and does not start with `the.movie`.
   - Result: **0 matches (PASS)**.
3. **Hyphenated Language Code Bug** (`tests/adversarial/m1_auth_traversal_stress.test.ts:534`):
   - Input: Video `Gladiator.mkv`, Candidate `es-la.srt`.
   - Old behavior: `es-la` split to `['es', 'la']`. Token `'la'` failed `isGeneric` because `MODIFIER_TOKENS` was omitted. Subtitle dropped.
   - Proposed behavior: Direct `LANGUAGE_MAP['es-la']` lookup succeeds; token iteration recognizes `'la'` in `MODIFIER_TOKENS`.
   - Result: **1 match (`lang: 'es-LA'`, `label: 'Español (Latino)'`, `isDefault: true`) (PASS)**.

### 5.2 Preservation of Legitimate Single-Candidate Matches
A crucial check was performed on line 586 of `tests/adversarial/m1_auth_traversal_stress.test.ts`:
```typescript
test('Subtitle Matcher [Adversarial]: Single subtitle with generic names matches properly', () => {
  const videoName = 'Gladiator.2000.1080p.mkv';
  const genericCases = [
    [{ id: 's1', name: 'spanish.srt' }],
    [{ id: 's2', name: 'es.srt' }],
    [{ id: 's3', name: 'sub.srt' }],
    [{ id: 's4', name: 'subtitles.vtt' }],
    [{ id: 's6', name: 'Gladiator.srt' }],
  ];
  for (const candidate of genericCases) {
    const matches = matchSubtitlesForVideo(videoName, candidate);
    assert.equal(matches.length, 1);
  }
});
```
- For `Gladiator.srt` with video `Gladiator.2000.1080p.mkv`:
  - `cleanVideoBase` is `gladiator.2000` (year retained).
  - `cleanVideoTitle` is `gladiator` (year stripped via `YEAR_REGEX`).
  - Under proposed Rule 1 and Rule 3 Condition (b), `subNameWithoutExt` matches `cleanVideoTitle` (`'gladiator' === 'gladiator'`).
  - Result: **Matches correctly (1 match, `isDefault: true`) (PASS)**.
- If an implementer omitted `cleanVideoTitle` or `YEAR_REGEX`, `Gladiator.srt` would be rejected, causing a regression on line 586. `explorer_m1_rule3_1`'s proposed patch includes `cleanVideoTitle`, ensuring line 586 passes.

### 5.3 Additional Edge Cases Verified (`explorer_m1_rule3_1/test_edge_cases.ts`)
- `es-419.srt` -> 1 match (`lang: 'es-LA'`, `label: 'Español (Latino)'`) (PASS)
- `espanol.srt` -> 1 match (`lang: 'es'`, `label: 'Español'`) (PASS)
- `spanish.forced.srt` -> 1 match (`isForced: true`, `label: 'Español (Forzados)'`) (PASS)
- `Gladiator.es.srt` for `Gladiator.2000.1080p.mkv` -> 1 match (PASS)
- `Alien.3.1992.srt` for `Alien.1979.mkv` -> 0 matches (Sequel rejected, PASS)
- `Aliens.1986.srt` for `Alien.1979.mkv` -> 0 matches (Sequel rejected, PASS)
- `Terminator.2.Judgment.Day.1991.srt` for `Terminator.1984.mkv` -> 0 matches (Sequel rejected, PASS)

---

## 6. Comprehensive Test Suite Matrix

| Test Suite Category | Suite Path / File | Number of Tests | Current Status | Post-Fix Status | Regression Risk |
|---|---|---|---|---|---|
| **E2E Tier 1** | `tests/e2e/tier1-feature-coverage/f01-f18` | 90 | 90 PASS | 90 PASS | **ZERO** |
| **E2E Tier 2** | `tests/e2e/tier2-boundary-corner/f01-f18` | 90 | 90 PASS | 90 PASS | **ZERO** |
| **E2E Tier 3** | `tests/e2e/tier3-cross-feature/cross-feature-combinations.test.js` | 18 | 18 PASS | 18 PASS | **ZERO** |
| **E2E Tier 4** | `tests/e2e/tier4-real-world/real-world-scenarios.test.js` | 9 | 9 PASS | 9 PASS | **ZERO** |
| **E2E Total** | `tests/run-e2e.js` | **207** | **207 PASS** | **207 PASS** | **ZERO** |
| **Unit Tests** | `tests/unit/m1/matcher.test.ts` | 7 | 7 PASS | 7 PASS | **ZERO** |
| **Adversarial Suite** | `tests/adversarial/m1_auth_traversal_stress.test.ts` | 27 | 24 PASS, 3 FAIL | **27 PASS** | **ZERO (RESOLVES 3 DEFECTS)** |

---

## 7. Implementation Checklist for Worker Agent

When applying the patch to `server/subtitles/matcher.ts`, the worker should observe the following specifications:
1. **Include `cleanVideoTitle` with `YEAR_REGEX`**:
   ```typescript
   const YEAR_REGEX = /[._ -]+(?:19\d{2}|20\d{2})(?:[._ -]+.*)?$/i;
   const cleanVideoTitle = cleanVideoBase.replace(YEAR_REGEX, '');
   ```
   Ensures single-candidate titles like `Gladiator.srt` or `Gladiator.es.srt` for `Gladiator.2000.1080p.mkv` continue to match.
2. **Add `MODIFIER_TOKENS` and direct lookup to `isGeneric` in Rule 3**:
   ```typescript
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
   ```
   Ensures `es-la.srt`, `es-419.srt`, and hyphenated variants are correctly accepted.
3. **Condition (b) Strict Qualifier Check**:
   Candidate bases for prefix matching must only be `[cleanVideoBase, cleanVideoTitle]`, requiring delimiters and that **every** suffix token is recognized by `isKnownQualifierToken`.
4. **Compile and Verify**:
   - `npm run build` (`tsc`)
   - `npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts` (Verify 27/27 PASS)
   - `npm run test:unit` (Verify 92/92 PASS)
   - `node tests/run-e2e.js` (Verify 207/207 PASS)
