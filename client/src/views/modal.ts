import type { DriveMediaItem } from '../types';

export class MovieDetailModal {
  private overlayEl: HTMLElement | null = null;
  private currentItem: DriveMediaItem | null = null;
  private invokingElement: HTMLElement | null = null;
  private onPlayCallback: ((item: DriveMediaItem) => void) | null = null;
  private currentButtonIndex: number = 0; // 0: Play, 1: Close
  private buttons: HTMLElement[] = [];

  constructor() {
    this.createDom();
  }

  private createDom(): void {
    if (typeof document === 'undefined') return;

    var existing = document.getElementById('movie-detail-modal');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'movie-detail-modal';
    overlay.setAttribute('data-layer', 'modal');
    overlay.style.display = 'none';

    overlay.innerHTML =
      '<div class="modal-backdrop-layer" id="modal-backdrop-layer"></div>' +
      '<div class="modal-gradient-layer"></div>' +
      '<div class="modal-content-container">' +
        '<!-- Left Column: High-Res Poster -->' +
        '<div class="modal-poster-col">' +
          '<div class="modal-poster-frame">' +
            '<img class="modal-poster-img" id="modal-poster-img" src="" alt="Cartelera" />' +
          '</div>' +
        '</div>' +
        '<!-- Right Column: Metadata & Controls -->' +
        '<div class="modal-details-col">' +
          '<h1 class="modal-title" id="modal-title">Título</h1>' +
          '<div class="modal-meta-row">' +
            '<span class="meta-pill meta-year" id="modal-year">----</span>' +
            '<span class="meta-pill meta-runtime" id="modal-runtime">-- min</span>' +
            '<span class="meta-pill meta-rating" id="modal-rating">★ --</span>' +
            '<span class="meta-genres" id="modal-genres"></span>' +
          '</div>' +
          '<div class="modal-synopsis-box">' +
            '<p class="modal-synopsis" id="modal-synopsis">Sinopsis no disponible.</p>' +
          '</div>' +
          '<div class="modal-credits-box">' +
            '<p class="credit-line"><strong class="credit-label">Director:</strong> <span id="modal-director">Desconocido</span></p>' +
            '<p class="credit-line"><strong class="credit-label">Reparto:</strong> <span id="modal-cast">Desconocido</span></p>' +
          '</div>' +
          '<div class="modal-actions-row">' +
            '<button class="btn-modal btn-play nav-item" id="btn_play">' +
              '<span class="btn-icon">▶</span>' +
              '<span class="btn-text">Reproducir</span>' +
            '</button>' +
            '<button class="btn-modal btn-close nav-item" id="btn_close">' +
              '<span class="btn-icon">✕</span>' +
              '<span class="btn-text">Volver</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    var btnPlay = document.getElementById('btn_play')!;
    var btnClose = document.getElementById('btn_close')!;
    this.buttons = [btnPlay, btnClose];

    var self = this;
    if (btnPlay) {
      btnPlay.addEventListener('click', function () { self.handlePlay(); });
    }
    if (btnClose) {
      btnClose.addEventListener('click', function () { self.close(); });
    }
  }

  public open(item: DriveMediaItem, invokingEl: HTMLElement, onPlay: (item: DriveMediaItem) => void): void {
    this.currentItem = item;
    this.invokingElement = invokingEl;
    this.onPlayCallback = onPlay;
    this.currentButtonIndex = 0; // Default focus on [ Reproducir ]

    if (!this.overlayEl) this.createDom();

    // Backdrop with fallback
    var backdropEl = document.getElementById('modal-backdrop-layer');
    if (backdropEl) {
      if (item.backdropUrl) {
        backdropEl.style.backgroundImage = 'url("' + item.backdropUrl + '")';
        backdropEl.style.opacity = '1';
      } else {
        backdropEl.style.backgroundImage = 'none';
        backdropEl.style.opacity = '0';
      }
    }

    // Poster with fallback
    var posterImg = document.getElementById('modal-poster-img') as HTMLImageElement;
    if (posterImg) {
      var fallbackSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480"><rect fill="%23181b22" width="320" height="480"/><text fill="%23666" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20">Sin Cartel</text></svg>';
      posterImg.src = item.posterUrl || item.thumbnailLink || fallbackSvg;
      posterImg.onerror = function () { posterImg.src = fallbackSvg; };
    }

    // Title
    var titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = item.cleanTitle || item.name;

    // Meta: Year
    var yearEl = document.getElementById('modal-year');
    if (yearEl) yearEl.textContent = item.year ? String(item.year) : 'Año n/d';

    // Meta: Runtime
    var runtimeEl = document.getElementById('modal-runtime');
    if (runtimeEl) {
      var runtimeStr = item.runtime;
      if (!runtimeStr && item.durationMillis) {
        var mins = Math.floor(item.durationMillis / 60000);
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        runtimeStr = h > 0 ? h + 'h ' + (m < 10 ? '0' : '') + m + 'm' : m + 'm';
      }
      runtimeEl.textContent = runtimeStr || 'Duración n/d';
    }

    // Meta: Rating
    var ratingEl = document.getElementById('modal-rating');
    if (ratingEl) {
      var r = item.rating;
      ratingEl.textContent = (typeof r === 'number' && !isNaN(r) && r > 0) ? '★ ' + r.toFixed(1) : '★ --';
    }

    // Meta: Genres
    var genresEl = document.getElementById('modal-genres');
    if (genresEl) {
      var g = item.genres;
      genresEl.textContent = (Array.isArray(g) && g.length > 0) ? g.slice(0, 3).join(' • ') : '';
    }

    // Synopsis
    var synopsisEl = document.getElementById('modal-synopsis');
    if (synopsisEl) {
      synopsisEl.textContent = item.overview || 'Sinopsis no disponible en TMDB.';
    }

    // Director
    var directorEl = document.getElementById('modal-director');
    if (directorEl) {
      directorEl.textContent = item.director || 'Desconocido';
    }

    // Cast
    var castEl = document.getElementById('modal-cast');
    if (castEl) {
      var castList = item.cast;
      castEl.textContent = (Array.isArray(castList) && castList.length > 0)
        ? castList.slice(0, 5).join(', ')
        : 'Desconocido';
    }

    // Show modal & set focus
    if (this.overlayEl) {
      this.overlayEl.style.display = 'flex';
    }
    this.updateButtonFocus();
  }

  public handleKey(keyCode: number): boolean {
    switch (keyCode) {
      case 37: // ArrowLeft
        if (this.currentButtonIndex > 0) {
          this.currentButtonIndex--;
          this.updateButtonFocus();
        }
        return true;

      case 39: // ArrowRight
        if (this.currentButtonIndex < this.buttons.length - 1) {
          this.currentButtonIndex++;
          this.updateButtonFocus();
        }
        return true;

      case 38: // ArrowUp
      case 40: // ArrowDown
        // Trapped within modal!
        return true;

      case 13: // Enter
        if (this.currentButtonIndex === 0) {
          this.handlePlay();
        } else {
          this.close();
        }
        return true;

      case 10009: // Return
      case 27:    // Escape
      case 8:     // Backspace
        this.close();
        return true;

      default:
        return false;
    }
  }

  private updateButtonFocus(): void {
    for (var i = 0; i < this.buttons.length; i++) {
      this.buttons[i].classList.remove('is-focused');
    }
    var target = this.buttons[this.currentButtonIndex];
    if (target) {
      target.classList.add('is-focused');
      target.focus();
    }
  }

  private handlePlay(): void {
    if (this.currentItem && this.onPlayCallback) {
      this.close(true);
      this.onPlayCallback(this.currentItem);
    }
  }

  public close(isLaunchingPlayer: boolean = false): void {
    if (this.overlayEl) {
      this.overlayEl.style.display = 'none';
    }

    if (!isLaunchingPlayer && this.invokingElement) {
      this.invokingElement.classList.add('is-focused');
      this.invokingElement.focus();
    }
  }

  public isOpen(): boolean {
    return this.overlayEl ? this.overlayEl.style.display !== 'none' : false;
  }
}

export var movieDetailModal = new MovieDetailModal();
