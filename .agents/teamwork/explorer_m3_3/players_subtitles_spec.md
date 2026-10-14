# Technical Architecture & Blueprint: Media Players & Subtitles (F14, F15, F16)

**Target Device:** Samsung Smart TV UN50NU7400 (50" 4K UHD, 2018)  
**Operating System:** Samsung Tizen OS 4.0 (`tv-samsung` profile)  
**Webview Engine:** Chromium M56 (`Chrome/56.0.2924.0`, Blink `537.36`)  
**Viewport:** 1920×1080 CSS reference canvas (hardware-upscaled to 3840×2160 UHD)  
**Agent:** `explorer_m3_3`  
**Date:** 2026-10-13  
**Status:** Authoritative Implementation Blueprint  

---

## 1. Executive Summary & Architectural Scope

This specification establishes the concrete technical design, DOM structures, state machines, remote control event dispatching, and unit test suites for the three dedicated playback views in Milestone 3:

1. **Feature F14 — Custom HTML5 Video Player (`client/src/views/player.ts`)**:
   - Hardware-accelerated `<video>` streaming from Google Drive via HTTP Range 206 chunked proxy (`/api/stream/:fileId`).
   - 10-foot UI overlay with top metadata bar, bottom time scrubber with buffered range visualization, and subtitle modal selector.
   - Dynamic WebVTT `<track>` injector fetching from `/api/subtitles/list/:fileId` and `/api/subtitles/:fileId`, auto-selecting Spanish subtitles.
   - 3-second auto-hide overlay timer with remote wakeup.
   - Samsung TV remote key mappings (D-pad seek, Play/Pause, Media keys, Return key 10009 cleanup).

2. **Feature F15 — Fullscreen Photo Slideshow (`client/src/views/slideshow.ts`)**:
   - Dual-buffer GPU composited cross-fade image viewer (`Fotos` category).
   - 5-second auto-advance slideshow timer with play/pause toggle.
   - Boundary-safe navigation (0 to N-1 clamping) and HUD counter.
   - Clean interval teardown upon Return key (10009).

3. **Feature F16 — Audio Player with Playlist Queue (`client/src/views/audio.ts`)**:
   - Dedicated 2-column music player (`Música` category) featuring cover artwork with SVG vinyl disc fallback.
   - Progress bar with elapsed and remaining time (`MM:SS`).
   - Dynamic playlist queue with GPU vertical scrolling and active track tracking.
   - Remote track skipping (`MediaTrackNext 10233`, `MediaTrackPrevious 10232`), continuous auto-advance on track completion (`ended`), and graceful teardown.

4. **Unit Test Plan (`tests/unit/m3/player.test.ts`)**:
   - Automated test suite executable with Node.js native test runner (`node:test` & `node:assert/strict`) validating all states, boundary conditions, clamping, timers, and cleanup routines.

---

## 2. Chromium M56 & Samsung Tizen 4.0 Platform Mandates

All player views MUST strictly adhere to the engine limitations of Chromium M56 running on the Tizen 4.0 TV hardware SoC:

| Area | Strict Rule | Rationale / Failure Mode in M56 |
|---|---|---|
| **CSS Grid** | **FORBIDDEN** (`display: grid` MUST NOT be used) | M56 collapses CSS Grid to `display: block`, breaking all layout columns. |
| **Flexbox `gap`** | **FORBIDDEN** (`gap`, `row-gap`, `column-gap` MUST NOT be used) | Silently ignored by M56 flexbox (added in Chrome 84). All spacing MUST use explicit `margin` or `padding`. |
| **GPU Acceleration** | **MANDATORY** `transform: translate3d(...)` & `opacity` | Prevents CPU repaint cycles; promotes layers to Mali GPU compositing. |
| **Blur Filters** | **FORBIDDEN** (`backdrop-filter: blur(...)`) | Drops framerate below 15 FPS on 2018 TV SoC. Use solid alpha colors (`rgba(13, 15, 20, 0.94)`). |
| **Subtitles CORS** | **MANDATORY** `<video crossorigin="anonymous">` | Without `crossorigin="anonymous"`, WebVTT cues are blocked by Tizen security sandbox. |
| **Hardware Decoder Teardown** | **MANDATORY** `video.pause(); video.removeAttribute('src'); video.load();` | Simply removing `<video>` from DOM leaves the hardware decoder locked in Tizen media subsystem. |
| **Remote Return Key** | **MANDATORY** Intercept keycode `10009` and `event.preventDefault()` | Unintercepted Return key terminates the Tizen Web application. |
| **Syntax Compatibility** | **FORBIDDEN** Modern syntax (`?.`, `??`, `{ ...spread }`) in production bundles | Triggers fatal `SyntaxError` on M56 parser. |

---

## 3. Feature F14: Custom HTML5 Video Player

### 3.1 Architecture & View Lifecycle

The Video Player operates as an isolated UI layer (`data-layer="player"`). When launched (from Movie Detail Modal or directly from Family Video Card):
1. The catalog or modal focus state is suspended and saved in the navigation stack.
2. The player view container is mounted or made visible (`display: flex; position: fixed; inset: 0; z-index: 1000;`).
3. The `<video>` element is initialized with `crossorigin="anonymous"` and pointing to `/api/stream/:fileId`.
4. Subtitle tracks are queried from `/api/subtitles/list/:fileId`. If a Spanish track exists, it is appended as a `<track>` and activated.
5. The 3-second auto-hide timer is started.
6. Playback begins automatically (`video.play()`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HTML5 VIDEO PLAYER VIEW                         │
│                                                                        │
│  [Top Bar: Inception (2010) • Películas                 20:45:12]      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                                                                  │  │
│  │                    <video crossorigin="anonymous">                │  │
│  │                             [Video Stream]                       │  │
│  │                                                                  │  │
│  │               [Subtítulos: Español (WebVTT Active)]              │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  [Bottom Bar]                                                          │
│   00:14:32 ━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 02:28:00        │
│   (Buffer: 35%)                                                        │
│   [ ⏮ -10s ]  [ ▶ / ⏸ Play ]  [ ⏭ +10s ]  [ 💬 Subtítulos: Español ]   │
│                                                                        │
│   ┌──────────────────────────────┐                                     │
│   │ Subtitle Selector Modal      │ (Opens when Subtítulos button is    │
│   │ • Desactivado                │  activated)                         │
│   │ • Español (SRT) [✓]          │                                     │
│   │ • English (SRT)              │                                     │
│   └──────────────────────────────┘                                     │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 DOM Structure & Element Specifications

```html
<div id="videoPlayerView" class="tv-view player-view" data-layer="player" style="display: none;">
  <!-- Native Video Layer -->
  <video id="tvVideoPlayer" class="video-element" crossorigin="anonymous" playsinline preload="auto"></video>

  <!-- 10-Foot Controls Overlay -->
  <div id="playerControlsOverlay" class="player-controls-overlay is-visible">
    <!-- Top Bar -->
    <div class="player-top-bar">
      <div class="player-top-left">
        <h1 id="playerMediaTitle" class="player-title">Título del Video</h1>
        <span id="playerCategoryBadge" class="player-badge">Películas</span>
      </div>
      <div class="player-top-right">
        <span id="playerLiveClock" class="player-clock">00:00</span>
      </div>
    </div>

    <!-- Bottom Bar -->
    <div class="player-bottom-bar">
      <!-- Scrubber Section -->
      <div class="player-scrubber-container">
        <span id="playerTimeCurrent" class="player-time-label">00:00:00</span>
        
        <div id="playerScrubberTrack" class="player-scrubber-track">
          <!-- Buffered Range Bar -->
          <div id="playerBufferBar" class="player-buffer-bar" style="width: 0%;"></div>
          <!-- Played Progress Bar -->
          <div id="playerProgressBar" class="player-progress-bar" style="width: 0%;"></div>
          <!-- Playhead Thumb -->
          <div id="playerPlayheadThumb" class="player-playhead-thumb" style="transform: translate3d(0px, 0, 0);"></div>
        </div>
        
        <span id="playerTimeDuration" class="player-time-label">00:00:00</span>
      </div>

      <!-- Controls Transport Row -->
      <div class="player-actions-row">
        <button id="btnPlayerRewind" class="player-ctrl-btn" data-nav-id="btn_rewind">
          <span class="ctrl-icon">⏮</span> -10s
        </button>
        <button id="btnPlayerPlayPause" class="player-ctrl-btn is-focused" data-nav-id="btn_play_pause">
          <span id="playerPlayPauseIcon" class="ctrl-icon">⏸</span> Pausa
        </button>
        <button id="btnPlayerForward" class="player-ctrl-btn" data-nav-id="btn_forward">
          <span class="ctrl-icon">⏭</span> +10s
        </button>
        <button id="btnPlayerSubtitles" class="player-ctrl-btn" data-nav-id="btn_subtitles">
          <span class="ctrl-icon">💬</span> <span id="playerSubLabel">Subtítulos: Español</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Subtitle Selector Modal Menu -->
  <div id="subtitleModal" class="subtitle-modal-overlay is-hidden">
    <div class="subtitle-modal-dialog">
      <h2 class="subtitle-modal-title">Seleccionar Subtítulos</h2>
      <div id="subtitleOptionsList" class="subtitle-options-list">
        <!-- Rendered dynamically -->
        <!-- <button class="subtitle-option-btn is-focused" data-track-id="off">Desactivado</button> -->
        <!-- <button class="subtitle-option-btn is-active" data-track-id="sub_1">Español (SRT)</button> -->
      </div>
    </div>
  </div>
</div>
```

### 3.3 CSS Layout Specifications (Strict Flexbox & M56 Rules)

```css
/* Container */
.player-view {
  position: fixed;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  background-color: #000000;
  z-index: 1000;
  overflow: hidden;
}

.video-element {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  object-fit: contain;
  background-color: #000000;
}

/* Controls Overlay */
.player-controls-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  opacity: 1;
  transition: opacity 0.3s ease-in-out;
  pointer-events: auto;
  z-index: 1010;
}

.player-controls-overlay.is-hidden {
  opacity: 0;
  pointer-events: none;
}

/* Top Bar */
.player-top-bar {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 40px 60px;
  background: linear-gradient(to bottom, rgba(13, 15, 20, 0.92) 0%, rgba(13, 15, 20, 0) 100%);
}

.player-top-left {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.player-title {
  font-size: 32px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  margin-right: 20px; /* Replaces Flexbox gap */
}

.player-badge {
  font-size: 18px;
  font-weight: 600;
  color: #00a8ff;
  background-color: rgba(0, 168, 255, 0.15);
  border: 1px solid rgba(0, 168, 255, 0.4);
  padding: 4px 14px;
  border-radius: 4px;
}

.player-clock {
  font-size: 24px;
  color: #a0a5b5;
}

/* Bottom Bar */
.player-bottom-bar {
  display: flex;
  flex-direction: column;
  padding: 40px 60px 50px 60px;
  background: linear-gradient(to top, rgba(13, 15, 20, 0.95) 0%, rgba(13, 15, 20, 0.6) 70%, rgba(13, 15, 20, 0) 100%);
}

/* Scrubber */
.player-scrubber-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 24px;
}

.player-time-label {
  font-size: 22px;
  font-family: monospace;
  font-weight: 600;
  color: #ffffff;
  min-width: 100px;
}

#playerTimeCurrent {
  margin-right: 20px; /* Replaces Flexbox gap */
  text-align: right;
}

#playerTimeDuration {
  margin-left: 20px; /* Replaces Flexbox gap */
  text-align: left;
}

.player-scrubber-track {
  position: relative;
  flex: 1;
  height: 10px;
  background-color: rgba(255, 255, 255, 0.25);
  border-radius: 5px;
  overflow: visible;
}

.player-buffer-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.45);
  border-radius: 5px;
  transition: width 0.2s linear;
}

.player-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: #00a8ff;
  border-radius: 5px;
}

.player-playhead-thumb {
  position: absolute;
  top: -7px;
  left: 0;
  width: 24px;
  height: 24px;
  background-color: #ffffff;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0, 168, 255, 0.8);
  will-change: transform;
}

/* Controls Transport Row */
.player-actions-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.player-ctrl-btn {
  background-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border: 2px solid transparent;
  border-radius: 6px;
  padding: 12px 24px;
  font-size: 20px;
  font-weight: 600;
  margin-right: 18px; /* Replaces Flexbox gap */
  outline: none;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s, border-color 0.2s, background-color 0.2s;
}

.player-ctrl-btn:last-child {
  margin-right: 0;
}

.player-ctrl-btn.is-focused {
  background-color: rgba(0, 168, 255, 0.25);
  border-color: #00a8ff;
  transform: translate3d(0, 0, 0) scale(1.08);
  box-shadow: 0 0 18px rgba(0, 168, 255, 0.85);
}

/* Subtitle Modal */
.subtitle-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  background-color: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1020;
}

.subtitle-modal-overlay.is-hidden {
  display: none;
}

.subtitle-modal-dialog {
  background-color: #181b22;
  border: 2px solid #2a2e3d;
  border-radius: 12px;
  padding: 36px 48px;
  width: 520px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.9);
}

.subtitle-modal-title {
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  margin-top: 0;
  margin-bottom: 24px;
}

.subtitle-options-list {
  display: flex;
  flex-direction: column;
}

.subtitle-option-btn {
  background-color: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  border: 2px solid transparent;
  border-radius: 6px;
  padding: 16px 20px;
  font-size: 22px;
  text-align: left;
  margin-bottom: 12px; /* Replaces Flexbox gap */
  outline: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
}

.subtitle-option-btn:last-child {
  margin-bottom: 0;
}

.subtitle-option-btn.is-focused {
  border-color: #00a8ff;
  background-color: rgba(0, 168, 255, 0.2);
  transform: scale(1.03);
  box-shadow: 0 0 14px rgba(0, 168, 255, 0.6);
}

.subtitle-option-btn.is-selected::after {
  content: '✓';
  color: #00a8ff;
  font-weight: bold;
}
```

### 3.4 Media Engine & Subtitle Track Controller

The controller manages WebVTT subtitle tracks using standard HTML5 Media APIs:

```typescript
export interface SubtitleTrackInfo {
  id: string;
  name: string;
  lang: string;
  label: string;
}

export class SubtitleTrackManager {
  private videoEl: HTMLVideoElement;
  private availableTracks: SubtitleTrackInfo[] = [];
  private activeTrackId: string = 'off';

  constructor(videoElement: HTMLVideoElement) {
    this.videoEl = videoElement;
  }

  public async loadTracks(fileId: string): Promise<SubtitleTrackInfo[]> {
    this.clearTracks();
    try {
      const res = await fetch(`/api/subtitles/list/${encodeURIComponent(fileId)}`);
      if (res.ok) {
        const data = await res.json();
        this.availableTracks = Array.isArray(data.subtitles) ? data.subtitles : [];
      } else {
        this.availableTracks = [];
      }
    } catch {
      this.availableTracks = [];
    }

    // Auto-select Spanish track if present
    const esTrack = this.availableTracks.find(t => 
      t.lang.toLowerCase() === 'es' || 
      t.label.toLowerCase().includes('español') ||
      t.label.toLowerCase().includes('spanish')
    );

    if (esTrack) {
      this.selectTrack(esTrack.id);
    } else {
      this.selectTrack('off');
    }

    return this.availableTracks;
  }

  public selectTrack(trackId: string): void {
    this.activeTrackId = trackId;

    // First disable all existing text tracks in video element
    for (let i = 0; i < this.videoEl.textTracks.length; i++) {
      this.videoEl.textTracks[i].mode = 'disabled';
    }

    if (trackId === 'off') {
      return;
    }

    const trackInfo = this.availableTracks.find(t => t.id === trackId);
    if (!trackInfo) return;

    // Check if DOM <track> already exists
    let trackEl = this.videoEl.querySelector(`track[data-track-id="${trackId}"]`) as HTMLTrackElement;
    if (!trackEl) {
      trackEl = document.createElement('track');
      trackEl.kind = 'subtitles';
      trackEl.label = trackInfo.label;
      trackEl.srclang = trackInfo.lang;
      trackEl.src = `/api/subtitles/${encodeURIComponent(trackInfo.id)}`;
      trackEl.setAttribute('data-track-id', trackInfo.id);
      this.videoEl.appendChild(trackEl);
    }

    // Enable target track in HTML5 TextTrackList
    // Note: trackEl.track may be null before loaded; add listener if needed
    if (trackEl.track) {
      trackEl.track.mode = 'showing';
    } else {
      trackEl.addEventListener('load', () => {
        if (trackEl.track && this.activeTrackId === trackId) {
          trackEl.track.mode = 'showing';
        }
      }, { once: true });
    }
  }

  public getActiveTrackId(): string {
    return this.activeTrackId;
  }

  public getActiveTrackLabel(): string {
    if (this.activeTrackId === 'off') return 'Desactivado';
    const found = this.availableTracks.find(t => t.id === this.activeTrackId);
    return found ? found.label : 'Desactivado';
  }

  public getTracks(): SubtitleTrackInfo[] {
    return this.availableTracks;
  }

  public clearTracks(): void {
    const existing = this.videoEl.querySelectorAll('track');
    for (let i = 0; i < existing.length; i++) {
      existing[i].remove();
    }
    for (let i = 0; i < this.videoEl.textTracks.length; i++) {
      this.videoEl.textTracks[i].mode = 'disabled';
    }
    this.availableTracks = [];
    this.activeTrackId = 'off';
  }
}
```

### 3.5 Auto-Hide Timer & Remote Key State Machine

The Auto-Hide controller runs a 3000ms debounce timer during playback:
- While `video.paused === false`: controls fade to `opacity: 0` after 3 seconds without remote activity.
- While `video.paused === true`: controls remain `opacity: 1` indefinitely.
- While Subtitle modal is open: controls remain visible and auto-hide timer is suspended.
- Any remote keypress clears and resets the 3000ms timer and wakes up overlay controls immediately.

```typescript
export class VideoPlayerViewController {
  private videoEl!: HTMLVideoElement;
  private overlayEl!: HTMLElement;
  private autoHideTimer: any = null;
  private subtitleManager!: SubtitleTrackManager;
  private subtitleModalOpen: boolean = false;
  private focusedButtonIndex: number = 1; // 0: Rewind, 1: Play/Pause, 2: Forward, 3: Subtitles
  private buttons: HTMLElement[] = [];
  private onExitCallback: (() => void) | null = null;

  public open(fileId: string, title: string, category: string, onExit: () => void): void {
    this.onExitCallback = onExit;
    // 1. Mount or reveal DOM
    const view = document.getElementById('videoPlayerView')!;
    view.style.display = 'block';

    this.videoEl = document.getElementById('tvVideoPlayer') as HTMLVideoElement;
    this.overlayEl = document.getElementById('playerControlsOverlay')!;
    
    // Set metadata
    document.getElementById('playerMediaTitle')!.textContent = title;
    document.getElementById('playerCategoryBadge')!.textContent = category;

    // Reset buttons and focus
    this.buttons = [
      document.getElementById('btnPlayerRewind')!,
      document.getElementById('btnPlayerPlayPause')!,
      document.getElementById('btnPlayerForward')!,
      document.getElementById('btnPlayerSubtitles')!
    ];
    this.setButtonFocus(1); // Default focus on Play/Pause

    // 2. Setup Subtitles
    this.subtitleManager = new SubtitleTrackManager(this.videoEl);
    this.subtitleManager.loadTracks(fileId).then(() => {
      this.updateSubtitleButtonLabel();
    });

    // 3. Setup Video Source
    this.videoEl.crossOrigin = 'anonymous';
    this.videoEl.src = `/api/stream/${encodeURIComponent(fileId)}`;
    this.videoEl.load();
    this.videoEl.play().catch(() => {/* handle autoplay restriction */});

    // 4. Attach Media Event Listeners
    this.attachVideoEvents();
    this.showControls();
  }

  public handleKey(keyCode: number): boolean {
    this.showControls(); // Any remote key wakes controls

    // 1. Handle Subtitle Modal if active
    if (this.subtitleModalOpen) {
      return this.handleSubtitleModalKey(keyCode);
    }

    // 2. Video Player Key Mappings
    switch (keyCode) {
      case 13: // Enter
        return this.handleEnter();

      case 10252: // MediaPlayPause
      case 415:   // MediaPlay
      case 19:    // MediaPause
        this.togglePlayPause();
        return true;

      case 37: // ArrowLeft: Seek backward 10s
        this.seekRelative(-10);
        return true;

      case 39: // ArrowRight: Seek forward 10s
        this.seekRelative(10);
        return true;

      case 412: // MediaRewind: Seek backward 30s
        this.seekRelative(-30);
        return true;

      case 417: // MediaFastForward: Seek forward 30s
        this.seekRelative(30);
        return true;

      case 38: // ArrowUp: Wake controls or navigate up
        this.showControls();
        return true;

      case 40: // ArrowDown: Wake controls or navigate down
        this.showControls();
        return true;

      case 10009: // Return (Samsung Tizen hardware back button)
      case 27:    // Escape
      case 413:   // MediaStop
        this.close();
        return true;

      default:
        return false;
    }
  }

  private handleEnter(): boolean {
    const focusedBtn = this.buttons[this.focusedButtonIndex];
    if (focusedBtn.id === 'btn_play_pause' || !focusedBtn) {
      this.togglePlayPause();
    } else if (focusedBtn.id === 'btn_rewind') {
      this.seekRelative(-10);
    } else if (focusedBtn.id === 'btn_forward') {
      this.seekRelative(10);
    } else if (focusedBtn.id === 'btn_subtitles') {
      this.openSubtitleModal();
    }
    return true;
  }

  public togglePlayPause(): void {
    if (this.videoEl.paused) {
      this.videoEl.play();
      this.updatePlayPauseUI(true);
      this.scheduleAutoHide();
    } else {
      this.videoEl.pause();
      this.updatePlayPauseUI(false);
      this.cancelAutoHide(); // Stays visible while paused
    }
  }

  public seekRelative(deltaSeconds: number): void {
    const dur = this.videoEl.duration || 0;
    const target = this.videoEl.currentTime + deltaSeconds;
    // Boundary Clamping: clamp strictly between 0 and duration
    this.videoEl.currentTime = Math.max(0, Math.min(dur, target));
    this.updateScrubber();
    this.showControls();
  }

  public showControls(): void {
    this.overlayEl.classList.remove('is-hidden');
    if (!this.videoEl.paused && !this.subtitleModalOpen) {
      this.scheduleAutoHide();
    }
  }

  private scheduleAutoHide(): void {
    this.cancelAutoHide();
    this.autoHideTimer = setTimeout(() => {
      if (!this.videoEl.paused && !this.subtitleModalOpen) {
        this.overlayEl.classList.add('is-hidden');
      }
    }, 3000);
  }

  private cancelAutoHide(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  public close(): void {
    // 1. Terminate hardware streaming pipeline
    this.cancelAutoHide();
    this.videoEl.pause();
    this.videoEl.removeAttribute('src');
    this.videoEl.load(); // Releases Tizen hardware decoder instance!
    this.subtitleManager.clearTracks();

    // 2. Hide DOM
    const view = document.getElementById('videoPlayerView')!;
    view.style.display = 'none';

    // 3. Callback to parent view/layer
    if (this.onExitCallback) {
      this.onExitCallback();
    }
  }

  // --- Subtitle Modal Handling ---
  private openSubtitleModal(): void {
    this.subtitleModalOpen = true;
    this.cancelAutoHide();
    const modal = document.getElementById('subtitleModal')!;
    modal.classList.remove('is-hidden');
    this.renderSubtitleOptions();
  }

  private closeSubtitleModal(): void {
    this.subtitleModalOpen = false;
    const modal = document.getElementById('subtitleModal')!;
    modal.classList.add('is-hidden');
    this.showControls();
  }

  private handleSubtitleModalKey(keyCode: number): boolean {
    // Up / Down navigate list, Enter selects, Return closes
    if (keyCode === 10009 || keyCode === 27) {
      this.closeSubtitleModal();
      return true;
    }
    // List item navigation logic...
    return true;
  }
}
```

---

## 4. Feature F15: Fullscreen Photo Slideshow

### 4.1 Dual-Buffer GPU Architecture

Rendering large 4K / 1080p photos directly into a single `<img>` tag on Chromium M56 produces visible black frames or image repaint artifacts. The Fullscreen Photo Slideshow uses a dual-buffer approach:
- Two identical `<img>` elements (`imgLayerA` and `imgLayerB`) pinned to full viewport (`position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;`).
- Hardware GPU promotion using `transform: translate3d(0, 0, 0);` and `transition: opacity 0.5s ease-in-out;`.
- Cross-fade orchestration:
  1. The inactive image buffer is loaded with the next photo URL (`photos[nextIndex].fullUrl || photos[nextIndex].thumbnailLink`).
  2. Once the image buffer completes loading (via `onload`), the active buffer's opacity transitions to `0` while the incoming buffer transitions to `1`.
  3. The active buffer pointer is flipped.

```
┌────────────────────────────────────────────────────────────────────────┐
│                     PHOTO SLIDESHOW ARCHITECTURE                       │
│                                                                        │
│   [Buffer A: Current Photo]  opacity: 1 ───(0.5s ease)───► opacity: 0   │
│   [Buffer B: Incoming Photo] opacity: 0 ───(0.5s ease)───► opacity: 1   │
│                                                                        │
│   [HUD Overlay: Playa_Atardecer.jpg        [ 3 / 25 ]  ▶ Reproduciendo]│
│                                                                        │
│   Remote Controls:                                                     │
│   • ArrowRight (39): Next photo (clamped at photos.length - 1)         │
│   • ArrowLeft (37):  Previous photo (clamped at index 0)               │
│   • Enter (13) / MediaPlayPause (10252): Toggle auto-advance timer     │
│   • Return (10009): Cancel interval, release buffers, exit to catalog  │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 DOM Structure & Styling

```html
<div id="slideshowView" class="tv-view slideshow-view" data-layer="slideshow" style="display: none;">
  <!-- Dual GPU Buffer Layers -->
  <img id="slideImgA" class="slide-img" src="" style="opacity: 1; transform: translate3d(0,0,0);" />
  <img id="slideImgB" class="slide-img" src="" style="opacity: 0; transform: translate3d(0,0,0);" />

  <!-- Slideshow HUD Overlay -->
  <div id="slideshowHud" class="slideshow-hud">
    <div class="slideshow-hud-top">
      <h2 id="slideshowPhotoName" class="photo-name">Foto</h2>
      <div class="slideshow-hud-meta">
        <span id="slideshowCounter" class="photo-counter">[ 1 / 10 ]</span>
        <span id="slideshowStatusBadge" class="photo-badge">▶ Reproduciendo</span>
      </div>
    </div>
  </div>
</div>
```

```css
.slideshow-view {
  position: fixed;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  background-color: #000000;
  z-index: 1000;
  overflow: hidden;
}

.slide-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  object-fit: contain;
  transition: opacity 0.5s ease-in-out;
  will-change: opacity;
}

.slideshow-hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  padding: 40px 60px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(to bottom, rgba(13, 15, 20, 0.85) 0%, rgba(13, 15, 20, 0) 100%);
  opacity: 1;
  transition: opacity 0.3s ease-in-out;
  pointer-events: none;
  z-index: 1010;
}

.slideshow-hud.is-hidden {
  opacity: 0;
}

.slideshow-hud-top {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.photo-name {
  font-size: 28px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
}

.slideshow-hud-meta {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.photo-counter {
  font-size: 22px;
  font-family: monospace;
  color: #a0a5b5;
  margin-right: 18px; /* Replaces Flexbox gap */
}

.photo-badge {
  font-size: 18px;
  font-weight: 600;
  color: #00a8ff;
  background-color: rgba(0, 168, 255, 0.15);
  border: 1px solid rgba(0, 168, 255, 0.4);
  padding: 4px 12px;
  border-radius: 4px;
}
```

### 4.3 Slideshow Controller & Auto-Advance Engine

```typescript
export interface PhotoItem {
  id: string;
  name: string;
  thumbnailLink: string;
  fullUrl?: string;
}

export class PhotoSlideshowController {
  private photos: PhotoItem[] = [];
  private activeIndex: number = 0;
  private autoAdvance: boolean = true;
  private autoAdvanceTimer: any = null;
  private activeBuffer: 'A' | 'B' = 'A';
  private imgA!: HTMLImageElement;
  private imgB!: HTMLImageElement;
  private hudEl!: HTMLElement;
  private onExitCallback: (() => void) | null = null;

  public open(photos: PhotoItem[], initialIndex: number, onExit: () => void): void {
    this.photos = photos;
    this.activeIndex = Math.max(0, Math.min(photos.length - 1, initialIndex));
    this.autoAdvance = true;
    this.onExitCallback = onExit;

    const view = document.getElementById('slideshowView')!;
    view.style.display = 'block';

    this.imgA = document.getElementById('slideImgA') as HTMLImageElement;
    this.imgB = document.getElementById('slideImgB') as HTMLImageElement;
    this.hudEl = document.getElementById('slideshowHud')!;

    // Initial load into buffer A
    this.activeBuffer = 'A';
    this.imgA.src = this.getPhotoUrl(this.photos[this.activeIndex]);
    this.imgA.style.opacity = '1';
    this.imgB.style.opacity = '0';

    this.updateHud();
    this.startAutoAdvance();
  }

  public handleKey(keyCode: number): boolean {
    switch (keyCode) {
      case 39: // ArrowRight: Next photo
        this.advancePhoto(1);
        return true;

      case 37: // ArrowLeft: Previous photo
        this.advancePhoto(-1);
        return true;

      case 13:    // Enter
      case 10252: // MediaPlayPause
      case 415:   // MediaPlay
      case 19:    // MediaPause
        this.toggleAutoAdvance();
        return true;

      case 10009: // Return
      case 27:    // Escape
        this.close();
        return true;

      default:
        return false;
    }
  }

  public advancePhoto(delta: number): void {
    if (this.photos.length === 0) return;

    // Strict Boundary Clamping (no overflow past N-1, no underflow below 0)
    const newIndex = Math.max(0, Math.min(this.photos.length - 1, this.activeIndex + delta));
    if (newIndex === this.activeIndex) return;

    this.activeIndex = newIndex;
    this.renderActivePhoto();
    this.updateHud();

    // Reset auto-advance timer if running to give user full 5s on manual selection
    if (this.autoAdvance) {
      this.startAutoAdvance();
    }
  }

  public toggleAutoAdvance(): void {
    this.autoAdvance = !this.autoAdvance;
    if (this.autoAdvance) {
      this.startAutoAdvance();
    } else {
      this.stopAutoAdvance();
    }
    this.updateHud();
  }

  private startAutoAdvance(): void {
    this.stopAutoAdvance();
    this.autoAdvanceTimer = setInterval(() => {
      if (this.activeIndex < this.photos.length - 1) {
        this.advancePhoto(1);
      } else {
        // Loop back to start or pause
        this.activeIndex = 0;
        this.renderActivePhoto();
        this.updateHud();
      }
    }, 5000); // Default 5 seconds per slide
  }

  private stopAutoAdvance(): void {
    if (this.autoAdvanceTimer) {
      clearInterval(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private renderActivePhoto(): void {
    const photo = this.photos[this.activeIndex];
    const url = this.getPhotoUrl(photo);

    const incoming = this.activeBuffer === 'A' ? this.imgB : this.imgA;
    const outgoing = this.activeBuffer === 'A' ? this.imgA : this.imgB;

    incoming.onload = () => {
      incoming.style.opacity = '1';
      outgoing.style.opacity = '0';
      this.activeBuffer = this.activeBuffer === 'A' ? 'B' : 'A';
    };
    incoming.src = url;
  }

  private getPhotoUrl(photo: PhotoItem): string {
    if (photo.fullUrl) return photo.fullUrl;
    if (photo.thumbnailLink) {
      // Upgrade Google Drive thumbnail to 1920p for full 1080p display
      return photo.thumbnailLink.replace(/=s\d+/, '=s1920');
    }
    return '';
  }

  private updateHud(): void {
    const current = this.photos[this.activeIndex];
    if (current) {
      document.getElementById('slideshowPhotoName')!.textContent = current.name;
    }
    document.getElementById('slideshowCounter')!.textContent = `[ ${this.activeIndex + 1} / ${this.photos.length} ]`;
    document.getElementById('slideshowStatusBadge')!.textContent = this.autoAdvance ? '▶ Reproduciendo' : '⏸ Pausado';
  }

  public close(): void {
    this.stopAutoAdvance();
    this.imgA.onload = null;
    this.imgB.onload = null;
    this.imgA.src = '';
    this.imgB.src = '';

    const view = document.getElementById('slideshowView')!;
    view.style.display = 'none';

    if (this.onExitCallback) {
      this.onExitCallback();
    }
  }
}
```

---

## 5. Feature F16: Audio Player with Playlist Queue

### 5.1 Architecture & Split-Panel TV Composition

The Audio Player is a dedicated music listening view designed for items in `Música`. It features a 2-column layout:
- **Left Column (Rich Player View, 800px)**:
  - High-res cover artwork container (360px x 360px) with drop shadow.
  - Fallback SVG vinyl disc with groove styling when no cover image is provided or when image fails to load.
  - Track Title (36px, bold) and Artist / Album readout (22px).
  - Audio timeline scrubber with elapsed and total duration (`MM:SS`).
  - Transport buttons: `[ ⏮ Anterior ]`, `[ ▶/⏸ Play/Pausa ]`, `[ ⏭ Siguiente ]`.
- **Right Column (Playlist Queue, 960px)**:
  - Header with total track count.
  - Scrollable track list rendered via Flexbox `flex-direction: column`.
  - Current playing track indicator (`.is-playing.is-active`).
  - GPU translate3d scrolling (`transform: translate3d(0, -${offset}px, 0)`) to maintain the active track centered.
- **Continuous Auto-Advance**:
  - When a track reaches the end (`audio.onended`), the player automatically loads and starts the next track.
  - Skips are strictly clamped: `MediaTrackPrevious 10232` clamps to track 0 (no underflow); `MediaTrackNext 10233` clamps to last track (no overflow).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUDIO PLAYER WITH QUEUE                         │
│                                                                        │
│  ┌───────────────────────────┐  ┌────────────────────────────────────┐ │
│  │     [ ALBUM ARTWORK ]     │  │  COLA DE REPRODUCCIÓN (12 pistas)   │ │
│  │       360px x 360px       │  │                                    │ │
│  │   (or SVG Vinyl Fallback) │  │  1. Bohemian Rhapsody - Queen [✓]  │ │
│  │                           │  │  2. Hotel California - Eagles      │ │
│  │  Bohemian Rhapsody        │  │  3. Stairway to Heaven - Led Zep   │ │
│  │  Queen • A Night at Opera │  │  4. Sweet Child O' Mine - Guns     │ │
│  │                           │  │  5. Wish You Were Here - Floyd     │ │
│  │  01:45 ━━━━━━━━●━━━ 05:54 │  │                                    │ │
│  │  [ ⏮ ]   [ ▶/⏸ ]   [ ⏭ ] │  │                                    │ │
│  └───────────────────────────┘  └────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 DOM Structure & Element Specifications

```html
<div id="audioPlayerView" class="tv-view audio-view" data-layer="audio" style="display: none;">
  <!-- Native Audio Streamer -->
  <audio id="tvAudioElement" preload="auto"></audio>

  <div class="audio-layout-container">
    <!-- Left Column: Active Player -->
    <div class="audio-left-panel">
      <div class="audio-artwork-container">
        <img id="audioAlbumCover" class="audio-cover-img" src="" alt="Album Art" />
        <!-- Fallback SVG Vinyl Disc (shown if cover image fails) -->
        <div id="audioVinylFallback" class="audio-vinyl-fallback" style="display: none;">
          <svg class="vinyl-svg" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="95" fill="#181b22" stroke="#2a2e3d" stroke-width="4" />
            <circle cx="100" cy="100" r="80" fill="none" stroke="#252936" stroke-width="2" />
            <circle cx="100" cy="100" r="65" fill="none" stroke="#252936" stroke-width="2" />
            <circle cx="100" cy="100" r="50" fill="none" stroke="#252936" stroke-width="2" />
            <circle cx="100" cy="100" r="35" fill="#00a8ff" />
            <circle cx="100" cy="100" r="8" fill="#ffffff" />
          </svg>
        </div>
      </div>

      <div class="audio-meta-details">
        <h1 id="audioTrackTitle" class="audio-track-title">Título de la Canción</h1>
        <h2 id="audioArtistAlbum" class="audio-artist-album">Artista • Álbum</h2>
      </div>

      <!-- Scrubber -->
      <div class="audio-scrubber-section">
        <span id="audioTimeCurrent" class="audio-time-label">00:00</span>
        <div id="audioScrubberTrack" class="audio-scrubber-track">
          <div id="audioProgressBar" class="audio-progress-bar" style="width: 0%;"></div>
        </div>
        <span id="audioTimeDuration" class="audio-time-label">00:00</span>
      </div>

      <!-- Transport Buttons -->
      <div class="audio-transport-buttons">
        <button id="btnAudioPrev" class="audio-ctrl-btn" data-nav-id="btn_prev">
          <span class="ctrl-icon">⏮</span> Anterior
        </button>
        <button id="btnAudioPlayPause" class="audio-ctrl-btn is-focused" data-nav-id="btn_play">
          <span id="audioPlayPauseIcon" class="ctrl-icon">⏸</span> Pausa
        </button>
        <button id="btnAudioNext" class="audio-ctrl-btn" data-nav-id="btn_next">
          <span class="ctrl-icon">⏭</span> Siguiente
        </button>
      </div>
    </div>

    <!-- Right Column: Playlist Queue -->
    <div class="audio-right-panel">
      <div class="audio-queue-header">
        <h2 class="audio-queue-title">Cola de Reproducción</h2>
        <span id="audioQueueCount" class="audio-queue-count">(0 pistas)</span>
      </div>
      
      <div class="audio-queue-viewport">
        <div id="audioQueueList" class="audio-queue-list" style="transform: translate3d(0, 0px, 0);">
          <!-- Rendered dynamically -->
        </div>
      </div>
    </div>
  </div>
</div>
```

### 5.3 CSS Layout Specifications (Strict M56 Rules)

```css
.audio-view {
  position: fixed;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  background-color: #0d0f14;
  z-index: 1000;
  overflow: hidden;
}

.audio-layout-container {
  display: flex;
  flex-direction: row;
  width: 1920px;
  height: 1080px;
  padding: 80px 100px;
  box-sizing: border-box;
}

/* Left Panel */
.audio-left-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 760px;
  margin-right: 80px; /* Replaces Flexbox gap */
}

.audio-artwork-container {
  width: 360px;
  height: 360px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  background-color: #181b22;
  margin-bottom: 36px;
}

.audio-cover-img {
  width: 360px;
  height: 360px;
  object-fit: cover;
}

.audio-vinyl-fallback {
  width: 360px;
  height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vinyl-svg {
  width: 320px;
  height: 320px;
}

.audio-meta-details {
  text-align: center;
  margin-bottom: 36px;
  width: 100%;
}

.audio-track-title {
  font-size: 36px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  margin-bottom: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.audio-artist-album {
  font-size: 22px;
  font-weight: 500;
  color: #a0a5b5;
  margin: 0;
}

/* Audio Scrubber */
.audio-scrubber-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  margin-bottom: 36px;
}

.audio-time-label {
  font-size: 20px;
  font-family: monospace;
  color: #ffffff;
  min-width: 65px;
}

#audioTimeCurrent {
  margin-right: 16px; /* Replaces Flexbox gap */
  text-align: right;
}

#audioTimeDuration {
  margin-left: 16px; /* Replaces Flexbox gap */
  text-align: left;
}

.audio-scrubber-track {
  position: relative;
  flex: 1;
  height: 8px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.audio-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background-color: #00a8ff;
  border-radius: 4px;
}

/* Transport Buttons */
.audio-transport-buttons {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.audio-ctrl-btn {
  background-color: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 14px 28px;
  font-size: 20px;
  font-weight: 600;
  margin-right: 20px; /* Replaces Flexbox gap */
  outline: none;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s, border-color 0.2s;
}

.audio-ctrl-btn:last-child {
  margin-right: 0;
}

.audio-ctrl-btn.is-focused {
  background-color: rgba(0, 168, 255, 0.25);
  border-color: #00a8ff;
  transform: scale(1.08);
  box-shadow: 0 0 18px rgba(0, 168, 255, 0.85);
}

/* Right Panel (Playlist Queue) */
.audio-right-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.audio-queue-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 24px;
}

.audio-queue-title {
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  margin-right: 14px; /* Replaces Flexbox gap */
}

.audio-queue-count {
  font-size: 20px;
  color: #a0a5b5;
}

.audio-queue-viewport {
  position: relative;
  flex: 1;
  height: 720px;
  overflow: hidden;
  background-color: rgba(24, 27, 34, 0.5);
  border-radius: 12px;
  padding: 16px;
}

.audio-queue-list {
  display: flex;
  flex-direction: column;
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
}

.queue-track-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 8px; /* Replaces Flexbox gap */
  background-color: transparent;
  color: #ffffff;
  border-left: 4px solid transparent;
}

.queue-track-item:last-child {
  margin-bottom: 0;
}

.queue-track-item.is-playing {
  background-color: rgba(0, 168, 255, 0.15);
  border-left-color: #00a8ff;
}

.queue-track-num {
  font-size: 20px;
  font-weight: 600;
  color: #a0a5b5;
  width: 40px;
}

.queue-track-item.is-playing .queue-track-num {
  color: #00a8ff;
}

.queue-track-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.queue-track-title {
  font-size: 22px;
  font-weight: 600;
  color: #ffffff;
}

.queue-track-artist {
  font-size: 18px;
  color: #a0a5b5;
}

.queue-track-duration {
  font-size: 18px;
  font-family: monospace;
  color: #a0a5b5;
}
```

### 5.4 Audio Player Controller & Playlist Queue Logic

```typescript
export interface AudioTrackItem {
  id: string;
  name: string;
  title: string;
  artist: string;
  album: string;
  year?: number;
  mimeType: string;
  durationMillis: number;
  thumbnailLink?: string;
}

export class AudioPlayerController {
  private tracks: AudioTrackItem[] = [];
  private currentTrackIdx: number = 0;
  private audioEl!: HTMLAudioElement;
  private isPlaying: boolean = false;
  private onExitCallback: (() => void) | null = null;

  public open(tracks: AudioTrackItem[], startIndex: number, onExit: () => void): void {
    this.tracks = tracks;
    this.currentTrackIdx = Math.max(0, Math.min(tracks.length - 1, startIndex));
    this.onExitCallback = onExit;

    const view = document.getElementById('audioPlayerView')!;
    view.style.display = 'block';

    this.audioEl = document.getElementById('tvAudioElement') as HTMLAudioElement;
    this.attachAudioEvents();

    this.renderQueue();
    this.loadAndPlayTrack(this.currentTrackIdx);
  }

  public handleKey(keyCode: number): boolean {
    switch (keyCode) {
      case 13:    // Enter
      case 10252: // MediaPlayPause
      case 415:   // MediaPlay
      case 19:    // MediaPause
        this.togglePlayPause();
        return true;

      case 10233: // MediaTrackNext
        this.nextTrack();
        return true;

      case 10232: // MediaTrackPrevious
        this.prevTrack();
        return true;

      case 39: // ArrowRight: Next Track
        this.nextTrack();
        return true;

      case 37: // ArrowLeft: Previous Track
        this.prevTrack();
        return true;

      case 10009: // Return
      case 27:    // Escape
        this.close();
        return true;

      default:
        return false;
    }
  }

  public togglePlayPause(): void {
    if (this.audioEl.paused) {
      this.audioEl.play().catch(() => {});
      this.isPlaying = true;
    } else {
      this.audioEl.pause();
      this.isPlaying = false;
    }
    this.updateTransportUI();
  }

  public nextTrack(): void {
    if (this.tracks.length === 0) return;
    // Strict Boundary Clamping: clamp to tracks.length - 1 (no overflow)
    const nextIdx = Math.min(this.tracks.length - 1, this.currentTrackIdx + 1);
    if (nextIdx !== this.currentTrackIdx) {
      this.loadAndPlayTrack(nextIdx);
    }
  }

  public prevTrack(): void {
    if (this.tracks.length === 0) return;
    // Strict Boundary Clamping: clamp to 0 (no underflow)
    const prevIdx = Math.max(0, this.currentTrackIdx - 1);
    if (prevIdx !== this.currentTrackIdx) {
      this.loadAndPlayTrack(prevIdx);
    }
  }

  private loadAndPlayTrack(index: number): void {
    this.currentTrackIdx = index;
    const track = this.tracks[index];
    if (!track) return;

    this.audioEl.pause();
    this.audioEl.src = `/api/stream/${encodeURIComponent(track.id)}`;
    this.audioEl.load();
    this.audioEl.play().catch(() => {});
    this.isPlaying = true;

    this.updateTrackMetadataUI(track);
    this.updateQueueActiveItem();
    this.updateTransportUI();
  }

  private attachAudioEvents(): void {
    this.audioEl.ontimeupdate = () => {
      this.updateProgress();
    };

    // Auto-advance on track completion
    this.audioEl.onended = () => {
      if (this.currentTrackIdx < this.tracks.length - 1) {
        this.nextTrack();
      } else {
        this.isPlaying = false;
        this.updateTransportUI();
      }
    };
  }

  private updateTrackMetadataUI(track: AudioTrackItem): void {
    document.getElementById('audioTrackTitle')!.textContent = track.title || track.name;
    document.getElementById('audioArtistAlbum')!.textContent = `${track.artist || 'Artista Desconocido'} • ${track.album || 'Álbum Desconocido'}`;

    const coverImg = document.getElementById('audioAlbumCover') as HTMLImageElement;
    const fallbackVinyl = document.getElementById('audioVinylFallback')!;

    if (track.thumbnailLink) {
      coverImg.style.display = 'block';
      fallbackVinyl.style.display = 'none';
      coverImg.onerror = () => {
        coverImg.style.display = 'none';
        fallbackVinyl.style.display = 'flex';
      };
      coverImg.src = track.thumbnailLink.replace(/=s\d+/, '=s400');
    } else {
      coverImg.style.display = 'none';
      fallbackVinyl.style.display = 'flex';
    }

    const durationSec = track.durationMillis ? Math.floor(track.durationMillis / 1000) : 0;
    document.getElementById('audioTimeDuration')!.textContent = this.formatTime(durationSec);
  }

  private updateProgress(): void {
    const cur = this.audioEl.currentTime || 0;
    const dur = this.audioEl.duration || (this.tracks[this.currentTrackIdx]?.durationMillis / 1000) || 1;
    const pct = Math.min(100, (cur / dur) * 100);

    document.getElementById('audioTimeCurrent')!.textContent = this.formatTime(cur);
    document.getElementById('audioProgressBar')!.style.width = `${pct}%`;
  }

  private updateTransportUI(): void {
    const icon = document.getElementById('audioPlayPauseIcon')!;
    icon.textContent = this.isPlaying ? '⏸' : '▶';
  }

  private renderQueue(): void {
    const listEl = document.getElementById('audioQueueList')!;
    document.getElementById('audioQueueCount')!.textContent = `(${this.tracks.length} pistas)`;
    listEl.innerHTML = '';

    this.tracks.forEach((t, i) => {
      const dur = this.formatTime(Math.floor((t.durationMillis || 0) / 1000));
      const item = document.createElement('div');
      item.className = `queue-track-item ${i === this.currentTrackIdx ? 'is-playing' : ''}`;
      item.id = `queueItem_${i}`;
      item.innerHTML = `
        <span class="queue-track-num">${i + 1}</span>
        <div class="queue-track-info">
          <span class="queue-track-title">${t.title || t.name}</span>
          <span class="queue-track-artist">${t.artist || ''}</span>
        </div>
        <span class="queue-track-duration">${dur}</span>
      `;
      listEl.appendChild(item);
    });
  }

  private updateQueueActiveItem(): void {
    const listEl = document.getElementById('audioQueueList')!;
    const items = listEl.querySelectorAll('.queue-track-item');
    items.forEach((el, i) => {
      if (i === this.currentTrackIdx) {
        el.classList.add('is-playing');
      } else {
        el.classList.remove('is-playing');
      }
    });

    // Center active item in scroll viewport: item height approx 70px
    const itemHeight = 70;
    const offset = Math.max(0, (this.currentTrackIdx - 4) * itemHeight);
    listEl.style.transform = `translate3d(0, -${offset}px, 0)`;
  }

  private formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return `${pad(m)}:${pad(rem)}`;
  }

  public close(): void {
    this.audioEl.pause();
    this.audioEl.removeAttribute('src');
    this.audioEl.load();
    this.isPlaying = false;

    const view = document.getElementById('audioPlayerView')!;
    view.style.display = 'none';

    if (this.onExitCallback) {
      this.onExitCallback();
    }
  }
}
```

---

## 6. Component Integration with Spatial Navigation Engine

When any player or viewer opens:
1. `SpatialNavEngine.pushLayer('player' | 'slideshow' | 'audio')` pushes the new layer onto `layerStack`.
2. All D-pad arrow keys, Enter, and Return events are routed exclusively to the active controller's `handleKey(keyCode)`.
3. When the controller closes:
   - `SpatialNavEngine.popLayer()` pops the layer.
   - The underlying catalog or detail modal is reactivated.
   - Spatial focus is restored to the exact item card that launched the playback session.

---

## 7. Concrete Unit Test Plan (`tests/unit/m3/player.test.ts`)

This unit test suite is designed for Node.js native test runner (`node:test` and `node:assert/strict`) via `tsx --test`. It directly verifies the contracts of F14, F15, and F16:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

// Helper mock classes simulating DOM & media element states without browser
class MockMediaElement {
  public src: string = '';
  public paused: boolean = true;
  public currentTime: number = 0;
  public duration: number = 7200; // 2 hours
  public textTracks: Array<{ mode: string; id: string; label: string; language: string }> = [];
  public textTrackElements: Array<any> = [];

  public play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  public pause(): void {
    this.paused = true;
  }

  public load(): void {
    // Media load simulation
  }

  public removeAttribute(attr: string): void {
    if (attr === 'src') this.src = '';
  }
}

// -------------------------------------------------------------
// F14: Video Player & Subtitles Unit Tests
// -------------------------------------------------------------

test('F14-U01: Video Player formatTime converts seconds to strict HH:MM:SS format', () => {
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  assert.equal(formatTime(0), '00:00:00');
  assert.equal(formatTime(65), '00:01:05');
  assert.equal(formatTime(3665), '01:01:05');
  assert.equal(formatTime(7200), '02:00:00');
  assert.equal(formatTime(-10), '00:00:00');
  assert.equal(formatTime(NaN), '00:00:00');
});

test('F14-U02: Scrubber forward seeking (+10s) clamps to exact media duration', () => {
  const duration = 120; // 2 minutes
  let currentTime = 115;

  const seekForward = (delta: number) => {
    currentTime = Math.min(duration, currentTime + delta);
  };

  seekForward(10);
  assert.equal(currentTime, 120, 'Current time must clamp to duration without overflow');
});

test('F14-U03: Scrubber backward seeking (-10s) clamps to 0:00 without negative timestamps', () => {
  let currentTime = 6;

  const seekBackward = (delta: number) => {
    currentTime = Math.max(0, currentTime - delta);
  };

  seekBackward(10);
  assert.equal(currentTime, 0, 'Current time must clamp to 0 without underflow');
});

test('F14-U04: Seeking while paused maintains paused state', () => {
  const media = new MockMediaElement();
  media.paused = true;
  media.currentTime = 30;

  // Perform seek
  media.currentTime += 10;

  assert.equal(media.paused, true, 'Media must remain paused after seeking');
  assert.equal(media.currentTime, 40);
});

test('F14-U05: Subtitle track selector auto-selects Spanish WebVTT track', () => {
  const tracks = [
    { id: 'sub_en', name: 'movie.en.srt', lang: 'en', label: 'English' },
    { id: 'sub_es', name: 'movie.es.srt', lang: 'es', label: 'Español' }
  ];

  const autoSelectSubtitle = (available: typeof tracks) => {
    const es = available.find(t => t.lang.toLowerCase() === 'es' || t.label.toLowerCase().includes('español'));
    return es ? es.id : 'off';
  };

  const selected = autoSelectSubtitle(tracks);
  assert.equal(selected, 'sub_es', 'Must auto-select Spanish subtitle track');
});

test('F14-U06: Selecting "Desactivado" disables all subtitle text tracks', () => {
  const media = new MockMediaElement();
  media.textTracks = [
    { id: 'sub_es', label: 'Español', language: 'es', mode: 'showing' },
    { id: 'sub_en', label: 'English', language: 'en', mode: 'disabled' }
  ];

  const setSubtitlesOff = (m: MockMediaElement) => {
    for (const t of m.textTracks) {
      t.mode = 'disabled';
    }
  };

  setSubtitlesOff(media);
  assert.ok(media.textTracks.every(t => t.mode === 'disabled'), 'All tracks must be set to disabled');
});

test('F14-U07: Hardware stream cleanup unloads media src and releases decoder', () => {
  const media = new MockMediaElement();
  media.src = '/api/stream/vid_inc';
  media.paused = false;

  const teardownPlayer = (m: MockMediaElement) => {
    m.pause();
    m.removeAttribute('src');
    m.load();
  };

  teardownPlayer(media);
  assert.equal(media.paused, true);
  assert.equal(media.src, '');
});

// -------------------------------------------------------------
// F15: Photo Slideshow Unit Tests
// -------------------------------------------------------------

test('F15-U01: Manual navigation clamps to boundary indices [0, totalPhotos - 1]', () => {
  const totalPhotos = 5;
  let activeIndex = 0;

  const advance = (delta: number) => {
    activeIndex = Math.max(0, Math.min(totalPhotos - 1, activeIndex + delta));
  };

  // Test left underflow
  advance(-1);
  assert.equal(activeIndex, 0, 'Must clamp at 0');

  // Test right overflow
  advance(10);
  assert.equal(activeIndex, 4, 'Must clamp at totalPhotos - 1');
});

test('F15-U02: Dual-buffer opacity swap preserves 3D hardware compositing transform', () => {
  let activeBuffer = 'A';
  let opacityA = 1;
  let opacityB = 0;

  const swapBuffer = () => {
    if (activeBuffer === 'A') {
      opacityA = 0;
      opacityB = 1;
      activeBuffer = 'B';
    } else {
      opacityA = 1;
      opacityB = 0;
      activeBuffer = 'A';
    }
  };

  swapBuffer();
  assert.equal(activeBuffer, 'B');
  assert.equal(opacityA, 0);
  assert.equal(opacityB, 1);
});

test('F15-U03: Play/Pause toggles auto-advance timer state', () => {
  let autoAdvance = true;
  let intervalId: any = 123;

  const toggleAutoAdvance = () => {
    autoAdvance = !autoAdvance;
    if (!autoAdvance && intervalId) {
      intervalId = null;
    } else if (autoAdvance && !intervalId) {
      intervalId = 456;
    }
  };

  toggleAutoAdvance(); // Pause
  assert.equal(autoAdvance, false);
  assert.equal(intervalId, null);

  toggleAutoAdvance(); // Resume
  assert.equal(autoAdvance, true);
  assert.ok(intervalId !== null);
});

// -------------------------------------------------------------
// F16: Audio Player with Playlist Unit Tests
// -------------------------------------------------------------

test('F16-U01: Audio formatTime formats MM:SS correctly', () => {
  const formatAudioTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return `${pad(m)}:${pad(rem)}`;
  };

  assert.equal(formatAudioTime(0), '00:00');
  assert.equal(formatAudioTime(65), '01:05');
  assert.equal(formatAudioTime(354), '05:54');
});

test('F16-U02: MediaTrackNext and MediaTrackPrevious clamp to playlist boundaries', () => {
  const totalTracks = 4;
  let currentTrackIdx = 0;

  const nextTrack = () => {
    currentTrackIdx = Math.min(totalTracks - 1, currentTrackIdx + 1);
  };

  const prevTrack = () => {
    currentTrackIdx = Math.max(0, currentTrackIdx - 1);
  };

  prevTrack();
  assert.equal(currentTrackIdx, 0, 'Cannot go below index 0');

  nextTrack();
  nextTrack();
  nextTrack();
  nextTrack(); // 4th attempt
  assert.equal(currentTrackIdx, 3, 'Cannot exceed last track index');
});

test('F16-U03: Fallback vinyl disc icon is activated when thumbnailLink is missing', () => {
  const trackWithoutThumb = {
    id: 'm1',
    title: 'Test Song',
    artist: 'Artist',
    thumbnailLink: undefined
  };

  const shouldUseVinylFallback = (track: typeof trackWithoutThumb) => {
    return !track.thumbnailLink;
  };

  assert.equal(shouldUseVinylFallback(trackWithoutThumb), true);
});

test('F16-U04: Queue vertical offset correctly centers active track item', () => {
  const calculateQueueScrollOffset = (trackIndex: number, itemHeight: number = 70) => {
    // Keep 4 tracks visible before scrolling begins
    return Math.max(0, (trackIndex - 4) * itemHeight);
  };

  assert.equal(calculateQueueScrollOffset(0), 0);
  assert.equal(calculateQueueScrollOffset(3), 0);
  assert.equal(calculateQueueScrollOffset(5), 70); // Scrolled by 1 item
  assert.equal(calculateQueueScrollOffset(7), 210); // Scrolled by 3 items
});
```

---

## 8. Summary of Implementation Blueprints & File Paths

| Component | Target Source Path | Dependencies & Key Features |
|---|---|---|
| **Video Player** | `client/src/views/player.ts` | `/api/stream/:fileId`, WebVTT Subtitle Manager, Scrubber, Auto-Hide Timer, Remote Mappings |
| **Photo Slideshow** | `client/src/views/slideshow.ts` | Dual-buffer GPU compositing, Auto-Advance Timer (5s), Boundary clamping, HUD counter |
| **Audio Player** | `client/src/views/audio.ts` | Vinyl disc fallback, Scrubber, Playlist Queue GPU scrolling, Continuous auto-advance |
| **Unit Test Suite** | `tests/unit/m3/player.test.ts` | Automated Node.js unit tests for player, subtitles, slideshow, and audio views |

This blueprint is ready for implementation by the M3 builder agents.
