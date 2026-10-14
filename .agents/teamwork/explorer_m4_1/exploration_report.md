# Exploration Report: Milestone M4 Packaging & Deployment Architecture
**Target Platform:** Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)  
**Milestone:** M4 - Dual Deployment & Native Tizen Packaging (F17 + F18)  
**Date:** 2026-10-13  
**Explorer:** explorer_m4_1  

---

## 1. Executive Summary

Milestone M4 establishes the dual deployment pipeline for Multimedia Drive:
1. **Serverless Cloud Deployment (F17):** Turnkey configuration (`vercel.json`) allowing immediate, zero-infrastructure streaming proxy access via the Samsung Smart TV web browser or any mobile/desktop browser.
2. **Native Tizen Web Application Package (F18):** A standalone `.wgt` ZIP package containing the transpiled Chromium M56 client bundle, authoritative `config.xml` manifest with Samsung TV profile and privileges, and a compliant 117x117 PNG application icon.

Our exploration established that:
- The `tizen/` directory does not currently exist and must be created.
- The compiled client already exists in `dist/client/` (and is generated via `npm run build:client` using `vite.config.ts` configured with `base: './'`).
- A pure Node.js ZIP archive generator can be implemented using Node's built-in `zlib` and `fs` modules (using `zlib.deflateRawSync` and `zlib.crc32`), ensuring 100% host independence without requiring the external Samsung Tizen Studio CLI, while optionally leveraging `archiver` if installed.
- A 117x117 PNG icon can be generated programmatically with native Node `zlib` and `Buffer` routines, producing a valid PNG binary that passes `TizenValidator.validateIconBuffer` with zero external image processing tools.
- All 207 E2E tests (including F17, F18, T3-15, T4-09) and all 158 existing unit tests are currently passing. Adding `tests/unit/m4/packaging.test.ts` will provide robust verification for the generated `.wgt` archive, extracted assets, and manifest schema.

---

## 2. Existing Codebase Analysis

### 2.1 File Structure and Status
- `dist/client/`: Contains `index.html` and `assets/` (`index-legacy-*.js`, `polyfills-legacy-*.js`, `index-*.css`).
  - Configured in `client/vite.config.ts` with `base: './'` specifically for local file protocol (`file:///`) loading inside Tizen `.wgt` container.
- `tizen/`: **Not present**. Must be created with:
  - `tizen/config.xml`
  - `tizen/icon.png`
  - `tizen/generate-icon.js`
  - `tizen/build-wgt.js`
  - `tizen/README.md`
- `package.json`: Contains `build:client`, `test:e2e`, `test:unit`, etc., but lacks `build:wgt`, `package:tizen`, `generate:icon`, and `test:unit:m4`.

### 2.2 Validation Harness Requirements
From `tests/harness/tizen-validator.js`:
- `TizenValidator.validateConfigXml(xml)` requires:
  1. Namespaces: `xmlns="http://www.w3.org/ns/widgets"` and `xmlns:tizen="http://tizen.org/ns/widgets"`.
  2. TV Profile: `<tizen:profile name="tv-samsung"/>`.
  3. Package prefix: `<tizen:application package="..."/>` where package is **strictly 10 alphanumeric characters** (e.g. `tB7x9K3qL1`).
  4. Required privileges:
     - `http://tizen.org/privilege/internet`
     - `http://tizen.org/privilege/tv.inputdevice`
  5. Hardware key event setting: `<tizen:setting hwkey-event="enable"/>` (enables Return 10009 and media keys).
  6. Icon tag: `<icon src="icon.png"/>`.
- `TizenValidator.validateIconBuffer(buffer)` requires:
  1. PNG 8-byte signature: `0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`.
  2. Minimum buffer length >= 24 bytes.
  3. Dimensions in IHDR chunk: exactly `117` width and `117` height.

---

## 3. Design of Packaging Assets & Scripts

### 3.1 `tizen/config.xml`
The authoritative manifest conforming to Samsung Smart TV UN50NU7400 specifications:

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
    <description>Autonomous multimedia streaming platform for Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)</description>
    <author href="http://multimediadrive.samsung.tv">Multimedia Drive Team</author>
    <content src="index.html"/>
    <icon src="icon.png"/>
    <tizen:profile name="tv-samsung"/>
    <tizen:setting screen-orientation="landscape" hwkey-event="enable"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <access origin="*" subdomains="true"/>
</widget>
```

**Key Attributes:**
- `package="tB7x9K3qL1"`: Exactly 10 alphanumeric characters.
- `id="tB7x9K3qL1.MultimediaDrive"`: Standard `{package}.{appName}` notation.
- `required_version="4.0"`: Explicit target for Samsung UN50NU7400 (Tizen 4.0).
- `screen-orientation="landscape"`: Enforces landscape 16:9 1080p presentation.
- `hwkey-event="enable"`: Crucial for capturing Return key (code 10009) and media playback keys.
- `<access origin="*" subdomains="true"/>`: Allows network requests from local app container to backend streaming server and Google Drive / TMDB.

---

### 3.2 117x117 Icon Asset and Generator (`tizen/generate-icon.js`)
Rather than relying on third-party binary graphic tools, we provide a standalone pure Node.js icon generator script using native `zlib` and `Buffer`.

**Features:**
- Produces a valid, standards-compliant PNG file containing `IHDR`, `IDAT`, and `IEND` chunks.
- Computes correct CRC32 checksums using `zlib.crc32`.
- Sets width=117, height=117, color type=6 (RGBA), 8 bits per channel.
- Generates a sleek dark slate background (`#0f172a`), rounded cyan TV badge border (`#00a8e8`), and central play/multimedia emblem (`#00e5ff`).
- Automatically validates the resulting buffer against `TizenValidator.validateIconBuffer`.

---

### 3.3 `.wgt` Generator Script (`tizen/build-wgt.js`)
The Tizen widget archive format (`.wgt`) is a standard PKZIP archive containing:
- `config.xml` at root
- `icon.png` at root
- `index.html` at root
- `assets/` and all other files from `dist/client/` preserving relative directory hierarchies with forward slashes (`/`).

**Design Highlights of `build-wgt.js`:**
1. **Pre-flight Validation:**
   - Verifies `dist/client/index.html` exists (prompts user to run `npm run build:client` if missing).
   - Validates `config.xml` via `TizenValidator.validateConfigXml`.
   - Validates `icon.png` via `TizenValidator.validateIconBuffer`.
2. **Dual-Engine ZIP Packer:**
   - **Engine A (Zero-Dependency Native):** Builds standard ZIP bytes directly using `zlib.deflateRawSync` and `zlib.crc32`. Runs anywhere on any Node >= 18/20 environment without `npm install`.
   - **Engine B (`archiver`):** Detects if `archiver` is installed and uses it for streaming archive creation if preferred.
3. **Cross-Platform Path Normalization:**
   - Uses `relPath.split(path.sep).join('/')` to guarantee forward slashes in all ZIP local and central directory headers, avoiding Windows backslash corruption on Linux/Tizen extractors.
4. **CLI + Module API:**
   - Executable as CLI: `node tizen/build-wgt.js [--out=path] [--client-dir=path]`.
   - Exportable functions for testing: `buildWgt(options)`, `packZip(entries)`, `readZipEntries(zipBuffer)`.
5. **Output Destination:**
   - Produces `dist/MultimediaDrive.wgt`.

---

### 3.4 Serverless Cloud Deployment (`vercel.json`)
For the Dual Deployment requirement (R4 / F17), `vercel.json` configures the serverless streaming proxy and static client hosting:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/index.ts",
      "use": "@vercel/node"
    },
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist/client"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server/index.ts"
    },
    {
      "src": "/(.*)",
      "dest": "dist/client/$1"
    }
  ]
}
```

---

### 3.5 `package.json` Integration
The following npm scripts should be integrated into `package.json`:
- `"build:wgt": "node tizen/build-wgt.js"`
- `"package:tizen": "npm run build:client && node tizen/build-wgt.js"`
- `"generate:icon": "node tizen/generate-icon.js"`
- `"test:unit:m4": "tsx --test tests/unit/m4/**/*.test.ts"`

Optional devDependency:
- `"archiver": "^7.0.1"` (for standard ecosystem compatibility).

---

## 4. E2E Test Suite Analysis (T3-15 and T4-09)

### 4.1 T3-15 (`tests/e2e/tier3-cross-feature/cross-feature-combinations.test.js`)
- Combines F9 (Chromium M56 bundle) and F18 (Tizen packaging).
- Asserts that `TizenValidator.validateConfigXml` passes on the authoritative manifest.
- Asserts that `M56Validator.validateJavaScript` passes on the bundle (no `?.`, `??`, `{ ...obj }`, etc.).

### 4.2 T4-09 (`tests/e2e/tier4-real-world/real-world-scenarios.test.js`)
- Full native package deployment verification:
  1. Validates manifest schema, profile `tv-samsung`, permissions `internet` and `tv.inputdevice`.
  2. Validates 117x117 icon buffer.
  3. Validates viewport scale (`width=1920`) and classic script tags in HTML.
  4. Validates JavaScript bundle ES5/ES6 M56 compliance.

Our design completely matches and reinforces these contracts.

---

## 5. Comprehensive Unit Test Plan (`tests/unit/m4/packaging.test.ts`)

A dedicated unit test file should be added to test the physical assets on disk and the packaging process:
1. `M4-U01: tizen/config.xml exists and passes TizenValidator.validateConfigXml cleanly`.
2. `M4-U02: tizen/icon.png exists and passes TizenValidator.validateIconBuffer (117x117 PNG)`.
3. `M4-U03: tizen/generate-icon.js regenerates compliant icon buffer`.
4. `M4-U04: tizen/build-wgt.js packages dist/client into dist/MultimediaDrive.wgt`.
5. `M4-U05: Generated .wgt contains config.xml, icon.png, index.html, and assets/*`.
6. `M4-U06: Extracted config.xml from .wgt matches authoritative manifest`.
7. `M4-U07: Extracted icon.png from .wgt passes TizenValidator.validateIconBuffer`.
8. `M4-U08: Extracted index.html from .wgt passes M56Validator.validateHTML`.
9. `M4-U09: Extracted JavaScript bundles from .wgt pass M56Validator.validateJavaScript`.
10. `M4-U10: build-wgt aborts with descriptive error if client build is missing or manifest is invalid`.

---

## 6. Samsung Smart TV UN50NU7400 Developer Mode Installation Guide (`tizen/README.md`)

The deployment guide for end users / installers:
1. **Enable Developer Mode:**
   - TV Remote: Smart Hub -> Apps.
   - Enter digits `1 2 3 4 5`.
   - Toggle Developer Mode: `ON`.
   - Enter Host PC IP address and reboot TV.
2. **Deploy Package:**
   - Run `npm run package:tizen` to generate `dist/MultimediaDrive.wgt`.
   - Via SDB (if Tizen CLI is installed):
     ```bash
     sdb connect <TV_IP>:26101
     tizen install -n dist/MultimediaDrive.wgt -t UN50NU7400
     ```
   - Via Tizen Studio Device Manager GUI:
     Connect to TV IP -> right-click device -> Install Package -> select `dist/MultimediaDrive.wgt`.
3. **Remote Control Operation:**
   - Arrows: D-pad navigation.
   - Enter (13): Select / Play.
   - Return (10009): Back / Close Modal / Exit prompt.
