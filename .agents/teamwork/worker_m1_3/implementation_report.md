# Milestone 1: Subtitle Matcher Rule 3 Fix & Test Implementation Report

**Author**: Subtitle Matcher Worker (`worker_m1_3`)  
**Date**: 2026-10-13  
**Status**: Completed and 100% Verified  

---

## 1. Executive Summary

In Milestone 1, adversarial testing (`tests/adversarial/m1_auth_traversal_stress.test.ts`) discovered three vulnerability findings in `server/subtitles/matcher.ts` caused by loose title token overlap and flawed generic token validation under **Rule 3** (single-subtitle directory fallback):
1. **Solo Sequel False Positive**: A single subtitle file `Matrix.Reloaded.2003.srt` was matched to the parent movie `Matrix.mkv` because both contained the common word `'matrix'`.
2. **Stopword Overlap False Positive**: A single subtitle file `The.Dark.Knight.srt` was matched to unrelated movie `The.Movie.mkv` because both contained the 3-letter word `'The'`.
3. **Generic Latin American Rejection**: Generic Latin American Spanish subtitle `es-la.srt` was dropped for `Gladiator.2000.1080p.mkv` because hyphenated token splitting decomposed `es-la` into `['es', 'la']`, and `MODIFIER_TOKENS` was omitted from Rule 3's generic check.

`worker_m1_3` implemented the strict validation architecture in `server/subtitles/matcher.ts`, extended `tests/unit/m1/matcher.test.ts` with explicit regression tests, compiled the project cleanly (`npm run build`), and confirmed 100% pass rates across all unit, adversarial, and end-to-end test suites.

---

## 2. Code Changes

### 2.1. `server/subtitles/matcher.ts`
- **Language Mapping Expansion**:
  - Added `espanol` and `español` mappings directly into `LANGUAGE_MAP`.
  - Preserved existing compound tags `'es-la'` and `'es-419'` mapping to `{ code: 'es-LA', label: 'Español (Latino)' }`.
- **Title & Year Sanitization**:
  - Introduced `YEAR_REGEX = /[._ -]+(?:19\d{2}|20\d{2})(?:[._ -]+.*)?$/i;`.
  - Derived `cleanVideoTitle = cleanVideoBase.replace(YEAR_REGEX, '');` to allow clean title matching (e.g., `Gladiator.srt` matching `Gladiator.2000.1080p.mkv`).
- **Composite Language Token Parsing**:
  - Implemented `parseTokensQualifier(tokens: string[])`:
    - Scans token pairs to detect compound codes (e.g., `${t}-${next}` matching `es-la` or `es-419`).
    - Maps language code, label, and forced status (`isForced`) deterministically.
- **Rule 1 Updates**:
  - Supports exact matching against full base, clean release base (`cleanVideoBase`), or clean title base (`cleanVideoTitle`).
- **Rule 2 Updates**:
  - Checks candidate bases (`videoBase`, `cleanVideoBase`, `cleanVideoTitle`).
  - Requires delimiter boundary and strictly valid qualifier tokens, recognizing compound language tokens.
- **Rule 3 Overhaul (Elimination of `hasTitleOverlap`)**:
  - Removed `videoTokens` and `hasTitleOverlap` entirely.
  - Implemented strict two-branch matching for directories with a single subtitle candidate:
    - **Branch (a) - Generic Subtitles**: Subtitle name without extension is recognized in `LANGUAGE_MAP` or `GENERIC_SUB_TOKENS`, OR all split tokens belong to `GENERIC_SUB_TOKENS`, `LANGUAGE_MAP`, `FORCED_TOKENS`, `MODIFIER_TOKENS`, or digits.
    - **Branch (b) - Title Prefix with Delimiter Boundary & Pure Qualifiers**: Subtitle name must strictly start with `cleanVideoBase` or `cleanVideoTitle` followed by a boundary delimiter (`.`, `_`, `-`, ` `) and ONLY recognized qualifier tokens (`suffixTokens.every(isKnownQualifierToken)`). Extraneous sequel titles (e.g., `Reloaded`, `Revolutions`) are strictly rejected.

### 2.2. `tests/unit/m1/matcher.test.ts`
Added 3 targeted unit tests:
1. `Matcher: Rechaza subtítulo solitario de secuela (Matrix.mkv vs Matrix.Reloaded.2003.srt)`: Asserts that a solo sequel candidate is rejected for the parent video.
2. `Matcher: Rechaza subtítulo solitario por colisión de stopwords (The.Movie.mkv vs The.Dark.Knight.srt)`: Asserts that unrelated single subtitles sharing stopwords like "The" are rejected.
3. `Matcher: Acepta subtítulo genérico en español latino (Gladiator.mkv vs es-la.srt)`: Asserts that generic Latin American subtitles (`es-la.srt`) are accepted and marked default with language `es-LA`.

---

## 3. Verification Commands and Results

| Test Category | Command | Previous Result | Final Result | Status |
|---------------|---------|-----------------|--------------|--------|
| TypeScript Build | `npm run build` | Exit Code 0 | Exit Code 0 | **PASS** |
| Unit Tests (TS) | `npm run test:unit` | 92 / 92 | **95 / 95 (100%)** | **PASS** |
| Matcher Unit Tests | `npx tsx --test tests/unit/m1/matcher.test.ts` | 7 / 7 | **10 / 10 (100%)** | **PASS** |
| Adversarial Tests | `npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts` | 24 / 27 (88.9%) | **27 / 27 (100%)** | **PASS** |
| Full E2E Suite | `node tests/run-e2e.js` | 207 / 207 | **207 / 207 (100%)** | **PASS** |
| Unit Tests (Compiled Dist) | `npm run test:unit:dist` | 92 / 92 | **95 / 95 (100%)** | **PASS** |

### Adversarial Suite Run Details
```
✔ Credentials [Adversarial]: Corrupted raw JSON throws informative error
✔ Credentials [Adversarial]: Corrupted or invalid Base64 input
✔ Credentials [Adversarial]: Missing required fields (private_key or client_email)
✔ Credentials [Adversarial]: Base64 with and without padding
✔ Credentials [Adversarial]: Newline escaping (literal newlines vs escaped \n vs CRLF)
✔ Credentials [Adversarial]: Empty or whitespace environment variables cascading
✔ Credentials [Adversarial]: Fallback cascading to GOOGLE_APPLICATION_CREDENTIALS and credentials.json
✔ Credentials [Adversarial]: Incomplete credentials in credentials.json file fallback strictly rejected
✔ Folder Matcher [Adversarial]: Spanish accents and diacritics variations
✔ Folder Matcher [Adversarial]: Unicode NFC vs NFD forms
✔ Folder Matcher [Adversarial Resolution]: Trailing slashes in folder names
✔ Folder Matcher [Adversarial Resolution]: normalizeCategoryParam with trailing slashes and spaces
✔ Folder Matcher [Adversarial]: Slash-only or path traversal attempts return null
✔ Folder Matcher [Adversarial]: Non-matching folder names return null
✔ Cache [Adversarial]: Concurrent read/write stress test (2,000 operations)
[Adversarial Probe: Solo Sequel Bug] Matrix.mkv matched with Matrix.Reloaded.2003.srt: PASS
[Adversarial Probe: Stopword Collision] The.Movie.mkv matched with The.Dark.Knight.srt: PASS
[Adversarial Probe: es-la.srt Dropped] Gladiator matched with es-la.srt: PASS
✔ Cache [Adversarial]: TTL precision and expired entry cleanup
✔ Cache [Adversarial]: Manual refresh endpoint invalidation and concurrent eviction
✔ Subtitle Matcher [Adversarial]: Rule 2 rejects sequel subtitles when MULTIPLE candidates exist
✔ Subtitle Matcher [Adversarial Vulnerability Finding]: Solo sequel candidate falsely matched by Rule 3 title overlap
✔ Subtitle Matcher [Adversarial Vulnerability Finding]: Stopword "The" in title falsely matches unrelated movies via Rule 3
✔ Subtitle Matcher [Adversarial Vulnerability Finding]: Single subtitle with language code es-la.srt rejected by Rule 3
✔ Subtitle Matcher [Adversarial]: Legitimate subtitles for same video match correctly
✔ Subtitle Matcher [Adversarial]: Sequels match their own subtitles correctly
✔ Subtitle Matcher [Adversarial]: Single subtitle with generic names matches properly
✔ Subtitle Matcher [Adversarial Resolution]: Exactly one default track when multiple candidates exist
✔ Subtitle Matcher [Adversarial]: Empty candidates array produces 0 default tracks
✔ Traversal Engine [Adversarial Resolution]: Strict folder scoping prevents cross-movie contamination
ℹ tests 27 | suites 0 | pass 27 | fail 0
```

---

## 4. Conclusion

The Subtitle Matcher subsystem is now completely robust against solo sequel collisions, stopword title collisions, and hyphenated language code drops. All builds and automated test suites pass at 100%.
