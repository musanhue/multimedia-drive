# Milestone M2 Review & Adversarial Critic Report

**Reviewer**: `reviewer_m2_1`  
**Roles**: Reviewer, Adversarial Critic  
**Date**: 2026-10-13  
**Target Milestone**: M2 (Title Regex, TMDB Metadata & Strict Family Video Isolation)  
**Files Reviewed**:
- `server/metadata/sanitizer.ts`
- `server/metadata/tmdb.ts`
- `server/metadata/isolator.ts`
- `server/routes/metadata.ts`
- `server/routes/drive.ts`
- `tests/unit/m2/sanitizer.test.ts`
- `tests/unit/m2/tmdb.test.ts`
- `tests/unit/m2/isolator.test.ts`

---

## 1. Quality Review Summary

**Verdict**: **APPROVE**

Milestone M2 implements all architectural requirements from `ORIGINAL_REQUEST.md` (§R2) and `PROJECT.md` (Features F6, F7, F8) with exceptional engineering quality, genuine algorithmic implementations, robust boundary handling, and zero shortcuts or facade cheats.

### Integrity Verification
- **Hardcoded Test Results / Facades**: NONE. The 8-stage sanitizer engine in `server/metadata/sanitizer.ts` contains genuine Unicode normalization, regex tokenizers, lookaheads, and dictionary pruners. The TMDB client in `server/metadata/tmdb.ts` contains a real HTTP/HTTPS fetch client with single-roundtrip `append_to_response=credits`, genuine LRU eviction in memory, genuine atomic disk persistence with `.tmp` writes, real request queue throttling, and in-flight deduplication.
- **Bypassing / Cheating**: NONE. Offline fixture fallback in `findMockRecord` is strictly restricted to development/offline execution when `apiKey` is empty or external network requests fail, as specified in the test harness architecture.
- **Independent Verification**: CONFIRMED. Clean compilation (`tsc` exit 0), 95/95 M1 unit tests pass, 32/32 M2 unit tests pass, and 207/207 E2E tests pass (100% PASS).

---

## 2. Review Findings & Analysis

### Finding 1 [Minor / Good Practice Note]: Sanitizer Year Lookahead and Numeric Titles
- **Location**: `server/metadata/sanitizer.ts:88-130, 205-208`
- **Assessment**: Correctly solves ambiguous numeric titles like `Blade Runner 2049 (2017)` and `1984.mkv` / `1917.2019.mkv`. The non-consuming lookahead `(?=[._\s\)\]-]|$)` extracts historical years back to 1900 while leaving the numeric title intact. Stage 8 acts as a safe fallback when a title is purely a 4-digit year without trailing text.

### Finding 2 [Minor / Good Practice Note]: Strict Family Video Isolation Hard Barrier
- **Location**: `server/metadata/isolator.ts:58-67`, `server/routes/metadata.ts:38-43`, `server/routes/drive.ts:114-117`
- **Assessment**: The isolation barrier is enforced both at the route controller level (`assertFamilyIsolation` returning HTTP 403 on `/api/metadata/enrich`) and at the traversal dispatcher level (`server/routes/drive.ts` routing category `familiares` strictly through `synthesizeFamilyMetadata()`). It guarantees that commercial fields (`director`, `cast`, `overview`, `genres`, `rating`, `posterUrl`, `backdropUrl`) are set to `undefined`, `tmdbEnriched` is `false`, and zero external network requests are made.

### Finding 3 [Minor / Good Practice Note]: Two-Tier Cache and Concurrency Throttling
- **Location**: `server/metadata/tmdb.ts:54-105, 111-288`
- **Assessment**: The concurrency throttler caps concurrent outgoing queries to 4 with a 100ms pacing delay, comfortably within TMDB's rate limit (~40 requests per 10 seconds). The two-tier cache combines an in-memory LRU with disk-persisted JSON using atomic rename (`.tmp` -> target) and debounced saving (`500ms`), with automatic recovery and corruption renaming if disk content is malformed.

---

## 3. Adversarial Challenge & Stress-Testing

**Overall Risk Assessment**: **LOW**

### Challenge 1: Sanitizer Delimiter Collisions and Compound Hyphens
- **Assumption Challenged**: Does delimiter stripping inadvertently strip hyphenated character or movie names (e.g., `Spider-Man`, `WALL-E`, `X-Men`) while removing scene release hyphens (e.g., `-SPARKS`)?
- **Stress-Test Scenarios**:
  - `Spider-Man.No.Way.Home.2021.PROPER.1080p.WEBRip.x264-RARBG.mp4` -> Result: `Spider-Man No Way Home` (PASS)
  - `WALL-E.2008.1080p.mkv` -> Result: `WALL-E` (PASS)
  - `Dr..No...1962..1080p.mkv` -> Result: `Dr No` (PASS)
  - `¿Quién.engañó.a.Roger.Rabbit.1988.mkv` -> Result: `¿Quién engañó a Roger Rabbit` (PASS)
- **Blast Radius**: None. Compound hyphens are protected via boundary assertions, and isolated hyphens (` - `) or trailing release group tags (` -RARBG`) are stripped cleanly.

### Challenge 2: ReDoS Vulnerability on Pathologically Long Filenames
- **Assumption Challenged**: Can an attacker cause Denial of Service (ReDoS) by providing a 200+ character filename with deeply nested punctuation?
- **Stress-Test**: Tested with a 150-char prefix plus 80-char noise string: execution completed in `<1.0ms`, well within the 500ms safety ceiling.
- **Blast Radius**: None. The regular expressions do not possess catastrophic polynomial/exponential backtracking states.

### Challenge 3: In-Flight Promise Rejection & Memory Leakage
- **Assumption Challenged**: What happens if an in-flight TMDB enrichment promise rejects? Does it leave dead promises in `inFlightPromises` blocking future lookups?
- **Inspection**:
  ```typescript
  try {
    const result = await fetchTask;
    this.cache.set(key, persistable);
    return result;
  } finally {
    this.inFlightPromises.delete(key);
  }
  ```
  The `finally` block unconditionally purges the key from `inFlightPromises`. No memory leakage or permanent lock occurs.

### Challenge 4: Disk Cache Corruption Recovery
- **Assumption Challenged**: What happens if the disk cache file `cache/tmdb_cache.json` is partially written, truncated, or contains invalid JSON upon server startup?
- **Stress-Test**: Injected `NOT A VALID JSON{{{` into `cache/temp_corrupt_test.json`.
- **Result**: `TwoTierCache.loadFromDisk()` caught the parse error, logged a descriptive warning, renamed the corrupted file with a `.corrupt.<timestamp>` suffix, initialized a clean memory state, and safely wrote valid JSON on subsequent updates without crashing.

---

## 4. Verified Claims Matrix

| # | Worker Claim | Verification Method | Result |
|---|--------------|---------------------|--------|
| 1 | 8-stage regex sanitization pipeline | Inspected `server/metadata/sanitizer.ts`, ran unit test battery | **PASS** |
| 2 | TV episode extraction (SxxExx, Season x, Temporada x, 1x02) | Unit test assertions in `sanitizer.test.ts` & E2E F6-04 | **PASS** |
| 3 | Lookahead release year extraction (1900-2099) | Unit tests `extractReleaseYear` & E2E F6-03, F6-B02 | **PASS** |
| 4 | Noise dictionary stripping & Spanish diacritics preservation | Inspected dictionary; verified `Relatos salvajes`, `¿Quién engañó a Roger Rabbit` | **PASS** |
| 5 | Compound hyphen preservation (`Spider-Man`, `WALL-E`) | Inspected `cleanDelimitersAndHyphens`; ran tests | **PASS** |
| 6 | TMDB client with `append_to_response=credits` | Verified single HTTP roundtrip endpoint in `tmdb.ts:523-604` | **PASS** |
| 7 | 4-stage search fallback hierarchy | Verified Title+Year, Title, Stripped+Year, Stripped fallback stages | **PASS** |
| 8 | 2-tier cache with 30-day TTL & atomic writes | Verified LRU memory eviction, disk JSON, 30-day TTL math, `.tmp` rename | **PASS** |
| 9 | Concurrency throttler (max 4, 100ms pause) | Verified `RequestThrottler` implementation and unit test | **PASS** |
| 10| In-flight deduplication | Verified `inFlightPromises` map deduplicates concurrent promises | **PASS** |
| 11| Offline fallback to mock fixtures or graceful defaults | Verified `findMockRecord` and `createGracefulFallback` (200 status, rating 0) | **PASS** |
| 12| Family video isolation barrier (403 on TMDB query) | Tested `GET /api/metadata/enrich?category=familiares` -> HTTP 403 | **PASS** |
| 13| Native Drive metadata synthesis | Verified clean title, Spanish date with `"de"`, `MM:SS` duration, =s800 | **PASS** |
| 14| TypeScript build compiles cleanly (`npm run build`) | `tsc` executed with exit code 0 | **PASS** |
| 15| Unit tests pass (`npm run test:unit`) | 95/95 M1 unit tests passed | **PASS** |
| 16| M2 unit tests pass (`npx tsx --test tests/unit/m2/*.test.ts`) | 32/32 M2 unit tests passed | **PASS** |
| 17| 100% of E2E test suite passes (`node tests/run-e2e.js`) | 207/207 tests passed (100% PASS across Tiers 1-4) | **PASS** |

---

## 5. Coverage Gaps & Unverified Items
- **Coverage Gaps**: None. All features of M2 (F6, F7, F8) have dedicated unit tests, boundary tests, and full E2E test coverage across Tiers 1 to 4.
- **Unverified Items**: Live TMDB API with active remote network credentials. (Acceptable caveat: TMDB API mock harness and offline fallback are explicitly part of the project specification for reproducible CI/test execution).

---

## 6. Verdict Recommendation

**VERDICT**: **APPROVE**  
Milestone M2 is fully verified, robust against adversarial edge cases, and ready for integration into Milestone M3 (Frontend Catalog, 10-Foot Spatial Navigation & Detail Modal).
