# Blueprint: Rule 3 Subtitle Matcher Fix Strategy

**Target File**: `server/subtitles/matcher.ts`  
**Author**: `explorer_m1_rule3_1`  
**Date**: 2026-10-13  
**Patch Reference**: `.agents/teamwork/explorer_m1_rule3_1/proposed_matcher.patch`  

---

## 1. Executive Summary

Empirical testing (`tests/adversarial/m1_auth_traversal_stress.test.ts`) revealed three critical defects in subtitle matching when directories contain a single subtitle file under Rule 3 (`server/subtitles/matcher.ts:117-140`):
1. **Solo Sequel False Positive**: `Matrix.Reloaded.2003.srt` matches parent movie `Matrix.mkv` as a Spanish default track because both share the word `"matrix"`.
2. **Stopword Overlap False Positive**: `The.Dark.Knight.srt` matches unrelated movie `The.Movie.mkv` because both share the 3-letter word `"The"`.
3. **Hyphenated Generic Language Code Drop**: `es-la.srt` fails to match `Gladiator.2000.1080p.mkv` because delimiter splitting separates `es` and `la`, and `MODIFIER_TOKENS` was omitted from line 120.

This blueprint eliminates all loose single-token overlap (`hasTitleOverlap`), expands language recognition to compound tags and missing aliases (`espanol`, `español`), and implements strict two-branch matching for single subtitle files:
- **Branch (a)**: Recognized generic subtitle / language codes.
- **Branch (b)**: Title prefix followed strictly by delimiter boundary and known qualifier tokens (identical to Rule 2).

---

## 2. Root Cause Analysis

### Bug 1: Solo Sequel Subtitle Overlap
- **Code**: `server/subtitles/matcher.ts:123-126`:
  ```ts
  const videoTokens = cleanVideoBase.split(/[._ -]+/).filter((t) => t.length > 2);
  const hasTitleOverlap = tokens.some((t) => videoTokens.includes(t));
  ```
- **Mechanism**: When `subtitleFiles.length === 1`, Rule 2 correctly rejects `Matrix.Reloaded.2003.srt` for `Matrix.mkv` because `reloaded` is not a qualifier. However, execution falls through to Rule 3, where `videoTokens` is `['matrix']` and `tokens` is `['matrix', 'reloaded', '2003']`. Because `tokens.some(...)` finds `'matrix'`, `hasTitleOverlap` evaluates to `true`.
- **Impact**: Sequels or unrelated media sharing any title word are falsely associated and forced as Spanish Default.

### Bug 2: Stopword Overlap
- **Mechanism**: In `server/subtitles/matcher.ts:123`, `videoTokens` only filters `t.length > 2`. Any word with 3 or more letters passes, including stopwords like `"The"`, `"Los"`, `"War"`, `"Man"`.
- **Impact**: Any movie beginning with `"The"` (e.g. `The.Movie.mkv`) matches any single subtitle beginning with `"The"` (e.g. `The.Dark.Knight.srt`).

### Bug 3: Hyphenated Subtitle Code `es-la.srt` Dropped
- **Code**: `server/subtitles/matcher.ts:118-121`:
  ```ts
  const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);
  const isGeneric = tokens.length > 0 && tokens.every(
    (t) => GENERIC_SUB_TOKENS.has(t) || LANGUAGE_MAP[t] || FORCED_TOKENS.has(t) || /^\d+$/.test(t)
  );
  ```
- **Mechanism**: The delimiter regex `/[._ -]+/` splits `es-la` into `['es', 'la']`. Token `'es'` is in `LANGUAGE_MAP`, but token `'la'` is only defined in `MODIFIER_TOKENS`. Line 120 omits `MODIFIER_TOKENS`, so `isGeneric` evaluates to `false`. Moreover, `LANGUAGE_MAP['es-la']` was never consulted directly.
- **Impact**: Legitimate Latin American subtitles are dropped, leaving Spanish speakers without subtitles.

---

## 3. Exact Fix Architecture

### 3.1 Total Removal of `hasTitleOverlap`
Remove `videoTokens` and `hasTitleOverlap` completely from `server/subtitles/matcher.ts`. Subtitles must never match based on partial token intersection.

### 3.2 Enhanced Language Mapping & Extraction
1. Add `espanol` and `español` to `LANGUAGE_MAP`:
   ```ts
   espanol: { code: 'es', label: 'Español' },
   español: { code: 'es', label: 'Español' },
   ```
2. Introduce `parseTokensQualifier(tokens: string[])` helper:
   - Scans adjacent tokens to detect compound language tags such as `${t}-${next}` (e.g. `es-la`, `es-419`).
   - Extracts language code, label, and forced status deterministically.

### 3.3 Year and Clean Title Extraction
Introduce `YEAR_REGEX`:
```ts
const YEAR_REGEX = /[._ -]+(?:19\d{2}|20\d{2})(?:[._ -]+.*)?$/i;
const cleanVideoTitle = cleanVideoBase.replace(YEAR_REGEX, '');
```
This enables exact title matching for candidates like `Gladiator.srt` against `Gladiator.2000.1080p.mkv`.

### 3.4 Revised Rule 3 Logic
When `!matched && subtitleFiles.length === 1`:
```ts
const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);

const isGeneric =
  Boolean(LANGUAGE_MAP[subNameWithoutExt]) ||
  GENERIC_SUB_TOKENS.has(subNameWithoutExt) ||
  (tokens.length > 0 &&
    tokens.every(
      (t) =>
        GENERIC_SUB_TOKENS.has(t) ||
        Boolean(LANGUAGE_MAP[t]) ||
        FORCED_TOKENS.has(t) ||
        MODIFIER_TOKENS.has(t) ||
        /^\d+$/.test(t)
    ));

if (isGeneric) {
  matched = true;
  if (LANGUAGE_MAP[subNameWithoutExt]) {
    lang = LANGUAGE_MAP[subNameWithoutExt].code;
    label = LANGUAGE_MAP[subNameWithoutExt].label;
  } else {
    const parsed = parseTokensQualifier(tokens);
    lang = parsed.lang;
    label = parsed.label;
    isForced = parsed.isForced;
  }
} else {
  // Condition (b): Prefix match against cleanVideoBase or cleanVideoTitle with delimiter and ONLY qualifier tokens
  const candidateBases = [cleanVideoBase].filter(Boolean);
  if (cleanVideoTitle && cleanVideoTitle !== cleanVideoBase) candidateBases.push(cleanVideoTitle);

  for (const baseToMatch of candidateBases) {
    if (subNameWithoutExt.startsWith(baseToMatch)) {
      const rest = subNameWithoutExt.substring(baseToMatch.length);
      const delimiterMatch = rest.match(/^[._ -]+/);

      if (delimiterMatch) {
        const suffix = rest.slice(delimiterMatch[0].length);
        const suffixTokens = suffix.split(/[._ -]+/).filter(Boolean);

        if (
          suffixTokens.length > 0 &&
          suffixTokens.every(isKnownQualifierToken)
        ) {
          matched = true;
          const parsed = parseTokensQualifier(suffixTokens);
          lang = parsed.lang;
          label = parsed.label;
          isForced = parsed.isForced;
          break;
        }
      }
    }
  }
}
```

---

## 4. Test Matrix & Empirical Validation Results

The proposed fix was verified with `test_proposed.ts` and `test_edge_cases.ts`:

| # | Scenario | Video File | Subtitle Candidate(s) | Expected Result | Verified Result |
|---|----------|------------|-----------------------|-----------------|-----------------|
| 1 | Solo sequel overlap | `Matrix.mkv` | `Matrix.Reloaded.2003.srt` | 0 matches | **0 matches (PASS)** |
| 2 | Stopword overlap | `The.Movie.mkv` | `The.Dark.Knight.srt` | 0 matches | **0 matches (PASS)** |
| 3 | Hyphenated code | `Gladiator.2000.1080p.mkv` | `es-la.srt` | 1 match (`es-LA`, default) | **1 match (`es-LA`, default) (PASS)** |
| 4 | Clean movie title | `Gladiator.2000.1080p.mkv` | `Gladiator.srt` | 1 match (default) | **1 match (default) (PASS)** |
| 5 | Generic subtitle names | `Gladiator.2000.1080p.mkv` | `spanish.srt`, `es.srt`, `sub.srt`, `subtitles.vtt` | 1 match each | **1 match each (PASS)** |
| 6 | Multi-candidate sequels | `Matrix.mkv` | `Matrix.Reloaded.2003.srt`, `Matrix.Revolutions.2003.srt`, `Matrix2.srt` | 0 matches | **0 matches (PASS)** |
| 7 | Legitimate video tracks | `Matrix.1999.1080p.BluRay.x264.mkv` | 4 legitimate Matrix (1999) subtitles | 4 matches | **4 matches (PASS)** |
| 8 | Unrelated movies | `Interstellar.2014.mkv` | `Inception.2010.es.srt`, `Batman.2008.srt` | 0 matches | **0 matches (PASS)** |
| 9 | Unrelated solo movie | `Superman.2006.mkv` | `Batman.2005.es.srt` | 0 matches | **0 matches (PASS)** |
| 10 | BCP 47 Numeric | `Movie.mkv` | `es-419.srt` | 1 match (`es-LA`) | **1 match (`es-LA`) (PASS)** |
| 11 | Spanish alias | `Movie.mkv` | `espanol.srt` | 1 match (`es`) | **1 match (`es`) (PASS)** |
| 12 | Generic forced track | `Movie.mkv` | `spanish.forced.srt` | 1 match (`isForced: true`) | **1 match (`isForced: true`) (PASS)** |
| 13 | Sequel with numbers | `Alien.1979.mkv` | `Alien.3.1992.srt` | 0 matches | **0 matches (PASS)** |
| 14 | Plural sequel | `Alien.1979.mkv` | `Aliens.1986.srt` | 0 matches | **0 matches (PASS)** |

---

## 5. Implementation Instructions for Worker Agent

1. Open `server/subtitles/matcher.ts`.
2. Apply the patch from `.agents/teamwork/explorer_m1_rule3_1/proposed_matcher.patch` or replace lines 13-145 with the revised logic specified in Section 3.
3. Run the adversarial stress test suite:
   ```powershell
   npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts
   ```
   **Expected**: 27 tests passed, 0 failed.
4. Run the unit test suite:
   ```powershell
   npx tsx --test tests/unit/m1/matcher.test.ts
   ```
   **Expected**: 7 tests passed, 0 failed.
