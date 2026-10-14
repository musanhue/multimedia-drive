export interface AudioTrackItem {
  id: string;
  name: string;
  title?: string;
  artist?: string;
  album?: string;
  thumbnailLink?: string;
  durationMillis?: number;
}

export class AudioPlayerViewController {
  public audioEl!: HTMLAudioElement;
  private playlist: AudioTrackItem[] = [];
  public currentTrackIndex: number = 0;
  public isPlaying: boolean = false;
  public focusedButtonIndex: number = 1; // 0: Prev, 1: Play/Pause, 2: Next
  private buttons: HTMLElement[] = [];
  private onExitCallback: (() => void) | null = null;

  public open(initialTrack: AudioTrackItem, playlist: AudioTrackItem[], initialIndex: number, onExit: () => void): void {
    this.playlist = playlist && playlist.length > 0 ? playlist : [initialTrack];
    this.currentTrackIndex = Math.max(0, Math.min(this.playlist.length - 1, initialIndex));
    this.onExitCallback = onExit;

    var view = document.getElementById('audio-container');
    if (!view) return;
    view.style.display = 'block';
    view.classList.remove('hidden');

    this.renderAudioDom(view);

    this.audioEl = document.getElementById('tvAudioElement') as HTMLAudioElement;

    this.buttons = [
      document.getElementById('btnAudioPrev')!,
      document.getElementById('btnAudioPlayPause')!,
      document.getElementById('btnAudioNext')!
    ];
    this.setButtonFocus(1);

    this.attachAudioEvents();
    this.renderPlaylistQueue();
    this.loadCurrentTrack(true);
  }

  private renderAudioDom(container: HTMLElement): void {
    container.innerHTML =
      '<div id="audioPlayerView" class="tv-view audio-view" data-layer="audio">' +
        '<audio id="tvAudioElement" preload="auto"></audio>' +
        '<div class="audio-layout-container">' +
          '<div class="audio-left-panel">' +
            '<div class="audio-artwork-container">' +
              '<img id="audioAlbumCover" class="audio-cover-img" src="" alt="Album Art" />' +
              '<div id="audioVinylFallback" class="audio-vinyl-fallback" style="display: none;">' +
                '<svg class="vinyl-svg" viewBox="0 0 200 200">' +
                  '<circle cx="100" cy="100" r="95" fill="#181b22" stroke="#2a2e3d" stroke-width="4" />' +
                  '<circle cx="100" cy="100" r="80" fill="none" stroke="#252936" stroke-width="2" />' +
                  '<circle cx="100" cy="100" r="65" fill="none" stroke="#252936" stroke-width="2" />' +
                  '<circle cx="100" cy="100" r="50" fill="none" stroke="#252936" stroke-width="2" />' +
                  '<circle cx="100" cy="100" r="35" fill="#00a8ff" />' +
                  '<circle cx="100" cy="100" r="8" fill="#ffffff" />' +
                '</svg>' +
              '</div>' +
            '</div>' +
            '<div class="audio-meta-details">' +
              '<h1 id="audioTrackTitle" class="audio-track-title">Título de la Canción</h1>' +
              '<h2 id="audioArtistAlbum" class="audio-artist-album">Artista • Álbum</h2>' +
            '</div>' +
            '<div class="audio-scrubber-section">' +
              '<span id="audioTimeCurrent" class="audio-time-label">00:00</span>' +
              '<div id="audioScrubberTrack" class="audio-scrubber-track">' +
                '<div id="audioProgressBar" class="audio-progress-bar" style="width: 0%;"></div>' +
              '</div>' +
              '<span id="audioTimeDuration" class="audio-time-label">00:00</span>' +
            '</div>' +
            '<div class="audio-transport-buttons">' +
              '<button id="btnAudioPrev" class="audio-ctrl-btn" data-nav-id="btn_prev">' +
                '<span class="ctrl-icon">⏮</span> Anterior' +
              '</button>' +
              '<button id="btnAudioPlayPause" class="audio-ctrl-btn is-focused" data-nav-id="btn_play">' +
                '<span id="audioPlayPauseIcon" class="ctrl-icon">⏸</span> Pausa' +
              '</button>' +
              '<button id="btnAudioNext" class="audio-ctrl-btn" data-nav-id="btn_next">' +
                '<span class="ctrl-icon">⏭</span> Siguiente' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="audio-right-panel">' +
            '<div class="audio-queue-header">' +
              '<h2 class="audio-queue-title">Cola de Reproducción</h2>' +
              '<span id="audioQueueCount" class="audio-queue-count">(0 pistas)</span>' +
            '</div>' +
            '<div class="audio-queue-viewport">' +
              '<div id="audioQueueList" class="audio-queue-list" style="transform: translate3d(0, 0px, 0);">' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  private attachAudioEvents(): void {
    var self = this;
    this.audioEl.addEventListener('timeupdate', function () {
      self.updateScrubber();
    });
    this.audioEl.addEventListener('play', function () {
      self.isPlaying = true;
      self.updatePlayPauseUI(true);
    });
    this.audioEl.addEventListener('pause', function () {
      self.isPlaying = false;
      self.updatePlayPauseUI(false);
    });
    this.audioEl.addEventListener('ended', function () {
      self.playNextTrack(true);
    });
  }

  private loadCurrentTrack(autoPlay: boolean): void {
    var track = this.playlist[this.currentTrackIndex];
    if (!track) return;

    var titleEl = document.getElementById('audioTrackTitle');
    if (titleEl) titleEl.textContent = track.title || track.name;

    var artistEl = document.getElementById('audioArtistAlbum');
    if (artistEl) {
      var artist = track.artist || 'Música';
      var album = track.album || '';
      artistEl.textContent = album ? artist + ' • ' + album : artist;
    }

    var coverImg = document.getElementById('audioAlbumCover') as HTMLImageElement;
    var vinyl = document.getElementById('audioVinylFallback');
    if (track.thumbnailLink) {
      if (coverImg) {
        coverImg.src = track.thumbnailLink;
        coverImg.style.display = 'block';
        coverImg.onerror = function () {
          coverImg.style.display = 'none';
          if (vinyl) vinyl.style.display = 'flex';
        };
      }
      if (vinyl) vinyl.style.display = 'none';
    } else {
      if (coverImg) coverImg.style.display = 'none';
      if (vinyl) vinyl.style.display = 'flex';
    }

    this.audioEl.src = '/api/stream/' + encodeURIComponent(track.id);
    this.audioEl.load();

    if (autoPlay) {
      this.audioEl.play().catch(function () {});
    }

    this.updateQueueActiveItem();
  }

  private renderPlaylistQueue(): void {
    var listEl = document.getElementById('audioQueueList');
    var countEl = document.getElementById('audioQueueCount');
    if (countEl) countEl.textContent = '(' + this.playlist.length + ' pistas)';
    if (!listEl) return;

    listEl.innerHTML = '';
    var self = this;

    for (var i = 0; i < this.playlist.length; i++) {
      var track = this.playlist[i];
      var itemDiv = document.createElement('div');
      itemDiv.className = 'queue-track-item' + (i === this.currentTrackIndex ? ' is-playing' : '');
      itemDiv.id = 'queue_item_' + i;
      itemDiv.setAttribute('data-track-idx', String(i));

      var trackNum = i + 1;
      var trackName = track.title || track.name;
      var trackArtist = track.artist ? ' - ' + track.artist : '';

      itemDiv.innerHTML =
        '<span style="min-width: 32px; font-weight: 700; color: #a0a5b5;">' + trackNum + '.</span>' +
        '<span style="flex: 1; font-size: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + trackName + trackArtist + '</span>';

      (function (idx: number) {
        itemDiv.addEventListener('click', function () {
          self.currentTrackIndex = idx;
          self.loadCurrentTrack(true);
        });
      })(i);

      listEl.appendChild(itemDiv);
    }
  }

  private updateQueueActiveItem(): void {
    var items = document.querySelectorAll('.queue-track-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('is-playing');
    }
    var activeItem = document.getElementById('queue_item_' + this.currentTrackIndex);
    if (activeItem) {
      activeItem.classList.add('is-playing');
    }

    var listEl = document.getElementById('audioQueueList');
    if (listEl) {
      var offset = Math.max(0, (this.currentTrackIndex - 4) * 60);
      listEl.style.transform = 'translate3d(0, -' + offset + 'px, 0)';
    }
  }

  private updateScrubber(): void {
    var cur = this.audioEl.currentTime || 0;
    var dur = this.audioEl.duration || 0;

    var curEl = document.getElementById('audioTimeCurrent');
    if (curEl) curEl.textContent = this.formatAudioTime(cur);

    var durEl = document.getElementById('audioTimeDuration');
    if (durEl) durEl.textContent = this.formatAudioTime(dur);

    var pct = dur > 0 ? (cur / dur) * 100 : 0;
    var progEl = document.getElementById('audioProgressBar');
    if (progEl) progEl.style.width = pct + '%';
  }

  public formatAudioTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    var s = Math.floor(seconds);
    var m = Math.floor(s / 60);
    var rem = s % 60;
    var pad = function (n: number) { return n < 10 ? '0' + n : String(n); };
    return pad(m) + ':' + pad(rem);
  }

  private updatePlayPauseUI(isPlaying: boolean): void {
    var btn = document.getElementById('btnAudioPlayPause');
    if (btn) {
      if (isPlaying) {
        btn.innerHTML = '<span id="audioPlayPauseIcon" class="ctrl-icon">⏸</span> Pausa';
      } else {
        btn.innerHTML = '<span id="audioPlayPauseIcon" class="ctrl-icon">▶</span> Reproducir';
      }
    }
  }

  private setButtonFocus(idx: number): void {
    this.focusedButtonIndex = Math.max(0, Math.min(this.buttons.length - 1, idx));
    for (var i = 0; i < this.buttons.length; i++) {
      if (this.buttons[i]) this.buttons[i].classList.remove('is-focused');
    }
    if (this.buttons[this.focusedButtonIndex]) {
      this.buttons[this.focusedButtonIndex].classList.add('is-focused');
      this.buttons[this.focusedButtonIndex].focus();
    }
  }

  public handleKey(keyCode: number): boolean {
    switch (keyCode) {
      case 13: // Enter
        return this.handleEnter();

      case 10252: // MediaPlayPause
      case 415:   // MediaPlay
      case 19:    // MediaPause
        this.togglePlayPause();
        return true;

      case 10233: // MediaTrackNext
        this.playNextTrack(true);
        return true;

      case 10232: // MediaTrackPrevious
        this.playPrevTrack(true);
        return true;

      case 37: // ArrowLeft
        if (this.focusedButtonIndex > 0) {
          this.setButtonFocus(this.focusedButtonIndex - 1);
        }
        return true;

      case 39: // ArrowRight
        if (this.focusedButtonIndex < this.buttons.length - 1) {
          this.setButtonFocus(this.focusedButtonIndex + 1);
        }
        return true;

      case 10009: // Return
      case 27:    // Escape
      case 413:   // MediaStop
        this.close();
        return true;

      default:
        return false;
    }
  }

  private handleEnter(): boolean {
    if (this.focusedButtonIndex === 0) {
      this.playPrevTrack(true);
    } else if (this.focusedButtonIndex === 1) {
      this.togglePlayPause();
    } else if (this.focusedButtonIndex === 2) {
      this.playNextTrack(true);
    }
    return true;
  }

  public togglePlayPause(): void {
    if (this.audioEl.paused) {
      this.audioEl.play();
      this.isPlaying = true;
    } else {
      this.audioEl.pause();
      this.isPlaying = false;
    }
  }

  public playNextTrack(autoPlay: boolean = true): void {
    if (this.playlist.length === 0) return;
    if (this.currentTrackIndex < this.playlist.length - 1) {
      this.currentTrackIndex++;
      this.loadCurrentTrack(autoPlay);
    }
  }

  public playPrevTrack(autoPlay: boolean = true): void {
    if (this.playlist.length === 0) return;
    if (this.currentTrackIndex > 0) {
      this.currentTrackIndex--;
      this.loadCurrentTrack(autoPlay);
    }
  }

  public close(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
      this.audioEl.load();
    }
    this.isPlaying = false;

    var view = document.getElementById('audio-container');
    if (view) {
      view.style.display = 'none';
      view.classList.add('hidden');
    }

    if (this.onExitCallback) {
      this.onExitCallback();
    }
  }
}

export var audioPlayerController = new AudioPlayerViewController();
