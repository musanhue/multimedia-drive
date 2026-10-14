# Handoff Report: Milestone M4 Authoritative Specifications

**Agent**: `spec_miner_m4_1`  
**Milestone**: M4 (Dual Deployment & Native Tizen Packaging for Samsung Smart TV UN50NU7400)  
**Parent Agent**: `a2f7e2fc-11dd-4392-9fe8-4ace62bc0d67`  
**Date**: 2026-10-13  
**Status**: Hard Handoff (Complete)

---

## 1. Observation

Direct observations from codebase inspection, test harnesses, and execution:

1. **Tizen Manifest Validator (`tests/harness/tizen-validator.js:8-64`)**:
   - Lines 16–21:
     ```js
     if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/ns\/widgets["']/.test(xmlContent)) {
       errors.push('Missing W3C widget namespace: xmlns="http://www.w3.org/ns/widgets"');
     }
     if (!/xmlns:tizen\s*=\s*["']http:\/\/tizen\.org\/ns\/widgets["']/.test(xmlContent)) {
       errors.push('Missing Tizen namespace: xmlns:tizen="http://tizen.org/ns/widgets"');
     }
     ```
   - Lines 24–26:
     ```js
     if (!/<tizen:profile[^>]*name\s*=\s*["']tv-samsung["']/.test(xmlContent)) {
       errors.push('Missing or invalid profile: Must declare <tizen:profile name="tv-samsung"/> for Samsung Smart TV');
     }
     ```
   - Lines 29–37:
     ```js
     const appMatch = xmlContent.match(/<tizen:application[^>]*package\s*=\s*["']([^"']+)["']/);
     if (!appMatch) {
       errors.push('Missing <tizen:application> tag with package attribute');
     } else {
       const pkg = appMatch[1];
       if (pkg.length !== 10) {
         errors.push(`Tizen package prefix '${pkg}' must be exactly 10 alphanumeric characters (found ${pkg.length})`);
       }
     }
     ```
   - Lines 40–48: Required privileges `http://tizen.org/privilege/internet` and `http://tizen.org/privilege/tv.inputdevice`.
   - Lines 51–53: Hardware key setting `/<tizen:setting[^>]*hwkey-event\s*=\s*["']enable["']/`.
   - Lines 56–58: Icon reference `/<icon[^>]*src\s*=\s*["']icon\.png["']/`.

2. **PNG Icon Validator (`tests/harness/tizen-validator.js:69-98`)**:
   - Lines 75–78: Signature match against `Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])`.
   - Lines 85–88:
     ```js
     const width = buffer.readUInt32BE(16);
     const height = buffer.readUInt32BE(20);
     ```
   - Lines 88–95:
     ```js
     if (width !== 117 || height !== 117) {
       return { valid: false, error: `Icon dimensions must be exactly 117x117 pixels (got ${width}x${height})`, width, height };
     }
     ```

3. **Authoritative `config.xml` in Tests (`tests/e2e/tier1-feature-coverage/f18-native-tizen-packaging.test.js:5-21`)**:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <widget xmlns="http://www.w3.org/ns/widgets" 
           xmlns:tizen="http://tizen.org/ns/widgets" 
           id="http://multimediadrive.samsung.tv/app" 
           version="1.0.0" 
           viewmodes="fullscreen">
       <tizen:application id="tB7x9K3qL1.MultimediaDrive" 
                          package="tB7x9K3qL1" 
                          required_version="4.0"/>
       <name>Multimedia Drive</name>
       <content src="index.html"/>
       <icon src="icon.png"/>
       <tizen:profile name="tv-samsung"/>
       <tizen:setting screen-orientation="landscape" hwkey-event="enable"/>
       <tizen:privilege name="http://tizen.org/privilege/internet"/>
       <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
   </widget>
   ```

4. **Serverless Streaming & Caching Expectations (`tests/e2e/tier1-feature-coverage/f17-serverless-cloud-deployment.test.js`)**:
   - F17-01: OPTIONS preflight returns 200 or 204 with `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: /GET.*HEAD.*OPTIONS/`.
   - F17-02: `HEAD /api/stream/vid_inc` returns `Access-Control-Expose-Headers` containing `Content-Range, Content-Length, Accept-Ranges`.
   - F17-03: `GET /api/health` returns status 200 within 1000ms SLA.
   - F17-04: `GET /api/stream/vid_inc` with Range returns status 206 and `Cache-Control: public, max-age=3600, no-transform`.
   - F17-05: `GET /api/subtitles/sub_inc_es` returns status 200 and `Cache-Control: public, max-age=86400`.

5. **Serverless Boundary Expectations (`tests/e2e/tier2-boundary-corner/f17-deployment-boundaries.test.js`)**:
   - F17-B03: Undefined endpoint (`/api/unsupported_route_xyz`) returns 404 with JSON `{ error: ... }`.
   - F17-B04: All API routes preserve `Access-Control-Allow-Origin: *` on both success and error responses (e.g. 404 `/api/drive/files/non_existent`).

6. **Current Codebase State**:
   - `tizen/` directory does not yet exist in project root.
   - `dist/client/` is already compiled with Vite legacy plugin (`base: './'`, `target: 'chrome56'`).
   - Pure Node.js PNG generator test executed successfully (`PNG size: 350 Validation: { valid: true, width: 117, height: 117 }`).
   - Pure Node.js ZIP generator test executed successfully and verified via `tar -tf`.
   - Existing E2E test suite currently passes 100% across all 4 tiers against mock server oracle (Tier 1: 90/90, Tier 2: 90/90, Tier 3: 18/18, Tier 4: 9/9).

---

## 2. Logic Chain

1. **Manifest Validation Logic**:
   - Observation 1 defines the strict regular expressions in `TizenValidator.validateConfigXml`.
   - Observation 3 provides the exact verbatim XML document that passes all validator checks and tests (F18-01 through F18-05, T3-15, T4-09).
   - Therefore, the file `tizen/config.xml` must match this authoritative XML template exactly, with package `tB7x9K3qL1`, profile `tv-samsung`, `hwkey-event="enable"`, and the two required privileges.

2. **Icon Binary Structure Logic**:
   - Observation 2 demonstrates that `validateIconBuffer` verifies both the 8-byte PNG signature `89 50 4E 47 0D 0A 1A 0A` and the big-endian dimensions at offset 16 and 20 being exactly 117.
   - Observation 6 proves that Node.js standard `zlib` library (`zlib.deflateSync`, `zlib.crc32`) can synthesize a valid 117x117 RGBA PNG binary without external native image libraries (`sharp`, `canvas`, or `imagemagick`).
   - Therefore, `tizen/icon.png` can be generated deterministically via a zero-dependency script or static binary asset.

3. **Native Packaging Logic**:
   - Observation 6 confirms that PKZip archives can be constructed using Node.js built-ins (`zlib.deflateRawSync` and `zlib.crc32`) with standard local file headers and central directory records.
   - The archive must place `config.xml` and `icon.png` at root alongside the compiled frontend from `dist/client/`.
   - Because `client/vite.config.ts` uses `base: './'`, all asset paths in `dist/client/index.html` are relative, guaranteeing valid execution over the Tizen local `file://` protocol.

4. **Samsung TV Developer Mode Workflow Logic**:
   - Samsung UN50NU7400 requires Developer Mode enabled via Apps menu code `12345`, Host PC IP setup, and an explicit power-cycle TV reboot.
   - SDB connects to port 26101 and uses `sdb install <package>.wgt` to deploy to internal TV flash memory.

5. **Serverless Cloud Deployment Logic**:
   - Observations 4 and 5 establish the exact HTTP status codes and headers required for serverless streaming:
     - CORS: `Access-Control-Allow-Origin: *` on all responses, `Access-Control-Expose-Headers` exposing `Content-Range`, `Content-Length`, `Accept-Ranges`.
     - Caching: `Cache-Control: public, max-age=3600, no-transform` on stream chunks, `public, max-age=86400` on subtitles.
     - 404 routes must return structured JSON `{ error: ... }` with CORS headers.
   - A `vercel.json` rewrite configuration pointing `/api/:path*` to `api/index.ts` and serving static files from `dist/client/` fulfills all cloud deployment criteria.

---

## 3. Caveats

1. **Physical TV Remote Key Registration**:
   While the manifest requires `<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>` and `hwkey-event="enable"`, the D-pad keys (37-40), Enter (13), and Return (10009) are dispatched natively by the TV window manager and must NOT be registered via `registerKey()`; only media keys (`MediaPlay`, `MediaPause`, `MediaPlayPause`, `MediaFastForward`, `MediaRewind`) and color keys are registrable via `tizen.tvinputdevice.registerKey()`.
2. **Serverless Payload Limits**:
   Vercel serverless functions have execution time and response payload constraints. The 8MB chunk boundary designed in Milestone M1 (`CHUNK_SIZE_LIMIT = 8 * 1024 * 1024`) remains essential in cloud execution to avoid 504 Gateway Timeout errors.
3. No other caveats.

---

## 4. Conclusion

All specifications for Milestone M4 have been mined, analyzed, and authoritatively documented in `spec_report.md`. The implementation blueprint is concrete and requires:
1. Creating `tizen/config.xml` matching the authoritative XML schema.
2. Creating `tizen/icon.png` matching the 117x117 PNG binary specification.
3. Implementing `tizen/build-wgt.js` using pure Node.js built-ins (`zlib`, `fs`) to package `dist/MultimediaDrive.wgt`.
4. Adding `npm run package:tizen` and `npm run build:wgt` scripts to `package.json`.
5. Creating `vercel.json` and `api/index.ts` for serverless cloud deployment.
6. Ensuring 404 JSON handling and CORS headers in `server/index.ts`.
7. Authoring M4 unit tests (`tests/unit/m4/packaging.test.ts` and `tests/unit/m4/serverless.test.ts`).

---

## 5. Verification Method

To independently verify all specifications:

1. **Verify `config.xml` against authoritative validator**:
   ```powershell
   node -e "const { TizenValidator } = require('./tests/harness/tizen-validator'); const fs = require('fs'); const xml = fs.readFileSync('./tizen/config.xml', 'utf8'); console.log(TizenValidator.validateConfigXml(xml));"
   ```
   *Expected*: `{ valid: true, errors: [] }`

2. **Verify 117x117 PNG icon buffer**:
   ```powershell
   node -e "const { TizenValidator } = require('./tests/harness/tizen-validator'); const fs = require('fs'); const buf = fs.readFileSync('./tizen/icon.png'); console.log(TizenValidator.validateIconBuffer(buf));"
   ```
   *Expected*: `{ valid: true, width: 117, height: 117 }`

3. **Run E2E Test Suite for F17 and F18**:
   ```powershell
   npm run test:tier1
   npm run test:tier2
   npm run test:tier3
   npm run test:tier4
   ```
   *Expected*: 100% pass across all tiers.
