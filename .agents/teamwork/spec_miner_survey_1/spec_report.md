# Authoritative Specification Report: Samsung Smart TV UN50NU7400 (Tizen 4.0 / Chromium M56)

**Target Hardware:** Samsung Smart TV UN50NU7400 (50-inch 4K UHD, 2018 NU-Series)  
**Operating System:** Samsung Tizen OS 4.0  
**Browser / Webview Engine:** Chromium M56 (specifically `Chrome/56.0.2924.0`, Blink `WebKit/537.36`)  
**User Agent Signature:**  
`Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 SamsungBrowser/2.1 Chrome/56.0.2924.0 TV Safari/537.36`  
**Target Resolution & Viewport:** Physical 3840×2160 (4K UHD), Logical Viewport 1920×1080 (FHD 1080p, 16:9), hardware-upscaled by Tizen Display Pipeline  

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | JS Compatibility | Native ES6 Classes & Arrow Functions | Native instantiation and inheritance of classes and arrow function expressions | Standard ES6 class declarations and arrow callbacks | Valid object instantiation, preserved lexical `this` | `SyntaxError` if modern class fields (`#field`) are used | MDN / Chromium 56 standard release specifications |
| 2 | JS Compatibility | Native `async` / `await` | Native asynchronous function execution introduced in Chrome 55 | `async function`, `await promise` | Native Promise resolution / rejection | Syntax unhandled rejection if rejected without catch block | V8 5.6 engine specifications (M56) |
| 3 | JS Compatibility | Native `Promise` & `fetch` API | Native Promise constructor and window.fetch for network requests | Fetch URL, RequestInit options | Response object (json, text, blob) | Network failure rejects promise; CORS errors fail silently or reject | Chromium 42 / 56 Web API specs |
| 4 | JS Compatibility | Array & Object Destructuring | Syntactic unpacking of properties from arrays and objects (`const { a, b } = obj`) | Object/Array source | Bound local identifiers | `TypeError` if right-hand side is `null` or `undefined` | ES6 / Chrome 49 compatibility |
| 5 | JS Compatibility | Prohibited: Object Spread (`{ ...obj }`) | Spread syntax in object literals is NOT supported in Chrome 56 (requires Chrome 60+) | `{ ...existingObj, newProp: 1 }` | N/A | **Fatal `SyntaxError: Unexpected token ...`** halting application load | ECMAScript 2018 / Chrome 60 spec probe |
| 6 | JS Compatibility | Prohibited: ES Modules (`<script type="module">`) | Native ES Module loading is NOT supported in Chrome 56 (introduced in Chrome 61+) | `<script type="module" src="...">` | N/A | **Script tag is completely ignored**, causing white screen of death | Caniuse / Chromium 61 specification |
| 7 | JS Compatibility | Prohibited: Modern Operators (`?.`, `??`) | Optional chaining and nullish coalescing are unsupported in Chrome 56 (Chrome 80+) | `obj?.prop`, `val ?? defaultVal` | N/A | **Fatal `SyntaxError: Unexpected token .` or `?`** | ES2020 / Chrome 80 spec probe |
| 8 | CSS Compatibility | Flexbox Layout Level 1 | Full flexbox layout support (`display: flex`, flex-direction, align-items, justify-content) | Standard flex container properties | Correct 1D box model distribution | Full support; no quirks in M56 | W3C CSS Flexible Box Layout / Chrome 29+ |
| 9 | CSS Compatibility | Prohibited: CSS Grid Layout | CSS Grid Level 1 is disabled/unsupported out-of-the-box in Chrome 56 (enabled in Chrome 57) | `display: grid`, `grid-template-columns` | N/A | **Property silently ignored**; grid container collapses to `display: block` | Caniuse / Chromium 57 release notes |
| 10 | CSS Compatibility | Prohibited: Flexbox `gap` | Flexbox row/column gap is NOT supported in Chrome 56 (added in Chrome 84) | `gap: 16px`, `row-gap`, `column-gap` in flex container | N/A | **Property silently ignored**; items touch each other without spacing | Caniuse CSS Flexbox gap / Chrome 84 |
| 11 | CSS Compatibility | Hardware-Accelerated 3D Transforms | Hardware composite layers via GPU on Tizen 4.0 Mali GPU | `transform: translate3d(x, y, 0)`, `scale3d(x, y, 1)` | 60 FPS smooth rendering on TV | Software rasterization fallback if 2D properties trigger reflow | Blink Rendering Pipeline specs |
| 12 | CSS Compatibility | CSS Custom Properties (Variables) | CSS variable definition and runtime evaluation | `--accent-color: #3b82f6; color: var(--accent-color)` | Rendered computed color | Ignored if undeclared without fallback; supported since Chrome 49 | Chrome 49 CSS Variables spec |
| 13 | Media Playback | HTML5 `<video>` HTTP Range 206 | Progressive video streaming with partial byte-range chunk requests | `Range: bytes=start-end` HTTP header | `206 Partial Content` with `Content-Range` | **Playback freezes / MEDIA_ERR_SRC_NOT_SUPPORTED** if server returns 200 OK | Tizen 4.0 Media Subsystem specs |
| 14 | Media Playback | Video Codec: H.264 / AVC | Hardware decoding of AVC up to High Profile Level 5.1 (4K@30fps, 1080p@60fps) | MP4 container, H.264 video track | Seamless hardware rendering | Black screen or lag if profile level > 5.1 | Samsung UN50NU7400 Hardware Specs |
| 15 | Media Playback | Video Codec: HEVC / H.265 | Hardware decoding of HEVC Main / Main 10 profile (up to 4K@60fps with HDR10/HLG) | MP4 / MKV container, HEVC video track | 4K UHD 60fps hardware decoding | Codec error if container has unsupported muxing | Samsung UHD Engine Hardware Specs |
| 16 | Media Playback | Audio Codecs: AAC & MP3 | Native audio decoding of AAC-LC, HE-AAC, and MP3 audio streams | Standard audio streams in MP4/MKV/MP3 | Stereo / multi-channel audio output | Unsupported if sample rate exceeds hardware limit | Samsung NU7400 Audio specs |
| 17 | Media Playback | Audio Codecs: Dolby Digital (AC3/EAC3) | Hardware decoding and HDMI ARC / Optical pass-through of AC3 and EAC3 (DD+) | Dolby AC-3 / E-AC-3 audio track in video | Downmixed stereo to 20W TV speakers or 5.1 bitstream via ARC | DTS is unsupported natively on 2018 models | Samsung NU7400 Audio Spec Sheet |
| 18 | Subtitles | WebVTT Subtitle Track (`<track>`) | External subtitle rendering via HTML5 `<track kind="subtitles">` | WebVTT UTF-8 file (`.vtt`), `crossorigin="anonymous"` | Synchronized on-screen text overlays | Fails silently if CORS headers missing on origin or BOM present | W3C WebVTT / Tizen Media spec |
| 19 | Remote Input | Mandatory Navigation Keys | Directional D-pad and Enter keys detected without registration | Keycodes: Left (37), Up (38), Right (39), Down (40), Enter (13) | Standard DOM `keydown` events | **Exception thrown** if developer calls `tizen.tvinputdevice.registerKey` | Samsung Tizen TV Input Device API |
| 20 | Remote Input | Mandatory Return / Back Key | Physical Return/Back button on remote control (keycode 10009) | Keycode: `10009` | DOM `keydown` event on window | Unhandled key will terminate web app or trigger browser history pop | Samsung TV Application Certification Policy |
| 21 | Remote Input | Registrable Media Playback Keys | Dedicated playback keys on Samsung remotes (Play, Pause, Stop, FF, RW) | Key Names: `MediaPlay`, `MediaPause`, `MediaPlayPause`, `MediaStop`, etc. | Keycodes: 415, 19, 10252, 413, 417, 412 | Key ignored by OS and not delivered to app if not registered | `tizen.tvinputdevice.registerKey` API |
| 22 | Packaging | Manifest `config.xml` Schema | W3C Widget & Tizen namespace XML application configuration | `config.xml` with `http://www.w3.org/ns/widgets` & `http://tizen.org/ns/widgets` | TV recognizes package ID, name, icon, start file | App installation fails if XML is invalid or namespaces missing | Tizen 4.0 TV Web Application Guide |
| 23 | Packaging | Profile: `tv-samsung` | Target platform profile declaration in `config.xml` | `<tizen:profile name="tv-samsung"/>` | Activates Samsung TV Web engine extensions & remote control | Fails deployment if using generic `<tizen:profile name="tv"/>` | Samsung Developer TV Documentation |
| 24 | Packaging | Hardware Key Event Setting | Enabling hardware remote keys in manifest | `<tizen:setting hwkey-event="enable"/>` | Hardware key presses dispatched to DOM | Physical remote keys swallowed by TV OS if disabled | Tizen Web Application Settings Spec |
| 25 | Packaging | Required Privileges | Access rights for network and TV remote control | `internet`, `tv.inputdevice`, `application.launch` | Authorizes socket connections and key registrations | SecurityException on `tizen.tvinputdevice` without privilege | Tizen Privilege Specifications |
| 26 | Packaging | Application Icon 117x117 | Application icon PNG specification for Tizen TV Smart Hub launcher | 117×117 32-bit PNG (`icon.png`) in package root | Displayed in TV Apps menu & recent apps ribbon | Distorted icon or rejection by Tizen package manager | Samsung TV Packaging Guidelines |
| 27 | Packaging | Signed `.wgt` Distribution Archive | Cryptographic ZIP package containing web assets and XML signatures | Compiled web assets, `author-signature.xml`, `signature1.xml` | SDB / Developer Mode installable `.wgt` package | SDB install error `-12` / `-23` if unsigned or DUID mismatched | Tizen Security & Packaging Framework |

---

## Edge Cases

| # | Feature | Input | Observed Behavior | Mitigation / Required Solution |
|---|---------|-------|-------------------|--------------------------------|
| 1 | Bundling / Scripts | `<script type="module" src="...">` | In Chromium M56, `<script type="module">` is not supported. The TV parser ignores the tag completely. | **Total White Screen.** Bundlers must output classic scripts (`<script src="bundle.js">`) or use `@vitejs/plugin-legacy` targeting Chrome 56. |
| 2 | JS Object Spread | `const state = { ...prev, active: true };` | Chrome 56 throws `SyntaxError: Unexpected token ...`. | Use `Object.assign({}, prev, { active: true })` or Babel plugin `@babel/plugin-transform-object-rest-spread`. |
| 3 | Modern Operators | `user?.name ?? 'Guest'` | Chrome 56 throws `SyntaxError: Unexpected token .`. | Must be transpiled by Babel/SWC to ternary / logical operators (`user && user.name ? user.name : 'Guest'`). |
| 4 | CSS Layout | `display: grid; grid-template-columns: repeat(4, 1fr);` | Chrome 56 ignores `display: grid`. The element falls back to `display: block` and child cards stack vertically. | **Do NOT use CSS Grid.** Use Flexbox (`display: flex; flex-wrap: wrap;`) for all layouts and carousels. |
| 5 | Flexbox Spacing | `display: flex; gap: 20px;` | Chrome 56 ignores `gap` on flex containers (only supported since Chrome 84). Items clump together with 0px spacing. | Use explicit child margins (e.g. `.card { margin-right: 20px; }`) instead of `gap`. |
| 6 | Remote Registration | `tizen.tvinputdevice.registerKey("ArrowLeft")` or `registerKey("Enter")` | Mandatory keys cannot be registered. The TV runtime throws `WebAPIException: InvalidValuesError`. | Only call `registerKey` for non-mandatory keys (`MediaPlayPause`, `MediaPlay`, `MediaPause`, `MediaStop`, etc.). Never register directional keys or Return. |
| 7 | Return Key Navigation | User presses physical Return button (keycode 10009) while inside a video player or modal. | If `event.preventDefault()` is not called, Tizen immediately minimizes or terminates the app, or navigates back in browser history. | Intercept `10009`, call `event.preventDefault()`, close player/modal, and restore focus to previous catalog card. |
| 8 | Return Key on Root | User presses Return button (keycode 10009) on the home screen / root catalog. | Calling `tizen.application.getCurrentApplication().exit()` immediately without confirmation violates Samsung TV certification rules. | Display a custom Exit Confirmation modal ("¿Desea salir de la aplicación?"). Call `exit()` only when user selects "Sí". |
| 9 | TV Browser vs .wgt | App executes inside built-in Samsung Internet browser instead of `.wgt`. | `window.tizen` is `undefined`. Calling `tizen.tvinputdevice` or `tizen.application` throws `ReferenceError`. | Guard all Tizen calls: `if (typeof tizen !== 'undefined') { ... }`. In browser mode, rely purely on standard window `keydown` events. |
| 10 | HTTP Range Streaming | Backend returns HTTP `200 OK` with complete payload when video player requests `Range: bytes=0-`. | Chromium M56 video element rejects `200 OK` for large files or downloads entire 4GB video into RAM, causing crash or freeze. | Backend MUST return status `206 Partial Content`, `Accept-Ranges: bytes`, and accurate `Content-Range: bytes START-END/TOTAL`. |
| 11 | Cross-Origin Subtitles | `<track kind="subtitles" src="https://api.domain.com/sub.vtt">` without CORS attribute on video. | Tizen security sandbox blocks the subtitle track. No cues are parsed; no subtitles display on screen. | Add `crossorigin="anonymous"` to `<video>` element, and backend MUST return `Access-Control-Allow-Origin: *`. |
| 12 | WebVTT BOM Marker | Subtitle file starts with UTF-8 BOM (`\uFEFFWEBVTT`). | Tizen native VTT parser fails silently because line 1 does not start with exact ASCII `WEBVTT`. | Ensure VTT files are clean UTF-8 without BOM, starting strictly with `WEBVTT\n\n`. |
| 13 | Samsung One Remote | User operates the TV with Samsung Smart Control (TM1850A/One Remote), which lacks physical Play/Pause buttons. | Keycodes 415/19/10252 are never fired because the remote has no physical playback buttons. | UI MUST provide on-screen playback controls (Play/Pause, scrub bar, subtitle toggle) navigable and actionable via Enter (13). |
| 14 | Focus Trap in Modals | Modal opens, but spatial navigation D-pad still moves focus to elements in the underlying main catalog. | User loses visual focus; background catalog scrolls unexpectedly while modal is displayed. | Spatial navigation manager MUST push an isolated modal focus scope and trap navigation within the active modal until closed. |
| 15 | Viewport Scaling | `<meta name="viewport" content="width=3840">` used on 4K panel. | Web engine attempts to render 4K CSS pixels natively; TV GPU drops frames to <20fps and fonts appear tiny. | Keep `<meta name="viewport" content="width=1920, user-scalable=no">`. 1080p layout is hardware-upscaled to 4K by TV scaler with 60fps performance. |

---

## 1. Chromium M56 Web Engine Compatibility & Bundler Guide

### 1.1 Engine Specifications
* **Engine:** Chromium M56 (56.0.2924.0) / Blink / V8 5.6
* **Platform:** Tizen 4.0 TV Web Runtime (Firmware permanent, non-upgradable)
* **Architecture:** ARM Quad-Core with Mali GPU

### 1.2 ECMAScript Support Matrix

| Feature | Supported in M56? | Syntax / Requirement | Notes |
| :--- | :---: | :--- | :--- |
| **`let` / `const`** | **YES** | Block-scoped variable declarations | Full native support |
| **Arrow Functions** | **YES** | `() => {}` | Preserves lexical `this` |
| **Classes (`class`)** | **YES** | `class A extends B { constructor() {} }` | ES6 class declarations supported |
| **Template Literals** | **YES** | `` `Hello ${name}` `` | Native string interpolation |
| **`Promise`** | **YES** | `new Promise((res, rej) => ...)` | Fully native |
| **`async` / `await`** | **YES** | `async function f() { await ... }` | Added in Chrome 55; fully native in M56 |
| **`fetch()` API** | **YES** | `window.fetch(url, options)` | Native WHATWG Fetch API |
| **Array Destructuring** | **YES** | `const [a, b] = arr;` | Full ES6 support |
| **Object Destructuring** | **YES** | `const { x, y } = obj;` | Supported in assignments and declarations |
| **Array Spread** | **YES** | `[...items, newItem]` | Native array spreading |
| **`Array.prototype.includes`** | **YES** | `[1, 2].includes(1)` | ES2016 native |
| **`Object.assign`** | **YES** | `Object.assign({}, a, b)` | ES6 native |
| **`Object.values` / `entries`** | **YES** | `Object.values(obj)` | Added in Chrome 54; native in M56 |
| **Object Spread (`{ ...obj }`)** | **NO** | `{ ...a, b: 2 }` | **Added in Chrome 60.** Requires Babel transpilation to `Object.assign` |
| **ES Modules (`type="module"`)** | **NO** | `<script type="module">` | **Added in Chrome 61.** Browser ignores tag completely |
| **Optional Chaining (`?.`)** | **NO** | `obj?.prop?.val` | **Added in Chrome 80.** Throws fatal `SyntaxError` |
| **Nullish Coalescing (`??`)** | **NO** | `a ?? b` | **Added in Chrome 80.** Throws fatal `SyntaxError` |
| **`Promise.allSettled`** | **NO** | `Promise.allSettled([...])` | **Added in Chrome 76.** Throws `TypeError: undefined is not a function` |
| **`Array.prototype.flat`** | **NO** | `arr.flat()` | **Added in Chrome 69.** Throws `TypeError` |
| **`String.prototype.replaceAll`** | **NO** | `str.replaceAll()` | **Added in Chrome 85.** Use regex with `/g` flag |

### 1.3 CSS Engine Constraints & Capabilities

1. **Flexbox (Supported):** Full support for `display: flex`, `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `align-content`.
2. **CSS Grid (PROHIBITED):** Chrome 56 does **NOT** support CSS Grid Level 1 (Chrome 57 is required). Any use of `display: grid` will cause layout collapse.
3. **Flexbox `gap` (PROHIBITED):** Chrome 56 ignores `gap` in flex containers (added in Chrome 84). All inter-item spacing must use CSS margins (`margin-right`, `margin-bottom`).
4. **`aspect-ratio` (PROHIBITED):** Chrome 56 does not support CSS `aspect-ratio` (added in Chrome 88). Posters and cards must use explicit width/height or classic padding hacks (e.g., `padding-top: 150%` for 2:3 posters).
5. **GPU Compositing:** To ensure smooth 60fps animations on TV hardware, transitions must target only `transform` and `opacity`. Use `transform: translate3d(x, y, 0)` or `scale3d(...)` to promote focus highlights into GPU composited layers.
6. **Focus Styling:** `:focus-visible` is unsupported (Chrome 86+). Use a custom CSS class `.is-focused` added and removed by the Spatial Navigation Manager.

### 1.4 Frontend Build Configuration (Vite & Babel)
Because Vite defaults to generating `<script type="module">` targeting modern browsers (`esnext`), building for Tizen 4.0 requires `@vitejs/plugin-legacy`:

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['chrome 56'],
      renderLegacyChunks: true,
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  build: {
    target: 'chrome56',
    cssTarget: 'chrome56',
    minify: 'terser',
    rollupOptions: {
      output: {
        format: 'iife' // Self-executing bundle for classic script tags
      }
    }
  }
});
```

---

## 2. Media Subsystem, Codecs, Range 206 Streaming & WebVTT

### 2.1 Hardware Codec Support (Samsung UN50NU7400)

| Media Type | Codec / Format | Container | Supported Profiles & Max Resolutions |
| :--- | :--- | :--- | :--- |
| **Video** | **H.264 / AVC** | MP4, MKV, TS | BP/MP/HP up to Level 5.1. Up to 3840×2160 @ 30fps or 1920×1080 @ 60fps |
| **Video** | **HEVC / H.265** | MP4, MKV, TS | Main / Main 10 profile up to Level 5.1. Up to 3840×2160 @ 60fps (HDR10, HLG) |
| **Video** | **VP9** | WebM, MKV | Profile 0, Profile 2 up to 3840×2160 @ 60fps |
| **Audio** | **AAC** | MP4, AAC, MKV | AAC-LC, HE-AAC v1/v2 up to 48kHz, 5.1 ch |
| **Audio** | **MP3** | MP3, MP4, MKV | MPEG-1/2 Audio Layer 3 up to 320 kbps |
| **Audio** | **Dolby Digital (AC3)** | MP4, MKV, TS | AC-3 up to 5.1 channels (hardware decoding & optical/ARC pass-through) |
| **Audio** | **Dolby Digital+ (EAC3)** | MP4, MKV, TS | E-AC-3 up to 7.1 channels (hardware decoding & HDMI ARC pass-through) |
| **Audio (Prohibited)** | **DTS** | MKV | **NOT supported** natively on 2018 Samsung TVs (dropped by Samsung in 2018) |

### 2.2 HTTP Range 206 Streaming Contract (Google Drive Proxy)
The HTML5 `<video>` engine on Chromium M56 strictly relies on HTTP Range requests to inspect container moov atoms, buffer stream fragments, and seek forward/backward.

#### Protocol Sequence:
1. **Initial Probe:**
   The TV sends a `GET` request with header `Range: bytes=0-` (or seeking offset).
2. **Server Response Requirements:**
   * **HTTP Status Code:** `206 Partial Content` (Never `200 OK`).
   * **`Accept-Ranges`:** `bytes`
   * **`Content-Range`:** `bytes ${start}-${end}/${totalFileSize}`
   * **`Content-Length`:** `${chunkSize}` (where `chunkSize = end - start + 1`)
   * **`Content-Type`:** `video/mp4` (or `audio/mpeg`, etc.)
   * **CORS Headers:**
     ```http
     Access-Control-Allow-Origin: *
     Access-Control-Allow-Methods: GET, OPTIONS
     Access-Control-Allow-Headers: Range, Content-Type
     Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length
     ```
3. **Seeking Behavior:**
   When the user scrubs on the timeline, playback pauses, the video element issues a new request with `Range: bytes=${byteOffset}-`, waits for `206 Partial Content`, and fires the `seeked` event once buffering reaches threshold.

### 2.3 Subtitles: WebVTT & `<track>` Implementation
* **Markup Requirements:**
  ```html
  <video id="tvPlayer" crossorigin="anonymous" playsinline>
    <source src="https://stream-proxy.domain.com/video/123" type="video/mp4">
    <track id="subTrack" kind="subtitles" src="https://stream-proxy.domain.com/subtitles/123.vtt" srclang="es" label="Español" default>
  </video>
  ```
* **CORS Obligation:** If `crossorigin="anonymous"` is missing on `<video>`, the Tizen browser sandbox blocks the external `.vtt` file.
* **Format Specification:**
  * Must be UTF-8 encoded **without Byte Order Mark (BOM)**.
  * First line must be exactly `WEBVTT` followed by a blank line.
  * Timestamps formatted as `HH:MM:SS.mmm --> HH:MM:SS.mmm`.

---

## 3. Samsung Tizen 4.0 Remote Control & Spatial Navigation

### 3.1 Complete Remote Control Keycode Reference

| Key Name (Tizen API) | KeyCode | Category | Registration Requirement | Action / Behavior |
| :--- | :---: | :---: | :---: | :--- |
| `ArrowLeft` | `37` | Mandatory | **Cannot register** | Move focus left in carousel / menu |
| `ArrowUp` | `38` | Mandatory | **Cannot register** | Move focus up to upper carousel / navbar |
| `ArrowRight` | `39` | Mandatory | **Cannot register** | Move focus right in carousel / menu |
| `ArrowDown` | `40` | Mandatory | **Cannot register** | Move focus down to lower carousel |
| `Enter` | `13` | Mandatory | **Cannot register** | Activate focused card, open modal, trigger button |
| `Back` / `Return` | `10009` | Mandatory | **Cannot register** | Close modal, exit player, or prompt exit dialog |
| `MediaPlayPause` | `10252` | Media | `registerKey("MediaPlayPause")` | Toggle video/audio play/pause |
| `MediaPlay` | `415` | Media | `registerKey("MediaPlay")` | Resume playback |
| `MediaPause` | `19` | Media | `registerKey("MediaPause")` | Pause playback |
| `MediaStop` | `413` | Media | `registerKey("MediaStop")` | Stop playback and close player |
| `MediaFastForward` | `417` | Media | `registerKey("MediaFastForward")` | Seek forward +10s / +30s |
| `MediaRewind` | `412` | Media | `registerKey("MediaRewind")` | Seek backward -10s / -30s |
| `MediaTrackNext` | `10233` | Media | `registerKey("MediaTrackNext")` | Next song / next episode |
| `MediaTrackPrevious` | `10232` | Media | `registerKey("MediaTrackPrevious")` | Previous song / previous episode |
| `ColorF0Red` | `403` | Color | `registerKey("ColorF0Red")` | Contextual shortcut (e.g. search / reload) |
| `ColorF1Green` | `404` | Color | `registerKey("ColorF1Green")` | Contextual shortcut (e.g. filter) |
| `ColorF2Yellow` | `405` | Color | `registerKey("ColorF2Yellow")` | Contextual shortcut (e.g. view mode) |
| `ColorF3Blue` | `406` | Color | `registerKey("ColorF3Blue")` | Contextual shortcut (e.g. subtitles) |
| `0` – `9` | `48` – `57` | Numeric | `registerKey("0")` ... `("9")` | Direct channel or PIN entry |

### 3.2 Tizen Key Registration Pattern
In the native `.wgt` environment, media keys must be explicitly registered upon startup. Registration must be wrapped in `try/catch` and safe type-checks so it runs cleanly in both Tizen and web browsers:

```javascript
export function initRemoteKeys() {
  if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
    const keysToRegister = [
      'MediaPlay',
      'MediaPause',
      'MediaPlayPause',
      'MediaStop',
      'MediaFastForward',
      'MediaRewind',
      'MediaTrackNext',
      'MediaTrackPrevious',
      'ColorF0Red',
      'ColorF1Green',
      'ColorF2Yellow',
      'ColorF3Blue'
    ];

    keysToRegister.forEach(keyName => {
      try {
        tizen.tvinputdevice.registerKey(keyName);
      } catch (e) {
        console.warn(`Could not register key: ${keyName}`, e.message);
      }
    });
  }
}
```

### 3.3 Return/Back Key (10009) Handling Architecture
Samsung enforces strict app exit rules. The Return key must follow this hierarchical dispatch:

```javascript
window.addEventListener('keydown', function(event) {
  // Keycode 10009 is Tizen Return; 27 is Escape (PC browser testing)
  if (event.keyCode === 10009 || event.keyCode === 27) {
    event.preventDefault(); // Stop default browser navigation / app termination

    // 1. If Video/Photo/Music Player is open -> Close Player
    if (PlayerManager.isOpen()) {
      PlayerManager.close();
      return;
    }

    // 2. If Detail/Settings Modal is open -> Close Modal
    if (ModalManager.isOpen()) {
      ModalManager.close();
      return;
    }

    // 3. If Exit Dialog is already showing -> Dismiss Exit Dialog
    if (ExitDialog.isOpen()) {
      ExitDialog.dismiss();
      return;
    }

    // 4. On Root / Catalog View -> Show Exit Confirmation Modal
    ExitDialog.show({
      title: 'Salir de la aplicación',
      message: '¿Estás seguro de que deseas salir?',
      onConfirm: () => {
        if (typeof tizen !== 'undefined' && tizen.application) {
          tizen.application.getCurrentApplication().exit();
        } else {
          window.close();
        }
      }
    });
  }
});
```

### 3.4 Spatial Navigation (D-Pad Focus Engine) Design
To guarantee smooth 10-foot UI interaction on Tizen 4.0:
1. **Focus State Management:** The engine maintains an active focus pointer `{ row, col }` or active DOM node reference.
2. **Visual Focus Indicator:** The currently focused element receives the `.is-focused` CSS class:
   ```css
   .nav-card.is-focused {
     transform: scale3d(1.08, 1.08, 1);
     box-shadow: 0 0 25px rgba(59, 130, 246, 0.8);
     outline: 3px solid #3b82f6;
     z-index: 10;
     transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
   }
   ```
3. **Carousel Auto-Scrolling:** When focus moves horizontally, the carousel container scrolls using `scrollLeft` or CSS `transform: translate3d(-Xpx, 0, 0)` so the active card is always centered on screen.
4. **Vertical Row Transition:** ArrowDown moves focus to the closest item in the next carousel; ArrowUp returns to the previous row or top navigation bar.

---

## 4. Native Tizen Web Application Structure & Packaging (.wgt)

### 4.1 Authoritative `config.xml` Manifest
Below is the validated, complete `config.xml` specification for the Samsung UN50NU7400 TV:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" 
        xmlns:tizen="http://tizen.org/ns/widgets" 
        id="http://multimediadrive.samsung.tv/app" 
        version="1.0.0" 
        viewmodes="fullscreen">

    <!-- Application Identification (10-char package prefix + App Name) -->
    <tizen:application id="tB7x9K3qL1.MultimediaDrive" 
                       package="tB7x9K3qL1" 
                       required_version="4.0"/>

    <!-- Display Name & Metadata -->
    <name>Multimedia Drive</name>
    <description>Google Drive Private Cloud Multimedia Player for Samsung Smart TV</description>
    <author href="https://multimedia-drive.vercel.app">Multimedia Drive Team</author>

    <!-- Entry Point & Icons -->
    <content src="index.html"/>
    <icon src="icon.png"/>

    <!-- Samsung TV Platform Profile (MANDATORY) -->
    <tizen:profile name="tv-samsung"/>

    <!-- Hardware Settings -->
    <tizen:setting screen-orientation="landscape" 
                   context-menu="enable" 
                   background-support="disable" 
                   encryption="disable" 
                   hwkey-event="enable"/>

    <!-- Hardware Feature Declarations -->
    <feature name="http://tizen.org/feature/screen.size.all"/>
    <feature name="http://tizen.org/feature/network.internet"/>

    <!-- Security Privileges -->
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/application.launch"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <tizen:privilege name="http://developer.samsung.com/privilege/network.public"/>

    <!-- Cross-Origin & Network Access Policies -->
    <access origin="*" subdomains="true"/>
    <tizen:allow-navigation href="*"/>

</widget>
```

### 4.2 Application Icon Specifications
* **File Name:** `icon.png` (placed in the root of the project next to `config.xml`).
* **Dimensions:** Exactly **117 × 117 pixels**.
* **Color Depth / Format:** 32-bit PNG (with alpha channel support for rounded corners/transparency).
* **Safe Zone:** Keep key artwork within a 96×96 centered bounding box to prevent edge clipping on TV display themes.

### 4.3 Directory Layout of the `.wgt` Package
A `.wgt` file is a ZIP archive containing:
```
MultimediaDrive.wgt (ZIP archive)
├── config.xml             (W3C/Tizen manifest at package root)
├── icon.png               (117x117 launcher icon at root)
├── index.html             (Startup HTML entry point)
├── assets/
│   ├── index.css          (Flexbox CSS styles compiled for Chrome 56)
│   └── index.js           (ES5/Chrome 56 IIFE JavaScript bundle)
└── [signatures]           (Injected automatically when signed)
    ├── author-signature.xml
    └── signature1.xml
```

### 4.4 Packaging Scripts & CLI Pipeline
To build and package the `.wgt` from source, configure npm scripts in `package.json`:

```json
{
  "scripts": {
    "build": "vite build",
    "package:zip": "node scripts/build-wgt.js",
    "package:sign": "tizen package -t wgt -s SamsungCertProfile -- ./dist",
    "install:tv": "sdb connect 192.168.1.50:26101 && sdb install ./dist/MultimediaDrive.wgt"
  }
}
```

#### Node.js Standalone Packaging Script (`scripts/build-wgt.js`):
```javascript
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const outputDir = path.resolve(__dirname, '../dist-wgt');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const output = fs.createWriteStream(path.join(outputDir, 'MultimediaDrive.wgt'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Package created successfully: ${archive.pointer()} total bytes.`);
});

archive.pipe(output);
// Append built assets from dist
archive.directory(path.resolve(__dirname, '../dist'), false);
// Ensure config.xml and icon.png are at root
archive.file(path.resolve(__dirname, '../config.xml'), { name: 'config.xml' });
archive.file(path.resolve(__dirname, '../public/icon.png'), { name: 'icon.png' });
archive.finalize();
```

### 4.5 Developer Mode (12345) & Physical TV Installation Instructions

1. **Activate Developer Mode on TV:**
   - Turn on Samsung UN50NU7400 TV.
   - Press the **Home** button on the remote, navigate to **Apps**.
   - With the Apps panel in focus, enter sequence on remote: **`1` `2` `3` `4` `5`**.
   - A hidden dialog *Developer Mode Configuration* will pop up.
   - Toggle **Developer Mode** to **On**.
   - Enter the **Host PC IPv4 Address** (e.g. `192.168.1.100`).
   - Reboot TV: Hold down the Power button on the remote for 3–5 seconds until the Samsung UHD logo reappears.
2. **Connect via SDB (Smart Development Bridge):**
   ```bash
   sdb connect <TV_IP_ADDRESS>:26101
   sdb devices
   ```
   *(Verify the TV shows up with status `device`).*
3. **Sign and Install the Package:**
   On Samsung TVs, testing `.wgt` packages requires signing with a Samsung Certificate Profile containing the TV's DUID (Device Unique ID obtained via `sdb get-serial` or TV Settings > Support > About This TV):
   ```bash
   # Package and sign with developer profile
   tizen package -t wgt -s TVProfile -o ./dist-signed -- ./dist
   
   # Install to TV
   sdb install ./dist-signed/MultimediaDrive.wgt
   ```

---

## 5. Dual Deployment Architecture: Browser vs Native `.wgt`

To satisfy requirement **R4** (accessible both via TV web browser and native `.wgt` without maintaining two separate codebases), the frontend must implement runtime environment detection:

```javascript
export const RuntimeEnv = {
  isTizenNative: typeof tizen !== 'undefined' && typeof tizen.tvinputdevice !== 'undefined',
  isTVBrowser: /SMART-TV|Tizen/i.test(navigator.userAgent) && typeof tizen === 'undefined',
  isDesktopDev: !/SMART-TV|Tizen/i.test(navigator.userAgent)
};
```

### Feature Parity & Graceful Degradation:

| Capability | Native `.wgt` App | Samsung TV Web Browser | Desktop / Mobile Dev |
| :--- | :--- | :--- | :--- |
| **Hosting Mode** | Installed locally in TV NAND Flash | Hosted serverless (Vercel / Cloudflare) | Localhost / Vercel |
| **App Launch** | Icon on Samsung Smart Hub launcher ribbon | URL entered in Samsung Internet Browser | Standard browser URL |
| **D-pad Navigation** | Keycodes 37, 38, 39, 40 | Keycodes 37, 38, 39, 40 | Arrow keys on keyboard |
| **Enter / Selection** | Keycode 13 | Keycode 13 | Keycode 13 (Enter) |
| **Return / Back Key** | Keycode 10009 | Keycode 10009 / Backspace / Escape | Escape / Backspace |
| **Application Termination** | `tizen.application.getCurrentApplication().exit()` | Shows exit message / redirects to home | `window.close()` or no-op |
| **Media Keys (Play/Pause)** | Registered via `tizen.tvinputdevice` | Standard Media Session API or on-screen controls | Spacebar / on-screen controls |
| **Streaming & Range 206** | Identical HTTP Range requests to Serverless Proxy | Identical HTTP Range requests to Serverless Proxy | Identical HTTP Range requests |

---

## Conclusion & Specification Verdict
The Samsung UN50NU7400 Smart TV is a capable 4K playback device, but its **Chromium M56 engine strictly prohibits modern JavaScript syntax (`{ ...obj }`, `?.`, `??`, `<script type="module">`) and modern CSS features (`display: grid`, Flexbox `gap`, `aspect-ratio`)**. 

By adhering strictly to:
1. **Flexbox-only layouts with margin-based spacing**,
2. **ES5 / Chrome 56 IIFE legacy bundling with `@vitejs/plugin-legacy`**,
3. **HTTP Range 206 streaming proxy headers**,
4. **Clean UTF-8 WebVTT subtitle delivery with `crossorigin="anonymous"`**, and
5. **Robust Return key hierarchy and spatial focus management**,

the Multimedia Drive application will achieve flawless, stutter-free 60fps performance and 100% remote control compatibility on both the web browser and the native `.wgt` package.
