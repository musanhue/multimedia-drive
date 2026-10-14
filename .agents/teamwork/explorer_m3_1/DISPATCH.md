## 2026-10-13T12:31:32Z
You are the M56 Build, Spatial Navigation & CSS Architecture Explorer (`explorer_m3_1`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_1
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
Prior survey research:
- Tizen & Chromium M56 specification: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_survey_1\tizen_chromium_m56_spec.md
- UI & Spatial Navigation research: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3\ui_metadata_report.md

Scope: Features F9 (Chromium M56 Compatible UI) and F10 (2D Spatial Navigation Engine).

Your task:
Analyze and formulate the exact technical architecture and blueprints for:
1. Build & Tooling Setup for Chromium M56:
   - Configure Vite (`client/vite.config.ts`) with `@vitejs/plugin-legacy` targeting `targets: ['chrome 56']`.
   - Ensure the production build emits an IIFE bundle (`index.html` loads legacy polyfills + legacy bundle without modern ES module `<script type="module">` syntax errors).
   - Package setup: determine required npm dependencies (e.g. `vite`, `@vitejs/plugin-legacy`, `terser`, etc.) and ensure package.json scripts (`build:client`, `dev:client`) integrate cleanly.
2. 10-Foot UI Design System & Flexbox Level 1 CSS (`client/styles/`):
   - Strict CSS rules for Chromium M56:
     * ZERO CSS Grid (`display: grid` MUST NOT be used anywhere).
     * ZERO Flexbox `gap` (`gap`, `row-gap`, `column-gap` MUST NOT be used in flex containers; all spacing MUST use explicit `margin` or `padding`).
     * Hardware-accelerated transitions: use `transform: translate3d()` and `transform: scale()`.
   - 10-foot ergonomics: 1920x1080 design base (scales to 4K), 3-meter viewing distance readability (body text >= 18px-24px, titles >= 36px-48px), dark theater palette (`#121212` background, `#FFFFFF` text, `#00A8FF` or gold accent).
   - Luminous focus indicator styling: glowing outline / box-shadow (`box-shadow: 0 0 18px rgba(0, 168, 255, 0.85)`), border highlight, and `transform: scale(1.06)`.
3. 2D Spatial Navigation Engine (`client/src/navigation/`):
   - Support Samsung Smart TV remote physical keys:
     * D-pad: ArrowLeft (37), ArrowUp (38), ArrowRight (39), ArrowDown (40)
     * Select / OK: Enter (13)
     * Return / Back: Key 10009 (`returnKey` on Tizen), Backspace (8), Escape (27)
     * Media keys: MediaPlayPause (10252), MediaPlay (415), MediaPause (19), MediaStop (413), MediaFastForward (417), MediaRewind (412)
   - Spatial navigation algorithm: structured registration of focusable nodes (`data-nav-id`, `data-nav-group`, directional coordinates or hierarchical row/column navigation), ensuring focus never gets lost.
   - View/History stack: pushing modals, players, and sub-views to the stack, so pressing Return (10009) pops the current view and restores previous focus.
4. Concrete unit testing strategy for spatial navigation and M56 compatibility in `tests/unit/m3/navigation.test.ts`.

Write your detailed blueprint to:
c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_1\navigation_build_spec.md
Write handoff.md in your working directory and send a completion message to your parent.
