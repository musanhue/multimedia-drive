## 2026-10-13T15:34:42Z
You are spec_miner_m4_1, extracting authoritative specifications for Milestone M4: Dual Deployment & Native Tizen Packaging for Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56).
Your working directory: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_m4_1
Project root: c:\Users\musan\Documents\Proyectos\Multimedia_Drive
Parent conversation ID: a2f7e2fc-11dd-4392-9fe8-4ace62bc0d67

MANDATORY READING:
1. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
2. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
3. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\tests\harness\tizen-validator.js
4. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\tests\e2e\tier1-feature-coverage\f17-serverless-cloud-deployment.test.js
5. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\tests\e2e\tier1-feature-coverage\f18-native-tizen-packaging.test.js
6. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\tests\e2e\tier2-boundary-corner\f17-deployment-boundaries.test.js
7. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\tests\e2e\tier2-boundary-corner\f18-tizen-packaging-boundaries.test.js

Tasks:
1. Extract and document complete, authoritative specifications for Tizen 4.0 `config.xml` (W3C/Tizen namespaces, `tv-samsung` profile, package ID format of exactly 10 alphanumeric characters, required privileges `http://tizen.org/privilege/internet` and `http://tizen.org/privilege/tv.inputdevice`, `hwkey-event="enable"`, icon and content references).
2. Document 117x117 PNG binary icon specifications (exact dimensions, PNG magic header, IHDR chunk).
3. Document native `.wgt` ZIP packaging requirements (files included from `dist/client/`, placement of `config.xml` and `icon.png` at root, zip generation script without external binary dependencies).
4. Document Samsung Smart TV Developer Mode (code 12345) installation workflow, Host PC IP configuration, SDB connect/install commands, and user instructions.
5. Document serverless cloud deployment specification (Vercel `vercel.json` and/or Cloudflare serverless config, static frontend routing, CORS headers, Cache-Control headers for stream and subtitles, 206 Partial Content support).
6. Write spec_report.md and handoff.md in your working directory.
7. Send message to parent (a2f7e2fc-11dd-4392-9fe8-4ace62bc0d67).
