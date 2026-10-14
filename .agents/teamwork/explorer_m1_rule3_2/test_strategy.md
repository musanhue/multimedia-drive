# Subtitle Matcher Rule 3 Adversarial Test Strategy & Specification Report

**Document Target**: `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_rule3_2\test_strategy.md`  
**Author**: Adversarial Subtitle Test Explorer (`explorer_m1_rule3_2`)  
**Timestamp**: 2026-10-13T05:05:00Z  
**Status**: Investigation Complete — Ready for Implementation  

---

## 1. Executive Summary

During adversarial stress verification of the **Milestone 1** subtitle matching subsystem (`server/subtitles/matcher.ts`), an empirical evaluation of `tests/adversarial/m1_auth_traversal_stress.test.ts` and `tests/unit/m1/matcher.test.ts` was conducted.

### Current Suite Execution Baseline
- **`tests/unit/m1/matcher.test.ts`**: **7/7 tests PASS (100%)**
- **`tests/adversarial/m1_auth_traversal_stress.test.ts`**: **24/27 tests PASS (88.9%)**, **3 tests FAIL**
- **`tests/run-e2e.js` (Tiers 1–4)**: **207/207 tests PASS (100%)**

The 3 failing adversarial tests isolate three critical vulnerabilities in **Rule 3** (single-subtitle directory fallback) of `server/subtitles/matcher.ts`:
1. **Solo Sequel Collision**: When only one candidate exists (e.g. `Matrix.Reloaded.2003.srt`), Rule 3 matches it to `Matrix.mkv` because `'matrix'` overlaps, bypassing Rule 2's sequel rejection.
2. **Stopword Overlap**: The filter `t.length > 2` admits 3-letter stopwords like `"the"` or `"los"`, causing unrelated movies (e.g. `The.Movie.mkv` and `The.Dark.Knight.srt`) to match.
3. **Generic Latin American Subtitle Rejection**: Single subtitle file `es-la.srt` for `Gladiator.mkv` is dropped because hyphenated splitting breaks `es-la` into `['es', 'la']` and `MODIFIER_TOKENS` is omitted from Rule 3's `isGeneric` validation.

---

## 2. Complete Inventory & Status of All 27 Adversarial Tests

Suite: `tests/adversarial/m1_auth_traversal_stress.test.ts`

| # | Test Title | Section | Line | Current Result | Root Cause / Note |
|---|------------|---------|------|----------------|-------------------|
| 1 | Corrupted raw JSON throws informative error | Credentials | 19 | **PASS** | Validated JSON parser exception handling |
| 2 | Corrupted or invalid Base64 input | Credentials | 36 | **PASS** | Base64 decode error handling |
| 3 | Missing required fields (private_key / client_email) | Credentials | 50 | **PASS** | Schema validation |
| 4 | Base64 with and without padding | Credentials | 74 | **PASS** | Unpadded Base64 normalization |
| 5 | Newline escaping (literal vs `\n` vs CRLF) | Credentials | 100 | **PASS** | RSA PEM key newline normalization |
| 6 | Empty or whitespace environment variables cascading | Credentials | 132 | **PASS** | Cascading env fallback logic |
| 7 | Fallback cascading to `GOOGLE_APPLICATION_CREDENTIALS` | Credentials | 154 | **PASS** | File fallback priority |
| 8 | Incomplete credentials in `credentials.json` rejected | Credentials | 184 | **PASS** | File payload validation |
| 9 | Spanish accents and diacritics variations | Folder Matcher | 213 | **PASS** | NFD accent stripping |
| 10 | Unicode NFC vs NFD forms | Folder Matcher | 265 | **PASS** | Unicode canonical decomposition |
| 11 | Trailing slashes in folder names (`Películas/`) | Folder Matcher | 277 | **PASS** | Trailing slash trimming |
| 12 | `normalizeCategoryParam` with slashes and spaces | Folder Matcher | 309 | **PASS** | Route param normalization |
| 13 | Slash-only or path traversal attempts return null | Folder Matcher | 337 | **PASS** | Traversal injection barrier |
| 14 | Non-matching folder names return null | Folder Matcher | 357 | **PASS** | Category boundary filtering |
| 15 | Concurrent read/write stress test (2,000 ops) | Cache | 379 | **PASS** | In-memory concurrency safety |
| 16 | TTL precision and expired entry cleanup | Cache | 416 | **PASS** | In-memory TTL eviction |
| 17 | Manual refresh endpoint invalidation | Cache | 436 | **PASS** | Cache clear verification |
| 18 | Rule 2 rejects sequel subtitles when MULTIPLE candidates exist | Subtitle Matcher | 457 | **PASS** | Rule 2 candidate loop works correctly |
| 19 | Solo sequel candidate falsely matched by Rule 3 title overlap | Subtitle Matcher | 496 | **FAIL** | `Matrix.Reloaded.2003.srt` matches `Matrix.mkv` |
| 20 | Stopword "The" falsely matches unrelated movies via Rule 3 | Subtitle Matcher | 517 | **FAIL** | `The.Dark.Knight.srt` matches `The.Movie.mkv` |
| 21 | Single subtitle with language code `es-la.srt` rejected by Rule 3 | Subtitle Matcher | 534 | **FAIL** | `es-la.srt` dropped for `Gladiator.mkv` |
| 22 | Legitimate subtitles for same video match correctly | Subtitle Matcher | 551 | **PASS** | Exact and qualified multi-subs match |
| 23 | Sequels match their own subtitles correctly | Subtitle Matcher | 564 | **PASS** | Matrix Reloaded matches its own tracks |
| 24 | Single subtitle with generic names matches properly | Subtitle Matcher | 579 | **PASS** | `spanish.srt`, `es.srt`, `sub.srt`, `Gladiator.srt` match |
| 25 | Exactly one default track when multiple candidates exist | Subtitle Matcher | 601 | **PASS** | Deterministic score resolution |
| 26 | Empty candidates array produces 0 default tracks | Subtitle Matcher | 678 | **PASS** | Boundary check |
| 27 | Strict folder scoping prevents cross-movie contamination | Traversal Engine | 689 | **PASS** | Folder isolation preserves zero orphans |

---

## 3. Inventory & Status of All 7 Matcher Unit Tests

Suite: `tests/unit/m1/matcher.test.ts`

| # | Test Title | Line | Result | Subtitle Rule Exercised |
|---|------------|------|--------|-------------------------|
| 1 | Matcher: Coincidencia exacta de nombre de archivo base | 5 | **PASS** | **Rule 1** (Exact base match) |
| 2 | Matcher: Reconocimiento de sufijos de idioma múltiple y forzados | 21 | **PASS** | **Rule 2** (Prefix + language/forced suffixes) |
| 3 | Matcher: Subtítulo único en carpeta dedicada asocia por defecto | 47 | **PASS** | **Rule 3** (Single generic candidate: `spanish.srt`) |
| 4 | Matcher: No empareja subtítulos de otras películas | 58 | **PASS** | Multi-candidate rejection across different titles |
| 5 | Matcher: Rechaza colisiones de secuelas (Matrix.mkv vs Matrix.Reloaded.2003.srt) | 69 | **PASS** | **Rule 2** (Multiple sequel candidates rejected) |
| 6 | Matcher: Garantiza exactamente un subtítulo predeterminado con preferencia WebVTT | 81 | **PASS** | Post-matching default scoring (WebVTT > SRT) |
| 7 | Matcher: Rechaza subtítulo solitario en Rule 3 si los títulos son contradictorios | 95 | **PASS** | **Rule 3** (`Superman` vs `Batman.2005.es.srt`) |

*Critical Observation*: Unit test 5 passed only because it provided **3 candidates** (`Matrix.Reloaded.2003.srt`, `Matrix.Revolutions.2003.srt`, `Matrix2.srt`). When `folderFiles.length >= 2`, Rule 3 does not activate, and Rule 2 correctly rejects the suffixes. But when a folder contains a **single** sequel subtitle, Rule 3 activates and falsely matches!

---

## 4. In-Depth Root Cause Analysis

### Defect 1: Solo Sequel Candidate Bypasses Rule 2 via Rule 3 Title Overlap
**File**: `server/subtitles/matcher.ts`, lines 123–126:
```typescript
const videoTokens = cleanVideoBase.split(/[._ -]+/).filter((t) => t.length > 2);
const hasTitleOverlap = tokens.some((t) => videoTokens.includes(t));
```
- **Mechanism**: For `Matrix.mkv` and solo candidate `Matrix.Reloaded.2003.srt`, `videoTokens` is `['matrix']`. The candidate tokens are `['matrix', 'reloaded', '2003']`.
- **Fault**: The expression `tokens.some(t => videoTokens.includes(t))` evaluates to `true` on the common word `'matrix'`.
- **Impact**: Any solo sequel subtitle whose filename begins with the parent movie's root title is falsely associated with the parent video.

### Defect 2: 3-Letter Stopword Collision
**File**: `server/subtitles/matcher.ts`, line 123:
```typescript
const videoTokens = cleanVideoBase.split(/[._ -]+/).filter((t) => t.length > 2);
```
- **Mechanism**: The filter `t.length > 2` retains words with length >= 3. The English article `"the"` and Spanish articles like `"los"` or `"las"` have 3 letters.
- **Fault**: For `The.Movie.mkv` and `The.Dark.Knight.srt`, `videoTokens` contains `['the', 'movie']` and subtitle tokens contain `['the', 'dark', 'knight']`. The token `'the'` matches, returning `hasTitleOverlap = true`.
- **Impact**: Any movie whose title begins with `"The"` or `"Los"` will match ANY single subtitle beginning with the same article (e.g. `The.Matrix.mkv` matching `The.Godfather.srt`).

### Defect 3: Token Splitting of Hyphenated Language Codes & Omission of `MODIFIER_TOKENS`
**File**: `server/subtitles/matcher.ts`, lines 118–121:
```typescript
const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);
const isGeneric = tokens.length > 0 && tokens.every(
  (t) => GENERIC_SUB_TOKENS.has(t) || LANGUAGE_MAP[t] || FORCED_TOKENS.has(t) || /^\d+$/.test(t)
);
```
- **Mechanism**:
  1. The regex `/[._ -]+/` splits `es-la` by the hyphen `-` into `['es', 'la']`.
  2. While `'es'` is in `LANGUAGE_MAP`, `'la'` is NOT in `LANGUAGE_MAP` (only `'es-la'` and `'es-419'` are mapped as composite keys).
  3. `'la'` is defined in `MODIFIER_TOKENS`, but line 120 omits `MODIFIER_TOKENS`!
- **Fault**: `tokens.every(...)` returns `false` because `'la'` is not recognized. `isGeneric` becomes `false`. Because `Gladiator` shares no tokens with `es-la`, `es-la.srt` is completely dropped.
- **Impact**: Standard Latin American Spanish subtitle files (`es-la.srt`, `es-419.srt`) placed in dedicated movie folders are rejected.

---

## 5. Formulated Test Assertions

To establish rigorous verification across both test suites, the following four assertion suites are formulated.

### Suite 1: Solo Sequel Subtitle Rejection Assertions
**Target**: Verify that Rule 3 never associates a sequel subtitle with its parent video when presented as a solo candidate.

```typescript
// Assertion 1.1: Canonical Matrix vs Solo Matrix Reloaded
{
  const matches = matchSubtitlesForVideo('Matrix.mkv', [
    { id: 'sub_solo_reloaded', name: 'Matrix.Reloaded.2003.srt' },
  ]);
  assert.equal(matches.length, 0, 'Solo sequel Matrix.Reloaded.2003.srt must be rejected for Matrix.mkv');
}

// Assertion 1.2: Solo Matrix Revolutions
{
  const matches = matchSubtitlesForVideo('Matrix.mkv', [
    { id: 'sub_solo_revolutions', name: 'Matrix.Revolutions.2003.srt' },
  ]);
  assert.equal(matches.length, 0, 'Solo sequel Matrix.Revolutions.2003.srt must be rejected for Matrix.mkv');
}

// Assertion 1.3: Numbered Sequel without year (Matrix2.srt)
{
  const matches = matchSubtitlesForVideo('Matrix.mkv', [
    { id: 'sub_solo_matrix2', name: 'Matrix2.srt' },
  ]);
  assert.equal(matches.length, 0, 'Solo numbered sequel Matrix2.srt must be rejected for Matrix.mkv');
}

// Assertion 1.4: Multi-token sequel Terminator 2 vs Terminator (1984)
{
  const matches = matchSubtitlesForVideo('Terminator.1984.mkv', [
    { id: 'sub_solo_t2', name: 'Terminator.2.Judgment.Day.1991.srt' },
  ]);
  assert.equal(matches.length, 0, 'Solo sequel Terminator 2 must be rejected for Terminator (1984)');
}

// Assertion 1.5: Subtitle with conflicting release year
{
  const matches = matchSubtitlesForVideo('Alien.1979.mkv', [
    { id: 'sub_solo_alien3', name: 'Alien.3.1992.srt' },
  ]);
  assert.equal(matches.length, 0, 'Solo sequel Alien 3 (1992) must be rejected for Alien (1979)');
}
```

### Suite 2: Stopword Overlap Rejection Assertions
**Target**: Verify that non-distinctive grammatical particles and stopwords do not trigger false title matches under Rule 3.

```typescript
// Assertion 2.1: Canonical English article collision
{
  const matches = matchSubtitlesForVideo('The.Movie.mkv', [
    { id: 'sub_batman', name: 'The.Dark.Knight.srt' },
  ]);
  assert.equal(matches.length, 0, 'Unrelated subtitle The.Dark.Knight.srt must be rejected for The.Movie.mkv');
}

// Assertion 2.2: English article with release year
{
  const matches = matchSubtitlesForVideo('The.Godfather.1972.mkv', [
    { id: 'sub_prestige', name: 'The.Prestige.2006.srt' },
  ]);
  assert.equal(matches.length, 0, 'Stopword overlap "The" must not match The.Godfather with The.Prestige');
}

// Assertion 2.3: Spanish definite article collision ("El")
{
  const matches = matchSubtitlesForVideo('El.Orfanato.2007.mkv', [
    { id: 'sub_laberinto', name: 'El.Laberinto.del.Fauno.2006.srt' },
  ]);
  assert.equal(matches.length, 0, 'Spanish stopword overlap "El" must not match El.Orfanato with El.Laberinto');
}

// Assertion 2.4: Spanish plural article collision ("Los")
{
  const matches = matchSubtitlesForVideo('Los.Otros.2001.mkv', [
    { id: 'sub_vengadores', name: 'Los.Vengadores.2012.srt' },
  ]);
  assert.equal(matches.length, 0, 'Spanish stopword overlap "Los" must not match Los.Otros with Los.Vengadores');
}

// Assertion 2.5: Conjunction collision ("And" / "Y")
{
  const matches = matchSubtitlesForVideo('Beauty.and.the.Beast.1991.mkv', [
    { id: 'sub_fast', name: 'Fast.and.Furious.2001.srt' },
  ]);
  assert.equal(matches.length, 0, 'Conjunction "and" must not bridge unrelated titles');
}
```

### Suite 3: Generic Latin American Subtitle Acceptance Assertions
**Target**: Verify that generic Latin American Spanish subtitle tracks (`es-la.srt`, `es-419.srt`, `lat.srt`, `latino.srt`) are correctly accepted and mapped under Rule 3.

```typescript
// Assertion 3.1: Canonical Gladiator with es-la.srt
{
  const matches = matchSubtitlesForVideo('Gladiator.mkv', [
    { id: 'sub_es_la', name: 'es-la.srt' },
  ]);
  assert.equal(matches.length, 1, 'Generic Latin American subtitle es-la.srt must be accepted for Gladiator.mkv');
  assert.equal(matches[0].id, 'sub_es_la');
  assert.equal(matches[0].isDefault, true);
  assert.ok(matches[0].lang.startsWith('es'), 'Language code must be Spanish / Spanish Latin');
  assert.equal(matches[0].format, 'srt');
  assert.equal(matches[0].vttUrl, '/api/subtitles/sub_es_la');
}

// Assertion 3.2: Gladiator with release tags and es-la.srt
{
  const matches = matchSubtitlesForVideo('Gladiator.2000.1080p.mkv', [
    { id: 'sub_es_la_hd', name: 'es-la.srt' },
  ]);
  assert.equal(matches.length, 1, 'es-la.srt must match Gladiator with release tags');
  assert.equal(matches[0].isDefault, true);
}

// Assertion 3.3: UN M49 Latin America code es-419.srt
{
  const matches = matchSubtitlesForVideo('Gladiator.mkv', [
    { id: 'sub_es_419', name: 'es-419.srt' },
  ]);
  assert.equal(matches.length, 1, 'Generic es-419.srt must be accepted for Gladiator.mkv');
  assert.equal(matches[0].isDefault, true);
}

// Assertion 3.4: Abbreviated lat.srt
{
  const matches = matchSubtitlesForVideo('Gladiator.mkv', [
    { id: 'sub_lat', name: 'lat.srt' },
  ]);
  assert.equal(matches.length, 1, 'Generic lat.srt must be accepted for Gladiator.mkv');
  assert.equal(matches[0].isDefault, true);
}

// Assertion 3.5: Full word latino.srt
{
  const matches = matchSubtitlesForVideo('Gladiator.mkv', [
    { id: 'sub_latino', name: 'latino.srt' },
  ]);
  assert.equal(matches.length, 1, 'Generic latino.srt must be accepted for Gladiator.mkv');
  assert.equal(matches[0].isDefault, true);
}
```

### Suite 4: Non-Regression & Preservation Assertions
**Target**: Verify that all existing Rule 1 exact matches, Rule 2 qualified multi-candidate matches, and WebVTT priority defaults remain 100% stable.

```typescript
// Assertion 4.1: Exact base name match (Rule 1)
{
  const matches = matchSubtitlesForVideo('Avatar.2009.1080p.mkv', [
    { id: 'sub_1', name: 'Avatar.2009.1080p.srt' },
    { id: 'sub_2', name: 'Titanic.1997.srt' },
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'sub_1');
  assert.equal(matches[0].isDefault, true);
}

// Assertion 4.2: Multi-candidate language suffixes (Rule 2)
{
  const matches = matchSubtitlesForVideo('Matrix.1999.mkv', [
    { id: 'sub_forced', name: 'Matrix.1999.es.forced.srt' },
    { id: 'sub_spa', name: 'Matrix.1999.spa.srt' },
    { id: 'sub_eng', name: 'Matrix.1999.en.srt' },
  ]);
  assert.equal(matches.length, 3);
  const def = matches.find((m) => m.isDefault);
  assert.ok(def);
  assert.equal(def.id, 'sub_spa', 'Full Spanish track must be default');
}

// Assertion 4.3: Solo title-only subtitle in dedicated folder (Rule 3)
{
  const matches = matchSubtitlesForVideo('Gladiator.2000.1080p.mkv', [
    { id: 's6', name: 'Gladiator.srt' },
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 's6');
  assert.equal(matches[0].isDefault, true);
}

// Assertion 4.4: WebVTT priority over SRT
{
  const matches = matchSubtitlesForVideo('Movie.mkv', [
    { id: 'sub_srt', name: 'Movie.srt' },
    { id: 'sub_vtt', name: 'Movie.vtt' },
  ]);
  assert.equal(matches.length, 2);
  const def = matches.find((m) => m.isDefault);
  assert.equal(def?.id, 'sub_vtt');
}

// Assertion 4.5: Sequels match their own tracks when multiple exist
{
  const sequelVideo = 'Matrix.Reloaded.2003.1080p.mkv';
  const candidates = [
    { id: 'sub_m1', name: 'Matrix.1999.es.srt' },
    { id: 'sub_m2_es', name: 'Matrix.Reloaded.2003.es.srt' },
    { id: 'sub_m2_en', name: 'Matrix.Reloaded.2003.en.vtt' },
    { id: 'sub_m3', name: 'Matrix.Revolutions.2003.es.srt' },
  ];
  const matches = matchSubtitlesForVideo(sequelVideo, candidates);
  assert.equal(matches.length, 2);
  assert.ok(matches.some((m) => m.id === 'sub_m2_es'));
  assert.ok(matches.some((m) => m.id === 'sub_m2_en'));
}
```

---

## 6. Concrete Unit Tests to Add to `tests/unit/m1/matcher.test.ts`

The current `tests/unit/m1/matcher.test.ts` has 7 tests. To permanently lock in these bug fixes at the unit test level, the implementer should add the following 3 tests to `tests/unit/m1/matcher.test.ts`:

```typescript
test('Matcher: Rechaza subtítulo solitario de secuela (Matrix.mkv vs Matrix.Reloaded.2003.srt)', () => {
  const video = 'Matrix.mkv';
  const candidates = [{ id: 'sub_reloaded_solo', name: 'Matrix.Reloaded.2003.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 0, 'No debe emparejar un subtítulo de secuela solitario con la película base');
});

test('Matcher: Rechaza subtítulo solitario por colisión de stopwords (The.Movie.mkv vs The.Dark.Knight.srt)', () => {
  const video = 'The.Movie.mkv';
  const candidates = [{ id: 'sub_batman', name: 'The.Dark.Knight.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 0, 'No debe asociar subtítulos de películas no relacionadas por coincidencia de "The"');
});

test('Matcher: Acepta subtítulo genérico en español latino (Gladiator.mkv vs es-la.srt)', () => {
  const video = 'Gladiator.mkv';
  const candidates = [{ id: 'sub_es_la', name: 'es-la.srt' }];

  const matches = matchSubtitlesForVideo(video, candidates);
  assert.equal(matches.length, 1, 'Debe aceptar subtítulo genérico es-la.srt para Gladiator');
  assert.equal(matches[0].id, 'sub_es_la');
  assert.equal(matches[0].isDefault, true);
  assert.ok(matches[0].lang.startsWith('es'));
});
```

---

## 7. Proposed Solution & Code Patch for `server/subtitles/matcher.ts`

To resolve the 3 vulnerabilities while preserving all 27 adversarial tests and all unit tests, the following changes in `server/subtitles/matcher.ts` are proposed.

### 7.1. Add STOPWORDS and Extended Qualifier Helpers
Define a comprehensive stopword set and update qualifier token checking:

```typescript
// Stopwords for English and Spanish movie titles
const TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'de', 'del', 'al', 'en', 'con', 'por', 'para'
]);

function isGenericOrQualifierToken(token: string): boolean {
  return Boolean(
    LANGUAGE_MAP[token] ||
    FORCED_TOKENS.has(token) ||
    MODIFIER_TOKENS.has(token) ||
    GENERIC_SUB_TOKENS.has(token) ||
    /^\d+$/.test(token)
  );
}
```

### 7.2. Refined Rule 3 Logic in `matchSubtitlesForVideo`
Replace lines 114–140 of `server/subtitles/matcher.ts` with:

```typescript
    // Rule 3: Single subtitle file in directory fallback
    // Allowed ONLY IF:
    // (A) The subtitle file has a purely generic / qualifier name (e.g. spanish.srt, es.srt, es-la.srt, sub.srt, 1.srt)
    // (B) The subtitle specifically represents the video title (e.g. Gladiator.srt for Gladiator.2000.1080p.mkv),
    //     requiring substantive non-stopword title overlap, NO extraneous sequel title tokens, and matching release years.
    if (!matched && subtitleFiles.length === 1) {
      // Check composite language names like 'es-la' or 'es-419'
      const isDirectLanguageKey = Boolean(LANGUAGE_MAP[subNameWithoutExt]);
      const tokens = subNameWithoutExt.split(/[._ -]+/).filter(Boolean);

      // Check if all tokens are generic/qualifiers
      const isGeneric =
        isDirectLanguageKey ||
        (tokens.length > 0 && tokens.every(isGenericOrQualifierToken));

      let hasValidTitleMatch = false;

      if (!isGeneric) {
        // Extract substantive title tokens (excluding generic tokens, stopwords, and 4-digit release years)
        const subTitleTokens = tokens.filter(
          (t) => !isGenericOrQualifierToken(t) && !TITLE_STOPWORDS.has(t) && !/^(19\d\d|20\d\d)$/.test(t)
        );

        const rawVideoTokens = cleanVideoBase.split(/[._ -]+/).filter(Boolean);
        const videoTitleTokens = rawVideoTokens.filter(
          (t) => !isGenericOrQualifierToken(t) && !TITLE_STOPWORDS.has(t) && !/^(19\d\d|20\d\d)$/.test(t)
        );

        // Subtitle must share at least one substantive title word with the video
        const hasCommonTitleToken =
          subTitleTokens.length > 0 &&
          videoTitleTokens.length > 0 &&
          subTitleTokens.some((t) => videoTitleTokens.includes(t));

        // Subtitle must NOT introduce extra title tokens (e.g. "reloaded", "judgment", "resurrection")
        // that are absent in the parent video title!
        const hasExtraneousTokens = subTitleTokens.some((t) => !videoTitleTokens.includes(t));

        // Release years if both present must match
        const subYear = tokens.find((t) => /^(19\d\d|20\d\d)$/.test(t));
        const videoYear = rawVideoTokens.find((t) => /^(19\d\d|20\d\d)$/.test(t));
        const yearsCompatible = !subYear || !videoYear || subYear === videoYear;

        hasValidTitleMatch = hasCommonTitleToken && !hasExtraneousTokens && yearsCompatible;
      }

      if (isGeneric || hasValidTitleMatch) {
        matched = true;

        // If direct language code (e.g. es-la or es-419), take its defined metadata
        if (LANGUAGE_MAP[subNameWithoutExt]) {
          lang = LANGUAGE_MAP[subNameWithoutExt].code;
          label = LANGUAGE_MAP[subNameWithoutExt].label;
        } else if (tokens.includes('es') && (tokens.includes('la') || tokens.includes('419') || tokens.includes('latam'))) {
          lang = 'es-LA';
          label = 'Español (Latino)';
        }

        for (const token of tokens) {
          if (FORCED_TOKENS.has(token)) {
            isForced = true;
          } else if (!isDirectLanguageKey && !tokens.includes('la') && LANGUAGE_MAP[token]) {
            lang = LANGUAGE_MAP[token].code;
            label = LANGUAGE_MAP[token].label;
          }
        }
        if (isForced) {
          label += ' (Forzados)';
        }
      }
    }
```

---

## 8. Verification Plan & Expected Output

### Step 1: Run Adversarial Stress Test Suite
Command:
```powershell
npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts
```
**Expected Outcome**:
```
✔ Credentials [Adversarial]: Corrupted raw JSON throws informative error
...
✔ Subtitle Matcher [Adversarial Vulnerability Finding]: Solo sequel candidate falsely matched by Rule 3 title overlap
✔ Subtitle Matcher [Adversarial Vulnerability Finding]: Stopword "The" in title falsely matches unrelated movies via Rule 3
✔ Subtitle Matcher [Adversarial Vulnerability Finding]: Single subtitle with language code es-la.srt rejected by Rule 3
...
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
```
All **27/27 tests PASS**.

### Step 2: Run Unit Matcher Test Suite
Command:
```powershell
npx tsx --test tests/unit/m1/matcher.test.ts
```
**Expected Outcome**:
All tests (including new unit test additions) **PASS (10/10)**.

### Step 3: Run Full Unit Test Suite
Command:
```powershell
npx tsx --test tests/unit/m1/**/*.test.ts
```
**Expected Outcome**:
All 43+ unit tests **PASS**.

### Step 4: Run E2E Test Suite (Tiers 1–4)
Command:
```powershell
node tests/run-e2e.js
```
**Expected Outcome**:
All 207 tests across Tiers 1, 2, 3, and 4 **PASS (100%)**.
