## 2026-10-13T15:43:14Z

You are worker_m4_1, implementing Milestone M4: Dual Deployment & Native Tizen Packaging for Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56).
Your working directory: c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\worker_m4_1
Project root: c:\Users\musan\Documents\Proyectos\Multimedia_Drive
Parent conversation ID: a2f7e2fc-11dd-4392-9fe8-4ace62bc0d67

MANDATORY READING:
1. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\ORIGINAL_REQUEST.md
2. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\PROJECT.md
3. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_m4_1\spec_report.md
4. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_m4_1\handoff.md
5. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m4_1\handoff.md
6. c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m4_2\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You own exclusively:
- `tizen/config.xml`
- `tizen/generate-icon.js`
- `tizen/build-wgt.js`
- `tizen/DEVELOPER_MODE.md`
- `vercel.json`
- `api/index.ts`
- `server/index.ts` (modifying to add 404 JSON fallback middleware)
- `tsconfig.json` (modifying include to include api/**/* and tests/unit/**/*)
- `package.json` (modifying to add scripts: build:wgt, package:tizen, generate:icon, test:unit:m4)
- `tests/unit/m4/packaging.test.ts`
- `tests/unit/m4/serverless.test.ts`

Tasks:
1. Create `tizen/config.xml`: Authoritative Tizen 4.0 manifest with `tv-samsung` profile, package `tB7x9K3qL1`, required privileges (`http://tizen.org/privilege/internet`, `http://tizen.org/privilege/tv.inputdevice`), `hwkey-event="enable"`, icon `icon.png`, content `index.html`.
2. Create `tizen/generate-icon.js`: Pure Node.js script (using built-in `zlib`) that generates `tizen/icon.png` (exactly 117x117 PNG binary, valid PNG header `89 50 4E 47 0D 0A 1A 0A`, IHDR width=117 height=117). Must pass `TizenValidator.validateIconBuffer`.
3. Create `tizen/build-wgt.js`: Pure Node.js script that packages `dist/client/`, `tizen/config.xml`, and `tizen/icon.png` into `dist/MultimediaDrive.wgt` (PKZip format, forward slash entry paths, preflight validation with `TizenValidator`).
4. Create `tizen/DEVELOPER_MODE.md`: Complete guide for Samsung Smart TV Developer Mode:
   - Activation via TV Apps -> Remote sequence `1 2 3 4 5` -> Developer Mode On -> Host PC IP -> Power-cycle TV reboot.
   - SDB setup & connection: `sdb connect <TV_IP>:26101`, `sdb devices`, `sdb install dist/MultimediaDrive.wgt`.
   - Troubleshooting: firewall ports 26101/26099, common error codes.
5. Create `vercel.json`: Production serverless deployment configuration:
   - `outputDirectory: "dist/client"`
   - `rewrites: [{ "source": "/api/(.*)", "destination": "/api/index" }]`
   - Edge headers: `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`.
   - Stream caching: `Cache-Control: public, max-age=3600, no-transform`.
   - Subtitle caching: `Cache-Control: public, max-age=86400`.
6. Create `api/index.ts`: Serverless entry point exporting Express `app` for Vercel/Cloudflare.
7. Update `server/index.ts`: Add 404 JSON fallback middleware (`app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));`) before the global error handler to pass contract `F17-B03` and preserve CORS `F17-B04`.
8. Update `tsconfig.json`: Include `"api/**/*"` and `"tests/unit/**/*"`.
9. Update `package.json`: Add scripts:
   - `"build:wgt": "node tizen/build-wgt.js"`
   - `"package:tizen": "npm run build:client && node tizen/generate-icon.js && node tizen/build-wgt.js"`
   - `"generate:icon": "node tizen/generate-icon.js"`
   - `"test:unit:m4": "tsx --test tests/unit/m4/**/*.test.ts"`
10. Create `tests/unit/m4/packaging.test.ts`: Comprehensive unit tests for `config.xml`, `icon.png` 117x117 dimensions, `build-wgt.js` zip generation, and manifest validator.
11. Create `tests/unit/m4/serverless.test.ts`: Comprehensive unit tests for `vercel.json`, `api/index.ts`, CORS headers, 404 JSON fallback, and Cache-Control headers.
12. Execute all builds and test commands:
   - `npm run build`
   - `npm run generate:icon`
   - `npm run build:client`
   - `npm run build:wgt`
   - `npm run test:unit:m4`
   - `npm run test:unit`
   - `node tests/run-e2e.js`
   - `npx tsx --test tests/adversarial/**/*.test.ts`
13. Write `implementation_report.md` and `handoff.md` in your working directory.
14. Send completion message back to parent (`a2f7e2fc-11dd-4392-9fe8-4ace62bc0d67`).
