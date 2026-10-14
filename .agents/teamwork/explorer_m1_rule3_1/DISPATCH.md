## 2026-10-13T04:56:34Z
You are the Rule 3 Subtitle Matcher Fix Explorer (`explorer_m1_rule3_1`).
Working directory: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_rule3_1
Authoritative original request: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
Master project specification: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
Challenger report: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\challenger_m1_3\handoff.md

Scope: Fix server/subtitles/matcher.ts:117-140 (Rule 3).
Root cause:
In Rule 3, hasTitleOverlap = tokens.some(t => videoTokens.includes(t)) allows single subtitle files to match unrelated movies (e.g. Matrix.Reloaded.2003.srt matches Matrix.mkv, The.Dark.Knight.srt matches The.Movie.mkv). In addition, es-la.srt is dropped because MODIFIER_TOKENS is not checked.
Formulate the exact fix:
- Remove loose single-token overlap (hasTitleOverlap).
- A single subtitle candidate must match ONLY IF:
  a. It is a known generic subtitle name (spanish, espanol, castellano, sub, subs, subtitles, or language codes in LANGUAGE_MAP / MODIFIER_TOKENS like es, es-la, en), OR
  b. Its name starts with cleanVideoBase followed by a valid delimiter (., _, -, space) and ONLY recognized language / forced / format tokens (identical to Rule 2 qualifier checks).
Write your blueprint to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_rule3_1\fix_strategy.md.
Write handoff.md and send a completion message.
