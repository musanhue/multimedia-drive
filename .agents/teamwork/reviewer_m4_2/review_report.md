# Milestone M4 Quality & Adversarial Review Report: Serverless Cloud Deployment

**Milestone**: M4 (Dual Deployment & Native Tizen Packaging)  
**Component Reviewed**: Serverless Cloud Deployment (F17)  
**Reviewer**: `reviewer_m4_2` (Roles: Reviewer, Adversarial Critic)  
**Date**: 2026-10-13  
**Target Environment**: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56) & Cloud Browser Deployment  

---

# Part 1: Quality Review

## Review Summary

**Verdict**: **APPROVE**

Milestone M4 serverless cloud deployment artifacts have been thoroughly examined and independently validated. All requirements from `ORIGINAL_REQUEST.md §R4` and `PROJECT.md (Feature F17)` have been implemented to high technical quality, adhering to Vercel schema, Express middleware standards, Chromium M56 browser accessibility, and strict CORS/caching requirements. No integrity violations or regressions were identified.

---

## Findings

### Integrity Check: PASS
- **Hardcoded test fixtures in production code**: None found. Real Express middleware and real Vercel configuration files are utilized.
- **Dummy or facade implementations**: None. `api/index.ts` exports the full live Express application instance; `server/index.ts` contains real 404 fallback middleware and real CORS configuration.
- **Shortcut bypasses**: None. Dual routing cleanly separates static assets (`dist/client/`) and serverless API handlers (`/api/(.*)`).
- **Fabricated verification outputs**: None. All commands were run independently and verified directly.
- **Self-certifying work**: Independently reproduced all tests and ran custom adversarial edge-case probes against the live compiled bundle.

### [Minor] Informational Note 1: Redundant Dual-Layer Cache & CORS Headers
- **What**: CORS and Cache-Control headers are specified both at the Vercel Edge configuration level (`vercel.json`) and at the Express application level (`server/index.ts`, `server/proxy/streamer.ts`, `server/routes/subtitles.ts`).
- **Where**: `vercel.json` (lines 10–40) and `server/index.ts` (lines 14–21).
- **Assessment**: This is a positive best practice in dual-deployment architectures. When running in serverless cloud behind Vercel's edge network, the CDN applies the headers directly at the edge layer; when running in local development or custom standalone Node.js environments, Express applies them internally. Both layers are fully synchronized and produce consistent behavior.

---

## Verified Claims

1. **`vercel.json` Schema and Dual-Routing**:
   - `outputDirectory: "dist/client"` correctly exposes the compiled Chromium M56 frontend bundle as static assets.
   - `rewrites: [{ "source": "/api/(.*)", "destination": "/api/index" }]` routes all API requests to the serverless function.
   - Verified via: `npm run test:unit:m4` and direct file inspection. Status: **PASS**.

2. **Edge Headers & CORS Wildcard**:
   - `Access-Control-Allow-Origin: *` is enforced globally on all `/api/(.*)` routes.
   - `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges` exposed for streaming video and audio players.
   - Cache-Control set to `public, max-age=3600, no-transform` for `/api/stream/(.*)`.
   - Cache-Control set to `public, max-age=86400` for `/api/subtitles/(.*)`.
   - Verified via: `tests/unit/m4/serverless.test.ts` and `tests/e2e/tier1-feature-coverage/f17-serverless-cloud-deployment.test.js`. Status: **PASS**.

3. **Serverless Entrypoint `api/index.ts`**:
   - Directly imports and default-exports `app` from `../server/index`.
   - Compiles cleanly to `dist/api/index.js` via `tsc`.
   - Successfully boots and serves incoming requests via `serverlessApp.handle`. Status: **PASS**.

4. **404 JSON Fallback Middleware**:
   - Installed at lines 75–78 of `server/index.ts` prior to the global error handler.
   - Responds to undefined routes with HTTP status `404` and payload `{ error: 'Endpoint not found' }`.
   - Preserves `Access-Control-Allow-Origin: *` across all HTTP verbs (GET, POST, OPTIONS, DELETE). Status: **PASS**.

5. **Test Suite Execution**:
   - `npm run build`: Code 0.
   - `npm run test:unit:m4`: 18/18 PASS.
   - `npm run test:unit`: 176/176 PASS across 5 suites.
   - `node tests/run-e2e.js --feature=F17`: 10/10 PASS (Tiers 1 & 2).
   - `node tests/run-e2e.js`: 207/207 PASS across all 4 tiers.
   - `npx tsx --test tests/adversarial/**/*.test.ts`: 82/82 PASS. Status: **PASS**.

---

## Coverage Gaps
- None. Serverless configuration, entrypoints, routing rules, and HTTP status codes are covered by both unit tests and end-to-end tests.

## Unverified Items
- Physical deployment to a live Vercel cloud account (requires external user credentials and internet deployment; local verification via Vercel CLI schema rules and mock serverless runner is complete and verified).

---

# Part 2: Adversarial Review

## Challenge Summary

**Overall risk assessment**: **LOW**

---

## Challenges

### [Low] Challenge 1: Ephemeral Filesystem & TMDB Disk Cache on Serverless Functions
- **Assumption challenged**: Serverless instances have write access to local disk for persistent caching (`cache/tmdb_cache.json`).
- **Attack scenario**: On read-only serverless runtimes (such as AWS Lambda / Vercel Functions outside `/tmp`), attempting `fs.writeFileSync` to `./cache/tmdb_cache.json` would throw `EROFS: read-only file system`.
- **Blast radius**: If unhandled, the serverless function could crash with an unhandled exception on cache flush.
- **Mitigation verified**: Inspected `server/metadata/tmdb.ts` lines 270–272: `flushSync()` wraps disk writes in a `try...catch` block logging a warning without rethrowing. In-memory LRU caching serves active requests throughout the function container's warm lifecycle.

### [Low] Challenge 2: Serverless Function Timeout During Large Media Streaming
- **Assumption challenged**: Streaming a 2-hour 4K movie over a serverless function will exceed the platform's execution timeout (e.g. 10s–15s on Vercel free tier).
- **Attack scenario**: A client initiates a video stream without bounded chunking; the connection stays open until the movie finishes or the function is terminated with HTTP 504 Gateway Timeout.
- **Blast radius**: Playback halts mid-stream.
- **Mitigation verified**: The architecture uses HTTP Range 206 chunking with a maximum chunk size of 8MB (`DEFAULT_MAX_CHUNK_SIZE`). The TV client's HTML5 video player requests bounded byte segments sequentially. Each request completes in <1 second, well within serverless timeout ceilings.

### [Low] Challenge 3: HTTP Method Variations and CORS on 404 Endpoints
- **Assumption challenged**: Requests using non-GET methods (POST, PUT, DELETE, OPTIONS) to unhandled endpoints might bypass the 404 middleware or fail to include CORS headers.
- **Attack scenario**: A web browser preflights an invalid endpoint with OPTIONS, receiving 404 without CORS headers, causing a browser console CORS violation rather than an identifiable 404 response.
- **Blast radius**: Obscured client errors.
- **Mitigation verified**: Verified via live probe:
  - `OPTIONS /api/unsupported` returns HTTP 204 with `Access-Control-Allow-Origin: *` (handled by CORS middleware before reaching router).
  - `POST /api/unsupported` returns HTTP 404 with `Access-Control-Allow-Origin: *` and `{ error: 'Endpoint not found' }`.
  - `GET /api/unsupported` returns HTTP 404 with `Access-Control-Allow-Origin: *` and `{ error: 'Endpoint not found' }`.

---

## Stress Test Results

| Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| `GET /api/completely-unknown-route` | 404 JSON `{ error: 'Endpoint not found' }` + CORS `*` | Status 404, CORS `*`, JSON payload returned | PASS |
| `POST /api/random-post` with JSON body | 404 JSON `{ error: 'Endpoint not found' }` + CORS `*` | Status 404, CORS `*`, JSON payload returned | PASS |
| `OPTIONS /api/random-options` | 204 No Content + CORS `*` + Allow Methods | Status 204, CORS `*`, Methods `GET,HEAD,POST,OPTIONS` | PASS |
| `HEAD /api/stream/vid_inc` | 200 + Content-Length + Expose-Headers + Cache-Control | Status 200, Content-Length present, Expose-Headers present, Cache-Control `public, max-age=3600, no-transform` | PASS |
| `GET /api/stream/vid_inc` (`bytes=0-100`) | 206 Partial Content + Content-Range + Cache-Control | Status 206, Content-Range `bytes 0-100/...`, Cache-Control `public, max-age=3600, no-transform` | PASS |
| `GET /api/subtitles/sub_inc_es` | 200 WebVTT + Cache-Control `public, max-age=86400` | Status 200, WebVTT body, Cache-Control `public, max-age=86400` | PASS |
| 100 concurrent requests (health + 404) | All return valid status + CORS `*` | 100/100 requests returned CORS `*` within <100ms | PASS |

---

## Unchallenged Areas
- Direct network latencies under high physical geodistributed CDN load (out of scope for unit/E2E test suites).
