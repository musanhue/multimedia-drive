# Test Infrastructure: Multimedia Drive (Samsung Smart TV UN50NU7400)

## 1. Overview & Test Philosophy

The **Multimedia Drive** test infrastructure implements a comprehensive, opaque-box End-to-End (E2E) testing framework strictly derived from authoritative user requirements (`ORIGINAL_REQUEST.md`) and technical specifications (`PROJECT.md`).

### Core Testing Tenets:
1. **Opaque-Box Contract Verification**: The test suite exercises the application strictly from the outside—via HTTP REST endpoints, media streaming protocols (RFC 7233 / RFC 9110 Range requests), subtitle parsers, 10-foot spatial navigation contracts, Chromium M56 engine compatibility linters, and Tizen W3C packaging specifications. It relies on zero internal implementation details.
2. **Dual Execution Modes (Mock Oracle & Live Backend)**: The test harness includes an integrated, high-fidelity reference server (oracle) that allows running the full test suite synchronously right out of the box. In addition, every test can be pointed at any live backend or cloud deployment via the `--live` flag or `E2E_BASE_URL` environment variable.
3. **4-Tier Testing Methodology**: Complete coverage across four distinct test tiers ensuring depth, resilience, integration robustness, and real-world fidelity.
4. **Zero-Dependency Resilience**: The test runner is written with zero external runtime dependencies using native Node.js (v24), guaranteeing deterministic, instant execution on Windows and CI/CD pipelines without fragile module installations.

---

## 2. 4-Tier Test Architecture & Taxonomy

| Tier | Name | Target Ratio | Total Tests | Focus |
|:---:|:---|:---:|:---:|:---|
| **Tier 1** | **Feature Coverage** | >=5 tests per feature (18 features) | **90 tests** | Primary behavior, happy paths, and fundamental functional requirements for features F1 through F18. |
| **Tier 2** | **Boundary & Corner Cases** | >=5 tests per feature (18 features) | **90 tests** | Empty inputs, zero-byte payloads, extreme byte offsets, invalid HTTP Range headers, corrupt timestamps, character encodings (BOM, Latin-1), rate limits, boundary keystrokes, and fault injection. |
| **Tier 3** | **Cross-Feature Combinations** | Multi-feature workflows | **18 tests** | Complex interactions across features: streaming with active WebVTT subtitles, strict family video isolation during navigation, photo slideshows with audio playback, remote key return hierarchies, and serverless CORS preflight with media streams. |
| **Tier 4** | **Real-World Application Scenarios** | End-to-end user journeys | **9 tests** | Complete TV viewing sessions, multi-episode binge watching, 4K MKV remote seeking stress tests, family multimedia evenings, cold boot network drops, and Tizen `.wgt` packaging verification. |
| **TOTAL** | **Full E2E Test Suite** | — | **207 tests** | 100% specification coverage with pass/fail exit code 0. |

---

## 3. Feature Coverage Matrix (Features F1 to F18)

| Feature # | Feature Name | Tier 1 Tests | Tier 2 Tests | Relevant Cross-Feature / Scenarios |
|:---:|:---|:---:|:---:|:---|
| **F1** | Service Account Auth | 5 tests (`F1-01` .. `F1-05`) | 5 tests (`F1-B01` .. `F1-B05`) | T3-10, T4-06, T4-08 |
| **F2** | Recursive Folder Traversal | 5 tests (`F2-01` .. `F2-05`) | 5 tests (`F2-B01` .. `F2-B05`) | T3-02, T3-09, T4-02 |
| **F3** | HTTP Range 206 Streaming Proxy | 5 tests (`F3-01` .. `F3-05`) | 5 tests (`F3-B01` .. `F3-B05`) | T3-01, T3-03, T3-06, T4-01, T4-04 |
| **F4** | SRT to WebVTT Subtitle Converter | 5 tests (`F4-01` .. `F4-05`) | 5 tests (`F4-B01` .. `F4-B05`) | T3-01, T3-06, T3-13, T3-16, T4-01 |
| **F5** | Embedded Subtitles / Media Support | 5 tests (`F5-01` .. `F5-05`) | 5 tests (`F5-B01` .. `F5-B05`) | T3-07, T4-03 |
| **F6** | Filename Regex Cleaning | 5 tests (`F6-01` .. `F6-05`) | 5 tests (`F6-B01` .. `F6-B05`) | T3-05, T3-09, T3-14, T4-02 |
| **F7** | TMDB Metadata Enrichment | 5 tests (`F7-01` .. `F7-05`) | 5 tests (`F7-B01` .. `F7-B05`) | T3-05, T3-09, T3-14, T4-08 |
| **F8** | Family Video Isolation Barrier | 5 tests (`F8-01` .. `F8-05`) | 5 tests (`F8-B01` .. `F8-B05`) | T3-02, T3-11, T4-05 |
| **F9** | Chromium M56 Compatible UI | 5 tests (`F9-01` .. `F9-05`) | 5 tests (`F9-B01` .. `F9-B05`) | T3-15, T4-09 |
| **F10** | 2D Spatial Navigation Engine | 5 tests (`F10-01` .. `F10-05`) | 5 tests (`F10-B01` .. `F10-B05`) | T3-03, T3-08, T3-12, T3-17, T4-07 |
| **F11** | Catalog Carousel View | 5 tests (`F11-01` .. `F11-05`) | 5 tests (`F11-B01` .. `F11-B05`) | T3-03, T3-17, T4-01, T4-05 |
| **F12** | Movie Detail Modal | 5 tests (`F12-01` .. `F12-05`) | 5 tests (`F12-B01` .. `F12-B05`) | T3-05, T3-08, T3-14, T4-01 |
| **F13** | Family Video Card View | 5 tests (`F13-01` .. `F13-05`) | 5 tests (`F13-B01` .. `F13-B05`) | T3-11, T4-05 |
| **F14** | Custom Video Player | 5 tests (`F14-01` .. `F14-05`) | 5 tests (`F14-B01` .. `F14-B05`) | T3-01, T3-05, T3-06, T3-08, T3-13, T4-01, T4-03, T4-04 |
| **F15** | Fullscreen Photo Slideshow | 5 tests (`F15-01` .. `F15-05`) | 5 tests (`F15-B01` .. `F15-B05`) | T3-04, T3-12, T4-05 |
| **F16** | Audio Player with Playlist | 5 tests (`F16-01` .. `F16-05`) | 5 tests (`F16-B01` .. `F16-B05`) | T3-04, T3-07, T3-18, T4-05 |
| **F17** | Serverless Cloud Deployment | 5 tests (`F17-01` .. `F17-05`) | 5 tests (`F17-B01` .. `F17-B05`) | T3-10, T4-08, T4-09 |
| **F18** | Native Tizen .wgt Packaging | 5 tests (`F18-01` .. `F18-05`) | 5 tests (`F18-B01` .. `F18-B05`) | T3-15, T4-09 |

---

## 4. Directory Structure

```
tests/
├── run-e2e.js                         # Unified CLI test runner
├── harness/                           # Standalone test infrastructure
│   ├── mock-server.js                 # HTTP reference server (implements full interface contracts)
│   ├── mock-data.js                   # Authoritative mock fixtures (catalog, media, subtitles, TMDB)
│   ├── test-client.js                 # HTTP client helper with assertion utilities
│   ├── m56-validator.js               # AST / regex validator for Chromium M56 compatibility
│   ├── spatial-nav-sim.js             # D-pad spatial navigation headless state simulator
│   └── tizen-validator.js             # Manifest and packaging validator
└── e2e/
    ├── tier1-feature-coverage/        # 18 test files (F01 to F18, 5 tests each = 90 tests)
    │   ├── f01-service-account-auth.test.js
    │   ├── f02-recursive-folder-traversal.test.js
    │   ├── f03-http-range-streaming-proxy.test.js
    │   ├── f04-srt-to-webvtt-converter.test.js
    │   ├── f05-embedded-subtitles-media.test.js
    │   ├── f06-filename-regex-cleaning.test.js
    │   ├── f07-tmdb-metadata-enrichment.test.js
    │   ├── f08-family-video-isolation.test.js
    │   ├── f09-chromium-m56-compatible-ui.test.js
    │   ├── f10-spatial-navigation-engine.test.js
    │   ├── f11-catalog-carousel-view.test.js
    │   ├── f12-movie-detail-modal.test.js
    │   ├── f13-family-video-card-view.test.js
    │   ├── f14-custom-video-player.test.js
    │   ├── f15-fullscreen-photo-slideshow.test.js
    │   ├── f16-audio-player-playlist.test.js
    │   ├── f17-serverless-cloud-deployment.test.js
    │   └── f18-native-tizen-packaging.test.js
    ├── tier2-boundary-corner/         # 18 test files (F01 to F18, 5 tests each = 90 tests)
    │   ├── f01-auth-boundaries.test.js
    │   ├── f02-traversal-boundaries.test.js
    │   ├── f03-streaming-boundaries.test.js
    │   ├── f04-subtitles-boundaries.test.js
    │   ├── f05-media-boundaries.test.js
    │   ├── f06-regex-boundaries.test.js
    │   ├── f07-tmdb-boundaries.test.js
    │   ├── f08-family-isolation-boundaries.test.js
    │   ├── f09-m56-compatibility-boundaries.test.js
    │   ├── f10-spatial-nav-boundaries.test.js
    │   ├── f11-catalog-view-boundaries.test.js
    │   ├── f12-detail-modal-boundaries.test.js
    │   ├── f13-family-card-boundaries.test.js
    │   ├── f14-video-player-boundaries.test.js
    │   ├── f15-slideshow-boundaries.test.js
    │   ├── f16-audio-player-boundaries.test.js
    │   ├── f17-deployment-boundaries.test.js
    │   └── f18-tizen-packaging-boundaries.test.js
    ├── tier3-cross-feature/           # 1 file (18 integration tests)
    │   └── cross-feature-combinations.test.js
    └── tier4-real-world/              # 1 file (9 real-world scenario tests)
        └── real-world-scenarios.test.js
```

---

## 5. Execution Instructions

### Running the Full Test Suite
To execute all 207 tests in the standalone mock environment:
```bash
node tests/run-e2e.js
# Or using npm
npm test
```

### Running Specific Tiers
```bash
# Run Tier 1 only (Feature Coverage - 90 tests)
node tests/run-e2e.js --tier=1

# Run Tier 2 only (Boundary & Corner Cases - 90 tests)
node tests/run-e2e.js --tier=2

# Run Tier 3 only (Cross-Feature Combinations - 18 tests)
node tests/run-e2e.js --tier=3

# Run Tier 4 only (Real-World Scenarios - 9 tests)
node tests/run-e2e.js --tier=4
```

### Running a Specific Feature
```bash
# Run all tests (Tier 1 & Tier 2) for Feature F3 (Streaming Proxy)
node tests/run-e2e.js --feature=F3

# Run Feature F8 (Family Video Isolation)
node tests/run-e2e.js --feature=F8
```

### Running Against Live Backend / Production Cloud
When a live backend server is running (e.g., local development server at `http://localhost:3000` or deployed serverless instance):
```bash
# Point directly to live URL
node tests/run-e2e.js --live --url=http://localhost:3000

# Or via environment variable
E2E_BASE_URL=https://multimedia-drive.vercel.app node tests/run-e2e.js --live
```

---

## 6. Exit Codes & Assertion Protocol

- **Exit Code `0`**: All executed test cases passed successfully.
- **Exit Code `1`**: One or more test cases failed. Detailed failure diagnostics, expected vs actual outputs, stack traces, and HTTP status codes are printed to standard output.
- Every test file exports an array of test cases:
  ```javascript
  {
    id: "F3-01",
    name: "Request with Range header returns 206 Partial Content",
    run: async (client, context) => { ... }
  }
  ```
- The test harness automatically captures and records durations, error messages, and tier breakdowns.
