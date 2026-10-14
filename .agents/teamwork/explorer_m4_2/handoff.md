# Handoff Report: Serverless Cloud Deployment Architecture (Milestone M4)

## 1. Observation
1. **Express App Structure (`server/index.ts`)**:
   - Lines 10-21: Exports `app` with global CORS middleware configuring allowed methods `['GET', 'HEAD', 'POST', 'OPTIONS']` and exposed headers `['Content-Range', 'Content-Length', 'Accept-Ranges']`.
   - Lines 46-51: Mounts subrouters under `/api`: `healthRouter`, `driveRouter`, `streamRouter`, `subtitlesRouter`, `metadataRouter`.
   - Lines 75-84: Global error handling middleware `app.use((err, _req, res, _next) => ...)`.
   - Lines 86-92: Listens conditionally on `require.main === module && process.env.NODE_ENV !== 'test'`; exports `default app`.
   - **Gap**: Lacks a 404 fallback middleware before line 75, causing unmatched requests like `/api/unsupported_route_xyz` to return Express's default HTML page rather than structured JSON.
2. **Streaming Caching & Headers (`server/routes/stream.ts` & `server/proxy/streamer.ts`)**:
   - `stream.ts` lines 48 & 84, and `streamer.ts` lines 93 & 146 explicitly set `'Cache-Control': 'public, max-age=3600, no-transform'`, `'Accept-Ranges': 'bytes'`, and `Content-Range`.
   - Streaming is strictly partitioned into 8MB bounded chunks (`DEFAULT_MAX_CHUNK_SIZE` in `rangeParser.ts`).
3. **Subtitles Caching & MIME (`server/routes/subtitles.ts`)**:
   - Lines 74 & 96 set `'Cache-Control': 'public, max-age=86400'` and `'Content-Type': 'text/vtt; charset=utf-8'`.
4. **Vite Frontend Output (`client/vite.config.ts`)**:
   - Line 59 configures `outDir: path.resolve(__dirname, '../dist/client')`.
   - `dist/client/` contains `index.html` and transpiled Chromium M56 legacy bundles.
5. **E2E Test Oracle Contracts**:
   - `f17-serverless-cloud-deployment.test.js`: tests F17-01 (OPTIONS preflight 200/204), F17-02 (Expose headers), F17-03 (/api/health < 1000ms), F17-04 (Range 206 stream cache 3600 no-transform), F17-05 (subtitles cache 86400).
   - `f17-deployment-boundaries.test.js`: tests F17-B01 to F17-B05, including F17-B03 (`GET /api/unsupported_route_xyz` must return 404 with `res.json.error`) and F17-B04 (`Access-Control-Allow-Origin: *` preserved on both success and 404 errors).
6. **TypeScript Configuration (`tsconfig.json`)**:
   - Line 15: `"include": ["server/**/*", "tests/unit/m1/**/*"]`. Excludes `api/` by default unless updated to `"include": ["server/**/*", "api/**/*", "tests/unit/**/*"]`.
7. **Existing Unit Tests**:
   - `package.json` line 15: `"test:unit": "tsx --test tests/unit/**/*.test.ts"` discovers tests in `tests/unit/`.

---

## 2. Logic Chain
1. *From Observation 1 & 4*: Vercel provides static file hosting at the edge and on-demand serverless function execution. Configuring `"outputDirectory": "dist/client"` in `vercel.json` allows Vercel edge to serve static legacy M56 assets (`dist/client/index.html` and `dist/client/assets/*`) without triggering cold starts or lambda compute overhead.
2. *From Observation 1 & 5*: To route `/api/*` requests to serverless compute, `vercel.json` must configure `"rewrites": [{ "source": "/api/(.*)", "destination": "/api/index" }]`. Creating `api/index.ts` that exports `app` allows `@vercel/node` runtime to execute the Express application for all `/api/*` endpoints.
3. *From Observation 2, 3, & 5*: Both Vercel edge gateway (`vercel.json` headers) and Express proxy must emit identical headers:
   - Wildcard CORS (`Access-Control-Allow-Origin: *`).
   - Exposed headers (`Content-Range, Content-Length, Accept-Ranges`).
   - Video chunk caching (`Cache-Control: public, max-age=3600, no-transform`).
   - Subtitle caching (`Cache-Control: public, max-age=86400`).
4. *From Observation 1 & 5 (F17-B03)*: If `/api/unsupported_route_xyz` is requested, without an explicit JSON 404 middleware in Express, HTML is returned, causing `Assert.ok(res.json.error)` to fail. Adding `app.use((req, res) => res.status(404).json({ error: ... }))` before the global error handler ensures valid JSON error responses while CORS middleware preserves `Access-Control-Allow-Origin: *`.
5. *From Observation 2*: Because `rangeParser.ts` limits chunks to 8MB, requests take < 1.5s, completely avoiding serverless execution timeouts (10s limit) and AWS Lambda payload size limits (4.5MB unbuffered or streaming).
6. *From Observation 6 & 7*: Creating `tests/unit/m4/serverless.test.ts` and `tests/unit/m4/packaging.test.ts` and updating `tsconfig.json` ensures full Milestone M4 unit test coverage executed automatically by `npm run test:unit`.

---

## 3. Caveats
1. **Serverless Ephemeral Disk State**:
   - In serverless environments (Vercel Lambdas), local disk writes are restricted to `/tmp`. Persistent disk caching (`cache/tmdb_cache.json`) will be ephemeral per instance. In-memory caching (`MemoryCache`) remains active for warm container instances.
2. **Cloudflare Runtime Differences**:
   - Cloudflare Workers use V8 isolates rather than full Node.js. For Cloudflare, `nodejs_compat` in `wrangler.toml` or Cloudflare Pages Functions (`functions/api/[[catchall]].ts`) provides the necessary compatibility bridge.
3. **Packaging Scope Boundary**:
   - While this agent (explorer_m4_2) provides the design and test suite for `tests/unit/m4/packaging.test.ts` (F18), peer agent `explorer_m4_1` is concurrently investigating native `.wgt` ZIP generation (`tizen/build-wgt.js`) and `tizen/icon.png`.

---

## 4. Conclusion
Milestone M4 Serverless Cloud Deployment is architecturally sound and ready for immediate implementation by the Worker:
1. `vercel.json` dual routing configuration cleanly bridges static legacy M56 assets with serverless API execution.
2. `api/index.ts` provides a clean 4-line serverless entry point exporting Express `app`.
3. Express requires a 404 JSON fallback middleware in `server/index.ts` to pass F17-B03.
4. Comprehensive unit test suites `tests/unit/m4/serverless.test.ts` (12 tests) and `tests/unit/m4/packaging.test.ts` (11 tests) are fully designed and ready to be committed to `tests/unit/m4/`.

---

## 5. Verification Method

### 5.1 Verification Commands
The Worker can verify the implementation by running:
```powershell
# 1. Compile TypeScript (checks tsconfig.json and api/index.ts)
npm run build

# 2. Build Chromium M56 legacy frontend
npm run build:client

# 3. Run Milestone M4 Unit Tests
npx tsx --test tests/unit/m4/serverless.test.ts tests/unit/m4/packaging.test.ts

# 4. Run Full Unit Test Battery
npm run test:unit

# 5. Run E2E Test Suite for Feature F17
node tests/run-e2e.js --feature=F17
```

### 5.2 Files to Inspect
- `vercel.json` (root): Valid JSON, outputDirectory `dist/client`, rewrites to `/api/index`, headers configured.
- `api/index.ts` (root): Exports Express app.
- `server/index.ts`: 404 JSON fallback middleware installed before error handler.
- `tests/unit/m4/serverless.test.ts`: 12 passing unit tests.
- `tests/unit/m4/packaging.test.ts`: 11 passing unit tests.

### 5.3 Invalidation Conditions
- Any route under `/api/*` returning HTML instead of JSON on 404.
- Stream chunks lacking `no-transform` in `Cache-Control`.
- Subtitle routes lacking `public, max-age=86400`.
- Vercel rewrite redirecting static assets or stripping URL paths.
