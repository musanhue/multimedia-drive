# Subtitle Matcher Rule 3 Adversarial Challenge Report

## Challenge Summary

**Overall risk assessment**: LOW (All previously reported Rule 3 vulnerabilities are thoroughly mitigated, verified, and regression-free).

An empirical challenge and stress-testing campaign was executed against `server/subtitles/matcher.ts` focusing on the resolution of Rule 3 defects:
1. Verification of the 27-test adversarial suite `tests/adversarial/m1_auth_traversal_stress.test.ts`: **27/27 PASS (100%)**.
2. Verification of the four mandated aggressive edge cases:
   - `Spider.Man.mkv` vs `Spider.Man.2.srt` → **REJECTED (PASS)**
   - `Lord.of.the.Rings.mkv` vs `Lord.of.the.Flies.srt` → **REJECTED (PASS)**
   - `Avatar.mp4` vs `castellano.vtt` → **MATCHED & TAGGED SPANISH DEFAULT (PASS)**
   - `Dune.mkv` vs `es-419.srt` → **MATCHED & TAGGED SPANISH DEFAULT (PASS)**
3. Expanded stress harness across 10 additional sequel variants, 6 stopword collisions, 16 generic alias variants, and multi-candidate preference matrices in `tests/adversarial/m1_rule3_edge_cases.test.ts`: **9/9 PASS (100%)**.
4. Full regression validation: Unit tests (**95/95 PASS**), E2E test suite (**207/207 PASS**), and TypeScript compilation (**tsc exit code 0**).

---

## Challenges

### [Low] Challenge 1: Solo Sequel Subtitle False Positives Under Rule 3

- **Assumption challenged**: That single subtitle candidates in a directory share semantic relevance with the video file if partial title substrings overlap.
- **Attack scenario**: A directory containing a base film (e.g. `Spider.Man.mkv` or `Matrix.mkv`) accompanied solely by a sequel's subtitle file (`Spider.Man.2.srt` or `Matrix.Reloaded.2003.srt`). In previous iterations, loose token overlap (`tokens.some(t => videoTokens.includes(t))`) matched sequel subtitles to the base movie.
- **Blast radius**: Display of incorrect, out-of-sync subtitle dialogue for sequel films on the base movie during playback on Samsung Smart TV.
- **Mitigation & Verification**: `server/subtitles/matcher.ts` eliminates loose token overlap in Rule 3. Condition (b) now strictly requires candidate prefixes to match `cleanVideoBase` or `cleanVideoTitle` followed by a delimiter and ONLY recognized qualifier tokens (`isKnownQualifierToken`). Since sequel tokens (`'2'`, `'reloaded'`, `'part'`, etc.) are not language/forced/modifier qualifiers, sequels are strictly rejected under both solo (Rule 3) and multi-file (Rule 2) conditions.

### [Low] Challenge 2: Stopword and High-Frequency Shared Token Collisions

- **Assumption challenged**: That movies sharing common English articles ("The", "A", "In the", "Star") should match solo subtitle files sharing the same lead article.
- **Attack scenario**: A video named `Lord.of.the.Rings.mkv` paired with `Lord.of.the.Flies.srt`, or `The.Movie.mkv` paired with `The.Dark.Knight.srt`. Under legacy Rule 3 logic, tokens with length > 2 (such as "The" or "Lord") caused false matching.
- **Blast radius**: Random cross-contamination of subtitles between completely distinct cinematic properties.
- **Mitigation & Verification**: Removal of token intersection fallback. Unrelated titles with shared stopwords do not start with the video base plus a delimiter, nor do their remaining tokens qualify as recognized language/forced modifiers. Tested and verified: 100% rejection across all stopword combinations.

### [Low] Challenge 3: Dialect and Generic Spanish Subtitle Support (es-419, es-la, castellano)

- **Assumption challenged**: That generic subtitle names are properly recognized without false rejections when hyphenated language tags or non-standard regional aliases are used.
- **Attack scenario**: Standard streaming and release conventions often supply solo subtitles titled `es-419.srt`, `es-la.srt`, or `castellano.vtt`. Tokenization on hyphens could break `es-la` into `['es', 'la']` or fail `isGeneric` validation if modifiers were omitted.
- **Blast radius**: Legitimate Spanish subtitles dropped entirely, forcing users to watch videos without subtitles.
- **Mitigation & Verification**: `LANGUAGE_MAP` explicitly maps `'es-la'`, `'es-419'`, and `'castellano'` to standardized language codes and labels (`code: 'es-LA', label: 'Español (Latino)'` and `code: 'es', label: 'Español'`). `GENERIC_SUB_TOKENS` and `MODIFIER_TOKENS` recognize regional sub-tags (`la`, `419`, `latam`). Both `Avatar.mp4` vs `castellano.vtt` and `Dune.mkv` vs `es-419.srt` correctly match and receive Spanish default track designation.

---

## Stress Test Results

| # | Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---------------|-------------------|-----------------|--------|
| 1 | `tests/adversarial/m1_auth_traversal_stress.test.ts` (27 tests) | All 27 tests pass | 27/27 passed in 1229ms | **PASS** |
| 2 | `Spider.Man.mkv` vs solo `Spider.Man.2.srt` | Subtitle rejected (`matches.length === 0`) | 0 matches returned | **PASS** |
| 3 | `Spider.Man.mkv` vs multiple `[Spider.Man.2.srt, Spider.Man.3.srt]` | Both sequels rejected | 0 matches returned | **PASS** |
| 4 | `Lord.of.the.Rings.mkv` vs `Lord.of.the.Flies.srt` | Subtitle rejected (`matches.length === 0`) | 0 matches returned | **PASS** |
| 5 | `Avatar.mp4` vs `castellano.vtt` | Matched, `lang === 'es'`, `format === 'vtt'`, `isDefault === true`, label updated to `'Español (Predeterminado)'` | Matched, `isDefault: true`, `lang: 'es'`, `label: 'Español (Predeterminado)'` | **PASS** |
| 6 | `Dune.mkv` vs `es-419.srt` | Matched, `lang === 'es-LA'`, `format === 'srt'`, `isDefault === true`, label `'Español (Latino)'` | Matched, `isDefault: true`, `lang: 'es-LA'`, `label: 'Español (Latino)'` | **PASS** |
| 7 | Sequels stress suite (`Iron.Man.2`, `Toy.Story.3`, `Shrek.2`, `Fast.Five`, `Aliens`, `Terminator.2`, `The.Godfather.Part.II`) | All 10 sequel cases rejected | 10/10 rejected (0 matches) | **PASS** |
| 8 | Stopword collision stress suite (`The.Batman` vs `The.Godfather`, `Star.Wars` vs `Star.Trek`, `American.Beauty` vs `American.Psycho`, etc.) | All 6 stopword cases rejected | 6/6 rejected (0 matches) | **PASS** |
| 9 | Generic aliases stress suite (`spanish`, `castellano`, `es`, `spa`, `esp`, `espanol`, `español`, `es-la`, `es-419`, `latino`, `lat`, `sub`, `subs`, `subtitles`) | All 16 generic aliases matched & tagged default | 16/16 matched & default assigned | **PASS** |
| 10 | Video prefix + qualifiers (`Gladiator.es.srt`, `Gladiator.es.forced.srt`, `Gladiator.es-la.srt`, `Gladiator.2000.castellano.vtt`) | All 4 matched with accurate language and forced flags | 4/4 matched correctly | **PASS** |
| 11 | Default track arbitration: 5 competing candidates (`en.srt`, `en.vtt`, `es.forced.srt`, `es.srt`, `es.vtt`) | Exactly 1 default track selected; `es.vtt` wins (Spanish + Full + VTT = 160 pts) | `sub_es_vtt` selected as unique default with label `'Español (Predeterminado)'` | **PASS** |

---

## Unchallenged Areas

- **Live Google Drive API network errors**: Subtitle fetching over live network with simulated transient 5xx errors or socket disconnects during SRT file streaming. This was out of scope for the in-memory filename matching logic in `server/subtitles/matcher.ts`, and is handled at the network/proxy layer covered by E2E Tier 2 tests.
- **Subtitles in non-Latin scripts (Arabic, Cyrillic, CJK)**: Out of scope per `ORIGINAL_REQUEST.md` R1/R2 which specifically specifies Spanish/English media handling for Samsung Smart TV.
