# Milestone M4 Authoritative Specification Report: Dual Deployment & Native Tizen Packaging

**Target Environment**: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56 / Kant-M Architecture)  
**Date**: 2026-10-13  
**Status**: Authoritative Reference

---

## 1. Executive Summary

Milestone M4 establishes the dual deployment pipeline for the Multimedia Drive platform:
1. **Serverless Cloud Deployment**: Accessible directly through Samsung Smart TV's built-in web browser (Chromium M56) via Vercel / Cloudflare edge hosting with HTTP Range 206 chunking, strict CORS preflight, and tuned Cache-Control headers.
2. **Native Tizen Package (`.wgt`)**: A standalone W3C/Tizen widget archive installable directly into the internal flash storage of the Samsung TV UN50NU7400 via Developer Mode (code 12345) and Smart Development Bridge (SDB).

This report specifies the authoritative schemas, byte layouts, protocol headers, execution workflows, and boundary behaviors derived directly from authoritative test harnesses (`tizen-validator.js`), E2E test suites (Tiers 1–4), and Samsung Tizen 4.0 developer specifications.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Native Tizen Manifest | W3C & Tizen XML Namespaces | Manifest must declare root `<widget>` with standard W3C and Tizen widget namespaces | XML document root attributes | Validated root node | Fails validation if `xmlns="http://www.w3.org/ns/widgets"` or `xmlns:tizen="http://tizen.org/ns/widgets"` missing | `tizen-validator.js:16-21`, `f18-native-tizen-packaging.test.js:F18-01` |
| 2 | Native Tizen Manifest | `tv-samsung` Profile Declaration | Manifest must declare `<tizen:profile name="tv-samsung"/>` indicating TV runtime | Profile XML tag | Profile validation | Fails if missing or set to `mobile` or `wearable` | `tizen-validator.js:24-26`, `f18-native-tizen-packaging.test.js:F18-02` |
| 3 | Native Tizen Manifest | 10-Character Package ID | `<tizen:application>` attribute `package` must contain exactly 10 alphanumeric characters; `id` is `<package>.<appName>` | Package attribute string | Application registration | Fails validation if package ID length != 10 characters | `tizen-validator.js:29-37`, `f18-tizen-packaging-boundaries.test.js:F18-B02` |
| 4 | Native Tizen Manifest | Required Network & Input Privileges | Declares `http://tizen.org/privilege/internet` and `http://tizen.org/privilege/tv.inputdevice` | Privilege XML tags | Device permission grants | Validation fails if either privilege is absent; app cannot fetch media or register remote keys | `tizen-validator.js:40-49`, `f18-native-tizen-packaging.test.js:F18-03`, `f18-tizen-packaging-boundaries.test.js:F18-B01` |
| 5 | Native Tizen Manifest | Hardware Key Event Enablement | Setting `<tizen:setting screen-orientation="landscape" hwkey-event="enable"/>` allows JavaScript capturing Return (10009) and media keys | Setting XML tag | Key event dispatch to web runtime | Validation fails if `hwkey-event="enable"` is missing or set to disable; OS intercepts Return | `tizen-validator.js:51-53`, `f18-native-tizen-packaging.test.js:F18-05` |
| 6 | Native Tizen Manifest | Entry Point and Icon Tag | `<content src="index.html"/>` and `<icon src="icon.png"/>` declare start document and TV ribbon icon | Tag references | App entry & launcher icon | Validation fails if `<icon src="icon.png"/>` tag is missing | `tizen-validator.js:56-58` |
| 7 | Tizen Binary Icon | PNG Header Signature Check | Icon binary buffer must begin with the standard 8-byte PNG magic header `[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]` | Buffer (>=8 bytes) | Signature validation boolean | Returns `{ valid: false, error: 'Invalid PNG header signature' }` if header mismatch | `tizen-validator.js:74-78`, `f18-tizen-packaging-boundaries.test.js:F18-B04` |
| 8 | Tizen Binary Icon | Exact 117x117 Pixel Dimensions | IHDR chunk at offset 16–23 must encode UInt32BE width = 117 and height = 117 | Buffer (>=24 bytes) | `{ valid: true, width: 117, height: 117 }` | Returns `{ valid: false, error: 'Icon dimensions must be exactly 117x117 pixels...' }` if dimensions differ | `tizen-validator.js:84-95`, `f18-native-tizen-packaging.test.js:F18-04` |
| 9 | Tizen Native Packaging | Root File Placement in `.wgt` | `config.xml` and `icon.png` must reside at the root of the ZIP archive alongside `index.html` and `assets/` | File tree from `dist/client/` + `tizen/` | Packaged `.wgt` ZIP archive | Packaging script errors out if `config.xml`, `icon.png`, or `dist/client/` is missing | `PROJECT.md:80-83`, `f18-native-tizen-packaging.test.js` |
| 10 | Tizen Native Packaging | Zero-Dependency ZIP Archive Builder | Generator script (`tizen/build-wgt.js`) packs `.wgt` without external CLI tools (`tizen`, `zip`, `7z`) using Node.js built-ins (`zlib`, `fs`) | File array / directory paths | Standard PKZip 2.0 archive buffer | Throws descriptive error on missing source files; outputs sha256 checksum and size | Dispatch prompt Task 3, `PROJECT.md:83` |
| 11 | Developer Mode Deployment | 5-Digit Dev Mode Activation | Samsung TV Developer Mode toggled via Apps panel numeric code `12345`, Host PC IP configuration, and power cycle reboot | Remote code `12345` on Apps screen | TV Developer Mode ON with Host PC IP | Dev mode not active until full TV power cycle / reboot | `ORIGINAL_REQUEST.md:36`, Dispatch prompt Task 4 |
| 12 | Developer Mode Deployment | SDB Bridge Connection & Install | Connects via `sdb connect <TV_IP>:26101`, verifies with `sdb devices`, and installs with `sdb install <app>.wgt` | TV IP, Port 26101, `.wgt` path | Installed app package `tB7x9K3qL1.MultimediaDrive` | Connection timeout if TV and Host PC on different subnets or TV not rebooted | Dispatch prompt Task 4 |
| 13 | Serverless Cloud Deployment | OPTIONS Preflight Handling | Serverless router responds to HTTP OPTIONS with 200 or 204 status and standard CORS headers | `OPTIONS /api/*` | 200 or 204, `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods` | 404 or missing CORS breaks cross-origin browser requests | `f17-serverless-cloud-deployment.test.js:F17-01`, `f17-deployment-boundaries.test.js:F17-B01,F17-B02` |
| 14 | Serverless Cloud Deployment | Exposed Streaming Headers | Exposes `Content-Range`, `Content-Length`, `Accept-Ranges` in CORS response headers | `HEAD` / `GET /api/stream/:id` | `Access-Control-Expose-Headers` contains required headers | TV browser HTML5 `<video>` cannot inspect total duration or seek offsets | `f17-serverless-cloud-deployment.test.js:F17-02` |
| 15 | Serverless Cloud Deployment | Serverless Healthcheck Endpoint | `GET /api/health` returns status 200 with `{ status: 'ok' }` within 1000ms SLA | `GET /api/health` | HTTP 200, JSON `{ status: 'ok', ... }` | Returns 500 or times out if serverless container unhealthy | `f17-serverless-cloud-deployment.test.js:F17-03`, `f17-deployment-boundaries.test.js:F17-B05` |
| 16 | Serverless Cloud Deployment | Streaming Cache-Control Header | Video/audio streaming chunks (HTTP 206) return `Cache-Control: public, max-age=3600, no-transform` | `GET /api/stream/:id` with `Range` | HTTP 206 with `Cache-Control: public, max-age=3600, no-transform` | Missing `no-transform` causes proxies/CDNs to compress or corrupt media byte streams | `f17-serverless-cloud-deployment.test.js:F17-04` |
| 17 | Serverless Cloud Deployment | Subtitle Cache-Control Header | WebVTT subtitle stream returns `Cache-Control: public, max-age=86400` (24h caching) | `GET /api/subtitles/:id` | HTTP 200 with `Cache-Control: public, max-age=86400` | Subtitle cache re-fetches repeatedly on pause/resume | `f17-serverless-cloud-deployment.test.js:F17-05` |
| 18 | Serverless Cloud Deployment | Universal CORS Preservation | All API routes preserve `Access-Control-Allow-Origin: *` on both success (200, 206) and error responses (401, 403, 404, 429, 500) | Any request to `/api/*` | `Access-Control-Allow-Origin: *` on all status codes | Browser suppresses error message due to CORS omission | `f17-deployment-boundaries.test.js:F17-B04` |
| 19 | Serverless Cloud Deployment | Structured JSON 404 Handler | Requests to undefined endpoints return HTTP 404 with structured JSON `{ error: ... }` rather than HTML | `GET /api/unsupported_route_xyz` | HTTP 404, `{ error: "Route '...' not found" }` | Raw HTML error causes client JSON parser syntax error | `f17-deployment-boundaries.test.js:F17-B03` |
| 20 | Serverless Cloud Deployment | Dual Routing Architecture (`vercel.json`) | Serves static Chromium M56 assets from `dist/client/` and rewrites `/api/*` to serverless function entrypoint | Incoming HTTP requests | Static files or serverless execution | Misconfiguration serves HTML for API or blocks asset loading | Dispatch prompt Task 5, `PROJECT.md:80` |

---

## 3. Edge Cases & Boundary Behaviors

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `config.xml` Validator | Empty or null string `""` | Returns `{ valid: false, errors: ['Manifest config.xml content is missing or empty'] }` |
| 2 | `config.xml` Validator | Package prefix length != 10 (e.g. `'short'`) | Returns `{ valid: false, errors: ["Tizen package prefix 'short' must be exactly 10 alphanumeric characters (found 5)"] }` |
| 3 | `config.xml` Validator | Missing `tv-samsung` profile (e.g. profile set to `'mobile'`) | Returns `{ valid: false, errors: ['Missing or invalid profile: Must declare <tizen:profile name="tv-samsung"/> for Samsung Smart TV'] }` |
| 4 | `config.xml` Validator | Missing `<tizen:privilege name=".../tv.inputdevice"/>` | Returns `{ valid: false, errors: ['Missing required privilege: http://tizen.org/privilege/tv.inputdevice'] }` |
| 5 | `config.xml` Validator | Missing `<tizen:privilege name=".../internet"/>` | Returns `{ valid: false, errors: ['Missing required privilege: http://tizen.org/privilege/internet'] }` |
| 6 | `config.xml` Validator | Disabled hardware key setting (`hwkey-event="disable"`) | Returns `{ valid: false, errors: ['Missing or disabled hwkey-event: <tizen:setting hwkey-event="enable"/> is required for Return and media keys'] }` |
| 7 | Icon Buffer Validator | Buffer with length < 8 (e.g. 3 bytes `[0x89, 0x50, 0x4E]`) | Returns `{ valid: false, error: 'Buffer is too small to be a valid PNG' }` |
| 8 | Icon Buffer Validator | Non-PNG signature (e.g. `Buffer.from('NOT_A_PNG_IMAGE_DATA')`) | Returns `{ valid: false, error: 'Invalid PNG header signature' }` |
| 9 | Icon Buffer Validator | Valid signature but length between 8 and 23 bytes | Returns `{ valid: false, error: 'Buffer is too small to read PNG dimensions' }` |
| 10 | Icon Buffer Validator | Dimensions not 117x117 (e.g. 128x128 or 96x96) | Returns `{ valid: false, error: 'Icon dimensions must be exactly 117x117 pixels (got 128x128)' }` |
| 11 | Serverless Preflight | `OPTIONS /api/subtitles/sub_inc_es` | Status 200 or 204, headers contain `Access-Control-Allow-Origin: *` |
| 12 | Serverless Preflight | `OPTIONS /api/metadata/enrich` | Status 200 or 204, headers contain `Access-Control-Allow-Origin: *` |
| 13 | Serverless Error CORS | `GET /api/drive/files/non_existent` (HTTP 404) | Header `Access-Control-Allow-Origin: *` remains present on error |
| 14 | Serverless Range Stream | `GET /api/stream/vid_inc` with `Range: bytes=0-100` | Responds with 206, `Content-Range: bytes 0-100/...`, `Cache-Control: public, max-age=3600, no-transform` |
| 15 | Subtitle Delivery | `GET /api/subtitles/sub_inc_es` | Responds with 200, `Content-Type: text/vtt; charset=utf-8`, `Cache-Control: public, max-age=86400` |

---

## 4. Authoritative Specifications by Domain

### 4.1 Tizen 4.0 `config.xml` Specification

#### Full Authoritative XML Manifest
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

#### Field Specifications:
1. **Namespaces**:
   - `xmlns="http://www.w3.org/ns/widgets"`: Required W3C Widgets specification namespace.
   - `xmlns:tizen="http://tizen.org/ns/widgets"`: Required Tizen XML extensions namespace.
2. **Widget Attributes**:
   - `id`: Widget IRI identifier. Authoritative value: `http://multimediadrive.samsung.tv/app`.
   - `version`: Application version (`1.0.0`).
   - `viewmodes`: `fullscreen` enforces edge-to-edge UI presentation without window borders or status bars.
3. **Application Identifiers**:
   - `package`: MUST be exactly 10 alphanumeric characters. Standard package ID: `tB7x9K3qL1`.
   - `id`: Fully qualified application ID following `<package>.<appName>`. Standard ID: `tB7x9K3qL1.MultimediaDrive`.
   - `required_version`: `4.0` targeting Tizen 4.0 (Samsung NU7400 TV platform).
4. **Profile**:
   - `<tizen:profile name="tv-samsung"/>`: Authoritative declaration. Rejects `mobile` and `wearable`.
5. **Settings**:
   - `screen-orientation="landscape"`: Enforces 16:9 landscape format for TV panels.
   - `hwkey-event="enable"`: Enables dispatch of physical TV remote hardware events to DOM listeners. Crucial for key code 10009 (Return key).
6. **Privileges**:
   - `http://tizen.org/privilege/internet`: Network access for Google Drive API, TMDB API, and streaming proxy.
   - `http://tizen.org/privilege/tv.inputdevice`: Remote control input key registration via `window.tizen.tvinputdevice.registerKey(...)`.
7. **Assets**:
   - `<content src="index.html"/>`: Web application entry point.
   - `<icon src="icon.png"/>`: TV launcher ribbon icon.

---

### 4.2 117x117 PNG Binary Icon Specification

#### Binary Layout & Structure
A valid PNG icon for Samsung Smart TV must satisfy both standard PNG specification (ISO/IEC 15948) and `TizenValidator.validateIconBuffer`:

1. **Header Signature (Bytes 0–7)**:
   - Values: `0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`
2. **IHDR Chunk (Bytes 8–32)**:
   - Chunk Length (Bytes 8–11): `0x00, 0x00, 0x00, 0x0D` (13 bytes)
   - Chunk Type (Bytes 12–15): `0x49, 0x48, 0x44, 0x52` (`IHDR`)
   - Width (Bytes 16–19): `0x00, 0x00, 0x00, 0x75` (117 pixels UInt32BE)
   - Height (Bytes 20–23): `0x00, 0x00, 0x00, 0x75` (117 pixels UInt32BE)
   - Bit Depth (Byte 24): `0x08` (8 bits per sample)
   - Color Type (Byte 25): `0x06` (RGBA) or `0x02` (RGB)
   - Compression Method (Byte 26): `0x00` (deflate)
   - Filter Method (Byte 27): `0x00` (standard adaptive filtering)
   - Interlace Method (Byte 28): `0x00` (no interlace)
   - CRC-32 (Bytes 29–32): Standard 32-bit CRC over chunk type and data.
3. **IDAT Chunk**:
   - Contains zlib-compressed scanline bitmap (117 scanlines, each having 1 filter byte followed by 117 * 4 RGBA bytes = 469 bytes per row, total 54,873 uncompressed bytes).
4. **IEND Chunk**:
   - 12-byte standard PNG trailer: `00 00 00 00 49 45 4E 44 AE 42 60 82`.

#### Generation without External Dependencies
Can be synthesized directly in Node.js standard library using `zlib.deflateSync` and `zlib.crc32`.

---

### 4.3 Native `.wgt` ZIP Packaging Specification

#### Archive File Structure
The `.wgt` archive is a standard PKZip 2.0 file containing:
```
MultimediaDrive.wgt
├── config.xml             # Placed at archive root
├── icon.png               # Placed at archive root (117x117 PNG)
├── index.html             # Client entry point (compiled from dist/client/index.html)
└── assets/                # Assets folder (from dist/client/assets/)
    ├── *.css              # Flexbox-only stylesheet
    ├── index-legacy-*.js  # Chromium M56 compliant bundle
    └── polyfills-legacy-*.js
```

#### Packaging Rules:
1. **Root Placement**:
   `config.xml` and `icon.png` must be located directly at the archive root (`/config.xml` and `/icon.png`).
2. **Relative URIs**:
   Inside `.wgt`, resources are resolved relative to `file:///opt/usr/apps/.../res/wgt/`. The frontend Vite configuration (`client/vite.config.ts`) specifies `base: './'`, ensuring all `<script>` and `<link>` tags use relative paths (`./assets/...`).
3. **Zero External Binary Dependencies**:
   Packaging must not rely on `tizen.exe`, `zip`, or `7z`. Built via pure Node.js (`zlib.deflateRawSync`, `zlib.crc32`, and standard ZIP local/central directory headers).
4. **Pre-build Validation**:
   The build script must validate `config.xml` via `TizenValidator.validateConfigXml` and `icon.png` via `TizenValidator.validateIconBuffer` before archiving.

---

### 4.4 Samsung Smart TV Developer Mode & SDB Deployment Workflow

#### Hardware Platform:
- Model: Samsung UN50NU7400
- Year: 2018
- Platform: Tizen 4.0
- Web Engine: Chromium M56
- Port: 26101 (SDB daemon)

#### Workflow Steps:
1. **LAN Configuration**:
   - Connect Samsung TV and Host PC to the same local Wi-Fi / Ethernet subnet.
   - Note TV IP (e.g. `192.168.1.105`) via `Settings` -> `General` -> `Network` -> `Network Status` -> `IP Settings`.
   - Note Host PC IPv4 address (e.g. `192.168.1.50`).

2. **Enable Developer Mode**:
   - Press `Smart Hub` / `Home` on the Samsung remote.
   - Navigate to and open `Apps`.
   - On the remote keypad (or on-screen numbers), enter: `1 2 3 4 5`.
   - In the "Developer Mode Configuration" dialog:
     - Toggle Developer Mode to **ON**.
     - Enter Host PC IP: `192.168.1.50`.
     - Click **OK**.
   - **Crucial Step**: Reboot the TV by holding the physical remote `Power` button for 5 seconds until the screen cycles, or disconnect AC power for 10 seconds. Developer mode does not engage without a reboot.

3. **SDB Connection Commands**:
   ```powershell
   # Connect to Samsung TV over port 26101
   sdb connect 192.168.1.105:26101

   # Verify connected devices
   sdb devices
   # Expected output:
   # List of devices attached
   # 192.168.1.105:26101    device    UN50NU7400
   ```

4. **Package Installation**:
   ```powershell
   # Install the generated .wgt file
   sdb install dist/MultimediaDrive.wgt
   # Output confirms: app_id[tB7x9K3qL1.MultimediaDrive] install completed
   ```

5. **Application Lifecycle Commands**:
   ```powershell
   # Launch application
   sdb shell 0 was_start tB7x9K3qL1.MultimediaDrive

   # Terminate application
   sdb shell 0 was_kill tB7x9K3qL1.MultimediaDrive

   # Uninstall application
   sdb uninstall tB7x9K3qL1.MultimediaDrive
   ```

6. **Remote Web Inspector**:
   Navigate to `http://192.168.1.105:9222` in Chrome/Chromium to inspect the running web app.

---

### 4.5 Serverless Cloud Deployment Specification (Vercel / Cloudflare)

#### Routing Architecture:
- **Static Assets (`dist/client/`)**: Delivered directly by edge CDN for TV browser navigation (`index.html`, CSS, legacy JS).
- **API Functions (`/api/*`)**: Routed to Node.js serverless functions (e.g. `api/index.ts`).

#### Authoritative Headers by Route Type:

| Route Type | Method | Status | Required Headers | Description |
|---|---|---|---|---|
| Global Preflight | `OPTIONS` | 200 or 204 | `Access-Control-Allow-Origin: *`<br>`Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS`<br>`Access-Control-Allow-Headers: Range, Accept-Ranges, Content-Type, Authorization`<br>`Access-Control-Max-Age: 86400` | Browser CORS preflight for all endpoints |
| Streaming Proxy (`/api/stream/:id`) | `GET` (Range) | 206 | `Access-Control-Allow-Origin: *`<br>`Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`<br>`Accept-Ranges: bytes`<br>`Content-Range: bytes <start>-<end>/<total>`<br>`Content-Length: <chunkSize>`<br>`Content-Type: <mimeType>`<br>`Cache-Control: public, max-age=3600, no-transform` | Bounded byte-range streaming chunk (1–8MB) |
| Streaming Probe (`/api/stream/:id`) | `HEAD` | 200 | `Access-Control-Allow-Origin: *`<br>`Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges`<br>`Accept-Ranges: bytes`<br>`Content-Length: <totalSize>`<br>`Content-Type: <mimeType>`<br>`Cache-Control: public, max-age=3600, no-transform` | Duration probe without body payload |
| Subtitles (`/api/subtitles/:id`) | `GET` | 200 | `Access-Control-Allow-Origin: *`<br>`Content-Type: text/vtt; charset=utf-8`<br>`Cache-Control: public, max-age=86400` | Standard WebVTT subtitle stream |
| Healthcheck (`/api/health`) | `GET` | 200 | `Access-Control-Allow-Origin: *`<br>`Content-Type: application/json` | Health status `< 1000ms` SLA: `{ "status": "ok", ... }` |
| Undefined Routes (`/api/*`) | `GET` / `POST` | 404 | `Access-Control-Allow-Origin: *`<br>`Content-Type: application/json` | JSON structured error: `{ "error": "Route '...' not found" }` |
| All Error States (401, 403, 404, 429, 500) | Any | 4xx / 5xx | `Access-Control-Allow-Origin: *`<br>`Content-Type: application/json` | Preserves CORS so browser displays error message |

#### `vercel.json` Specification:
```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/api/:match*",
      "destination": "/api"
    }
  ],
  "headers": [
    {
      "source": "/api/:path*",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, HEAD, POST, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Range, Accept-Ranges, Content-Type, Authorization, X-Simulate-Auth-Failure, X-Simulate-Rate-Limit" },
        { "key": "Access-Control-Expose-Headers", "value": "Content-Range, Content-Length, Accept-Ranges" }
      ]
    }
  ]
}
```

#### Serverless Function Wrapper (`api/index.ts`):
```ts
import app from '../server/index';
export default app;
```
When hosted on Vercel, requests directed to `/api/*` invoke the Express application instance exported by `api/index.ts`.

---

## 5. Verification Matrix

| Verification Target | Command / Check | Expected Authoritative Result |
|---|---|---|
| Manifest Schema | `TizenValidator.validateConfigXml(AUTHORITATIVE_CONFIG_XML)` | `{ valid: true, errors: [] }` |
| Icon Buffer | `TizenValidator.validateIconBuffer(iconBuffer)` | `{ valid: true, width: 117, height: 117 }` |
| Tier 1 E2E | `npm run test:tier1` | 90/90 tests pass (including F17-01..F17-05 and F18-01..F18-05) |
| Tier 2 E2E | `npm run test:tier2` | 90/90 tests pass (including F17-B01..F17-B05 and F18-B01..F18-B05) |
| Tier 3 E2E | `npm run test:tier3` | 18/18 tests pass (including T3-10, T3-15) |
| Tier 4 E2E | `npm run test:tier4` | 9/9 tests pass (including T4-09 complete package deployment) |
