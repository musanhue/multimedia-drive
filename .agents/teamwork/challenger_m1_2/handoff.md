# Handoff Report: Auth, Traversal, Caching & Subtitles (M1)

**Verdict**: **`REQUEST_CHANGES`**  
**Agent**: `challenger_m1_2` (Auth and Traversal Challenger)  
**Date**: 2026-10-13  
**Working Directory**: `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\challenger_m1_2`  
**Test Suite**: `tests/adversarial/m1_auth_traversal_stress.test.ts` (23 empirical tests)  

---

## 1. Observation

Direct empirical observations from executing `npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts`:

1. **Folder Traversal Trailing Slash Incompatibility**:
   - `matchCategory("Películas/")` returns `null`.
   - `normalizeCategoryParam("peliculas/")` returns `null`.
   - File: `server/drive/traversal.ts:13-19`:
     ```ts
     export function normalizeString(str: string): string {
       return str
         .normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '')
         .trim()
         .toLowerCase();
     }
     ```
     Because `normalizeString` does not strip trailing slashes, regex `/^(peliculas|cine|movies)$/.test("peliculas/")` evaluates to `false`. When a client requests `GET /api/drive/files/peliculas/`, the route handler at `server/routes/drive.ts:88` returns HTTP 404 `Category 'peliculas/' not found`.

2. **Subtitle Matcher False Association on Single Subtitle (Rule 3)**:
   - For video `Superman.2006.mkv` and subtitle candidates `[{ id: 'sub_batman', name: 'Batman.2005.es.srt' }]`:
     `matchSubtitlesForVideo` returns: `[{ id: 'sub_batman', name: 'Batman.2005.es.srt', isDefault: true, ... }]`.
   - File: `server/subtitles/matcher.ts:76-87`:
     ```ts
     else if (subtitleFiles.length === 1) {
       matched = true;
       isDefault = true;
     ```
   - In `server/drive/traversal.ts:174-179`, `subtitleFiles` across the entire category is passed to `matchSubtitlesForVideo(video.name, subtitleFiles)`. When only one subtitle file exists in the whole category, all movies receive that single subtitle.

3. **Subtitle Matcher False Positive on Sequels (Rule 2)**:
   - For video `Matrix.mkv` and subtitle candidate `Matrix.Reloaded.2003.srt`:
     `subNameWithoutExt.startsWith(videoBase)` evaluates to `true` (`'matrix.reloaded.2003'.startsWith('matrix')`).
   - File: `server/subtitles/matcher.ts:59-75`:
     Tokens `['reloaded', '2003']` do not match `LANGUAGE_MAP`. The function falls back to `lang = 'es'`, `label = 'Español'`, and marks `matched = true`.
     Result: `Matrix.mkv` falsely receives `Matrix.Reloaded.2003.srt` as a Spanish subtitle.

4. **Duplicate `isDefault: true` Flags**:
   - For video `Movie.mkv` with candidates `[{ id: '1', name: 'Movie.srt' }, { id: '2', name: 'Movie.vtt' }]`:
     Both candidates trigger Rule 1 (`subNameWithoutExt === videoBase`).
     Result: Both return `isDefault: true`. The deduplication at line 104 is bypassed because `results.some(r => r.isDefault)` is already true. This creates invalid HTML5 `<video>` structures with multiple `<track default>`.

5. **Incomplete Credential Object Returned from Fallback Files**:
   - Calling `loadCredentials(undefined, tempCredsPath)` with a file containing `{ "project_id": "foo" }` (lacking `client_email` and `private_key`) returns `{ project_id: 'foo' }` without throwing.
   - Contrast with environment variable parsing at `server/config.ts:49-51`, which strictly enforces `if (!parsed.client_email || !parsed.private_key) throw new Error(...)`.

---

## 2. Logic Chain

1. **Step 1**: The orchestrator's specification (`ORIGINAL_REQUEST.md §R1`, `PROJECT.md`) defines seamless streaming, category exploration, and subtitle detection for Samsung Smart TV (Tizen 4.0 / Chromium M56).
2. **Step 2**: If `matchCategory` cannot handle trailing slashes, standard HTTP requests (`/api/drive/files/peliculas/`) fail with 404, breaking client navigation when trailing slashes are present.
3. **Step 3**: If `matchSubtitlesForVideo` associates unrelated subtitles (Rule 3) or sequel subtitles (Rule 2), users will see out-of-sync or completely wrong subtitles on their TV.
4. **Step 4**: If multiple subtitle tracks are tagged `isDefault: true`, Chromium M56 video player on Tizen 4.0 has undefined behavior regarding which track to activate.
5. **Step 5**: Because these failure modes occur under realistic edge conditions that our empirical test suite reproduced, the worker's implementation requires targeted fixes before milestone completion.

---

## 3. Caveats

- **Live Google Drive API Rate Limits**: Real Google Drive quota limits were tested via mock error injection (`X-Simulate-Rate-Limit`), not live Google Cloud servers.
- **Cache Concurrency**: Concurrency stress was executed in Node.js event loop (2,000 promises); in clustered or multi-process deployments, distributed caching (Redis) would be needed, but for single-process Node.js this MemoryCache is thread-safe.

---

## 4. Conclusion

Explicit Verdict: **`REQUEST_CHANGES`**

The implementation demonstrates solid foundations (NFD Unicode accent stripping, resilient Base64 decoding, robust in-memory caching), but contains **4 critical/high logic bugs**:
1. Trailing slashes in folder names and route parameters produce `null` / 404.
2. Rule 3 unconditionally matches single subtitle files to completely unrelated movies.
3. Rule 2 falsely matches sequel subtitles to parent movies due to unchecked prefix tokens.
4. Rule 1 creates duplicate default tracks when both `.srt` and `.vtt` exist.
5. File fallbacks in `loadCredentials` do not validate `client_email` and `private_key`.

---

## 5. Verification Method

To independently verify these findings, run the newly added empirical stress test suite:

```powershell
npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts
```

Inspect output and check:
- `normalizeCategoryParam("peliculas/") -> "null"`
- `Superman got subtitle: Batman.2005.es.srt`
- `Matrix.mkv falsely matched with sequel subtitles: [ 'Matrix.Reloaded.2003.srt', 'Matrix.Revolutions.2003.srt' ]`
- `Number of default tracks for Movie.mkv: 2`
- `Fallback credentials returned without validation: { project_id: 'incomplete-project' }`

**Invalidation Conditions**:
- If `normalizeString` strips trailing slashes, `matchCategory("Películas/")` returns `'peliculas'`.
- If Rule 2 requires valid language/modifier tokens in the suffix, `Matrix.mkv` ignores `Matrix.Reloaded.2003.srt`.
- If Rule 3 validates filename similarity or scopes strictly to parent folders, `Superman` does not receive `Batman.srt`.
- If track deduplication ensures strictly 1 default track, only the preferred track has `isDefault: true`.
