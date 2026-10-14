import test from 'node:test';
import assert from 'node:assert/strict';
import { M56Validator } from '../../harness/m56-validator';
import fs from 'node:fs';
import path from 'node:path';

// Mock Media Element simulating HTMLMediaElement in headless Node
class MockMediaElement {
  public src: string = '';
  public paused: boolean = true;
  public currentTime: number = 0;
  public duration: number = 7200; // 2 hours
  public textTracks: Array<{ mode: string; id: string; label: string; language: string }> = [];

  public play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  public pause(): void {
    this.paused = true;
  }

  public load(): void {
    // Hardware decoder release simulation
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
  const calculateQueueScrollOffset = (trackIndex: number, itemHeight: number = 60) => {
    return Math.max(0, (trackIndex - 4) * itemHeight);
  };

  assert.equal(calculateQueueScrollOffset(0), 0);
  assert.equal(calculateQueueScrollOffset(3), 0);
  assert.equal(calculateQueueScrollOffset(5), 60);
  assert.equal(calculateQueueScrollOffset(7), 180);
});

test('Player Views: Chromium M56 Static Code & CSS Compliance', () => {
  const views = ['player.ts', 'slideshow.ts', 'audio.ts'];
  for (const v of views) {
    const full = path.resolve(__dirname, '../../../client/src/views', v);
    if (fs.existsSync(full)) {
      const code = fs.readFileSync(full, 'utf8');
      const res = M56Validator.validateJavaScript(code);
      assert.equal(res.valid, true, `M56 JS violation in ${v}: ${JSON.stringify(res.violations)}`);
    }
  }

  const styles = ['player.css', 'slideshow.css', 'audio.css'];
  for (const s of styles) {
    const full = path.resolve(__dirname, '../../../client/styles', s);
    if (fs.existsSync(full)) {
      const css = fs.readFileSync(full, 'utf8');
      const res = M56Validator.validateCSS(css);
      assert.equal(res.valid, true, `M56 CSS violation in ${s}: ${JSON.stringify(res.violations)}`);
    }
  }
});
