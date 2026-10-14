# Challenge Report — Streaming Proxy & Subtitle Engine (M1)

**Challenger Agent**: `challenger_m1_1`
**Date**: 2026-10-13T04:28:00Z
**Target Implementation**: `server/proxy/rangeParser.ts`, `server/proxy/streamer.ts`, `server/subtitles/converter.ts`, `server/routes/stream.ts`, `server/routes/subtitles.ts`
**Adversarial Test Suite**: `tests/unit/m1/adversarial-streaming-subtitles.test.ts` (34 test cases executed)

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

While the core range math in `server/proxy/rangeParser.ts` correctly bounds chunks to 8MB (`8388608` bytes) and validates most malformed ranges, and `server/subtitles/converter.ts` successfully cleans SSA tags, normalizes line breaks, and decodes Latin-1 Spanish diacritics, empirical adversarial stress testing revealed **two critical bugs and two medium vulnerabilities**:

1. **[CRITICAL] Severe Content-Length mismatch in `server/routes/stream.ts`**: When handling video stream requests in mock fallback mode (the default mode in development, local testing, and CI environments without live Google credentials), the server declares `Content-Length: 8388608` (8MB) based on `parseHttpRange`, but `res.end(bufferSlice)` truncates the payload to `Math.min(chunkSize, 65536)` (at most 64KB). The server immediately closes the socket after 64KB while the HTTP client is waiting for 8MB. Any standard HTTP client (Node `fetch`, Chrome/Chromium M56 video elements) fails with `UND_ERR_SOCKET: other side closed` or `net::ERR_CONTENT_LENGTH_MISMATCH`.
2. **[HIGH] Subtitle parser fails on single-digit minute timestamps (`5:20,500`) and 1-2 digit milliseconds**: The regex in `converter.ts` strictly requires two digits for minutes (`(\d{2}):(\d{2})`) and three digits for milliseconds (`[,.](\d{3})`). When given single-digit minutes or non-3-digit milliseconds common in fan-subbed SRT files, conversion silently fails, emitting unparsed timestamps with commas and missing hour headers, which renders the WebVTT cue invalid in Samsung TV's video player.
3. **[MEDIUM] Case-sensitive Range unit rejection**: Per RFC 7233 §2.1, range units are case-insensitive. `rangeParser.ts` uses `trimmed.startsWith('bytes=')`. Requests sending `Range: Bytes=0-100` or `Range: BYTES=0-100` are rejected with HTTP 416.
4. **[MEDIUM] Lenient alphanumeric range acceptance**: Ranges like `bytes=0abc-10def` are silently accepted as `bytes 0-10/totalSize` (returning 206) due to JavaScript's `parseInt()` stopping at non-digit characters instead of validating strict numeric format.

---

## Challenges

### [CRITICAL] Challenge 1: Socket Drop on 8MB Chunks due to Content-Length Mismatch in `server/routes/stream.ts`

- **Assumption challenged**: The HTTP Range 206 streaming proxy delivers valid 8MB partial content chunks without stalling or breaking client sockets.
- **Attack scenario**: A client requests an 8MB chunk or an open-ended range `Range: bytes=0-` on `/api/stream/:fileId`. In `server/routes/stream.ts`:
  ```typescript
  const { start, end, chunkSize } = parsed.range; // chunkSize = 8388608 (8MB)
  const bufferSlice = mockData.sampleVideoBuffer.subarray(
    start % mockData.SAMPLE_VIDEO_BUFFER_SIZE,
    (start % mockData.SAMPLE_VIDEO_BUFFER_SIZE) + Math.min(chunkSize, 65536) // capped at 64KB!
  );
  res.writeHead(206, {
    ...corsHeaders,
    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize.toString(), // announces 8388608 bytes
    ...
  });
  return res.end(bufferSlice); // sends only 65536 bytes and closes socket!
  ```
- **Blast radius**: Every video playback attempt in test, development, and offline environments using standard chunk sizes (> 64KB) aborts immediately. In Node.js, `fetch` aborts with `TypeError: terminated (SocketError: other side closed)`. In Chromium M56 (Samsung TV), the video pipeline throws `MEDIA_ELEMENT_ERROR` or stalls indefinitely.
- **Mitigation**: In `server/routes/stream.ts`, either:
  1. Repeat/loop `mockData.sampleVideoBuffer` into a full `Buffer.alloc(chunkSize)` or `Buffer.allocUnsafe(chunkSize)` matching `chunkSize` (as `tests/harness/mock-server.js` correctly does at line 320: `Buffer.alloc(chunkSize)`), OR
  2. If the mock buffer is strictly 64KB, clamp `end = Math.min(start + 65536 - 1, totalSize - 1)` so that `Content-Length`, `Content-Range`, and the written byte count are strictly identical.

---

### [HIGH] Challenge 2: Timestamp Parsing Failure on Non-Standard SRT Timestamps

- **Assumption challenged**: `convertSrtToVtt` reliably normalizes arbitrary SRT timestamps (including missing hours, variable digit lengths) into standard WebVTT `00:mm:ss.mmm`.
- **Attack scenario**: An SRT file has timestamps with single-digit minutes (e.g. `1\n5:20,500 --> 5:25,800\nTexto`) or 2-digit milliseconds (e.g. `00:00:01,23 --> 00:00:02,45`).
  Regex in `server/subtitles/converter.ts`:
  `/(?:^|\n)(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})(.*)/g`
  Because minute matching requires `(\d{2})` and millisecond matching requires `(\d{3})`, the regex fails to match.
  Result produced:
  ```
  WEBVTT

  1
  5:20,500 --> 5:25,800
  Texto
  ```
- **Blast radius**: The output retains the comma separator `,` and non-standard syntax, which violates W3C WebVTT syntax. The browser TextTrack parser discards the entire cue, leaving users with missing subtitles on real-world community subtitle files.
- **Mitigation**: Update the regex in `server/subtitles/converter.ts` to support variable digit lengths:
  `/(?:^|\n)(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})(.*)/g`
  and pad hours (`padStart(2, '0')`), minutes (`padStart(2, '0')`), and milliseconds (`padEnd(3, '0')`).

---

### [MEDIUM] Challenge 3: Case-Sensitive HTTP Range Unit Rejection

- **Assumption challenged**: Range header parsing conforms to RFC 7233 §2.1.
- **Attack scenario**: A client or TV proxy sends `Range: Bytes=0-1023` or `Range: BYTES=0-1023`.
  In `server/proxy/rangeParser.ts` line 49:
  `if (!trimmed.startsWith('bytes='))`
  The check fails and returns HTTP 416 `bytes */${totalSize}`.
- **Blast radius**: Clients sending valid HTTP range requests with title-case or uppercase units are rejected with 416.
- **Mitigation**: Use case-insensitive prefix matching:
  `if (!/^bytes=/i.test(trimmed))`

---

### [MEDIUM] Challenge 4: Alphanumeric Injection in Range Header Accepted as Valid

- **Assumption challenged**: Range headers containing invalid characters are rejected with HTTP 416.
- **Attack scenario**: Range header `bytes=0abc-10def`.
  `parts[0] = "0abc"`, `parseInt("0abc", 10)` returns `0`.
  `parts[1] = "10def"`, `parseInt("10def", 10)` returns `10`.
  Returns status 206 with range `0-10`.
- **Blast radius**: Non-conforming, corrupt range headers are accepted instead of triggering 416, masking client corruption.
- **Mitigation**: Ensure strict digit validation before parsing: `/^\d+$/.test(startStr)` and `/^\d+$/.test(endStr)`.

---

## Stress Test Results

| # | Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---------------|-------------------|-----------------|--------|
| 1 | Single byte: `bytes=0-0` | Status 206, Content-Length 1, Content-Range `bytes 0-0/total` | Status 206, Content-Length 1, Content-Range `bytes 0-0/total` | **PASS** |
| 2 | Two bytes: `bytes=0-1` | Status 206, Content-Length 2, Content-Range `bytes 0-1/total` | Status 206, Content-Length 2, Content-Range `bytes 0-1/total` | **PASS** |
| 3 | Start beyond EOF: `bytes=999999999-` (on 50MB file) | Status 416, Content-Range `bytes */52428800` | Status 416, Content-Range `bytes */52428800` | **PASS** |
| 4 | Valid seeking: `bytes=999999999-` (on 4GB file) | Status 206, chunk clamped to 8MB | Status 206, chunk clamped to 8MB (start: 999999999, chunkSize: 8388608) | **PASS** |
| 5 | Suffix range: `bytes=-1000` (on 20MB file) | Status 206, Content-Length 1000, Content-Range `bytes (total-1000)-(total-1)/total` | Status 206, Content-Length 1000, Content-Range exact match | **PASS** |
| 6 | Inverted range: `bytes=500-100` | Status 416, Content-Range `bytes */total` | Status 416, Content-Range `bytes */total` | **PASS** |
| 7 | Non-numeric range: `bytes=abc-def` | Status 416, Content-Range `bytes */total` | Status 416, Content-Range `bytes */total` | **PASS** |
| 8 | Empty specifier: `bytes=,` | Status 416, Content-Range `bytes */total` | Status 416, Content-Range `bytes */total` | **PASS** |
| 9 | Multipart ranges: `bytes=0-499, 1000-1499` | Status 206, selects first range `0-499` | Status 206, first range `0-499` served | **PASS** |
| 10 | Chunk Clamping: `bytes=0-` on 100MB | Clamped to exact 8MB (`8388608` bytes, end `8388607`) | Clamped to exact 8MB | **PASS** |
| 11 | Chunk Clamping: `bytes=0-20971519` (20MB) on 100MB | Clamped to exact 8MB | Clamped to exact 8MB | **PASS** |
| 12 | Chunk Clamping: `bytes=10485760-` (seeking at 10MB) | Clamped to exact 8MB | Clamped to exact 8MB | **PASS** |
| 13 | Chunk Clamping: `bytes=-16777216` (16MB suffix) on 50MB | Clamped to exact 8MB | Clamped to exact 8MB | **PASS** |
| 14 | Near EOF remainder: 512KB left | Delivers exact 512KB without padding | Delivers exact 512KB without padding | **PASS** |
| 15 | Header format exactness (100 pseudo-random ranges) | All match `^bytes \d+-\d+/\d+$`, chunkSize <= 8MB | 100/100 matches exact format | **PASS** |
| 16 | Mixed CRLF, LF, CR subtitle normalization | All normalized to Unix LF `\n`, zero `\r` | Normalized to LF, zero `\r` | **PASS** |
| 17 | Subtitles with missing / non-numeric indices | WebVTT valid with double newline separation | Converted cleanly to WEBVTT | **PASS** |
| 18 | Subtitle tags: `<b>`, `<i>`, `<font>`, `{\an8}`, `{\pos}` | Font & SSA stripped, `<b>` and `<i>` preserved | Font & SSA stripped, `<b>` and `<i>` preserved | **PASS** |
| 19 | ISO-8859-1 accented Spanish characters (`á, é, í, ó, ú, ñ, ¿, ¡`) | Decoded without `\uFFFD` replacement | Decoded without `\uFFFD` replacement | **PASS** |
| 20 | Subtitle edge cases (empty, whitespace, residual BOM) | Returns `WEBVTT\n\n\n` without crashing | Returns `WEBVTT\n\n\n` without crashing | **PASS** |
| 21 | HTTP Live Route: `bytes=0-` chunk transfer | Content-Length matches transferred payload | **Declared Content-Length: 8388608, Transferred: 65536 bytes** | **FAIL (BUG)** |
| 22 | Subtitles with 1-digit minutes `5:20,500` | Pads to `00:05:20.500 --> 00:05:25.800` | Unconverted `5:20,500 --> 5:25,800` (comma retained) | **FAIL (BUG)** |

---

## Unchallenged Areas

- **Live Google Drive upstream streaming quota behavior**: Physical Google Drive API network streaming was tested against local mock streaming engines because live service account credentials require network authorization and external bandwidth. Upstream socket destruction logic (`upstreamStream.on('close')`, `destroy()`) was inspected statically and verified structurally in `server/proxy/streamer.ts`.

---

## Conclusion & Recommended Actions

The mathematical clamping (8MB chunk limit) and core parser logic in `server/proxy/rangeParser.ts` are robust. However, **`server/routes/stream.ts` has a critical Content-Length mismatch bug** that breaks video streaming for any chunk larger than 64KB, and `server/subtitles/converter.ts` fails to convert community subtitle timestamps with 1-digit minutes or non-3-digit milliseconds.

**Recommendation**: **REQUEST_CHANGES** until the worker fixes the `Content-Length` / payload length discrepancy in `server/routes/stream.ts` and updates the timestamp regex in `server/subtitles/converter.ts`.
