# Handoff Report: Auth, Traversal, Subtitles & Caching (M1)

**Verdict**: **`REQUEST_CHANGES`**  
**Agent**: `challenger_m1_3` (Auth and Traversal Challenger)  
**Date**: 2026-10-13  
**Working Directory**: `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\challenger_m1_3`  
**Test Suite**: `tests/adversarial/m1_auth_traversal_stress.test.ts` (27 empirical tests: 24 passed, 3 failed)  

---

## 1. Observation

Direct empirical observations from executing `npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts`:

1. **Bug 1: Solo Sequel Subtitle Matches Parent Movie via Rule 3 Title Overlap**:
   - Command: `npx tsx -e "const { matchSubtitlesForVideo } = require('./server/subtitles/matcher'); console.log(matchSubtitlesForVideo('Matrix.mkv', [{ id: '1', name: 'Matrix.Reloaded.2003.srt' }]));"`
   - Output:
     ```json
     [
       {
         "id": "1",
         "name": "Matrix.Reloaded.2003.srt",
         "lang": "es",
         "label": "Español (Predeterminado)",
         "format": "srt",
         "isDefault": true,
         "isForced": false,
         "vttUrl": "/api/subtitles/1"
       }
     ]
     ```
   - Source: `server/subtitles/matcher.ts:117-140`:
     ```ts
     if (!matched && subtitleFiles.length === 1) {
       const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);
       ...
       const videoTokens = cleanVideoBase.split(/[._ -]+/).filter((t) => t.length > 2);
       const hasTitleOverlap = tokens.some((t) => videoTokens.includes(t));
       if (isGeneric || hasTitleOverlap) {
         matched = true;
     ```
   - Because `Matrix.mkv` and `Matrix.Reloaded.2003.srt` both contain the token `'matrix'`, `hasTitleOverlap` evaluates to `true`.
   - None of the sequel tokens match `LANGUAGE_MAP`, so `lang` defaults to `'es'`, `label` defaults to `'Español'`, and line 180 tags it `isDefault: true`.
   - The worker's unit test at `tests/unit/m1/matcher.test.ts:69-79` passed only because it provided 3 candidates (`candidates.length === 3`), completely bypassing Rule 3. The moment a single sequel subtitle exists, Rule 3 incorrectly attaches it.

2. **Bug 2: Stopword Title Overlap in Rule 3 Matches Unrelated Movies**:
   - Command: `npx tsx -e "const { matchSubtitlesForVideo } = require('./server/subtitles/matcher'); console.log(matchSubtitlesForVideo('The.Movie.mkv', [{ id: '1', name: 'The.Dark.Knight.srt' }]));"`
   - Output:
     ```json
     [
       {
         "id": "1",
         "name": "The.Dark.Knight.srt",
         "lang": "es",
         "label": "Español (Predeterminado)",
         "format": "srt",
         "isDefault": true,
         "isForced": false,
         "vttUrl": "/api/subtitles/1"
       }
     ]
     ```
   - Source: `server/subtitles/matcher.ts:123`: `videoTokens` only filters `t.length > 2`. Words like `"The"`, `"Los"`, `"War"` pass the length check, so any movie starting with `"The"` matches ANY subtitle starting with `"The"`.

3. **Bug 3: Hyphenated Generic Subtitle Code `es-la.srt` Dropped by Rule 3**:
   - Command: `npx tsx -e "const { matchSubtitlesForVideo } = require('./server/subtitles/matcher'); console.log(matchSubtitlesForVideo('Gladiator.mkv', [{ id: '1', name: 'es-la.srt' }]));"`
   - Output: `[]` (0 matches).
   - Source: `server/subtitles/matcher.ts:118-121`: Delimiter `/[._ -]+/` splits `es-la` into `['es', 'la']`. Token `'la'` is only in `MODIFIER_TOKENS`, but `MODIFIER_TOKENS` is omitted from line 120. `isGeneric` evaluates to `false`, and the subtitle is dropped.

4. **Resolved Findings Verified**:
   - **Trailing slashes**: `normalizeString` now strips trailing slashes via `.replace(/\/+$/, '')`. `matchCategory('Películas/')` returns `'peliculas'`, `normalizeCategoryParam('series///')` returns `'series'`.
   - **Unique default track**: Lines 156-184 perform argmax scoring across candidates, ensuring strictly 1 track has `isDefault: true` (preferring Spanish, full track, WebVTT).
   - **Folder-scoped subtitles**: Lines 179-192 in `server/drive/traversal.ts` group subtitles strictly by `parentFolderId`. In a mock 3-folder hierarchy, movies in separate folders are strictly isolated and orphan movies receive 0 subtitles.
   - **Credentials validation**: `validateAndNormalizeCredentials` is applied to all fallbacks, throwing when `client_email` or `private_key` are missing.

---

## 2. Logic Chain

1. **Step 1**: The orchestrator's specification (`ORIGINAL_REQUEST.md §R1`, `PROJECT.md`) requires automated and accurate subtitle detection for the Samsung Smart TV player.
2. **Step 2**: While the worker corrected Rule 2's prefix matcher when multiple candidates exist, the fallback logic in Rule 3 introduces an unchecked condition: `hasTitleOverlap = tokens.some(t => videoTokens.includes(t))`.
3. **Step 3**: Whenever a folder contains a video and a single subtitle from a sequel (e.g. `Matrix.mkv` and `Matrix.Reloaded.2003.srt`), Rule 3 matches the sequel subtitle as Spanish Default because they share the title token `'matrix'`.
4. **Step 4**: Similarly, any video sharing common 3-letter words like `"The"` matches unrelated subtitles (e.g. `The.Movie.mkv` matching `The.Dark.Knight.srt`), and legitimate generic subtitles like `es-la.srt` are discarded due to hyphen splitting.
5. **Step 5**: Because empirical execution of the expanded adversarial test suite directly reproduces these failures (3 test failures), the worker must implement targeted fixes to Rule 3 before Milestone 1 can be approved.

---

## 3. Caveats

- **Live Google Drive API QPS Quotas**: Quota exhaustion was evaluated using mock error headers (`X-Simulate-Rate-Limit`) and local mock traversal engines rather than live Google Cloud service account quotas.
- **Tizen HTML5 Video Component**: Default subtitle track behavior on Chromium M56 relies on receiving at most one `<track default>`, which was verified at the data schema level.

---

## 4. Conclusion

Explicit Verdict: **`REQUEST_CHANGES`**

The implementation resolved 3 of the 4 previous issues (trailing slashes, default track deduplication, folder-scoped traversal grouping, and credential fallbacks). However, **Rule 3 in `server/subtitles/matcher.ts` contains a regression**:
1. Solo sequel subtitles (`Matrix.Reloaded.2003.srt`) falsely attach to parent movies (`Matrix.mkv`) as default Spanish tracks.
2. Stopword overlaps (`"The"`) falsely associate unrelated movies under Rule 3.
3. Single generic Latin American subtitles (`es-la.srt`) are dropped due to hyphen tokenization.

---

## 5. Verification Method

To independently verify these findings, run the expanded adversarial test suite:

```powershell
npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts
```

Observe the test runner summary:
- Total: 27 tests (24 PASS, 3 FAIL)
- Failing test 1: `CRITICAL BUG DETECTED: Solo sequel subtitle "Matrix.Reloaded.2003.srt" was falsely matched to "Matrix.mkv" via Rule 3 title overlap!`
- Failing test 2: `CRITICAL BUG DETECTED: Unrelated subtitle "The.Dark.Knight.srt" was falsely matched to "The.Movie.mkv" due to stopword overlap "The" in Rule 3!`
- Failing test 3: `HIGH BUG DETECTED: Generic Latin American subtitle "es-la.srt" was dropped by Rule 3 due to token splitting of hyphenated language code!`

**Invalidation Conditions**:
- If Rule 3 requires that any non-generic single subtitle candidate matches the video base without additional non-qualifier tokens (rejecting sequels like `Reloaded`, `2`, `Judgment Day`), test 1 passes.
- If Rule 3 stops matching on generic 3-letter stopwords like `"The"`, test 2 passes.
- If Rule 3 includes `MODIFIER_TOKENS` in line 120 or preserves hyphenated language codes (`es-la`), test 3 passes.
