## 2026-10-13T11:43:25Z
You are the Regex Sanitizer & Year Extractor Explorer (`explorer_m2_1`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_1
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
Prior survey research is in: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3\ui_metadata_report.md

Your task:
Analyze and design the exact technical specification for `server/metadata/sanitizer.ts`:
1. Design the 8-stage sanitization pipeline to clean filenames into clean titles, release years, and TV episode information:
   - File extension stripping (.mkv, .mp4, .avi, etc.).
   - TV Show detection (S01E02, 1x02, Season 1 Episode 2, etc.) extracting season and episode numbers and setting isSeries: true.
   - Release Year extraction (1900-2099) using regex lookahead so numbers in titles (like 'Blade Runner 2049 2017') are not prematurely consumed.
   - Noise tag stripping: complete dictionary of resolutions (1080p, 4k, 2160p), codecs (x264, x265, hevc), audio formats (dts, ddp5.1, ac3, aac), sources (bluray, web-dl, remux), edition tags (remastered, extended), language tags (latino, castellano, dual), and release groups (-SPARKS, -YIFY).
   - Delimiter cleanup: translate dots and underscores into clean single spaces, while preserving hyphens in compound words (like Spider-Man).
   - Accents and diacritics preservation: ensure Spanish characters (ñ, á, é, í, ó, ú, ü) are preserved intact.
2. Enumerate edge cases and formulate concrete unit test cases to be written in `tests/unit/m2/sanitizer.test.ts`.
3. Write your detailed blueprint to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_1\sanitizer_spec.md.
4. Write handoff.md and send a completion message to your parent.
