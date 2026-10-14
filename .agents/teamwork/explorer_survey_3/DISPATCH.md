## 2026-10-13T03:46:22Z
Sender: a3fbfcdc-1b0f-4f67-9e44-0e15f1241a0c
Priority: MESSAGE_PRIORITY_HIGH

You are the Metadata and UI Architecture Explorer (`explorer_survey_3`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md

Your task is to conduct an authoritative investigation of Metadata Enrichment (R2) and 10-foot Smart TV UI (R3).

Investigate and document thoroughly:
1. Filename Sanitization & Title/Year Extraction Algorithm:
   - Regex patterns and rules to clean movie/series filenames (e.g. `Inception.2010.1080p.BluRay.x264-SPARKS.mkv`, `El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4`).
   - Filtering noise tags: resolutions (480p, 720p, 1080p, 2160p, 4k), codecs (x264, h264, x265, hevc), audio formats (DTS, AC3, AAC, 5.1), sources (BluRay, WEBRip, WEB-DL, HDTV, DVDRip), release groups.
   - Extracting clean title and release year (4-digit year 19xx/20xx).
   - Handling Spanish titles and accented characters.
2. TMDB API Integration & Strict Isolation Rules:
   - The Movie Database (TMDB) API v3 endpoints: `/search/movie`, `/search/tv`, `/movie/{id}`, `/tv/{id}` with `language=es-ES`.
   - Data extraction: poster_path (HD w500/original), backdrop_path, overview (sinopsis in Spanish), vote_average (calificación), credits (directors from crew, top actors from cast), genres, release_date.
   - Caching strategy (in-memory / file cache / localStorage) to avoid repeated TMDB API calls and stay within rate limits.
   - STRICT ISOLATION OF 'Videos familiares':
     - Files inside 'Videos familiares' MUST NEVER trigger TMDB queries.
     - Extract native Drive metadata instead: video title formatted legibly, date created/modified, duration from videoMediaMetadata, thumbnail link directly from Drive.
3. 10-Foot UI for Smart TV Architecture:
   - 2D Spatial Navigation Engine (D-pad directional navigation): calculating nearest focusable element on ArrowUp/Down/Left/Right, managing focused state (`.focused` class with glow/scale effect), handling Enter (13) and Return (10009).
   - High contrast, large typography, 1080p/4K TV layout readable from 3 meters.
   - Specialized Views:
     a. Catalog carousel: horizontal scrolling rows ('Películas', 'Series', 'Videos familiares', 'Fotos', 'Música') with poster cards.
     b. Movie detail modal: backdrop background, HD poster, title, year, duration, rating, Spanish synopsis, cast, and prominent "Reproducir" button.
     c. Home video card: clean date, thumbnail, duration, direct playback.
     d. Custom HTML5 Video Player: custom TV overlay with play/pause, time scrubber, duration, subtitle selector menu (toggling off / WebVTT tracks), auto-hiding controls after 3 seconds of inactivity.
     e. Fullscreen Photo Slideshow: smooth transition between photos, auto-advance interval, pause/resume.
     f. Audio Player: album artwork, track title, artist, playlist queue, playback progress.
4. Output Requirements:
   - Write your complete findings to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3\ui_metadata_report.md
   - Include `handoff.md` in your working directory.
   - Send a concise completion message with the path to your report.
