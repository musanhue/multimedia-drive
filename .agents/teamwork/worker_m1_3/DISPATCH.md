## 2026-10-13T05:06:59Z
You are the Subtitle Matcher Worker (`worker_m1_3`).
Your working directory is: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\worker_m1_3
The authoritative original request is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
The master project specification is at: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md

Input blueprints to guide your implementation:
1. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_rule3_1\fix_strategy.md and patch at c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_rule3_1\proposed_matcher.patch
2. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m1_rule3_2\test_strategy.md

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks to execute:
1. Apply the Rule 3 patch to server/subtitles/matcher.ts:
   - Replace loose token overlap in Rule 3 with strict validation: single subtitle candidates must be either a recognized generic subtitle name (including hyphenated codes like es-la and MODIFIER_TOKENS), or start with cleanVideoBase / cleanVideoTitle followed by a boundary delimiter (., _, -, space) and ONLY recognized language / forced / format qualifier tokens.
2. Extend tests/unit/m1/matcher.test.ts to include unit tests asserting:
   - Solo sequel Matrix.Reloaded.2003.srt is rejected for Matrix.mkv.
   - Stopword overlap The.Dark.Knight.srt is rejected for The.Movie.mkv.
   - Generic Latin American es-la.srt matches Gladiator.mkv.
3. Build and Test:
   - Run npm run build and ensure exit code 0.
   - Run unit tests: npm run test:unit.
   - Run adversarial tests: npx tsx --test tests/adversarial/m1_auth_traversal_stress.test.ts. Verify 27/27 PASS (100%).
   - Run full E2E test suite: node tests/run-e2e.js. Verify 207/207 PASS (100%).
4. Output:
   - Write your implementation report to c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\worker_m1_3\implementation_report.md.
   - Write handoff.md in your working directory documenting all commands and test outputs.
   - Send completion message to parent.
