## 2026-10-13T11:43:25Z
From: a3fbfcdc-1b0f-4f67-9e44-0e15f1241a0c (parent)
Priority: MESSAGE_PRIORITY_HIGH

You are the Family Video Isolator & Route Integration Explorer (`explorer_m2_3`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_3
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
Prior survey research is in: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3\ui_metadata_report.md

Your task:
Analyze and design the exact technical specification for `server/metadata/isolator.ts` and API route integration:
1. Design the Strict Isolation Barrier (Feature F8):
   - Under NO circumstance may any file in Videos familiares make a network call to TMDB.
   - Identify family category by folder path, parent name, or category slug (videos familiares, familiares, familia, home videos).
   - Synthesize native metadata from Google Drive API v3 attributes:
     - Clean title: Title Case formatted from filename without technical extension.
     - Recorded date: extracted from driveFile.createdTime or videoMediaMetadata.date, formatted in Spanish (e.g. '14 de octubre de 2022').
     - Duration: converted from videoMediaMetadata.durationMillis to MM:SS or Hh MMm.
     - Resolution badge: 4K (height >= 2160), 1080p (height >= 1080), 720p.
     - Thumbnail: high-definition thumbnail using Google Drive edge CDN with =w800.
2. Design the API Routes:
   - GET /api/metadata/enrich: single query parameter enrichment (?title=...&year=...&category=...).
   - Integrate with GET /api/drive/files/:category:
     - If category is peliculas or series, enrich items with TMDB metadata.
     - If category is familiares, apply strict family isolator.
     - If category is fotos or musica, apply appropriate native Drive metadata.
3. Design verification checks to assert zero network leaks (mocking TMDB fetch and asserting 0 invocations for family videos).
4. Write your detailed blueprint to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_3\isolator_routes_spec.md.
5. Write handoff.md and send a completion message to your parent.
