# Adversarial Challenge Report: Auth, Traversal, Subtitles & Caching (M1)

**Agent**: `challenger_m1_3` (Empirical Challenger)  
**Date**: 2026-10-13  
**Target Files**:
- `server/subtitles/matcher.ts`
- `server/drive/traversal.ts`
- `server/config.ts`
- `server/routes/drive.ts`
- `tests/adversarial/m1_auth_traversal_stress.test.ts`

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

While 3 of the 4 previous challenger findings have been properly resolved (trailing slashes, folder-scoped subtitles, and unique default track resolution), empirical stress testing of the subtitle matching engine uncovered a **critical flaw in Rule 3**:
When a directory contains a video and a single subtitle file that belongs to a sequel (or unrelated movie sharing a word like "The"), Rule 3 completely bypasses Rule 2's qualifier checks and forces a match, tagging it as the default Spanish subtitle. In addition, valid single generic Latin American subtitles (`es-la.srt`) are dropped.

---

## Status of Previous Challenger Findings

| # | Issue Identified by challenger_m1_2 | Status | Empirical Verification Result |
|---|---|---|---|
| 1 | Trailing slashes in folder names and route parameters produce 404 / null | **RESOLVED** | `matchCategory('Películas/')` -> `'peliculas'`, `normalizeCategoryParam('series///')` -> `'series'`, malformed paths return `null`. (PASS) |
| 2 | Rule 3 associates unrelated subtitles when single file in category | **PARTIALLY RESOLVED / REGRESSION** | Cross-folder leakage solved in traversal, BUT within the video's candidate list, Rule 3 matches sequels (`Matrix.Reloaded.srt`) and stopword collisions (`The.Dark.Knight.srt`). (FAIL) |
| 3 | Rule 2 falsely matches sequel subtitles to parent movies | **PARTIALLY RESOLVED** | Rule 2 qualifier checks work when candidates >= 2, but fail completely when candidates === 1 because Rule 3 overrides Rule 2. (FAIL) |
| 4 | Duplicate `isDefault: true` flags when both .srt and .vtt exist | **RESOLVED** | Argmax scoring ensures strictly <= 1 default track with WebVTT and Spanish prioritized. (PASS) |
| 5 | Fallback credentials file missing `client_email`/`private_key` returns without validation | **RESOLVED** | `validateAndNormalizeCredentials` strictly enforces required string properties across all loading mechanisms. (PASS) |

---

## Challenges

### [Critical] Challenge 1: Solo Sequel Subtitle Matches Parent Video via Rule 3 Title Overlap

- **Assumption challenged**: The worker assumed that adding `isKnownQualifierToken` to Rule 2 (`server/subtitles/matcher.ts:75-112`) was sufficient to prevent sequels from matching parent videos.
- **Attack scenario**: A user has `Matrix.mkv` in a folder and only one subtitle file is present: `Matrix.Reloaded.2003.srt` (or a sequel subtitle is downloaded).
  - Rule 2 correctly rejects it because `reloaded` is not a qualifier token.
  - However, Rule 3 immediately executes at line 117:
    ```ts
    if (!matched && subtitleFiles.length === 1) {
      ...
      const videoTokens = cleanVideoBase.split(/[._ -]+/).filter((t) => t.length > 2);
      const hasTitleOverlap = tokens.some((t) => videoTokens.includes(t));
      if (isGeneric || hasTitleOverlap) {
        matched = true;
    ```
  - Both `Matrix.mkv` and `Matrix.Reloaded.2003.srt` contain the token `'matrix'`.
  - `hasTitleOverlap` evaluates to `true`.
  - Because `reloaded` and `2003` are not in `LANGUAGE_MAP`, `lang` stays `'es'`, `label` stays `'Español'`, and line 180 sets `isDefault: true`.
- **Blast radius**:
  - `Matrix.mkv` receives `Matrix.Reloaded.2003.srt` as its default Spanish subtitle track.
  - `Terminator.1984.mkv` receives `Terminator.2.Judgment.Day.1991.srt`.
  - `Avatar.2009.mkv` receives `Avatar.The.Way.of.Water.2022.srt`.
  - The TV viewer sees subtitles from a completely different movie / sequel displayed on screen out of sync.
- **Why worker's unit test missed it**: In `tests/unit/m1/matcher.test.ts:69-79`, the worker tested `candidates` with 3 items (`[Matrix.Reloaded.2003.srt, Matrix.Revolutions.2003.srt, Matrix2.srt]`). Because `candidates.length === 3 !== 1`, Rule 3 never fired in the worker's unit test!
- **Mitigation**:
  Rule 3 must NOT use loose `tokens.some(t => videoTokens.includes(t))` to declare a match. If a subtitle is not purely generic (i.e. not in `GENERIC_SUB_TOKENS` / `LANGUAGE_MAP`), all tokens outside the matching video title base must be valid language or modifier qualifier tokens. Any additional title words (e.g. `reloaded`, `revolutions`, `2`, `judgment`) must disqualify the subtitle.

---

### [High] Challenge 2: Stopword Collisions in Rule 3 Associate Completely Unrelated Movies

- **Assumption challenged**: The worker assumed filtering tokens by length > 2 (`filter((t) => t.length > 2)`) avoids accidental word overlaps.
- **Attack scenario**: English and Spanish titles frequently begin with 3-letter articles/words like `"The"`, `"Los"`, `"Las"`, `"Una"`, `"War"`, `"Man"`, `"Day"`.
  - For video `The.Movie.mkv` and single subtitle `The.Dark.Knight.srt`:
  - `videoTokens` contains `['the', 'movie']`.
  - `tokens` contains `['the', 'dark', 'knight']`.
  - `tokens.some(t => videoTokens.includes(t))` evaluates to `true` on `'the'`.
  - `The.Movie.mkv` receives `The.Dark.Knight.srt` as its default Spanish subtitle.
- **Blast radius**: TV users watching any movie starting with "The" will have completely unrelated subtitles automatically loaded if a single subtitle starting with "The" exists in the folder.
- **Mitigation**: Exclude common stopwords from title token matching, or require that title tokens overlap on the primary distinctive noun, and ensure no conflicting title tokens exist.

---

### [Medium] Challenge 3: Hyphenated Generic Subtitle `es-la.srt` Dropped by Rule 3

- **Assumption challenged**: The worker assumed `tokens.every(...)` in line 120 validates all generic subtitle names.
- **Attack scenario**: A user has `Gladiator.mkv` and a single generic Spanish Latino subtitle `es-la.srt`.
  - In line 118: `tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);`
  - The hyphen `-` splits `es-la` into `['es', 'la']`.
  - Line 120 checks:
    ```ts
    tokens.every((t) => GENERIC_SUB_TOKENS.has(t) || LANGUAGE_MAP[t] || FORCED_TOKENS.has(t) || /^\d+$/.test(t))
    ```
  - While `'es'` matches `LANGUAGE_MAP`, `'la'` is only in `MODIFIER_TOKENS`. `MODIFIER_TOKENS` is omitted from line 120.
  - Result: `isGeneric` evaluates to `false`, `hasTitleOverlap` evaluates to `false`, and `es-la.srt` is dropped.
- **Blast radius**: Legitimate generic Latin American subtitles named `es-la.srt` fail to attach to single movies.
- **Mitigation**: Include `MODIFIER_TOKENS.has(t)` in line 120, or preserve hyphenated language codes like `es-la` / `es-419` during tokenization.

---

## Stress Test Results

Executed via: `npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts`  
Total Tests: 27 | Passed: 24 | Failed: 3

| Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|
| Credentials malformed JSON / Base64 / Missing keys | Throw descriptive Error | Throws descriptive Error | **PASS** |
| Fallback `credentials.json` missing required keys | Throw invalid credentials Error | Throws invalid credentials Error | **PASS** |
| Folder name trailing slashes (`Películas/`, `series///`, `musica//`) | Normalize to canonical category | Normalized to canonical category | **PASS** |
| Route param trailing slashes (`/files/peliculas/`, `series///`) | Normalize to canonical category | Normalized to canonical category | **PASS** |
| Malicious slash-only inputs (`/`, `///`, `../peliculas`) | Return `null` | Returns `null` | **PASS** |
| Cache 2,000 concurrent ops & TTL expiration | Thread-safe, exact TTL expiry | 0 race conditions, exact expiry | **PASS** |
| Multiple subtitles default track resolution | Strictly 1 default track, VTT/Spanish preferred | Exactly 1 default track tagged | **PASS** |
| Cross-folder subtitle traversal scoping | Movies only receive subtitles from own parent folder | Strictly scoped by `parentFolderId` | **PASS** |
| Sequel isolation with multiple candidates (`Matrix` vs `[Reloaded, Revolutions]`) | 0 matches | 0 matches | **PASS** |
| Solo sequel isolation (`Matrix.mkv` vs `[Matrix.Reloaded.2003.srt]`) | 0 matches | 1 match (falsely attached as Default Spanish) | **FAIL** |
| Stopword title overlap (`The.Movie.mkv` vs `[The.Dark.Knight.srt]`) | 0 matches | 1 match (falsely attached as Default Spanish) | **FAIL** |
| Generic Latin American subtitle (`Gladiator.mkv` vs `[es-la.srt]`) | 1 match | 0 matches (dropped due to token splitting) | **FAIL** |

---

## Unchallenged Areas

- **Live Google Drive API QPS Quotas**: Tested via mock error simulation header (`X-Simulate-Rate-Limit`) and local mock traversal engine, as live Google Cloud credentials with production quota were not available in this test phase.
