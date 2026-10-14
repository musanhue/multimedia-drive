// Setup headless DOM environment for testing view controllers
if (typeof (global as any).document === 'undefined') {
  const elements: Record<string, any> = {};
  const createElement = (tag: string) => {
    const attrs: Record<string, string> = {};
    const classes = new Set<string>();
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      innerHTML: '',
      textContent: '',
      style: {},
      src: '',
      paused: true,
      currentTime: 0,
      duration: 100,
      clientWidth: 1000,
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
        contains: (c: string) => classes.has(c)
      },
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      getAttribute: (k: string) => attrs[k],
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: (child: any) => child,
      querySelectorAll: () => [],
      querySelector: () => null,
      focus: () => {},
      play: () => Promise.resolve(),
      pause: () => {},
      load: () => {},
      removeAttribute: () => {}
    };
    return el;
  };

  (global as any).document = {
    createElement,
    getElementById: (id: string) => {
      if (!elements[id]) {
        elements[id] = createElement('div');
        elements[id].id = id;
      }
      return elements[id];
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    body: createElement('body')
  };
  (global as any).window = global;
}

import { VideoPlayerViewController, SubtitleTrackManager } from '../../../client/src/views/player';
import { PhotoSlideshowController } from '../../../client/src/views/slideshow';
import { AudioPlayerViewController } from '../../../client/src/views/audio';
import { SpatialNavigationEngine } from '../../../client/src/navigation/engine';
import { MovieDetailModal } from '../../../client/src/views/modal';
import { upgradeDriveThumbnail, renderFamilyCard } from '../../../client/src/views/family';

console.log('=== FORENSIC TEST SUITE: DIRECT CLASS VERIFICATION ===');

// 1. VideoPlayerViewController formatTime
console.log('1. Checking VideoPlayerViewController formatTime:');
const player = new VideoPlayerViewController();
console.log('   formatTime(0) ->', player.formatTime(0));
console.log('   formatTime(3665) ->', player.formatTime(3665));
console.log('   formatTime(7200) ->', player.formatTime(7200));
console.log('   formatTime(-10) ->', player.formatTime(-10));
console.log('   formatTime(NaN) ->', player.formatTime(NaN));
if (player.formatTime(3665) !== '01:01:05' || player.formatTime(0) !== '00:00:00') {
  throw new Error('VideoPlayerViewController formatTime failed!');
}

// 2. AudioPlayerViewController formatAudioTime
console.log('2. Checking AudioPlayerViewController formatAudioTime:');
const audio = new AudioPlayerViewController();
console.log('   formatAudioTime(0) ->', audio.formatAudioTime(0));
console.log('   formatAudioTime(65) ->', audio.formatAudioTime(65));
console.log('   formatAudioTime(354) ->', audio.formatAudioTime(354));
if (audio.formatAudioTime(65) !== '01:05' || audio.formatAudioTime(354) !== '05:54') {
  throw new Error('AudioPlayerViewController formatAudioTime failed!');
}

// 3. Audio playlist boundary clamping
console.log('3. Checking Audio playlist boundary clamping:');
audio.open({ id: 'm1', name: 'Song 1' }, [{ id: 'm1', name: 'Song 1' }, { id: 'm2', name: 'Song 2' }], 0, () => {});
audio.playPrevTrack(false);
console.log('   playPrevTrack at 0 index ->', audio.currentTrackIndex);
if (audio.currentTrackIndex !== 0) throw new Error('Audio boundary underflow!');
audio.playNextTrack(false);
console.log('   playNextTrack index ->', audio.currentTrackIndex);
if (audio.currentTrackIndex !== 1) throw new Error('Audio playNextTrack failed!');
audio.playNextTrack(false);
console.log('   playNextTrack at end index ->', audio.currentTrackIndex);
if (audio.currentTrackIndex !== 1) throw new Error('Audio boundary overflow!');

// 4. PhotoSlideshowController
console.log('4. Checking PhotoSlideshowController boundary clamping:');
const slideshow = new PhotoSlideshowController();
slideshow.open([{ id: 'p1', name: 'A', thumbnailLink: '' }, { id: 'p2', name: 'B', thumbnailLink: '' }], 0, () => {});
slideshow.advancePhoto(-1);
console.log('   advancePhoto(-1) index ->', slideshow.activeIndex);
if (slideshow.activeIndex !== 0) throw new Error('Slideshow underflow!');
slideshow.advancePhoto(10);
console.log('   advancePhoto(10) index ->', slideshow.activeIndex);
if (slideshow.activeIndex !== 1) throw new Error('Slideshow overflow!');
slideshow.close();

// 5. Family Thumbnail Upgrade & Zero TMDB
console.log('5. Checking Family Video thumbnail upgrade:');
const upgraded = upgradeDriveThumbnail('https://lh3.googleusercontent.com/test=s220');
console.log('   upgraded thumbnail ->', upgraded);
if (upgraded !== 'https://lh3.googleusercontent.com/test=s800') {
  throw new Error('upgradeDriveThumbnail failed!');
}

// 6. SpatialNavigationEngine
console.log('6. Checking SpatialNavigationEngine 2D calculation:');
const engine = new SpatialNavigationEngine();
const src = { left: 100, top: 100, width: 80, height: 80 };
const tgtRight = { left: 220, top: 100, width: 80, height: 80 };
const dist = engine.calculateDirectionalDistance(src, tgtRight, 'right');
console.log('   distance to right target ->', dist);
if (dist !== 40) {
  throw new Error('SpatialNavigationEngine distance calculation failed!');
}

// 7. MovieDetailModal Key Handling
console.log('7. Checking MovieDetailModal key trapping and toggle:');
const modal = new MovieDetailModal();
let closed = false;
modal.open({ id: 'mov1', name: 'Movie 1', category: 'peliculas' } as any, null as any, () => {});
console.log('   modal open ->', modal.isOpen());
// Up and Down are trapped
const trappedUp = modal.handleKey(38); // ArrowUp
const trappedDown = modal.handleKey(40); // ArrowDown
console.log('   trappedUp ->', trappedUp, 'trappedDown ->', trappedDown);
if (!trappedUp || !trappedDown) throw new Error('Modal vertical navigation was not trapped!');
// Return closes modal
const handledReturn = modal.handleKey(10009); // Return
console.log('   handledReturn ->', handledReturn, 'modal isOpen ->', modal.isOpen());
if (!handledReturn || modal.isOpen()) throw new Error('Return did not close modal!');

console.log('=== ALL FORENSIC CHECKS PASSED EMPIRICALLY! ===');
