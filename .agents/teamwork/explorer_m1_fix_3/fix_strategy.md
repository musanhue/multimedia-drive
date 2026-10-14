# Fix Strategy: Streaming Payload, Subtitle Timestamps & Range Parser

**Author**: `explorer_m1_fix_3` (Streaming & Timestamp Fix Explorer)  
**Date**: 2026-10-13  
**Status**: APPROVED_DESIGN  
**Scope**:
1. `server/routes/stream.ts` — Mock fallback payload length matching `Content-Length`
2. `server/subtitles/converter.ts` — Subtitle timestamp regex accepting single-digit hour/minute and non-3-digit milliseconds
3. `server/proxy/rangeParser.ts` — Case-insensitive range unit check and strict numeric digit validation

---

## 1. Problem Analysis & Root Cause Diagnosis

### 1.1 Issue 1: Content-Length vs Payload Mismatch in `server/routes/stream.ts`

- **Observed Bug**:
  In `server/routes/stream.ts` (lines 66–80), when serving mock/test fallback streams (such as `GET /api/stream/vid_inc` with `Range: bytes=0-`), the route parsed the range via `parseHttpRange`, which returned `chunkSize = 8388608` (8MB).
  The route set:
  ```typescript
  'Content-Length': chunkSize.toString() // '8388608'
  ```
  However, the buffer written was sliced as:
  ```typescript
  const bufferSlice = mockData.sampleVideoBuffer.subarray(
    start % mockData.SAMPLE_VIDEO_BUFFER_SIZE,
    (start % mockData.SAMPLE_VIDEO_BUFFER_SIZE) + Math.min(chunkSize, 65536)
  );
  ```
  `Math.min(chunkSize, 65536)` clamped the payload to at most 65,536 bytes (64KB).
  When `res.end(bufferSlice)` was called, the server closed the HTTP socket having sent only 64KB out of the promised 8MB.
- **Protocol Impact**:
  Per HTTP/1.1 (RFC 7230 §3.3.2), premature socket closure before transmitting the exact byte count declared in `Content-Length` constitutes a protocol violation. Standard HTTP clients (e.g., Node `fetch` / Undici, Chromium M56 HTML5 media player) terminate playback with `SocketError: other side closed (UND_ERR_SOCKET)` or `TypeError: terminated`.
- **Root Cause**:
  Hardcoded clamping to `65536` bytes in `server/routes/stream.ts:69` rather than allocating or constructing a buffer that matches `chunkSize`.

---

### 1.2 Issue 2: Subtitle Timestamp Regex in `server/subtitles/converter.ts`

- **Observed Bug**:
  In `server/subtitles/converter.ts` (lines 59–68):
  ```typescript
  normalized = normalized.replace(
    /(?:^|\n)(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})(.*)/g,
    (_match, h1, m1, s1, ms1, h2, m2, s2, ms2, extra) => { ... }
  );
  ```
  When an SRT subtitle cue uses single-digit minutes without hours (e.g., `5:20,500 --> 5:25,800`) or non-3-digit milliseconds (e.g., `00:00:01,23 --> 00:00:02,3`), the regex fails to match:
  1. `(\d{2}):` requires strictly two digits for minutes. When given `5:20`, it does not match.
  2. `[,.](\d{3})` requires strictly three digits for milliseconds. When given `,23` or `,3`, it does not match.
  Because the regex fails to match, the line is passed through unmodified with raw commas (`5:20,500`), causing WebVTT parsers (such as Chromium M56's `<track>` parser) to drop the cues.
- **Root Cause**:
  Rigid quantifier constraints (`\d{2}` for minutes, `\d{3}` for milliseconds) that do not tolerate real-world SRT community formats.

---

### 1.3 Issue 3: Case-Sensitivity & Trailing Garbage in `server/proxy/rangeParser.ts`

- **Observed Bug**:
  In `server/proxy/rangeParser.ts`:
  1. **Case-sensitivity**: Line 49 checks `if (!trimmed.startsWith('bytes='))`. If a client sends `Bytes=0-100` or `BYTES=0-100`, the parser returns HTTP 416. Per RFC 7233 §2.1, HTTP range-units are case-insensitive tokens (`bytes-unit = "bytes"`).
  2. **Trailing garbage**: Lines 59, 89, 96 use `parseInt(str, 10)` without digit-only validation:
     - `spec.startsWith('-')`: `parseInt('100abc', 10)` parses as `100`, ignoring trailing garbage.
     - `spec.split('-')`: `startStr = '0abc'`, `parseInt('0abc', 10)` parses as `0`.
     - `endStr = '100abc'`, `parseInt('100abc', 10)` parses as `100`.
     Consequently, invalid range headers like `bytes=0-100abc` or `bytes=-100abc` were erroneously accepted with HTTP 206 instead of being rejected with HTTP 416 `Range Not Satisfiable`.
- **Root Cause**:
  Case-sensitive prefix check `trimmed.startsWith('bytes=')` and permissive `parseInt` without regex digit validation `/^\d+$/`.

---

## 2. Concrete Proposed Fixes

### 2.1 Fix 1: `server/routes/stream.ts`

#### Rationale
Replace the 64KB slicing with buffer allocation matching `chunkSize`. Copy mock video payload from `mockData.sampleVideoBuffer` into the buffer, wrapping around if `chunkSize` spans past the end of the 16MB sample buffer.

#### Target Location
File: `server/routes/stream.ts`, lines 66–71

#### Before
```typescript
        const { start, end, chunkSize } = parsed.range;
        const bufferSlice = mockData.sampleVideoBuffer.subarray(
          start % mockData.SAMPLE_VIDEO_BUFFER_SIZE,
          (start % mockData.SAMPLE_VIDEO_BUFFER_SIZE) + Math.min(chunkSize, 65536)
        );
```

#### After
```typescript
        const { start, end, chunkSize } = parsed.range;
        const bufferSlice = Buffer.alloc(chunkSize);
        if (mockData.sampleVideoBuffer && mockData.sampleVideoBuffer.length > 0) {
          const sampleBufLen = mockData.sampleVideoBuffer.length;
          const sourceOffset = start % sampleBufLen;
          const firstCopyLen = Math.min(chunkSize, sampleBufLen - sourceOffset);
          mockData.sampleVideoBuffer.copy(bufferSlice, 0, sourceOffset, sourceOffset + firstCopyLen);
          if (firstCopyLen < chunkSize) {
            mockData.sampleVideoBuffer.copy(bufferSlice, firstCopyLen, 0, chunkSize - firstCopyLen);
          }
        }
```

#### Unified Diff Patch
```patch
--- a/server/routes/stream.ts
+++ b/server/routes/stream.ts
@@ -66,5 +66,12 @@ const handleStream = async (req: Request, res: Response) => {
         const { start, end, chunkSize } = parsed.range;
-        const bufferSlice = mockData.sampleVideoBuffer.subarray(
-          start % mockData.SAMPLE_VIDEO_BUFFER_SIZE,
-          (start % mockData.SAMPLE_VIDEO_BUFFER_SIZE) + Math.min(chunkSize, 65536)
-        );
+        const bufferSlice = Buffer.alloc(chunkSize);
+        if (mockData.sampleVideoBuffer && mockData.sampleVideoBuffer.length > 0) {
+          const sampleBufLen = mockData.sampleVideoBuffer.length;
+          const sourceOffset = start % sampleBufLen;
+          const firstCopyLen = Math.min(chunkSize, sampleBufLen - sourceOffset);
+          mockData.sampleVideoBuffer.copy(bufferSlice, 0, sourceOffset, sourceOffset + firstCopyLen);
+          if (firstCopyLen < chunkSize) {
+            mockData.sampleVideoBuffer.copy(bufferSlice, firstCopyLen, 0, chunkSize - firstCopyLen);
+          }
+        }
```

---

### 2.2 Fix 2: `server/subtitles/converter.ts`

#### Rationale
Allow 1 to 2 digits for minutes (`(\d{1,2})`), 1 or more digits for hours (`(?:(\d+):)?`), and 1 or more digits for milliseconds (`[,.](\d+)`).
In the replacement callback:
- `hour`: `(h !== undefined ? h : '00').padStart(2, '0')`
- `min`: `m.padStart(2, '0')`
- `sec`: `s.padStart(2, '0')`
- `ms`: `ms.padEnd(3, '0').slice(0, 3)` (fractions of second: `.5` -> `500`, `.23` -> `230`, `.1234` -> `123`)

#### Target Location
File: `server/subtitles/converter.ts`, lines 58–68

#### Before
```typescript
  // 5. Convert timestamp lines: comma to dot, ensure HH:MM:SS.mmm
  normalized = normalized.replace(
    /(?:^|\n)(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})(.*)/g,
    (_match, h1, m1, s1, ms1, h2, m2, s2, ms2, extra) => {
      const hour1 = (h1 !== undefined ? h1 : '00').padStart(2, '0');
      const hour2 = (h2 !== undefined ? h2 : '00').padStart(2, '0');
      const cueSettings = extra ? extra.trim() : '';
      const suffix = cueSettings ? ` ${cueSettings}` : '';
      return `\n${hour1}:${m1}:${s1}.${ms1} --> ${hour2}:${m2}:${s2}.${ms2}${suffix}`;
    }
  );
```

#### After
```typescript
  // 5. Convert timestamp lines: comma to dot, ensure HH:MM:SS.mmm
  normalized = normalized.replace(
    /(?:^|\n)(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d+)\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d+)(.*)/g,
    (_match, h1, m1, s1, ms1, h2, m2, s2, ms2, extra) => {
      const hour1 = (h1 !== undefined ? h1 : '00').padStart(2, '0');
      const hour2 = (h2 !== undefined ? h2 : '00').padStart(2, '0');
      const min1 = m1.padStart(2, '0');
      const min2 = m2.padStart(2, '0');
      const sec1 = s1.padStart(2, '0');
      const sec2 = s2.padStart(2, '0');
      const mill1 = ms1.padEnd(3, '0').slice(0, 3);
      const mill2 = ms2.padEnd(3, '0').slice(0, 3);
      const cueSettings = extra ? extra.trim() : '';
      const suffix = cueSettings ? ` ${cueSettings}` : '';
      return `\n${hour1}:${min1}:${sec1}.${mill1} --> ${hour2}:${min2}:${sec2}.${mill2}${suffix}`;
    }
  );
```

#### Unified Diff Patch
```patch
--- a/server/subtitles/converter.ts
+++ b/server/subtitles/converter.ts
@@ -59,10 +59,14 @@ export function convertSrtToVtt(input: Buffer | string): string {
   normalized = normalized.replace(
-    /(?:^|\n)(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})(.*)/g,
+    /(?:^|\n)(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d+)\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d+)(.*)/g,
     (_match, h1, m1, s1, ms1, h2, m2, s2, ms2, extra) => {
       const hour1 = (h1 !== undefined ? h1 : '00').padStart(2, '0');
       const hour2 = (h2 !== undefined ? h2 : '00').padStart(2, '0');
+      const min1 = m1.padStart(2, '0');
+      const min2 = m2.padStart(2, '0');
+      const sec1 = s1.padStart(2, '0');
+      const sec2 = s2.padStart(2, '0');
+      const mill1 = ms1.padEnd(3, '0').slice(0, 3);
+      const mill2 = ms2.padEnd(3, '0').slice(0, 3);
       const cueSettings = extra ? extra.trim() : '';
       const suffix = cueSettings ? ` ${cueSettings}` : '';
-      return `\n${hour1}:${m1}:${s1}.${ms1} --> ${hour2}:${m2}:${s2}.${ms2}${suffix}`;
+      return `\n${hour1}:${min1}:${sec1}.${mill1} --> ${hour2}:${min2}:${sec2}.${mill2}${suffix}`;
     }
   );
```

---

### 2.3 Fix 3: `server/proxy/rangeParser.ts`

#### Rationale
1. Unit check: Use `/^bytes=/i.test(trimmed)` instead of `trimmed.startsWith('bytes=')`.
2. Suffix validation: Ensure `suffixStr` matches `/^\d+$/` and parses to `> 0`.
3. Closed/Open range validation: Ensure `startStr` matches `/^\d+$/`. If `endStr.length > 0`, ensure `endStr` matches `/^\d+$/`. Any string containing letters, symbols, or trailing garbage is strictly rejected with HTTP 416.

#### Target Location
File: `server/proxy/rangeParser.ts`, lines 48–105

#### Before
```typescript
  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith('bytes=')) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const byteSet = trimmed.substring(6).trim();
  // Handle multiple ranges by selecting the first specifier
  const spec = byteSet.split(',')[0].trim();

  // Case 2: Suffix range (e.g. bytes=-1048576)
  if (spec.startsWith('-')) {
    const suffixLength = parseInt(spec.substring(1).trim(), 10);
    if (isNaN(suffixLength) || suffixLength <= 0) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
...
  // Case 3: Closed or Open range (e.g. bytes=0-1048575 or bytes=0-)
  const parts = spec.split('-');
  if (parts.length !== 2) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const startStr = parts[0].trim();
  const endStr = parts[1].trim();

  const start = parseInt(startStr, 10);
  if (isNaN(start) || start < 0 || start >= totalSize) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  let end: number;
  if (endStr.length > 0) {
    const reqEnd = parseInt(endStr, 10);
    if (isNaN(reqEnd) || reqEnd < start) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
...
```

#### After
```typescript
  const trimmed = rangeHeader.trim();
  if (!/^bytes=/i.test(trimmed)) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const byteSet = trimmed.substring(6).trim();
  // Handle multiple ranges by selecting the first specifier
  const spec = byteSet.split(',')[0].trim();

  // Case 2: Suffix range (e.g. bytes=-1048576)
  if (spec.startsWith('-')) {
    const suffixStr = spec.substring(1).trim();
    if (!/^\d+$/.test(suffixStr)) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
    const suffixLength = parseInt(suffixStr, 10);
    if (suffixLength <= 0) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }

    const clampedSuffix = Math.min(suffixLength, totalSize);
    const start = totalSize - clampedSuffix;
    const end = Math.min(start + maxChunkSize - 1, totalSize - 1);
    const chunkSize = end - start + 1;
    return {
      status: 206,
      range: {
        start,
        end,
        chunkSize,
        totalSize,
        contentRange: `bytes ${start}-${end}/${totalSize}`,
      },
    };
  }

  // Case 3: Closed or Open range (e.g. bytes=0-1048575 or bytes=0-)
  const parts = spec.split('-');
  if (parts.length !== 2) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const startStr = parts[0].trim();
  const endStr = parts[1].trim();

  if (!/^\d+$/.test(startStr)) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  const start = parseInt(startStr, 10);
  if (start >= totalSize) {
    return { status: 416, contentRange: `bytes */${totalSize}` };
  }

  let end: number;
  if (endStr.length > 0) {
    if (!/^\d+$/.test(endStr)) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
    const reqEnd = parseInt(endStr, 10);
    if (reqEnd < start) {
      return { status: 416, contentRange: `bytes */${totalSize}` };
    }
    const boundedEnd = Math.min(reqEnd, start + maxChunkSize - 1);
    end = Math.min(boundedEnd, totalSize - 1);
  } else {
    // Open range
    end = Math.min(start + maxChunkSize - 1, totalSize - 1);
  }
```

#### Unified Diff Patch
```patch
--- a/server/proxy/rangeParser.ts
+++ b/server/proxy/rangeParser.ts
@@ -49,3 +49,3 @@ export function parseHttpRange(
   const trimmed = rangeHeader.trim();
-  if (!trimmed.startsWith('bytes=')) {
+  if (!/^bytes=/i.test(trimmed)) {
     return { status: 416, contentRange: `bytes */${totalSize}` };
@@ -58,4 +58,8 @@ export function parseHttpRange(
   if (spec.startsWith('-')) {
-    const suffixLength = parseInt(spec.substring(1).trim(), 10);
-    if (isNaN(suffixLength) || suffixLength <= 0) {
+    const suffixStr = spec.substring(1).trim();
+    if (!/^\d+$/.test(suffixStr)) {
+      return { status: 416, contentRange: `bytes */${totalSize}` };
+    }
+    const suffixLength = parseInt(suffixStr, 10);
+    if (suffixLength <= 0) {
       return { status: 416, contentRange: `bytes */${totalSize}` };
@@ -87,4 +91,8 @@ export function parseHttpRange(
   const endStr = parts[1].trim();

+  if (!/^\d+$/.test(startStr)) {
+    return { status: 416, contentRange: `bytes */${totalSize}` };
+  }
+
   const start = parseInt(startStr, 10);
-  if (isNaN(start) || start < 0 || start >= totalSize) {
+  if (start >= totalSize) {
     return { status: 416, contentRange: `bytes */${totalSize}` };
@@ -95,3 +103,6 @@ export function parseHttpRange(
   if (endStr.length > 0) {
+    if (!/^\d+$/.test(endStr)) {
+      return { status: 416, contentRange: `bytes */${totalSize}` };
+    }
     const reqEnd = parseInt(endStr, 10);
```

---

## 3. Verification & Test Plan

### 3.1 Tests to Update in `tests/unit/m1/adversarial-streaming-subtitles.test.ts`
1. **Remove warning & enforce strict equality on transferred bytes**:
   Update line 454–459 to assert:
   ```typescript
   assert.equal(actualTransferredBytes, declaredContentLength, 'Transferred body bytes must exactly match declared Content-Length');
   ```
2. **Add Case-Insensitive Range Header tests**:
   ```typescript
   test('Adversarial Range: Case-insensitive Bytes= and BYTES= headers', () => {
     const total = 50 * 1024 * 1024;
     const r1 = parseHttpRange('Bytes=0-100', total);
     assert.equal(r1.status, 206);
     const r2 = parseHttpRange('BYTES=0-100', total);
     assert.equal(r2.status, 206);
   });
   ```
3. **Add Trailing Garbage characters rejection tests**:
   ```typescript
   test('Adversarial Range: Trailing garbage rejected with 416', () => {
     const total = 50 * 1024 * 1024;
     assert.equal(parseHttpRange('bytes=0-100abc', total).status, 416);
     assert.equal(parseHttpRange('bytes=0abc-100', total).status, 416);
     assert.equal(parseHttpRange('bytes=-100abc', total).status, 416);
   });
   ```
4. **Add Single-Digit Minute Subtitle tests**:
   ```typescript
   test('Adversarial Subtitles: Single-digit minutes (5:20,500) normalized to 00:05:20.500', () => {
     const vtt = convertSrtToVtt('1\n5:20,500 --> 5:25,800\nTexto');
     assert.ok(vtt.includes('00:05:20.500 --> 00:05:25.800'));
   });
   ```

### 3.2 Verification Commands
- Run empirical adversarial suite:
  ```powershell
  npx tsx --test tests/unit/m1/adversarial-streaming-subtitles.test.ts
  ```
- Run complete unit suite:
  ```powershell
  npm run test:unit
  ```
- Run complete E2E suite:
  ```powershell
  npm run test:e2e
  ```
- Compile TypeScript:
  ```powershell
  npm run build
  ```
