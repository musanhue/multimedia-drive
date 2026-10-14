# Adversarial Challenge Report: Auth, Traversal, Subtitles & Caching (M1)

**Challenger**: `challenger_m1_2` (Auth and Traversal Challenger)  
**Date**: 2026-10-13  
**Target Code**: `server/config.ts`, `server/drive/traversal.ts`, `server/drive/cache.ts`, `server/subtitles/matcher.ts`, `server/routes/drive.ts`  
**Test Suite**: `tests/adversarial/m1_auth_traversal_stress.test.ts` (23 empirical test cases)  
**Verdict**: **`REQUEST_CHANGES`**  

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

While credentials parsing from environment variables (JSON / Base64 / unpadded Base64), diacritics stripping via Unicode NFD, and in-memory cache concurrency/TTL/invalidation perform robustly, empirical stress testing surfaced **4 critical/high-severity vulnerabilities and logic bugs** in folder traversal, credentials fallback, and subtitle matching:

1. **Folder Traversal / Router Failure on Trailing Slashes**: `matchCategory()` and `normalizeCategoryParam()` return `null` for folder names or URL route parameters containing trailing slashes (e.g. `Películas/`, `peliculas/`), causing unexpected 404 errors on API endpoints.
2. **Subtitle Matcher False Association on Single Subtitle (Rule 3)**: Unrelated movies are assigned arbitrary subtitles when a single subtitle exists in a folder (or across the entire category in `DriveTraversalEngine.listCategoryItems`).
3. **Subtitle Matcher Prefix Collision on Sequels (Rule 2)**: Prefix matching fails to validate language tokens, causing base movies (e.g. `Matrix.mkv`) to match sequels (e.g. `Matrix.Reloaded.2003.srt` and `Matrix.Revolutions.2003.srt`).
4. **Multiple `<track default>` Violations (Rule 1)**: When both `.srt` and `.vtt` exist with the same base name, both are flagged with `isDefault: true`, violating HTML5 video specs on Tizen 4.0 / Chromium M56.
5. **Incomplete Fallback Credentials Validation**: `loadCredentials()` returns incomplete credential objects from `GOOGLE_APPLICATION_CREDENTIALS` or `credentials.json` without verifying mandatory `client_email` and `private_key` fields.

---

## Challenges

### [High] Challenge 1: Trailing Slashes in Folder Traversal and Category Routes
- **Assumption challenged**: The folder matching engine assumes folder names and route parameters are strictly stripped of trailing slashes.
- **Attack scenario**: A user, Drive folder, or HTTP client requests `/api/drive/files/peliculas/` or Drive returns a folder named `Películas/`.
  In `server/drive/traversal.ts`:
  ```ts
  export function normalizeString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
  ```
  `normalizeString("Películas/")` produces `"peliculas/"`. Then `/^(peliculas|cine|movies)$/.test("peliculas/")` returns `false`, resulting in `matchCategory` returning `null`.
- **Blast radius**: `GET /api/drive/files/peliculas/` returns HTTP 404 `Category 'peliculas/' not found`. Categories with trailing slashes in Drive fail to resolve.
- **Mitigation**: Update `normalizeString` to strip leading and trailing slashes:
  ```ts
  export function normalizeString(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/^[\\/]+|[\\/]+$/g, '')
      .toLowerCase();
  }
  ```

---

### [High] Challenge 2: Single Subtitle Fallback Causes Cross-Movie Subtitle Contamination
- **Assumption challenged**: If only one subtitle exists in a directory, it is assumed to belong to the requested video.
- **Attack scenario**: A folder contains multiple movies (or an unrelated movie and subtitle), e.g. `Superman.2006.mkv` and `Batman.2005.es.srt`.
  In `server/subtitles/matcher.ts`:
  ```ts
  // Rule 3: Single subtitle file in directory fallback
  else if (subtitleFiles.length === 1) {
    matched = true;
    isDefault = true;
    ...
  }
  ```
  `Superman.2006.mkv` receives `Batman.2005.es.srt` as its default subtitle.
  **Aggravating Factor**: In `server/drive/traversal.ts` lines 174–180:
  ```ts
  for (const video of videoFiles) {
    const matchedSubs = matchSubtitlesForVideo(
      video.name,
      subtitleFiles.map((s) => ({ id: s.id, name: s.name, size: s.size }))
    );
    video.subtitles = matchedSubs;
  }
  ```
  `subtitleFiles` is the list of **all subtitle files across the entire category**, not scoped to the video's parent folder! If a category has 50 movies and 1 subtitle file anywhere in the category, ALL 50 movies receive that subtitle!
- **Blast radius**: Movies are served subtitles for completely unrelated titles, corrupting the viewing experience on Samsung Smart TV.
- **Mitigation**: 
  1. Scope subtitle matching in `traversal.ts` strictly to files sharing the same `parentFolderId`.
  2. In `matcher.ts` Rule 3, require that `videoBase` and `subNameWithoutExt` have some token overlap or title similarity before applying single-file fallback.

---

### [High] Challenge 3: Prefix Collision Matches Sequels and Other Movies
- **Assumption challenged**: If a subtitle name starts with the video base name, the remaining suffix must be language/forced tokens.
- **Attack scenario**: A directory contains `Matrix.mkv` and subtitles for its sequels: `Matrix.Reloaded.2003.srt` and `Matrix.Revolutions.2003.srt`.
  In `server/subtitles/matcher.ts`:
  ```ts
  else if (subNameWithoutExt.startsWith(videoBase)) {
    matched = true;
    const suffix = subNameWithoutExt.substring(videoBase.length).replace(/^[._ -]+/, '');
    const tokens = suffix.split(/[._ -]+/);
    ...
  ```
  `subNameWithoutExt` (`'matrix.reloaded.2003'`) starts with `videoBase` (`'matrix'`).
  None of `reloaded` or `2003` are in `LANGUAGE_MAP`.
  `matched` remains `true` and `lang` defaults to `'es'`.
  Result: `Matrix.mkv` receives 2 invalid subtitle tracks belonging to `Matrix Reloaded` and `Matrix Revolutions`.
- **Blast radius**: Franchises with sequels (Matrix, Alien, Toy Story, Iron Man, etc.) will mix up subtitles across movie installments.
- **Mitigation**: In Rule 2, only set `matched = true` if at least one token is a recognized language or modifier from `LANGUAGE_MAP`, OR verify that all tokens in the suffix are valid modifier tokens (e.g. language, `forced`, `full`, `cc`, `sdh`, resolution tags).

---

### [Medium] Challenge 4: Multiple Tracks Flagged as `isDefault: true`
- **Assumption challenged**: Only one track will be marked default per video.
- **Attack scenario**: A folder has both `Movie.srt` and `Movie.vtt`.
  Both trigger Rule 1:
  ```ts
  if (subNameWithoutExt === videoBase) {
    matched = true;
    isDefault = true;
    label = 'Español (Predeterminado)';
  }
  ```
  Both tracks are returned with `isDefault: true`.
  Because `results.some(r => r.isDefault)` is now true, the deduplication block at line 104 does not normalize them.
- **Blast radius**: HTML5 `<video>` element on Chromium M56 / Tizen 4.0 receives two `<track default>` elements, causing unpredictable track selection or rendering bugs.
- **Mitigation**: Enforce that at most one track retains `isDefault: true` across the returned array (e.g. prioritize VTT over SRT or first match).

---

### [Medium] Challenge 5: Credentials Fallback Missing Field Validation
- **Assumption challenged**: Fallback credential files (`credentials.json` or `GOOGLE_APPLICATION_CREDENTIALS`) contain valid Service Account schemas.
- **Attack scenario**: A user creates a partial `credentials.json` (e.g. containing only `project_id`).
  `loadCredentials()` in `server/config.ts`:
  - Lines 49-51 validate `client_email` and `private_key` for `GOOGLE_SERVICE_ACCOUNT_KEY`.
  - Lines 60-87 for file fallbacks only parse JSON and replace `\\n` without checking `!parsed.client_email || !parsed.private_key`.
- **Blast radius**: `loadCredentials` returns `{ project_id: '...' }` as valid credentials. The server boots, but crashes during Google Drive API requests.
- **Mitigation**: Add uniform validation in `loadCredentials`:
  ```ts
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid credentials: client_email or private_key missing');
  }
  ```

---

## Stress Test Results

| Test ID | Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|
| **ST-01** | Malformed raw JSON in env var | Throw informative parse error | Throws `Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON` | **PASS** |
| **ST-02** | Base64 decodes to non-JSON | Throw parse error | Throws `Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON` | **PASS** |
| **ST-03** | Missing `private_key` / `client_email` in env var | Throw validation error | Throws `Invalid credentials: client_email or private_key missing` | **PASS** |
| **ST-04** | Base64 unpadded (stripped `=`) | Decodes correctly | Decodes and validates valid credentials | **PASS** |
| **ST-05** | Literal `\n` vs escaped `\\n` vs CRLF | Converted to real newlines, no raw `\\n` | Literal newlines preserved, `\\n` replaced | **PASS** |
| **ST-06** | Empty / whitespace env vars | Cascade to fallback or throw | Falls back or throws `No Google Service Account credentials found` | **PASS** |
| **ST-07** | Partial credentials in fallback file | Throw missing fields error | Returns incomplete object `{ project_id: ... }` without throwing | **FAIL** (Vulnerability) |
| **ST-08** | Spanish accents (`Películas`, `Música`, `Fotografías`) | Matches canonical category | Matches `peliculas`, `musica`, `fotos` | **PASS** |
| **ST-09** | Unicode NFC vs NFD forms | Normalizes and matches | Both NFC and NFD match | **PASS** |
| **ST-10** | Trailing slashes in folder names (`Películas/`) | Strip slash & match category | Returns `null` | **FAIL** (Bug) |
| **ST-11** | Trailing slash in `normalizeCategoryParam` (`peliculas/`) | Normalize & match category | Returns `null` (HTTP 404) | **FAIL** (Bug) |
| **ST-12** | Cache concurrent read/write (2,000 ops) | Zero crashes, thread-safe | 2,000 ops completed in 23ms without error | **PASS** |
| **ST-13** | Cache TTL expiration (60ms) | Returns null after TTL | Key expired after 90ms, returned null | **PASS** |
| **ST-14** | Manual refresh (`memoryCache.clear()`) | Clears all keys (`size() === 0`) | All keys cleared, size = 0 | **PASS** |
| **ST-15** | Subtitle language & forced tags | Correct code & label | `es`, `en`, `pt`, `isForced: true` correctly assigned | **PASS** |
| **ST-16** | Subtitle case insensitivity (`.MKV`, `.ES.SRT`) | Case-insensitive match | Matches correctly | **PASS** |
| **ST-17** | Subtitle containers (`.mkv`, `.mp4`, `.avi`, `.mov`) | Stems container extension | Matches correctly across all containers | **PASS** |
| **ST-18** | Single subtitle fallback (Rule 3) with unrelated movie | Reject unrelated subtitle | Falsely matches `Superman` with `Batman.es.srt` | **FAIL** (Bug) |
| **ST-19** | Prefix match (Rule 2) with movie sequel | Reject sequel subtitle | Falsely matches `Matrix` with `Matrix.Reloaded.srt` | **FAIL** (Bug) |
| **ST-20** | Duplicate base name default flag (`.srt` + `.vtt`) | Exactly 1 default track | Returns 2 tracks with `isDefault: true` | **FAIL** (Bug) |

---

## Unchallenged Areas

- **Google Drive v3 Live Quota/Rate Limits**: Challenged via simulated headers in unit tests; live Google Drive quota exhaustion was not tested against live Google servers due to missing live API keys in local development sandbox.
- **Embedded MKV Subtitle Extraction**: Out of scope for M1 proxy tier (requires demuxing on client or ffmpeg transcoding, which is handled at M2/M3 level).
