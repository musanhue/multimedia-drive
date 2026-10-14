## 2026-10-13T04:02:04Z
You are the Drive Proxy Backend Worker (`worker_m1_1`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\worker_m1_1
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md

Input blueprints to guide your implementation:
- c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_1\auth_traversal_blueprint.md
- c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_2\streaming_proxy_blueprint.md
- c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_3\subtitles_and_tests_blueprint.md

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You exclusively own:
- `package.json`, `tsconfig.json` (server package and TypeScript configuration)
- `server/` directory:
  - `server/config.ts` (environment variables, credential paths, ports)
  - `server/drive/auth.ts` (Google Service Account credentials cascading loader)
  - `server/drive/client.ts` (Google Drive API v3 client wrapper)
  - `server/drive/traversal.ts` (recursive category folder traversal with diacritics resilience)
  - `server/drive/cache.ts` (in-memory caching with TTL)
  - `server/proxy/rangeParser.ts` (HTTP Range header parser & 8MB chunk boundary math)
  - `server/proxy/streamer.ts` (HTTP Range 206 streaming proxy with socket abort handling)
  - `server/subtitles/converter.ts` (SRT to WebVTT converter with UTF-8/Latin-1 resilience)
  - `server/subtitles/matcher.ts` (external subtitle file matcher)
  - `server/routes/` and `server/index.ts` (Express or Fastify server routes and entry point)
- `tests/unit/m1/` (unit tests for all M1 modules)

Implementation Requirements:
1. Initialize repository `package.json` and `tsconfig.json` with required dependencies (`googleapis`, `express`, `cors`, `dotenv`, and devDependencies for TypeScript, tests, and build). Install dependencies via npm.
2. Implement robust Service Account authentication supporting:
   - `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable (raw JSON string or Base64-encoded string).
   - Local `credentials.json` file.
   - Clean RSA private key newline sanitization (`\n`).
3. Implement recursive folder traversal resolving:
   - 'Películas', 'Series', 'Videos familiares', 'Fotos', 'Música' (handling accents/diacritics cleanly).
   - Recursive listing of subfolders and files.
   - Metadata extraction: id, name, mimeType, size, modifiedTime, videoMediaMetadata (width, height, durationMillis), imageMediaMetadata, high-res thumbnail link (`=w800`).
4. Implement in-memory cache:
   - Categories cache (TTL 10 mins).
   - File metadata cache (TTL 2 hours).
   - Manual cache invalidation endpoint (`POST /api/drive/refresh`).
5. Implement strict HTTP Range 206 Partial Content Streaming:
   - Correctly parse `Range: bytes=start-end`, open-ended `bytes=start-`, suffix `bytes=-suffix`, and requests without Range.
   - Bound chunk size to 8MB (`MAX_CHUNK_SIZE = 8 * 1024 * 1024`) per response to prevent serverless function timeouts.
   - Response headers: `Status: 206 Partial Content`, `Content-Range: bytes start-end/totalSize`, `Content-Length: chunkSize`, `Accept-Ranges: bytes`, `Content-Type: mimeType`, CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length`).
   - Upstream Google Drive download using `files.get({ fileId, alt: 'media' }, { headers: { Range: ... }, responseType: 'stream' })`.
   - Socket abort listener: on `req.on('close')`, abort upstream Drive stream if client disconnects before chunk completes.
6. Implement Subtitle Engine:
   - Match external `.srt`/`.vtt` files sharing the base video filename.
   - On-the-fly SRT to WebVTT converter: `WEBVTT\n\n` header, comma `,` to period `.` millisecond separator conversion, stripping SSA/HTML formatting tags, normalizing UTF-8 and Latin-1/Windows-1252 encodings.
   - Endpoint `/api/subtitles/:fileId` delivering valid WebVTT with `Content-Type: text/vtt; charset=utf-8`.
7. Testing & Verification:
   - Write comprehensive unit tests in `tests/unit/m1/` testing auth loading, folder matching, range parsing math, 206 header generation, SRT-to-WebVTT conversion, and routes.
   - Run the TypeScript build and run all unit tests. Ensure 100% pass rate.
8. Output:
   - Write full implementation report to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\worker_m1_1\implementation_report.md.
   - Write `handoff.md` in your working directory documenting build & test commands and results.
   - Send completion message to parent.
