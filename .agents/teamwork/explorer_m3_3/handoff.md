# Handoff Report: Media Players & Subtitles Architecture (F14, F15, F16)

**Agent:** `explorer_m3_3`  
**Working Directory:** `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_3`  
**Target Specification:** `c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_3\players_subtitles_spec.md`  
**Date:** 2026-10-13  
**Handoff Type:** Hard (Task complete)  

---

## 1. Observation

1. **Target Hardware & Webview Constraints**:
   - `spec_miner_survey_1/spec_report.md` (lines 3-8, 20-25): Hardware is Samsung Smart TV UN50NU7400 running Tizen 4.0 with Chromium M56 (`Chrome/56.0.2924.0`, Blink `537.36`). CSS Grid is unsupported/collapsed to `display: block`. Flexbox `gap`, `row-gap`, `column-gap` are unsupported and silently ignored. Object rest spread (`{ ...obj }`) throws `SyntaxError`.
   - `spec_miner_survey_1/spec_report.md` (lines 177-190): HTML5 `<video>` requires `crossorigin="anonymous"` for external WebVTT `<track>` loading. UTF-8 BOM causes silent subtitle parsing failure.
   - `spec_miner_survey_1/spec_report.md` (lines 204, 251-264): Tizen hardware Return key (`10009`) must be intercepted with `event.preventDefault()`. Unhandled Return triggers app termination.

2. **Existing E2E Test Contracts for F14, F15, F16**:
   - `tests/e2e/tier1-feature-coverage/f14-custom-video-player.test.js`:
     * F14-01: Play/Pause toggles via Enter (`13`) and MediaPlayPause (`10252`).
     * F14-02: ArrowRight (`39`) scrubs forward +10s and wakes controls (`controlsVisible: true`).
     * F14-03: ArrowLeft (`37`) scrubs backward -10s without dropping below 0:00.
     * F14-04: Fast-Forward (`417`) and Rewind (`412`) jump 30s.
     * F14-05: Return key (`10009`) terminates playback, sets `playing: false`, exits player layer back to caller view (`modal`).
   - `tests/e2e/tier2-boundary-corner/f14-video-player-boundaries.test.js`:
     * F14-B01: Seeking forward past total duration clamps scrubber time to exact video duration.
     * F14-B02: Seeking backward before 0:00 clamps scrubber time to 0 without negative timestamps.
     * F14-B03: Multiple rapid Play/Pause toggles maintain correct binary state.
     * F14-B04: Seeking during paused state preserves paused state while updating scrubber position.
   - `tests/e2e/tier1-feature-coverage/f15-fullscreen-photo-slideshow.test.js`:
     * F15-01: Enter on photo card launches `slideshow` layer.
     * F15-02 & F15-03: ArrowRight (`39`) / ArrowLeft (`37`) advance and rewind photo index.
     * F15-04: Enter (`13`) and MediaPlayPause (`10252`) toggle auto-advance timer.
     * F15-05: Return (`10009`) exits slideshow back to `catalog` layer.
   - `tests/e2e/tier2-boundary-corner/f15-slideshow-boundaries.test.js`:
     * F15-B01: ArrowLeft on index 0 clamps to 0 without underflow.
     * F15-B02: ArrowRight on last photo clamps to `totalPhotos - 1` without overflow.
     * F15-B03: Manual navigation retains active layer and resets auto-advance timer.
     * F15-B05: Exiting slideshow clears lingering timers.
   - `tests/e2e/tier1-feature-coverage/f16-audio-player-playlist.test.js`:
     * F16-01: `/api/drive/files/musica` provides `title`, `artist`, `album`, `thumbnailLink`, `durationMillis`.
     * F16-02: Enter on music item launches `audio` layer with playback active.
     * F16-03 & F16-04: MediaTrackNext (`10233`) and MediaTrackPrevious (`10232`) skip tracks.
     * F16-05: Return (`10009`) exits audio player back to `catalog` layer.
   - `tests/e2e/tier2-boundary-corner/f16-audio-player-boundaries.test.js`:
     * F16-B01 & F16-B02: Clamping at track 0 and track N-1.
     * F16-B03: Duration in milliseconds parsed to timeline.
     * F16-B05: Audio MIME type is `audio/*`.

3. **Backend Route Interfaces**:
   - `server/routes/subtitles.ts` (lines 16-41): `GET /api/subtitles/list/:fileId` returns `{ fileId, subtitles: [{ id, name, lang, label }] }`.
   - `server/routes/subtitles.ts` (lines 43-78): `GET /api/subtitles/:fileId` returns `text/vtt; charset=utf-8` with CORS header `Access-Control-Allow-Origin: *`.
   - `server/routes/stream.ts`: `GET /api/stream/:fileId` returns `206 Partial Content` with `Accept-Ranges: bytes`.

---

## 2. Logic Chain

1. **Hardware & CSS Constraints → Dedicated Flexbox Level 1 Layouts**:
   - Based on Observation 1 (no CSS Grid, no Flexbox `gap`), all player layouts (`player.ts`, `slideshow.ts`, `audio.ts`) are structured using Flexbox containers with explicit `margin-right` / `margin-bottom` spacing.
   - Transitions strictly leverage `transform: translate3d(x, y, 0)` and `opacity` to activate GPU compositing on the Mali GPU, guaranteeing 60 FPS 10-foot TV interactions.

2. **Playback Engine & Hardware Decoder Safety**:
   - In Chromium M56 / Tizen 4.0, removing a `<video>` or `<audio>` element from DOM without calling `video.pause(); video.removeAttribute('src'); video.load();` leaves the hardware decoder locked.
   - The architectural blueprint specifies mandatory teardown sequences in `close()` for all views, cancelling timers (`clearTimeout`, `clearInterval`) and unhooking media event listeners.

3. **Subtitle Auto-Selection & WebVTT Management**:
   - The video player queries `/api/subtitles/list/:fileId` and parses available tracks.
   - If a track with `lang === 'es'` or label containing 'español' is detected, it is automatically injected as a `<track>` and enabled via `track.mode = 'showing'`.
   - A dedicated 10-foot modal menu enables manual track selection (`[ Desactivado ]`, `[ Español (SRT) ]`, `[ English (SRT) ]`). Choosing "Desactivado" disables all tracks (`track.mode = 'disabled'`).
   - The `<video>` tag includes `crossorigin="anonymous"` to satisfy Tizen's security sandbox.

4. **10-Foot UI Control Overlay & Remote Responsiveness**:
   - Top metadata bar shows title, category badge, and live clock.
   - Bottom scrubber visualizes played progress, playhead thumb, and buffered ranges (`video.buffered`).
   - An auto-hide debounce timer (3000ms) runs while playing; any remote key wakes up the overlay. When paused or when the subtitle modal is open, auto-hide is suspended.
   - Seeking (+10s via ArrowRight, -10s via ArrowLeft, +30s via FF 417, -30s via RW 412) clamps strictly between 0:00 and duration, preserving paused state if currently paused.

5. **Slideshow & Audio Player Specialization**:
   - Photo slideshow implements dual-buffer GPU cross-fading (`imgLayerA`, `imgLayerB`) with a 5s auto-advance timer, manual ArrowLeft/Right boundary clamping, and HUD counter.
   - Audio player implements a 2-column split layout with cover art (and SVG vinyl disc fallback), scrubber bar (`MM:SS`), dynamic playlist queue with vertical GPU scrolling (`translate3d(0, -y, 0)`), and continuous auto-advance on track completion (`ended`).

6. **Unit Test Strategy**:
   - Node.js test runner (`node:test` + `node:assert/strict`) test plan authored in `tests/unit/m3/player.test.ts` to validate time formatting, seeking clamping, track auto-selection, timer states, and teardown logic without browser dependencies.

---

## 3. Caveats

- **Audio in Background vs Full Teardown**: In Tier 3 integration test `T3-04`, the photo slideshow runs while background audio continues playing concurrently. The audio player specification supports both complete teardown on exit and background playback persistence when desired by the caller.
- **Autoplay Policies**: Chromium M56 may require user interaction before autoplaying unmuted media. On Tizen Smart TV, remote keypresses (Enter 13) qualify as trusted user gestures.
- No caveats regarding hardware specifications, keycodes, or streaming protocols.

---

## 4. Conclusion

The technical architecture and implementation blueprint for F14 (Custom Video Player with Subtitle Selector), F15 (Fullscreen Photo Slideshow), and F16 (Audio Player with Playlist Queue) is fully analyzed, formulated, and documented in:
`c:\Users\musan\Documents\Proyectos\Multimedia_Drive\.agents\teamwork\explorer_m3_3\players_subtitles_spec.md`

The blueprint provides drop-in class implementations, DOM templates, strict M56 CSS styling, remote key event handling, and a complete unit test suite ready for builder implementation.

---

## 5. Verification Method

1. **Inspect Blueprint File**:
   - Check `players_subtitles_spec.md` for complete DOM structures, CSS rules (zero `display: grid`, zero `gap`), TypeScript controllers, and unit test code.
2. **Review Against E2E Test Contracts**:
   - Verify that F14, F15, and F16 controller logic satisfies tests in `tests/e2e/tier1-feature-coverage/` and `tests/e2e/tier2-boundary-corner/`.
3. **Invalidation Conditions**:
   - Any use of `display: grid` or Flexbox `gap` in the CSS specifications.
   - Lack of `crossorigin="anonymous"` on `<video>`.
   - Absence of hardware decoder cleanup (`video.removeAttribute('src')`, `video.load()`) on exit.
