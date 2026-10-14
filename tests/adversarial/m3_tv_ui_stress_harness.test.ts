import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

import { SpatialNavigationEngine } from '../../client/src/navigation/engine';
import { RemoteKeys, registerTizenRemoteKeys } from '../../client/src/navigation/keys';
import { upgradeDriveThumbnail, renderFamilyCard } from '../../client/src/views/family';
import { app } from '../../server/index';
import { M56Validator } from '../harness/m56-validator';

// ----------------------------------------------------------------------------
// Lightweight DOM Mock for Headless Node.js
// ----------------------------------------------------------------------------
function createMockElement(tagName: string, id: string = ''): any {
  const listeners: Record<string, Function[]> = {};
  const attributes: Record<string, string> = {};
  const children: any[] = [];
  const classes = new Set<string>();

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    src: '',
    crossOrigin: '',
    paused: true,
    currentTime: 0,
    duration: 100,
    buffered: {
      length: 1,
      end: () => 50
    },
    textTracks: [] as any[],
    style: {} as Record<string, string>,
    clientWidth: 1000,
    clientHeight: 60,
    parentNode: null as any,
    children,

    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val: string) {
      classes.clear();
      if (val) {
        val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    },

    classList: {
      add: (...tokens: string[]) => tokens.forEach(t => classes.add(t)),
      remove: (...tokens: string[]) => tokens.forEach(t => classes.delete(t)),
      contains: (token: string) => classes.has(token),
      toggle: (token: string) => {
        if (classes.has(token)) {
          classes.delete(token);
          return false;
        } else {
          classes.add(token);
          return true;
        }
      }
    },

    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
    getAttribute: (name: string) => attributes[name] || null,
    removeAttribute: (name: string) => {
      delete attributes[name];
      if (name === 'src') el.src = '';
    },

    addEventListener: (type: string, handler: Function) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: (type: string, handler: Function) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter(h => h !== handler);
      }
    },
    dispatchEvent: (type: string, eventData: any = {}) => {
      const handlers = listeners[type] || [];
      handlers.forEach(h => h(eventData));
    },

    appendChild: (child: any) => {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    removeChild: (child: any) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },

    querySelector: (sel: string) => {
      return children.find(c => {
        if (sel.startsWith('#')) return c.id === sel.slice(1);
        if (sel.startsWith('.')) return c.classList.contains(sel.slice(1));
        return c.tagName.toLowerCase() === sel.toLowerCase();
      }) || null;
    },
    querySelectorAll: (sel: string) => {
      return children.filter(c => {
        if (sel.startsWith('#')) return c.id === sel.slice(1);
        if (sel.startsWith('.')) return c.classList.contains(sel.slice(1));
        return c.tagName.toLowerCase() === sel.toLowerCase();
      });
    },

    focus: () => {},
    play: () => {
      el.paused = false;
      el.dispatchEvent('play');
      return Promise.resolve();
    },
    pause: () => {
      el.paused = true;
      el.dispatchEvent('pause');
    },
    load: () => {
      el.dispatchEvent('load');
    },

    _innerHTML: '',
    get innerHTML() {
      return el._innerHTML;
    },
    set innerHTML(html: string) {
      el._innerHTML = html;
      children.length = 0;
      const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
      let match;
      while ((match = tagRegex.exec(html)) !== null) {
        const tag = match[1];
        const attrs = match[2];
        const idMatch = attrs.match(/id="([^"]+)"/);
        const classMatch = attrs.match(/class="([^"]+)"/);
        if (idMatch) {
          const childId = idMatch[1];
          const child = createMockElement(tag, childId);
          if (classMatch) child.className = classMatch[1];
          children.push(child);
          if ((global as any).__mockDomElements__) {
            (global as any).__mockDomElements__.set(childId, child);
          }
        }
      }
    },
    _textContent: '',
    get textContent() {
      return el._textContent;
    },
    set textContent(txt: string) {
      el._textContent = txt;
    }
  };

  return el;
}

function setupGlobalDom() {
  const elements = new Map<string, any>();
  (global as any).__mockDomElements__ = elements;

  const doc = {
    _elements: elements,
    createElement: (tag: string) => createMockElement(tag),
    getElementById: (id: string) => {
      if (!elements.has(id)) {
        elements.set(id, createMockElement('div', id));
      }
      return elements.get(id);
    },
    querySelector: (sel: string) => {
      if (sel.startsWith('#')) return doc.getElementById(sel.slice(1));
      return createMockElement('div');
    },
    querySelectorAll: (sel: string) => {
      return [];
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createMockElement('body', 'body')
  };

  (global as any).document = doc;
  (global as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    document: doc
  };

  return { doc, elements };
}

// ============================================================================
// 1. SPATIAL NAVIGATION BOUNDARY STRESS
// ============================================================================

test('Spatial Nav [Burst Stress]: 500 rapid D-pad key dispatches maintain coordinate bounds without NaN', () => {
  const asymmetricGrid = [
    Array.from({ length: 12 }, (_, i) => ({ id: `r0_${i}` })),
    [{ id: 'r1_0' }],
    Array.from({ length: 7 }, (_, i) => ({ id: `r2_${i}` })),
    Array.from({ length: 4 }, (_, i) => ({ id: `r3_${i}` }))
  ];

  const engine = new SpatialNavigationEngine(asymmetricGrid);

  // 1. 200 rapid ArrowRight events
  for (let i = 0; i < 200; i++) {
    const res = engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
    assert.equal(res.handled, true);
    assert.ok(!isNaN(engine.focusCol));
    assert.ok(engine.focusCol >= 0 && engine.focusCol < 12);
  }
  assert.equal(engine.focusCol, 11, 'Must clamp exactly at right boundary index 11');
  assert.equal(engine.columnMemory, 11, 'Column memory must be 11');

  // 2. 100 rapid ArrowDown events
  for (let i = 0; i < 100; i++) {
    const res = engine.dispatchKey(RemoteKeys.ARROW_DOWN);
    assert.equal(res.handled, true);
    assert.ok(!isNaN(engine.focusRow));
    assert.ok(engine.focusRow >= 0 && engine.focusRow < 4);
  }
  assert.equal(engine.focusRow, 3, 'Must clamp at bottom boundary row 3');
  assert.equal(engine.focusCol, 3, 'In row 3 (len 4), focusCol clamped to 3');
  assert.equal(engine.columnMemory, 11, 'Column memory must remain preserved at 11');

  // 3. 200 rapid ArrowLeft events
  for (let i = 0; i < 200; i++) {
    const res = engine.dispatchKey(RemoteKeys.ARROW_LEFT);
    assert.equal(res.handled, true);
  }
  assert.equal(engine.focusCol, 0, 'Must clamp at left boundary 0');
  assert.equal(engine.columnMemory, 0, 'Column memory updated to 0 after horizontal left movement');

  // 4. 100 rapid ArrowUp events
  for (let i = 0; i < 100; i++) {
    const res = engine.dispatchKey(RemoteKeys.ARROW_UP);
    assert.equal(res.handled, true);
  }
  assert.equal(engine.focusRow, 0, 'Must clamp at top boundary row 0');
  assert.equal(engine.focusCol, 0, 'Must be at (0, 0)');
});

test('Spatial Nav [T3-17 Contract]: Deep vertical traverse preserves column memory across multi-tier ragged rows', () => {
  const raggedGrid = [
    // Row 0: 8 items
    Array.from({ length: 8 }, (_, i) => ({ id: `row0_${i}` })),
    // Row 1: 2 items
    Array.from({ length: 2 }, (_, i) => ({ id: `row1_${i}` })),
    // Row 2: 10 items
    Array.from({ length: 10 }, (_, i) => ({ id: `row2_${i}` })),
    // Row 3: 1 item
    Array.from({ length: 1 }, (_, i) => ({ id: `row3_${i}` })),
    // Row 4: 9 items
    Array.from({ length: 9 }, (_, i) => ({ id: `row4_${i}` }))
  ];

  const engine = new SpatialNavigationEngine(raggedGrid);

  // Move right to col 6 in row 0
  for (let i = 0; i < 6; i++) engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(engine.focusRow, 0);
  assert.equal(engine.focusCol, 6);
  assert.equal(engine.columnMemory, 6);
  assert.equal(engine.getCurrentFocus()?.id, 'row0_6');

  // Down to row 1 (len 2): focusCol clamped to 1, columnMemory preserved as 6
  engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 1);
  assert.equal(engine.focusCol, 1);
  assert.equal(engine.columnMemory, 6);
  assert.equal(engine.getCurrentFocus()?.id, 'row1_1');

  // Down to row 2 (len 10): focusCol restored to 6
  engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 2);
  assert.equal(engine.focusCol, 6);
  assert.equal(engine.columnMemory, 6);
  assert.equal(engine.getCurrentFocus()?.id, 'row2_6');

  // Down to row 3 (len 1): focusCol clamped to 0
  engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 3);
  assert.equal(engine.focusCol, 0);
  assert.equal(engine.columnMemory, 6);
  assert.equal(engine.getCurrentFocus()?.id, 'row3_0');

  // Down to row 4 (len 9): focusCol restored to 6
  engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 4);
  assert.equal(engine.focusCol, 6);
  assert.equal(engine.columnMemory, 6);
  assert.equal(engine.getCurrentFocus()?.id, 'row4_6');

  // Retrace upwards: Row 4 -> Row 3 -> Row 2 -> Row 1 -> Row 0
  engine.dispatchKey(RemoteKeys.ARROW_UP); // Row 3
  assert.equal(engine.focusRow, 3);
  assert.equal(engine.focusCol, 0);

  engine.dispatchKey(RemoteKeys.ARROW_UP); // Row 2
  assert.equal(engine.focusRow, 2);
  assert.equal(engine.focusCol, 6);

  engine.dispatchKey(RemoteKeys.ARROW_UP); // Row 1
  assert.equal(engine.focusRow, 1);
  assert.equal(engine.focusCol, 1);

  engine.dispatchKey(RemoteKeys.ARROW_UP); // Row 0
  assert.equal(engine.focusRow, 0);
  assert.equal(engine.focusCol, 6);
  assert.equal(engine.getCurrentFocus()?.id, 'row0_6');
});

test('Spatial Nav [Layer Stack Unwinding]: Multi-tier modal hierarchy unwinds in strict LIFO order on Return', () => {
  const engine = new SpatialNavigationEngine([
    [{ id: 'card_a' }, { id: 'card_b' }, { id: 'card_c' }]
  ]);

  // Position at card_b (col 1)
  engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(engine.getCurrentFocus()?.id, 'card_b');

  // Register layers
  engine.registerSpatialLayer('modal_movie', [
    { id: 'btn_play', rect: { left: 400, top: 700, width: 200, height: 60 } },
    { id: 'btn_subs', rect: { left: 640, top: 700, width: 200, height: 60 } }
  ], 'btn_play');

  engine.registerSpatialLayer('modal_subs', [
    { id: 'sub_opt_0', rect: { left: 800, top: 300, width: 300, height: 50 } },
    { id: 'sub_opt_1', rect: { left: 800, top: 370, width: 300, height: 50 } }
  ], 'sub_opt_0');

  // 1. Push movie modal
  let movieClosed = false;
  engine.pushLayer('modal_movie', { defaultFocusId: 'btn_play', onClose: () => { movieClosed = true; } });
  assert.equal(engine.activeLayer, 'modal_movie');
  assert.equal(engine.getCurrentFocus()?.id, 'btn_play');

  // Test focus trapping in movie modal: Up/Down trapped
  const trapUp = engine.dispatchKey(RemoteKeys.ARROW_UP);
  assert.equal(trapUp.trapped, true);
  const trapDown = engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(trapDown.trapped, true);
  assert.equal(engine.getCurrentFocus()?.id, 'btn_play');

  // 2. Push subtitle modal on top
  let subsClosed = false;
  engine.pushLayer('modal_subs', { defaultFocusId: 'sub_opt_0', onClose: () => { subsClosed = true; } });
  assert.equal(engine.activeLayer, 'modal_subs');
  assert.equal(engine.getCurrentFocus()?.id, 'sub_opt_0');

  // 3. Unwind tier 1: Return key (10009) closes subtitle modal
  const return1 = engine.dispatchKey(RemoteKeys.RETURN);
  assert.equal(return1.handled, true);
  assert.equal(return1.action, 'EXIT_LAYER');
  assert.equal(subsClosed, true, 'Subtitle modal onClose must be called');
  assert.equal(movieClosed, false, 'Movie modal must NOT be closed yet');
  assert.equal(engine.activeLayer, 'modal_movie');

  // 4. Unwind tier 2: Return key closes movie modal, restoring catalog
  const return2 = engine.dispatchKey(RemoteKeys.RETURN);
  assert.equal(return2.handled, true);
  assert.equal(return2.action, 'EXIT_LAYER');
  assert.equal(movieClosed, true, 'Movie modal onClose must be called');
  assert.equal(engine.activeLayer, 'catalog');
  assert.equal(engine.getCurrentFocus()?.id, 'card_b', 'Focus must restore to invoking card card_b');

  // 5. Return on root catalog triggers SHOW_EXIT_DIALOG
  const return3 = engine.dispatchKey(RemoteKeys.RETURN);
  assert.equal(return3.handled, true);
  assert.equal(return3.action, 'SHOW_EXIT_DIALOG');
  assert.equal(engine.activeLayer, 'catalog');
});

// ============================================================================
// 2. VIDEO PLAYER HARDWARE LIFECYCLE & DECODER TEARDOWN
// ============================================================================

test('Player Hardware Lifecycle: Decoder teardown strictly executes pause, src removal, load and cancels timers', async () => {
  setupGlobalDom();
  const { videoPlayerController } = await import('../../client/src/views/player');

  let exitCalled = false;
  videoPlayerController.open('video_file_001', 'Inception', 'Películas', () => {
    exitCalled = true;
  });

  const video = videoPlayerController.videoEl;
  assert.ok(video, 'Video element must be initialized');
  assert.equal(video.crossOrigin, 'anonymous', 'Video crossorigin must be anonymous');
  assert.ok(video.src.includes('video_file_001'), 'Source must point to stream endpoint');

  // Simulate hardware decoder teardown via close() / Return key
  let pauseCalled = false;
  let loadCalled = false;
  let removeSrcCalled = false;

  const origPause = video.pause;
  video.pause = () => {
    pauseCalled = true;
    origPause.call(video);
  };

  const origLoad = video.load;
  video.load = () => {
    loadCalled = true;
    origLoad.call(video);
  };

  const origRemoveAttr = video.removeAttribute;
  video.removeAttribute = (attr: string) => {
    if (attr === 'src') removeSrcCalled = true;
    origRemoveAttr.call(video, attr);
  };

  // Dispatch Return key (10009)
  videoPlayerController.handleKey(10009);

  assert.equal(pauseCalled, true, 'video.pause() MUST be called to halt hardware decoder');
  assert.equal(removeSrcCalled, true, 'video.removeAttribute("src") MUST be called');
  assert.equal(loadCalled, true, 'video.load() MUST be called to flush decoder pipeline');
  assert.equal(video.src, '', 'video.src must be completely empty');
  assert.equal(exitCalled, true, 'onExit callback must be executed');
});

test('Player State Machine: Auto-hide HUD overlay reschedules on keydown and stays visible when paused', async () => {
  setupGlobalDom();
  const { videoPlayerController } = await import('../../client/src/views/player');

  videoPlayerController.open('vid_002', 'Avatar', 'Películas', () => {});

  // When playing, overlay is initially visible
  assert.equal(videoPlayerController.overlayEl.classList.contains('is-hidden'), false);

  // Pausing video cancels auto-hide
  videoPlayerController.videoEl.paused = false;
  videoPlayerController.togglePlayPause(); // pause it
  assert.equal(videoPlayerController.videoEl.paused, true);

  // Key navigation while paused keeps controls visible
  videoPlayerController.handleKey(RemoteKeys.ARROW_RIGHT); // seek +10
  assert.equal(videoPlayerController.overlayEl.classList.contains('is-hidden'), false);

  videoPlayerController.close();
});

test('Subtitle Manager: Auto-selects Spanish WebVTT track and disables tracks on "Desactivado"', async () => {
  setupGlobalDom();
  const { SubtitleTrackManager } = await import('../../client/src/views/player');
  const video = createMockElement('video');
  const subManager = new SubtitleTrackManager(video as any);

  // Mock global fetch for subtitle tracks
  const origFetch = global.fetch;
  global.fetch = async (url: any) => {
    if (String(url).includes('/api/subtitles/list/')) {
      return {
        ok: true,
        json: async () => ({
          subtitles: [
            { id: 'sub_en', name: 'movie.en.srt', lang: 'en', label: 'English' },
            { id: 'sub_es', name: 'movie.es.srt', lang: 'es', label: 'Español' },
            { id: 'sub_fr', name: 'movie.fr.srt', lang: 'fr', label: 'Français' }
          ]
        })
      } as any;
    }
    return origFetch(url);
  };

  try {
    const tracks = await subManager.loadTracks('movie_99');
    assert.equal(tracks.length, 3);
    assert.equal(subManager.getActiveTrackId(), 'sub_es', 'Must auto-select Spanish track');
    assert.equal(subManager.getActiveTrackLabel(), 'Español');

    // Switch to "Desactivado"
    subManager.selectTrack('off');
    assert.equal(subManager.getActiveTrackId(), 'off');
    assert.equal(subManager.getActiveTrackLabel(), 'Desactivado');

    // Switch to French
    subManager.selectTrack('sub_fr');
    assert.equal(subManager.getActiveTrackId(), 'sub_fr');
    assert.equal(subManager.getActiveTrackLabel(), 'Français');
  } finally {
    global.fetch = origFetch;
  }
});

// ============================================================================
// 3. FAMILY VIDEO ISOLATION BARRIER
// ============================================================================

test('Family Video Isolation: Family card click launches player with ZERO calls to TMDB endpoints', async () => {
  setupGlobalDom();
  const { CatalogView } = await import('../../client/src/views/catalog');
  const { apiClient } = await import('../../client/src/api/client');

  let tmdbCalls = 0;
  let familyVideoLaunched = false;
  let launchedCategory = '';

  const origGet = apiClient.get;
  apiClient.get = async (path: string, options?: any) => {
    if (path.includes('/metadata/')) {
      tmdbCalls++;
    }
    return origGet.call(apiClient, path, options);
  };

  const container = createMockElement('div', 'main-view-container');
  const catalogView = new CatalogView(container as any, {
    onPlayMovie: () => {},
    onPlayFamilyVideo: (item) => {
      familyVideoLaunched = true;
      launchedCategory = 'familiares';
    },
    onOpenPhotoSlideshow: () => {},
    onOpenAudioPlayer: () => {},
    onExitApp: () => {}
  });

  // Inject family row at index 2
  catalogView.currentFocusRow = 2; // Videos familiares
  catalogView.currentFocusCol = 0;
  (catalogView as any).rowData.set(2, [
    {
      id: 'fam_vid_1',
      name: 'Cumpleanos_Mama_2022.mp4',
      cleanTitle: 'Cumpleanos Mama 2022',
      category: 'familiares',
      dateFormatted: '12 de mayo de 2022',
      durationFormatted: '08:45',
      resolutionBadge: '1080p',
      thumbnailLink: 'https://lh3.googleusercontent.com/thumb=s220'
    }
  ]);

  // Press Enter on family card
  catalogView.handleEnter();

  assert.equal(familyVideoLaunched, true, 'Direct playback callback must be invoked');
  assert.equal(launchedCategory, 'familiares');
  assert.equal(tmdbCalls, 0, 'ZERO calls must be made to TMDB metadata endpoints!');
});

test('Family Video Isolation [Backend Boundary]: HTTP 403 Isolation Barrier verified against live server', async () => {
  let server: http.Server;
  let port: number;

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      port = addr.port;
      resolve();
    });
  });

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/metadata/enrich?category=familiares&title=Vacaciones`);
    assert.equal(res.status, 403, 'Isolation barrier must block category=familiares with 403');
    const data = await res.json();
    assert.ok(data.error.includes('Isolation Barrier'));
  } finally {
    server.close();
  }
});

// ============================================================================
// 4. PHOTO SLIDESHOW STRESS HARNESS
// ============================================================================

test('Photo Slideshow: Auto-advance timer, play/pause toggle, and boundary clamping', async () => {
  setupGlobalDom();
  const { PhotoSlideshowController } = await import('../../client/src/views/slideshow');

  const photos = [
    { id: 'ph_1', name: 'Foto 1', thumbnailLink: 'https://drive.com/1=s220' },
    { id: 'ph_2', name: 'Foto 2', thumbnailLink: 'https://drive.com/2=s220' },
    { id: 'ph_3', name: 'Foto 3', thumbnailLink: 'https://drive.com/3=s220' }
  ];

  let exitCalled = false;
  const slideshow = new PhotoSlideshowController();
  slideshow.open(photos, 0, () => { exitCalled = true; });

  assert.equal(slideshow.activeIndex, 0);
  assert.equal(slideshow.autoAdvance, true);

  // Manual navigation forward
  slideshow.handleKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(slideshow.activeIndex, 1);

  slideshow.handleKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(slideshow.activeIndex, 2);

  // Boundary clamp on right: does NOT overflow or wrap on manual navigation
  slideshow.handleKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(slideshow.activeIndex, 2, 'Manual right navigation must clamp at last index');

  // Manual navigation backward
  slideshow.handleKey(RemoteKeys.ARROW_LEFT);
  assert.equal(slideshow.activeIndex, 1);

  slideshow.handleKey(RemoteKeys.ARROW_LEFT);
  assert.equal(slideshow.activeIndex, 0);

  // Boundary clamp on left: does NOT underflow
  slideshow.handleKey(RemoteKeys.ARROW_LEFT);
  assert.equal(slideshow.activeIndex, 0, 'Manual left navigation must clamp at index 0');

  // Play/Pause toggle
  slideshow.handleKey(RemoteKeys.ENTER);
  assert.equal(slideshow.autoAdvance, false, 'Enter must toggle autoAdvance to false');

  slideshow.handleKey(RemoteKeys.ENTER);
  assert.equal(slideshow.autoAdvance, true, 'Enter must toggle autoAdvance back to true');

  // Teardown on Return
  slideshow.handleKey(RemoteKeys.RETURN);
  assert.equal(exitCalled, true, 'Return key must close slideshow and execute exit callback');
});

// ============================================================================
// 5. AUDIO PLAYER STRESS HARNESS
// ============================================================================

test('Audio Player: Queue advance on ended event, boundary clamping and SVG fallback', async () => {
  setupGlobalDom();
  const { AudioPlayerViewController } = await import('../../client/src/views/audio');

  const playlist = [
    { id: 'm_1', name: 'Track 1', title: 'Cancion 1', artist: 'Artista 1', thumbnailLink: 'https://img.com/1.jpg' },
    { id: 'm_2', name: 'Track 2', title: 'Cancion 2', artist: 'Artista 2', thumbnailLink: undefined }, // Missing artwork
    { id: 'm_3', name: 'Track 3', title: 'Cancion 3', artist: 'Artista 3', thumbnailLink: 'https://img.com/3.jpg' }
  ];

  let exitCalled = false;
  const audio = new AudioPlayerViewController();
  audio.open(playlist[0], playlist, 0, () => { exitCalled = true; });

  assert.equal(audio.currentTrackIndex, 0);
  assert.equal(audio.audioEl.src.includes('m_1'), true);

  // Track 0 has thumbnail -> vinyl fallback should be hidden
  const vinylFallback = (global as any).document.getElementById('audioVinylFallback');
  assert.equal(vinylFallback.style.display, 'none');

  // Transport Next
  audio.handleKey(RemoteKeys.MEDIA_TRACK_NEXT);
  assert.equal(audio.currentTrackIndex, 1);
  assert.equal(audio.audioEl.src.includes('m_2'), true);

  // Track 1 lacks thumbnail -> vinyl fallback must be displayed
  assert.equal(vinylFallback.style.display, 'flex');

  // Simulate audio 'ended' event -> auto-advance to track 2
  audio.playNextTrack(true);
  assert.equal(audio.currentTrackIndex, 2);
  assert.equal(audio.audioEl.src.includes('m_3'), true);

  // Boundary clamp on last track
  audio.handleKey(RemoteKeys.MEDIA_TRACK_NEXT);
  assert.equal(audio.currentTrackIndex, 2, 'Cannot exceed last playlist track');

  // Teardown on Return
  audio.handleKey(RemoteKeys.RETURN);
  assert.equal(exitCalled, true);
  assert.equal(audio.audioEl.src, '');
});

// ============================================================================
// 6. CHROMIUM M56 STATIC SYNTAX AND CSS COMPLIANCE
// ============================================================================

test('Static Compliance: Entire client codebase and compiled dist bundles strictly conform to Chromium M56', () => {
  const violations: string[] = [];

  function scanDirectory(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
        const code = fs.readFileSync(fullPath, 'utf8');
        const res = M56Validator.validateJavaScript(code);
        if (!res.valid) {
          violations.push(`[JS] ${fullPath}: ${JSON.stringify(res.violations)}`);
        }
      } else if (fullPath.endsWith('.css')) {
        const css = fs.readFileSync(fullPath, 'utf8');
        const res = M56Validator.validateCSS(css);
        if (!res.valid) {
          violations.push(`[CSS] ${fullPath}: ${JSON.stringify(res.violations)}`);
        }
      }
    }
  }

  scanDirectory(path.resolve(__dirname, '../../client/src'));
  scanDirectory(path.resolve(__dirname, '../../client/styles'));
  scanDirectory(path.resolve(__dirname, '../../dist/client'));

  assert.equal(
    violations.length,
    0,
    `Found ${violations.length} Chromium M56 syntax/CSS violations:\n${violations.join('\n')}`
  );
});


// ============================================================================
// 7. ADVERSARIAL FUZZING & EXTRA BOUNDARY CONDITIONS
// ============================================================================

test('Spatial Nav [Adversarial Fuzzing]: 5,000 random keycodes never corrupt navigation invariants', () => {
  const grid = [
    Array.from({ length: 5 }, (_, i) => ({ id: `p_${i}` })),
    Array.from({ length: 3 }, (_, i) => ({ id: `s_${i}` })),
    Array.from({ length: 1 }, (_, i) => ({ id: `f_${i}` })),
    Array.from({ length: 8 }, (_, i) => ({ id: `ph_${i}` })),
    Array.from({ length: 4 }, (_, i) => ({ id: `m_${i}` }))
  ];

  const engine = new SpatialNavigationEngine(grid);

  const keys = [
    RemoteKeys.ARROW_LEFT,
    RemoteKeys.ARROW_RIGHT,
    RemoteKeys.ARROW_UP,
    RemoteKeys.ARROW_DOWN,
    RemoteKeys.ENTER,
    RemoteKeys.RETURN,
    RemoteKeys.MEDIA_PLAY,
    RemoteKeys.MEDIA_PAUSE,
    RemoteKeys.MEDIA_FAST_FORWARD,
    RemoteKeys.MEDIA_REWIND,
    RemoteKeys.MEDIA_TRACK_NEXT,
    RemoteKeys.MEDIA_TRACK_PREVIOUS,
    99999, // Unmapped key
    -1
  ];

  for (let i = 0; i < 5000; i++) {
    const key = keys[Math.floor(Math.random() * keys.length)];
    const res = engine.dispatchKey(key);
    assert.ok(typeof res.handled === 'boolean');

    if (engine.activeLayer === 'catalog') {
      assert.ok(engine.focusRow >= 0 && engine.focusRow < grid.length, `focusRow out of bounds: ${engine.focusRow}`);
      assert.ok(engine.focusCol >= 0 && engine.focusCol < grid[engine.focusRow].length, `focusCol out of bounds: ${engine.focusCol}`);
      assert.ok(engine.columnMemory >= 0, `columnMemory negative: ${engine.columnMemory}`);
    }
  }
});

test('Video Player [Math & Edge Boundaries]: formatTime and relative seeking withstand adversarial inputs', async () => {
  setupGlobalDom();
  const { videoPlayerController } = await import('../../client/src/views/player');

  // formatTime edge cases
  assert.equal(videoPlayerController.formatTime(NaN), '00:00:00');
  assert.equal(videoPlayerController.formatTime(-100), '00:00:00');
  assert.equal(videoPlayerController.formatTime(0), '00:00:00');
  assert.equal(videoPlayerController.formatTime(0.5), '00:00:00');
  assert.equal(videoPlayerController.formatTime(59), '00:00:59');
  assert.equal(videoPlayerController.formatTime(60), '00:01:00');
  assert.equal(videoPlayerController.formatTime(3599), '00:59:59');
  assert.equal(videoPlayerController.formatTime(3600), '01:00:00');
  assert.equal(videoPlayerController.formatTime(3665), '01:01:05');
  assert.equal(videoPlayerController.formatTime(86400), '24:00:00');

  // Relative seeking clamped when duration is 0 or media not loaded
  videoPlayerController.open('vid_edge', 'Edge Case', 'Películas', () => {});
  videoPlayerController.videoEl.duration = 0;
  videoPlayerController.videoEl.currentTime = 0;

  videoPlayerController.seekRelative(50);
  assert.equal(videoPlayerController.videoEl.currentTime, 0, 'Cannot seek past 0 duration');

  videoPlayerController.seekRelative(-50);
  assert.equal(videoPlayerController.videoEl.currentTime, 0, 'Cannot seek below 0');

  // Relative seeking with 100s duration
  videoPlayerController.videoEl.duration = 100;
  videoPlayerController.videoEl.currentTime = 95;
  videoPlayerController.seekRelative(20);
  assert.equal(videoPlayerController.videoEl.currentTime, 100, 'Must clamp at 100');

  videoPlayerController.seekRelative(-150);
  assert.equal(videoPlayerController.videoEl.currentTime, 0, 'Must clamp at 0');

  videoPlayerController.close();
});

test('Photo Slideshow [Single Photo Edge Case]: Slideshow with 1 photo handles navigation gracefully', async () => {
  setupGlobalDom();
  const { PhotoSlideshowController } = await import('../../client/src/views/slideshow');

  const singlePhoto = [{ id: 'ph_solo', name: 'Foto Solitaria', thumbnailLink: 'https://thumb.com/solo' }];
  const slideshow = new PhotoSlideshowController();

  let exitCalled = false;
  slideshow.open(singlePhoto, 0, () => { exitCalled = true; });

  assert.equal(slideshow.activeIndex, 0);

  // Manual advances stay at index 0
  slideshow.handleKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(slideshow.activeIndex, 0);

  slideshow.handleKey(RemoteKeys.ARROW_LEFT);
  assert.equal(slideshow.activeIndex, 0);

  slideshow.close();
  assert.equal(exitCalled, true);
});

test('Audio Player [Queue Large Playlist Centering]: Centering offset math for 50 tracks', async () => {
  setupGlobalDom();
  const { AudioPlayerViewController } = await import('../../client/src/views/audio');

  const tracks = Array.from({ length: 50 }, (_, i) => ({
    id: `track_${i}`,
    name: `Pista ${i + 1}`,
    title: `Cancion ${i + 1}`,
    artist: 'Artista Test'
  }));

  const audio = new AudioPlayerViewController();
  audio.open(tracks[0], tracks, 0, () => {});

  // Initial offset for track 0 should be 0
  let listEl = (global as any).document.getElementById('audioQueueList');
  assert.equal(listEl.style.transform, 'translate3d(0, -0px, 0)');

  // Advance to track 4 -> offset still 0
  audio.currentTrackIndex = 4;
  (audio as any).updateQueueActiveItem();
  assert.equal(listEl.style.transform, 'translate3d(0, -0px, 0)');

  // Advance to track 5 -> offset becomes (5-4)*60 = 60px
  audio.currentTrackIndex = 5;
  (audio as any).updateQueueActiveItem();
  assert.equal(listEl.style.transform, 'translate3d(0, -60px, 0)');

  // Advance to track 20 -> offset becomes (20-4)*60 = 960px
  audio.currentTrackIndex = 20;
  (audio as any).updateQueueActiveItem();
  assert.equal(listEl.style.transform, 'translate3d(0, -960px, 0)');

  audio.close();
});

test('App Exit Dialog: D-pad navigation toggles buttons and Return/Escape dismisses dialog', async () => {
  setupGlobalDom();
  const { App } = await import('../../client/src/app');

  const appInstance = new App();
  let restoreFocusCalled = false;
  appInstance.catalogView = {
    restoreFocus: () => { restoreFocusCalled = true; }
  } as any;
  // Show exit dialog
  appInstance.showExitDialog();
  assert.equal((appInstance as any).exitDialogActive, true);
  assert.equal((appInstance as any).exitDialogFocusIdx, 0); // Default Salir

  const btnConfirm = (global as any).document.getElementById('btn_exit_confirm');
  const btnCancel = (global as any).document.getElementById('btn_exit_cancel');
  assert.ok(btnConfirm && btnCancel);
  assert.equal(btnConfirm.classList.contains('is-focused'), true);

  // ArrowRight moves focus to Cancelar
  appInstance.handleGlobalKeyDown({ keyCode: RemoteKeys.ARROW_RIGHT, preventDefault: () => {}, stopPropagation: () => {} } as any);
  assert.equal((appInstance as any).exitDialogFocusIdx, 1);
  assert.equal(btnCancel.classList.contains('is-focused'), true);
  assert.equal(btnConfirm.classList.contains('is-focused'), false);

  // ArrowLeft moves focus back to Salir
  appInstance.handleGlobalKeyDown({ keyCode: RemoteKeys.ARROW_LEFT, preventDefault: () => {}, stopPropagation: () => {} } as any);
  assert.equal((appInstance as any).exitDialogFocusIdx, 0);
  assert.equal(btnConfirm.classList.contains('is-focused'), true);

  // Return key dismisses dialog
  appInstance.handleGlobalKeyDown({ keyCode: RemoteKeys.RETURN, preventDefault: () => {}, stopPropagation: () => {} } as any);
  assert.equal((appInstance as any).exitDialogActive, false);
  assert.equal(restoreFocusCalled, true, 'Catalog focus must be restored when exit dialog is dismissed');
});
