# Handoff Report: Regex Sanitizer & Year Extractor Specification (`explorer_m2_1`)

**Target Milestone**: Milestone 2 (Metadata & Scraping Engine)  
**Agent**: `explorer_m2_1`  
**Date**: 2026-10-13  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **E2E Test Specifications for Feature F6**:
   - `tests/e2e/tier1-feature-coverage/f06-filename-regex-cleaning.test.js`:
     - Line 13-16: `Inception.2010.1080p.BluRay.x264-SPARKS.mkv` requires `res.json.cleanTitle === 'Inception'`, `res.json.year === 2010`.
     - Line 23-26: `El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4` requires `res.json.cleanTitle === 'El Secreto De Sus Ojos'`, `res.json.year === 2009`.
     - Line 33-36: `Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv` requires `res.json.cleanTitle === 'Blade Runner 2049'`, `res.json.year === 2017`.
     - Line 43-48: `Stranger.Things.S04E09.1080p.NF.mkv` requires `res.json.cleanTitle === 'Stranger Things'`, `res.json.isSeries === true`, `res.json.season === 4`, `res.json.episode === 9`.
     - Line 55-58: `Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv` requires `res.json.cleanTitle === 'Relatos salvajes'`, `res.json.year === 2014`.
   - `tests/e2e/tier2-boundary-corner/f06-regex-boundaries.test.js`:
     - Line 13-15: `1080p.x264.BluRay.mkv` requires `typeof res.json.cleanTitle === 'string'` without crashing.
     - Line 22-25: `The.Kid.1921.1080p.mkv` requires `res.json.cleanTitle === 'The Kid'`, `res.json.year === 1921`.
     - Line 32-35: `Dr..No...1962..1080p.mkv` requires `res.json.cleanTitle === 'Dr No'`, `res.json.year === 1962`.
     - Line 42-45: `El.laberinto.del.fauno.2006.1080p.mkv` requires `res.json.cleanTitle === 'El laberinto del fauno'`, `res.json.year === 2006`.
     - Line 52-58: String with 150 'A' characters + noise tags requires `res.json.year === 2020` and execution time `< 500ms`.

2. **Server Architecture & Interface Contract**:
   - `PROJECT.md` line 29: Feature F6 ("Clean scene tags, extract clean title and 4-digit release year / episode info").
   - `PROJECT.md` line 58: Contract `GET /api/metadata/enrich?title=...&year=...`.
   - `tests/harness/mock-server.js` line 438-442: Route `GET /api/metadata/clean-title?filename=...` returns `{ cleanTitle, year, isSeries, season, episode }`.

3. **Empirical Prototype Verification**:
   - Built and executed `.agents/teamwork/explorer_m2_1/verify_sanitizer.js` with 36+ real-world filenames and edge cases.
   - Result: All 36 cases passed with 100% accuracy, and the 200+ character string parsed in `0ms` with zero catastrophic backtracking.

---

## 2. Logic Chain

1. **Title vs Year Disambiguation (Observation 1, lines 33-36)**:
   - In `Blade.Runner.2049.2017`, `2049` and `2017` both match 4-digit years in `1900-2099`.
   - A single greedy or first-match regex consumes `2049`, truncating the title to `Blade Runner` and incorrectly marking `2049` as the release year.
   - By collecting all candidates via non-consuming lookahead `/(?:^|[._\s\(\[-])(19\d{2}|20\d{2})(?=[._\s\)\]-]|$)/g`, the algorithm identifies all year candidates. Selecting the last candidate preceding noise tags correctly yields `year: 2017` while preserving `2049` in `cleanTitle`.

2. **Extension Stripping Guard (Observation 1, lines 13 & 33)**:
   - A naive extension stripper `/\.[a-zA-Z0-9]{2,5}$/` strips `.2049` if a file is named `Blade.Runner.2049`.
   - The regex was specifically fortified with negative lookahead: `/\.(?!(?:19\d{2}|20\d{2})$)[a-zA-Z0-9]{2,5}$/`, ensuring 4-digit years are never stripped as file extensions.

3. **Compound Word Hyphen vs Delimiter Disambiguation (Observation 1, lines 13 & 55)**:
   - Titles such as `Spider-Man`, `WALL-E`, and `X-Men` contain hyphens that are part of proper nouns.
   - Scene group tags (`-SPARKS`, `-RARBG`) and dash delimiters (` - `) also use hyphens.
   - By converting dots and underscores to spaces first, then removing isolated hyphens (`\s+-\s+` and boundary dashes), hyphens flanked directly by alphanumeric characters (`[a-zA-Z0-9]-[a-zA-Z0-9]`) remain intact. Trailing hyphenated release groups (`-[a-zA-Z0-9]+$`) are explicitly pruned.

4. **Preservation of Spanish Diacritics (Observation 1, line 42 & 55)**:
   - Standard ASCII regex cleaners `/[^\w\s]/g` destroy Spanish characters (`á, é, í, ó, ú, ñ, ü, ¿, ¡`), mutating `Amélie` to `Amlie` and `Año Uno` to `Ao Uno`.
   - Applying `filename.normalize('NFC')` at Stage 0 and constraining punctuation cleaning to `^[^\wáéíóúÁÉÍÓÚñÑüÜ¿¡]+` guarantees complete diacritic fidelity.

5. **Linear ReDoS Safety (Observation 1, line 52-58)**:
   - Nested quantifier regexes cause exponential backtracking on long filenames.
   - The dictionary regex `NOISE_REGEX` operates strictly on atomic token alternations wrapped in an outer convergence loop (`while (cleaned !== prev)`), achieving `O(N)` linear runtime (<50ms).

---

## 3. Caveats

1. **Scope Boundaries**:
   - This task is an exploration and design specification (`explorer_m2_1`). Per constraints, no code in `server/` or `tests/` was modified.
   - Implementation of `server/metadata/sanitizer.ts`, `server/routes/metadata.ts`, and `tests/unit/m2/sanitizer.test.ts` is ready for implementation by the developer agent.
2. **Episode Names in Series**:
   - When a TV filename contains an episode title (e.g. `Breaking.Bad.S01E01.Pilot.mkv`), the title is truncated at `S01E01` to isolate the series title (`Breaking Bad`) required by TMDB's TV search API. The contract does not require an `episodeTitle` field.

---

## 4. Conclusion

The architectural design for `server/metadata/sanitizer.ts` is complete, fully validated, and documented in:
- `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_1\sanitizer_spec.md`

Key deliverables produced:
1. **8-Stage Sanitization Pipeline**: Extension stripping, TV series/episode detection, lookahead release year extraction, classified noise dictionary stripping, delimiter translation & compound hyphen preservation, bracket & group pruning, Spanish diacritic guard, and whitespace/numeric fallback.
2. **Comprehensive Noise Dictionary**: Complete classification covering resolutions, HDR/DV, video codecs, sources, audio codecs, streaming networks, editions, languages, and scene release groups.
3. **Exhaustive Edge Case Catalog**: 36 verified edge case mappings covering numeric titles, Spanish punctuation, TV variations, and boundary inputs.
4. **Concrete Unit Test Suite Specification**: Complete, ready-to-run test file for `tests/unit/m2/sanitizer.test.ts` using Node.js native test runner.

---

## 5. Verification Method

To independently verify the logic and prototype:

1. **Run Prototype Verification Script**:
   ```powershell
   node .agents/teamwork/explorer_m2_1/verify_sanitizer.js
   ```
   *Expected Output*: `ALL EXTENDED TESTS PASSED!` with 0ms execution time on long strings.

2. **Inspect Specification Blueprint**:
   - Open and review `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_1\sanitizer_spec.md`.
   - Confirm TypeScript interface `SanitizedMediaInfo`, stage helpers, and full production code in Section 4.

3. **Downstream Implementation Verification**:
   Once implemented by the developer agent, run:
   ```powershell
   npx tsx --test tests/unit/m2/sanitizer.test.ts
   node tests/run-e2e.js --tier=1
   node tests/run-e2e.js --tier=2
   ```
   *Pass Condition*: 100% of unit tests pass; tests F6-01 through F6-05 and F6-B01 through F6-B05 pass.
