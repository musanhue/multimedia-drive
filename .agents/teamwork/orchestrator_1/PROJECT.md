# Project: Multimedia Drive for Samsung Smart TV UN50NU7400

## Architecture
Autonomous multimedia streaming platform designed for Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56):
- **Cloud Backend / Streaming Proxy (Node.js/TypeScript, Serverless-ready)**:
  - Google Drive API v3 connector using Service Account credentials.
  - Recursive folder navigator for predefined categories (`Películas`, `Series`, `Videos familiares`, `Fotos`, `Música`).
  - Strict HTTP Range 206 Partial Content proxying (bounded 8MB chunks) ensuring smooth playback, seeking, pausing without serverless execution timeouts or quota issues.
  - SRT to WebVTT on-the-fly conversion engine with UTF-8 normalization and Spanish diacritics resilience.
  - TMDB v3 Spanish metadata enricher with 2-tier caching.
  - Strict Isolation Barrier: Family videos completely bypass TMDB and use native Drive metadata.
- **10-Foot UI Frontend (Chromium M56 Compatible)**:
  - Flexbox + GPU `translate3d` transforms (strictly avoiding unsupported CSS Grid and Flexbox `gap`).
  - Bundle targeting Chrome 56 (transpiling modern JS syntax, object spreads, etc. into classic IIFE bundles).
  - 2D Spatial Navigation Engine supporting physical Samsung Smart TV remote controls (Arrows 37-40, Enter 13, Return 10009, Media Keys).
  - 6 Specialized TV Views: Main Carousel Catalog, Movie Detail Modal, Home Video Cards, Custom HTML5 Video Player with Subtitle Selector, Fullscreen Photo Slideshow, Audio Player with Queue.
- **Dual Deployment Package**:
  - Cloud / Serverless deployment configuration for TV Web Browser access.
  - Native Tizen Web Application package (`config.xml`, 117x117 icon, `.wgt` ZIP archive builder, and Developer Mode installation guide).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Service Account Auth | Authenticate with private Google Drive folder using credentials.json or env var | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Recursive Folder Traversal | Navigate 'Películas', 'Series', 'Videos familiares', 'Fotos', 'Música' | M1 | ORIGINAL_REQUEST §R1 |
| F3 | HTTP Range 206 Streaming Proxy | Byte range chunked streaming with Content-Range & Accept-Ranges headers | M1 | ORIGINAL_REQUEST §R1 |
| F4 | SRT to WebVTT Subtitle Converter | Automatic detection and conversion of external SRT to standard WebVTT | M1 | ORIGINAL_REQUEST §R1 |
| F5 | Embedded Subtitles / Media Support | Handling container formats (MP4, MKV) and embedded stream attributes | M1 | ORIGINAL_REQUEST §R1 |
| F6 | Filename Regex Cleaning | Clean scene tags, extract clean title and 4-digit release year / episode info | M2 | ORIGINAL_REQUEST §R2 |
| F7 | TMDB Metadata Enrichment | Search TMDB in Spanish for poster, backdrop, overview, cast, director, rating | M2 | ORIGINAL_REQUEST §R2 |
| F8 | Family Video Isolation Barrier | Strictly isolate 'Videos familiares' from TMDB; use native Drive metadata | M2 | ORIGINAL_REQUEST §R2 |
| F9 | Chromium M56 Compatible UI | 10-foot UI built with Flexbox and ES5/ES6 Chrome 56 compliant bundle | M3 | ORIGINAL_REQUEST §R3 |
| F10 | 2D Spatial Navigation Engine | D-pad navigation, focus rings, remote keys (Arrows, Enter 13, Return 10009) | M3 | ORIGINAL_REQUEST §R3 |
| F11 | Catalog Carousel View | Horizontal scrolling media rows with luminous focus indicators | M3 | ORIGINAL_REQUEST §R3 |
| F12 | Movie Detail Modal | Backdrop, HD poster, synopsis, cast, director, rating, and Play action | M3 | ORIGINAL_REQUEST §R3 |
| F13 | Family Video Card View | Date, duration, thumbnail, and instant playback | M3 | ORIGINAL_REQUEST §R3 |
| F14 | Custom Video Player | Fullscreen player with time scrubber, auto-hiding controls, subtitle selector | M3 | ORIGINAL_REQUEST §R3 |
| F15 | Fullscreen Photo Slideshow | Fullscreen viewer with smooth transitions, auto-advance, play/pause | M3 | ORIGINAL_REQUEST §R3 |
| F16 | Audio Player with Playlist | Track artwork, metadata, playback progress, and playlist management | M3 | ORIGINAL_REQUEST §R3 |
| F17 | Serverless Cloud Deployment | Configuration and production serverless proxy for browser access | M4 | ORIGINAL_REQUEST §R4 |
| F18 | Native Tizen .wgt Packaging | config.xml (tv-samsung profile), 117x117 icon, .wgt builder, developer mode | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Cloud Connector & Drive Streaming Proxy | Google Drive API v3 auth, folder traversal, HTTP Range 206 proxy, SRT->WebVTT conversion | none | DONE |
| M2 | Title Regex & TMDB Metadata Enrichment | Filename cleaning, Spanish TMDB integration with caching, strict family video isolation | none | IN_PROGRESS |
| M3 | 10-Foot UI for Tizen 4.0 / Chromium M56 | Spatial navigation, M56 compatible bundle, TV carousels, video player with subtitles, photo & audio players | M1, M2 | PLANNED |
| M4 | Dual Deployment & Native .wgt Packaging | Serverless deployment assets, config.xml, 117x117 icon, .wgt builder & developer guide | M1, M2, M3 | PLANNED |
| M5 | Final Milestone: 100% E2E Pass & Hardening | Phase 1: Pass 100% of E2E test suite (Tiers 1-4). Phase 2: Adversarial coverage hardening (Tier 5) | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Backend Proxy ↔ Frontend Client
- `GET /api/drive/folders`: Returns categorized tree (`peliculas`, `series`, `familiares`, `fotos`, `musica`).
- `GET /api/drive/files/:category`: Returns items in a category with enriched or native metadata.
- `GET /api/stream/:fileId`: HTTP Range 206 video/audio stream proxy.
- `GET /api/subtitles/:fileId`: WebVTT subtitle stream.
- `GET /api/metadata/enrich?title=...&year=...`: TMDB movie/series metadata.

## Code Layout
```
c:\Users\musan\Documents\Proyectos\Multimedia_Drive\
├── server/                    # Backend server & streaming proxy
│   ├── config.ts              # Environment & credentials config
│   ├── drive/                 # Google Drive API v3 client & traversal
│   ├── proxy/                 # HTTP Range 206 streaming proxy & chunker
│   ├── subtitles/             # SRT to WebVTT parser & converter
│   ├── metadata/              # Title cleaner & TMDB client with caching
│   ├── routes/                # API router & controllers
│   └── index.ts               # Server entry point
├── client/                    # 10-foot UI Frontend (Chromium M56 compatible)
│   ├── index.html             # Main TV entry point
│   ├── styles/                # Flexbox-only CSS with margin spacing
│   ├── src/
│   │   ├── navigation/        # 2D Spatial Navigation Engine & D-pad keys
│   │   ├── views/             # Catalog, Modal, Player, Slideshow, Audio
│   │   ├── api/               # API client
│   │   └── app.ts             # Application lifecycle
│   └── vite.config.ts         # Vite build configured with @vitejs/plugin-legacy (Chrome 56 IIFE)
├── tizen/                     # Native Samsung Smart TV packaging
│   ├── config.xml             # Tizen 4.0 TV manifest (tv-samsung profile)
│   ├── icon.png               # 117x117 TV icon
│   └── build-wgt.js           # .wgt package generator
├── tests/                     # Test Suites
│   ├── unit/                  # Unit tests for backend & frontend modules
│   └── e2e/                   # Opaque-box E2E test suite (Tiers 1-4)
├── package.json
└── tsconfig.json
```
