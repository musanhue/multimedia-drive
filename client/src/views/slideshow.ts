export interface PhotoItem {
  id: string;
  name: string;
  thumbnailLink: string;
  fullUrl?: string;
}

export class PhotoSlideshowController {
  private photos: PhotoItem[] = [];
  public activeIndex: number = 0;
  public autoAdvance: boolean = true;
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

    var view = document.getElementById('slideshow-container');
    if (!view) return;
    view.style.display = 'block';
    view.classList.remove('hidden');

    this.renderSlideshowDom(view);

    this.imgA = document.getElementById('slideImgA') as HTMLImageElement;
    this.imgB = document.getElementById('slideImgB') as HTMLImageElement;
    this.hudEl = document.getElementById('slideshowHud')!;

    this.activeBuffer = 'A';
    if (this.photos[this.activeIndex]) {
      this.imgA.src = this.getPhotoUrl(this.photos[this.activeIndex]);
    }
    this.imgA.style.opacity = '1';
    this.imgB.style.opacity = '0';

    this.updateHud();
    this.startAutoAdvance();
  }

  private renderSlideshowDom(container: HTMLElement): void {
    container.innerHTML =
      '<div id="slideshowView" class="tv-view slideshow-view" data-layer="slideshow">' +
        '<img id="slideImgA" class="slide-img" src="" style="opacity: 1; transform: translate3d(0,0,0);" />' +
        '<img id="slideImgB" class="slide-img" src="" style="opacity: 0; transform: translate3d(0,0,0);" />' +
        '<div id="slideshowHud" class="slideshow-hud">' +
          '<div class="slideshow-hud-top">' +
            '<h2 id="slideshowPhotoName" class="photo-name">Foto</h2>' +
            '<div class="slideshow-hud-meta">' +
              '<span id="slideshowCounter" class="photo-counter">[ 1 / 10 ]</span>' +
              '<span id="slideshowStatusBadge" class="photo-badge">▶ Reproduciendo</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  public handleKey(keyCode: number): boolean {
    switch (keyCode) {
      case 39: // ArrowRight
        this.advancePhoto(1);
        return true;

      case 37: // ArrowLeft
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
      case 8:     // Backspace
        this.close();
        return true;

      default:
        return false;
    }
  }

  public advancePhoto(delta: number): void {
    if (this.photos.length === 0) return;

    var newIndex = Math.max(0, Math.min(this.photos.length - 1, this.activeIndex + delta));
    if (newIndex === this.activeIndex) return;

    this.activeIndex = newIndex;
    this.renderActivePhoto();
    this.updateHud();

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
    var self = this;
    this.autoAdvanceTimer = setInterval(function () {
      if (self.activeIndex < self.photos.length - 1) {
        self.advancePhoto(1);
      } else {
        self.activeIndex = 0;
        self.renderActivePhoto();
        self.updateHud();
      }
    }, 5000);
  }

  private stopAutoAdvance(): void {
    if (this.autoAdvanceTimer) {
      clearInterval(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private renderActivePhoto(): void {
    var photo = this.photos[this.activeIndex];
    if (!photo) return;
    var url = this.getPhotoUrl(photo);

    var incoming = this.activeBuffer === 'A' ? this.imgB : this.imgA;
    var outgoing = this.activeBuffer === 'A' ? this.imgA : this.imgB;

    var self = this;
    incoming.onload = function () {
      incoming.style.opacity = '1';
      outgoing.style.opacity = '0';
      self.activeBuffer = self.activeBuffer === 'A' ? 'B' : 'A';
    };
    incoming.src = url;
  }

  private getPhotoUrl(photo: PhotoItem): string {
    if (photo.fullUrl) return photo.fullUrl;
    if (photo.thumbnailLink) {
      return photo.thumbnailLink.replace(/=s\d+/, '=s1920');
    }
    return '';
  }

  private updateHud(): void {
    var current = this.photos[this.activeIndex];
    var nameEl = document.getElementById('slideshowPhotoName');
    if (nameEl && current) {
      nameEl.textContent = current.name;
    }

    var countEl = document.getElementById('slideshowCounter');
    if (countEl) {
      countEl.textContent = '[ ' + (this.activeIndex + 1) + ' / ' + this.photos.length + ' ]';
    }

    var badgeEl = document.getElementById('slideshowStatusBadge');
    if (badgeEl) {
      badgeEl.textContent = this.autoAdvance ? '▶ Reproduciendo' : '⏸ Pausado';
    }
  }

  public close(): void {
    this.stopAutoAdvance();
    if (this.imgA) {
      this.imgA.onload = null;
      this.imgA.src = '';
    }
    if (this.imgB) {
      this.imgB.onload = null;
      this.imgB.src = '';
    }

    var view = document.getElementById('slideshow-container');
    if (view) {
      view.style.display = 'none';
      view.classList.add('hidden');
    }

    if (this.onExitCallback) {
      this.onExitCallback();
    }
  }
}

export var photoSlideshowController = new PhotoSlideshowController();
