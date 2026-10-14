# Handoff Report: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56) Specification Survey

**Agent:** `spec_miner_survey_1`  
**Working Directory:** `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_survey_1`  
**Target:** Authoritative specification of Samsung Smart TV UN50NU7400, Tizen 4.0, Chromium M56 Webview, Remote Control key mappings, and Native .wgt packaging requirements for R3 & R4.

---

## 1. Observation

1. **Web Engine & Platform Identity:**
   - TV Model: Samsung UN50NU7400 (2018 NU-series, 50" 4K UHD, Quad-Core CPU, Mali GPU).
   - User Agent string: `Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 SamsungBrowser/2.1 Chrome/56.0.2924.0 TV Safari/537.36`.
   - Browser engine: Blink / Chromium M56 (Chrome 56.0.2924.0) permanent firmware.

2. **Syntax and CSS Compatibility Verification:**
   - Chrome 56 natively supports ES6 classes, arrow functions, `let`/`const`, `Promise`, and `async`/`await` (Chrome 55+).
   - Chrome 56 **FAILS** with fatal `SyntaxError` on:
     - Object Spread (`{ ...obj }`), which required Chrome 60.
     - Optional Chaining (`?.`) and Nullish Coalescing (`??`), which required Chrome 80.
     - ES Modules (`<script type="module">`), which required Chrome 61 (tags are silently ignored).
   - Chrome 56 **FAILS** on CSS layout:
     - CSS Grid Level 1 is disabled/unsupported out of the box (Chrome 57 required).
     - Flexbox `gap` is unsupported (Chrome 84 required; silently ignored in M56).
     - CSS `aspect-ratio` is unsupported (Chrome 88 required).
   - Chrome 56 **SUCCEEDS** on Flexbox Level 1 (`display: flex`), CSS variables (`var(--...)`), and GPU-accelerated 3D transforms (`translate3d`).

3. **Media Subsystem & HTTP Range 206 Behavior:**
   - Hardware codecs: H.264 (up to 4K@30fps, 1080p@60fps), HEVC / H.265 (up to 4K@60fps Main 10), AAC-LC, MP3, Dolby Digital (AC3), Dolby Digital Plus (EAC3). DTS is unsupported.
   - Chromium M56 HTML5 `<video>` player issues initial byte range request (`Range: bytes=0-`).
   - Server MUST return status `206 Partial Content` with `Content-Range`, `Accept-Ranges: bytes`, and CORS headers. Returning `200 OK` triggers playback stall, memory overload, or `MEDIA_ERR_SRC_NOT_SUPPORTED`.
   - External WebVTT subtitles require `<video crossorigin="anonymous">`, UTF-8 encoding without BOM, and CORS header `Access-Control-Allow-Origin: *`.

4. **Samsung Remote Key Codes & Registration:**
   - Mandatory keys (cannot and must not be registered via API): Left (37), Up (38), Right (39), Down (40), Enter (13), Return/Back (10009).
   - Registrable media keys (via `tizen.tvinputdevice.registerKey`): `MediaPlayPause` (10252), `MediaPlay` (415), `MediaPause` (19), `MediaStop` (413), `MediaFastForward` (417), `MediaRewind` (412), `MediaTrackNext` (10233), `MediaTrackPrevious` (10232).
   - Return key (10009): Must intercept with `e.preventDefault()`. Inside player/modals, close current view; on home catalog root, trigger custom exit confirmation dialog before invoking `tizen.application.getCurrentApplication().exit()`.

5. **Tizen Manifest (`config.xml`) & .wgt Packaging:**
   - Schema: `<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" ...>`
   - Profile: `<tizen:profile name="tv-samsung"/>` (generic `tv` profile fails deployment).
   - Settings: `<tizen:setting hwkey-event="enable" screen-orientation="landscape"/>`.
   - Privileges: `http://tizen.org/privilege/internet`, `http://tizen.org/privilege/tv.inputdevice`, `http://tizen.org/privilege/application.launch`, `http://developer.samsung.com/privilege/network.public`.
   - Features: `http://tizen.org/feature/screen.size.all`, `http://tizen.org/feature/network.internet`.
   - Icon: 117x117 PNG (`icon.png` at root).
   - Package is a ZIP archive containing `config.xml`, `icon.png`, `index.html`, and assets. SDB install requires signing with a developer certificate containing the TV DUID.

---

## 2. Logic Chain

1. **Premise:** The user requested an application running on Samsung Smart TV UN50NU7400 via both TV web browser and native `.wgt` package (R3 & R4).
2. **Inference 1 (Engine Constraints):** UN50NU7400 runs Tizen 4.0, which permanently locks web views to Chromium M56. Because modern toolchains (like Vite and React 18 / Vue 3) default to ES modules, object spread, and modern CSS, unconfigured modern frontend code will produce either a blank screen (due to `<script type="module">` or `{ ...obj }`) or broken layouts (due to `display: grid` or Flexbox `gap`).
3. **Inference 2 (Build Tooling):** The build configuration must include `@vitejs/plugin-legacy` targeting `chrome 56`, transpiling to classic IIFE bundles, converting object spreads to `Object.assign()`, and replacing modern JS syntax.
4. **Inference 3 (Styling Architecture):** All UI styling must strictly use Flexbox with explicit margin-based spacing (`margin-right` / `margin-bottom`) instead of `gap`, and use `padding-top` aspect ratio hacks instead of `aspect-ratio`.
5. **Inference 4 (Media Streaming):** The serverless backend proxying Google Drive must strictly honor `Range` request headers and return `206 Partial Content`. Any regression to `200 OK` breaks Tizen video playback.
6. **Inference 5 (Navigation & Remote):** Because Samsung's Smart Remote (One Remote) lacks dedicated physical media buttons while standard IR remotes have them, the UI must provide both on-screen spatial controls and registered remote key handlers for maximum compatibility.

---

## 3. Caveats

- **Tizen Native APIs in Web Browser:** When the app is accessed via the Samsung Internet web browser URL, `window.tizen` is undefined. The application must feature runtime detection (`typeof tizen !== 'undefined'`) to prevent runtime exceptions.
- **DTS Audio:** The UN50NU7400 dropped hardware DTS decoding. Media with DTS audio tracks will play video without audio unless the backend transcodes audio to AAC or AC3.
- **Physical Signing Keystores:** Testing via SDB requires the developer to generate a Samsung Certificate Profile tied to the physical TV DUID in Tizen Studio. An unsigned `.wgt` cannot be sideloaded via SDB directly without developer certificate signature.

---

## 4. Conclusion

The specification survey for Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56) is complete and authoritative. All technical constraints, syntax pitfalls, CSS layout rules, remote keycodes, HTTP Range requirements, and packaging specifications have been thoroughly investigated, validated, and documented in:
`c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_survey_1\spec_report.md`.

---

## 5. Verification Method

To independently verify these findings:
1. Inspect `spec_report.md` at `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\spec_miner_survey_1\spec_report.md`.
2. Verify Chrome 56 compatibility for `<script type="module">`, CSS Grid, Object Spread, and Flexbox `gap` against Caniuse / MDN compatibility tables.
3. Verify Tizen TV Remote Keycodes and `tvinputdevice` API against official Samsung Smart TV developer documentation (`developer.samsung.com/smarttv`).
4. Validate `config.xml` XML structure against Samsung Tizen Web Application guidelines.
