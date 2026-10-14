# Handoff Report: Subtitle Logic Fix (`explorer_m1_fix_2`)

**Author**: Subtitle Logic Fix Explorer (`explorer_m1_fix_2`)  
**Date**: 2026-10-13  
**Working Directory**: `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_fix_2`  
**Target Files**: `server/subtitles/matcher.ts`, `server/drive/traversal.ts`  
**Fix Strategy**: `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_fix_2\fix_strategy.md`  

---

## 1. Observation

During empirical execution of `npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts`, the following specific anomalies were observed:

1. **Subtitle Sequel Collision (Rule 2)**:
   - Command output:
     ```text
     [Subtitle Probe] Matrix.mkv matched with Matrix.Reloaded: count = 2
     [Subtitle Anomaly Detected!] Matrix.mkv falsely matched with sequel subtitles: [ 'Matrix.Reloaded.2003.srt', 'Matrix.Revolutions.2003.srt' ]
     ```
   - Code location: `server/subtitles/matcher.ts:59-75`:
     ```ts
     else if (subNameWithoutExt.startsWith(videoBase)) {
       matched = true;
       const suffix = subNameWithoutExt.substring(videoBase.length).replace(/^[._ -]+/, '');
       const tokens = suffix.split(/[._ -]+/);
       for (const token of tokens) { ... }
     }
     ```
     `subNameWithoutExt` (`matrix.reloaded.2003`) starts with `videoBase` (`matrix`). Tokens `['reloaded', '2003']` do not match `LANGUAGE_MAP` or `forced`, but `matched` remains `true` and defaults to `lang = 'es'`, `label = 'Español'`.
     Additionally, missing boundary delimiter check would allow `Matrix2.srt` to match `Matrix.mkv`.

2. **Single Subtitle Fallback Contamination (Rule 3 & Traversal)**:
   - Command output:
     ```text
     [Subtitle Probe] Superman matched with Batman.2005.es.srt count = 1
     [Subtitle Anomaly Detected!] Superman got subtitle: Batman.2005.es.srt
     ```
   - Code location: `server/drive/traversal.ts:167-180`:
     `subtitleFiles` is gathered across the entire category and passed globally to `matchSubtitlesForVideo(video.name, subtitleFiles)`.
   - Code location: `server/subtitles/matcher.ts:77-87`:
     ```ts
     else if (subtitleFiles.length === 1) {
       matched = true;
       isDefault = true;
     ```
     When only 1 subtitle exists in the whole category, all movies receive it. Even in a single folder, unrelated movie subtitles were matched.

3. **Duplicate Default Tracks (Rule 1)**:
   - Command output:
     ```text
     [Subtitle Probe] Number of default tracks for Movie.mkv: 2
     ```
   - Code location: `server/subtitles/matcher.ts:52-57`:
     ```ts
     if (subNameWithoutExt === videoBase) {
       matched = true;
       isDefault = true;
     }
     ```
     Both `Movie.srt` and `Movie.vtt` match Rule 1 and both receive `isDefault: true`. The fallback check at line 104 (`if (results.length > 0 && !results.some((r) => r.isDefault))`) is bypassed.

---

## 2. Logic Chain

1. **Step 1 (Sequels)**: Observation 1 shows `Matrix.mkv` matching `Matrix.Reloaded.2003.srt` because `matched = true` was assigned without verifying that suffix tokens are valid subtitle qualifiers. By requiring: (a) delimiter boundary (`[._ -]`), (b) `tokens.every(isKnownQualifierToken)`, and (c) `tokens.some(t => isLangOrForced)`, sequel titles like `reloaded` and `2003` fail validation and are rejected.
2. **Step 2 (Release tags)**: In real-world folders, videos often include quality tags (`Batman.Begins.2005.1080p.mkv`) while subtitles omit them (`Batman.Begins.2005.es.srt`). Introducing clean base matching (`cleanVideoBase`) allows legitimate matches while the qualifier whitelist guarantees sequels remain excluded.
3. **Step 3 (Cross-folder contamination)**: Observation 2 shows `subtitleFiles` across the entire category passed to each video. Scoping `subtitleFiles` by `parentFolderId` in `DriveTraversalEngine.listCategoryItems` ensures videos only receive candidates located in their own folder.
4. **Step 4 (Cross-movie title collision)**: Observation 2 also shows Rule 3 unconditionally matching single files even if the title differs. Restricting Rule 3 to generic subtitle filenames (`spanish.srt`, `sub.srt`, `1_es.srt`) or subtitles containing the video's title token prevents unrelated titles (e.g. `Batman` vs `Superman`) from matching.
5. **Step 5 (Duplicate defaults)**: Observation 3 shows multiple tracks keeping `isDefault: true`. Establishing a deterministic priority selection at the end of `matchSubtitlesForVideo` (Spanish +100, full track +40, WebVTT +20) guarantees that strictly at most one track is default, and WebVTT is preferred over SRT for native browser efficiency.

---

## 3. Caveats

- **External subtitle naming conventions**: Unconventional subtitle names that embed non-standard distributor release tags (e.g., `Matrix.YIFY.es.srt`) could be rejected under Rule 2 if `yify` is not in the qualifier or release tags regex. Common descriptors (`sdh`, `cc`, `hi`, `default`, `sub`, `subs`, `full`, `completo`) and release tags (`1080p`, `bluray`, `web-dl`, etc.) are explicitly accounted for.
- **TV Player Support**: All tracks continue to be served via `/api/subtitles/:id` which handles SRT-to-WebVTT conversion; designating `.vtt` as default simply bypasses unnecessary conversion when native WebVTT is already present.

---

## 4. Conclusion

The root causes of the three subtitle matching defects have been identified, modeled, and fixed in `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_fix_2\fix_strategy.md`:
1. `server/subtitles/matcher.ts`: Replaced prefix logic with boundary delimiter and qualifier whitelist; updated Rule 3 with generic/title checks; implemented deterministic default track scoring.
2. `server/drive/traversal.ts`: Replaced global subtitle iteration with `parentFolderId`-scoped mapping.

The logic was empirically verified in `.agents/teamwork/explorer_m1_fix_2/test_matcher_logic.ts` with 100% test pass rate across all edge cases.

---

## 5. Verification Method

1. **Review Fix Strategy**:
   Inspect `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_fix_2\fix_strategy.md`.
2. **Run Explorer Verification Suite**:
   ```powershell
   npx tsx .agents/teamwork/explorer_m1_fix_2/test_matcher_logic.ts
   ```
   Confirm output:
   - `Matrix matches: [ 'Matrix.es.srt' ]` (sequels rejected)
   - `Superman with Batman subtitle matches: 0` (unrelated single subtitle rejected)
   - `Gladiator with spanish.srt matches: 1` (generic fallback preserved)
   - `Movie.mkv matches: Movie.vtt (default: true), Movie.srt (default: false)` (strictly 1 default, WebVTT preferred)
   - `All advanced tests passed successfully!`
3. **Post-Implementation Verification (by Worker)**:
   After `worker_m1_1` applies the changes:
   ```powershell
   npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts
   npx tsx --test tests/unit/m1/matcher.test.ts
   npm test
   ```
   **Invalidation Conditions**:
   - If `Matrix.mkv` matches `Matrix.Reloaded.2003.srt`, the boundary/qualifier fix failed.
   - If `Movie.mkv` produces >1 default track, the priority scoring block failed.
   - If `Superman.2006.mkv` receives `Batman.2005.es.srt`, the folder-scoping or generic check failed.
