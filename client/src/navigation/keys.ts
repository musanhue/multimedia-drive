/**
 * Authoritative Remote Control Key Codes for Samsung Tizen 4.0 & Web Fallbacks
 */
export const RemoteKeys = {
  // D-pad Navigation Keys (Mandatory - Do NOT register via tizen API)
  ARROW_LEFT: 37,
  ARROW_UP: 38,
  ARROW_RIGHT: 39,
  ARROW_DOWN: 40,
  ENTER: 13,

  // Return / Back Keys (Mandatory - Do NOT register via tizen API)
  RETURN: 10009,   // Physical Samsung Smart TV Return button
  ESCAPE: 27,      // Desktop testing fallback
  BACKSPACE: 8,    // Desktop testing fallback

  // Media Playback Keys (Registrable via tizen.tvinputdevice.registerKey)
  MEDIA_PLAY: 415,
  MEDIA_PAUSE: 19,
  MEDIA_PLAY_PAUSE: 10252,
  MEDIA_STOP: 413,
  MEDIA_FAST_FORWARD: 417,
  MEDIA_REWIND: 412,
  MEDIA_TRACK_NEXT: 10233,
  MEDIA_TRACK_PREVIOUS: 10232,

  // Color Shortcut Keys (Registrable)
  COLOR_RED: 403,
  COLOR_GREEN: 404,
  COLOR_YELLOW: 405,
  COLOR_BLUE: 406
} as const;

export type RemoteKeyCode = typeof RemoteKeys[keyof typeof RemoteKeys];

declare global {
  interface Window {
    tizen?: {
      tvinputdevice?: {
        registerKey(keyName: string): void;
        unregisterKey(keyName: string): void;
      };
      application?: {
        getCurrentApplication(): {
          exit(): void;
        };
      };
    };
  }
}

export const REGISTRABLE_TIZEN_KEYS = [
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

export function registerTizenRemoteKeys(): { registered: string[]; isTizen: boolean } {
  const registered: string[] = [];
  const isTizen = typeof window !== 'undefined' && typeof window.tizen !== 'undefined' && Boolean(window.tizen.tvinputdevice);

  if (isTizen && window.tizen && window.tizen.tvinputdevice) {
    for (let i = 0; i < REGISTRABLE_TIZEN_KEYS.length; i++) {
      const keyName = REGISTRABLE_TIZEN_KEYS[i];
      try {
        window.tizen.tvinputdevice.registerKey(keyName);
        registered.push(keyName);
      } catch (e) {
        console.warn('[Tizen Keys] Could not register ' + keyName + ':', e);
      }
    }
  }

  return { registered, isTizen };
}
