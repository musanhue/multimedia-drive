## 2026-10-13T11:43:25Z
From: a3fbfcdc-1b0f-4f67-9e44-0e15f1241a0c (parent)
Priority: MESSAGE_PRIORITY_HIGH

You are the TMDB & 2-Tier Caching Explorer (`explorer_m2_2`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_2
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
Prior survey research is in: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_survey_3\ui_metadata_report.md

Your task:
Analyze and design the exact technical specification for `server/metadata/tmdb.ts`:
1. Design the TMDB API v3 client in Spanish (`language=es-ES`):
   - Movie search: https://api.themoviedb.org/3/search/movie with title, year, and language=es-ES.
   - Series search: https://api.themoviedb.org/3/search/tv with title, first_air_date_year, and language=es-ES.
   - Movie & Series details: append_to_response=credits to retrieve director, top cast (first 5), synopsis, rating (vote_average), poster_path (w500), backdrop_path (w1280), genres, and runtime in a single HTTP request.
   - Multi-stage fallback: (1) title + year -> (2) title alone -> (3) title stripped of secondary parenthetical text.
2. Design the 2-tier caching layer:
   - Tier 1: In-memory LRU cache for ultra-fast response.
   - Tier 2: Persistent file/JSON cache (cache/tmdb_cache.json) with 30-day TTL.
   - Concurrency throttle: queue/limit concurrent requests (max 4 concurrent, 100ms pause) to respect TMDB rate limits.
3. Design offline/mock fallback:
   - When TMDB_API_KEY is not provided or API calls fail (network/timeout), return clean title, year, and graceful defaults without throwing exceptions or crashing.
4. Write your detailed blueprint to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m2_2\tmdb_spec.md.
5. Write handoff.md and send a completion message to your parent.
