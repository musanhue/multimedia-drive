/**
 * Fullscreen API helper supporting standard HTML5, WebKit (Tizen 4.0 / Chromium 56),
 * Gecko, and MS vendor prefixes.
 */

export function isAppFullscreen(): boolean {
  var doc: any = document;
  return Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

export function toggleAppFullscreen(): Promise<void> {
  var doc: any = document;
  var docEl: any = document.documentElement;

  if (!isAppFullscreen()) {
    if (docEl.requestFullscreen) {
      return docEl.requestFullscreen().catch(function () {});
    } else if (docEl.webkitRequestFullscreen) {
      docEl.webkitRequestFullscreen();
    } else if (docEl.mozRequestFullScreen) {
      docEl.mozRequestFullScreen();
    } else if (docEl.msRequestFullscreen) {
      docEl.msRequestFullscreen();
    }
  } else {
    if (doc.exitFullscreen) {
      return doc.exitFullscreen().catch(function () {});
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen();
    }
  }
  return Promise.resolve();
}

export function onFullscreenChange(callback: (isFullscreen: boolean) => void): () => void {
  var handler = function () {
    callback(isAppFullscreen());
  };
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  document.addEventListener('mozfullscreenchange', handler);
  document.addEventListener('MSFullscreenChange', handler);

  return function () {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
    document.removeEventListener('mozfullscreenchange', handler);
    document.removeEventListener('MSFullscreenChange', handler);
  };
}
