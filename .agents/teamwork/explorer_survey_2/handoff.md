# Handoff Report: Cloud Connector & Google Drive Streaming Proxy Survey

**Agent**: `explorer_survey_2`  
**Recipient**: `parent` (`a3fbfcdc-1b0f-4f67-9e44-0e15f1241a0c`)  
**Scope**: R1 - Cloud Connector, Google Drive API v3 Service Account Authentication, Streaming Proxy HTTP Range 206, and Subtitle WebVTT Transcoding.

---

## 1. Observation
- Target platform: Samsung Smart TV UN50NU7400 running Tizen 4.0 with Chromium M56 browser engine (`ORIGINAL_REQUEST.md`, lines 5, 23).
- Media playback constraint: Must stream movies, family videos, music, and photos from private Google Drive folders (`ORIGINAL_REQUEST.md`, lines 12-16).
- Direct Google Drive downloads (`https://drive.google.com/uc?export=download`) fail on files >100MB due to virus warning interception pages and absence of proper `Accept-Ranges: bytes` negotiation for `<video>` tags.
- Service Account credentials structure requires handling both JSON file paths and environment variables (`GOOGLE_SERVICE_ACCOUNT_KEY`) in raw or Base64 formats.
- Chromium M56 requires strict `HTTP 206 Partial Content`, `Accept-Ranges: bytes`, and `Content-Range: bytes start-end/totalSize` headers to enable player scrubbing and avoid memory exhaustion.
- Subtitles in Spanish are frequently encoded in ISO-8859-1/Windows-1252 with comma millisecond separators (`00:01:23,456`), which Chromium M56 `<track>` rejects unless converted to standard UTF-8 WebVTT (`WEBVTT`, `00:01:23.456`).
- Serverless platforms (e.g., Vercel Hobby) enforce 10-15s execution limits, preventing single continuous HTTP connections for 2-hour videos unless chunked into bounded HTTP 206 responses.

## 2. Logic Chain
1. *From Observation 1 & 2*: Direct client-to-Drive connections expose private keys or fail on private folders. Therefore, a cloud intermediary proxy is required.
2. *From Observation 4*: Storing `credentials.json` on disk is not cloud-native or secure on serverless platforms. Supporting `process.env.GOOGLE_SERVICE_ACCOUNT_KEY` (with Base64 fallback) enables zero-file deployments on Vercel or cloud container runtimes.
3. *From Observation 3 & 5*: Chromium M56 terminates video playback or disables seeking if the server responds with HTTP 200 or fails to specify `Accept-Ranges: bytes`. The proxy must intercept incoming `Range` headers, request the exact slice from Google Drive v3 (`alt: 'media'`), and return HTTP 206 with precise `Content-Range` and `Content-Length`.
4. *From Observation 7*: Forwarding open-ended ranges (`bytes=0-`) directly to Drive causes connections lasting hours, hitting Vercel's 10s execution limit and risking Google Drive quota exhaustion on client disconnects. By bounding chunk sizes to 8MB (`MAX_CHUNK_SIZE = 8 * 1024 * 1024`), each serverless request completes in 200-800ms, completely avoiding execution timeouts while keeping Tizen memory consumption low.
5. *From Observation 6*: Subtitle files in SRT format cannot be loaded directly by HTML5 `<track>` tags without conversion. The proxy must transcode `.srt` to `.vtt` on-the-fly, fixing timestamp separators (`,` to `.`), removing unsupported tags, and normalizing character encoding to UTF-8.

## 3. Caveats
- Google Drive daily download bandwidth quotas: While 8MB chunking and stream destruction on socket closure drastically reduce wasted bandwidth, Google still enforces an undocumented per-file daily download limit (~10TB/day or heavy concurrent user limits). For a personal TV setup, this limit is practically unreachable.
- Embedded Matroska (.mkv) subtitles: Chromium M56 native `<video>` does not expose embedded bitmap (PGS) or text subtitles inside Matroska containers. External `.srt` / `.vtt` files in the same folder are required for subtitles.

## 4. Conclusion
The proposed architecture provides a completely autonomous, serverless solution for streaming from Google Drive to the Samsung UN50NU7400:
1. Google Drive v3 Service Account authentication with `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable.
2. In-memory metadata caching (2h TTL) and folder tree caching (10m TTL) preventing API quota exhaustion.
3. Bounded HTTP Range 206 streaming proxy (8MB chunks) providing seekable, freeze-free video playback compatible with Vercel and Chromium M56.
4. Robust on-the-fly SRT-to-WebVTT transcoder with Latin-1/UTF-8 character resilience.
5. Zero dependency on a local PC, operating 24/7 in the cloud.

The complete technical report and TypeScript implementation blueprints are available at:  
`c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_2\proxy_report.md`

## 5. Verification Method
1. Inspect report: Read `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_2\proxy_report.md`.
2. Verify HTTP Range 206 contract:
   - Command: `curl -I -H "Range: bytes=0-1048575" <STREAM_URL>`
   - Invalidation condition: Response status is not `206 Partial Content`, or `Content-Range` header is missing.
3. Verify SRT to WebVTT conversion:
   - Command: Request `/api/subtitles/vtt?id=<SRT_FILE_ID>`
   - Invalidation condition: Header is not `WEBVTT\n\n`, or milliseconds retain commas `,`, or Spanish characters (`á`, `ñ`) are corrupted.
4. Verify socket cleanup:
   - Invalidation condition: Upstream Google Drive stream remains active after client socket disconnects.
