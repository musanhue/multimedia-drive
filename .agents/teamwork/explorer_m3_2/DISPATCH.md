## 2026-10-13T12:31:32Z
You are the Catalog Views, Modals & Family Cards Explorer (`explorer_m3_2`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_2
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
Prior survey research:
- Tizen & Chromium M56 specification: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_survey_1\tizen_chromium_m56_spec.md
- UI & Metadata research: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3\ui_metadata_report.md

Scope: Features F11 (Catalog Carousel View), F12 (Movie Detail Modal), and F13 (Family Video Card View).

Your task:
Analyze and formulate the exact technical architecture and blueprints for:
1. Main Catalog Carousel View (`client/src/views/catalog.ts`):
   - Category navigation tabs / top bar: `Películas`, `Series`, `Videos familiares`, `Fotos`, `Música`.
   - Horizontal scrolling rows: container rendered with Flexbox (no `gap`, using `margin-right: 24px`), horizontal scrolling powered by `transform: translate3d(-...px, 0, 0)` to keep the active card centered/visible.
   - Card components:
     * Movie & Series cards: 2:3 aspect ratio (e.g. 200px x 300px), TMDB poster image with fallback placeholder, title, release year, rating badge.
     * Horizontal carousel smooth scrolling when D-pad Left/Right reaches edge of screen.
2. Movie Detail Modal (`client/src/views/modal.ts`):
   - Fullscreen overlay triggered by Enter (13) on a Movie or Series card.
   - Display elements:
     * Fullscreen high-res backdrop image (`backdrop_path` w1280) with dark gradient overlay (`rgba(18, 18, 18, 0.85)`).
     * High-res poster (`poster_path` w500).
     * Title, release year, duration/runtime, rating badge (`★ 8.4`).
     * Spanish synopsis / overview.
     * Director and top 5 cast members with character names.
     * Interactive buttons: "Reproducir" (Play) button (auto-focused on modal open), "Cerrar" (Close).
   - Modal focus trapping: spatial navigation is constrained within modal buttons; Return (10009) or "Cerrar" closes modal and restores focus to the triggering card.
3. Family Video Card View (`client/src/views/family.ts`):
   - Specialized layout for `Videos familiares`:
     * 16:9 landscape cards (e.g. 320px x 180px) to match home video recording dimensions.
     * Google Drive edge thumbnail upgraded to `=s800`.
     * Title formatted in clean Title Case (no camera noise tags).
     * Spanish recording date (e.g. "14 de octubre de 2022") from native Drive metadata.
     * Duration badge (e.g. "12:45") and resolution badge ("4K" / "1080p").
     * Enter (13) triggers immediate playback in the video player. Zero TMDB calls!
4. Frontend API Client (`client/src/api/client.ts`):
   - Fetching categories from `/api/drive/folders`.
   - Fetching media items from `/api/drive/files/:category`.
   - Error states, loading spinners, and offline fallback.
5. Unit test plan for catalog, modal, and family view components in `tests/unit/m3/views.test.ts`.

Write your detailed blueprint to:
c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_2\catalog_views_spec.md
Write handoff.md in your working directory and send a completion message to your parent.
