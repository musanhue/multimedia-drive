import { apiClient } from '../api/client';
import { toggleAppFullscreen, onFullscreenChange, isAppFullscreen } from '../navigation/fullscreen';

export interface SubtitleTrackInfo {
  id: string;
  name: string;
  lang: string;
  label: string;
}

export interface AudioTrackInfo {
  id: string;
  index: number;
  label: string;
  lang: string;
  codec: string;
  isDolby?: boolean;
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
      var res = await fetch((apiClient.baseUrl || '') + '/api/subtitles/list/' + encodeURIComponent(fileId));
      if (res.ok) {
        var data = await res.json();
        this.availableTracks = Array.isArray(data.subtitles) ? data.subtitles : [];
      } else {
        this.availableTracks = [];
      }
    } catch {
      this.availableTracks = [];
    }

    var esTrack: SubtitleTrackInfo | null = null;
    for (var i = 0; i < this.availableTracks.length; i++) {
      var t = this.availableTracks[i];
      if (
        (t.lang && t.lang.toLowerCase() === 'es') ||
        (t.label && t.label.toLowerCase().indexOf('español') !== -1) ||
        (t.label && t.label.toLowerCase().indexOf('spanish') !== -1)
      ) {
        esTrack = t;
        break;
      }
    }

    if (esTrack) {
      this.selectTrack(esTrack.id);
    } else {
      this.selectTrack('off');
    }

    return this.availableTracks;
  }

  public selectTrack(trackId: string): void {
    this.activeTrackId = trackId;

    if (this.videoEl.textTracks) {
      for (var i = 0; i < this.videoEl.textTracks.length; i++) {
        this.videoEl.textTracks[i].mode = 'disabled';
      }
    }

    if (trackId === 'off') {
      return;
    }

    var trackInfo: SubtitleTrackInfo | null = null;
    for (var j = 0; j < this.availableTracks.length; j++) {
      if (this.availableTracks[j].id === trackId) {
        trackInfo = this.availableTracks[j];
        break;
      }
    }
    if (!trackInfo) return;

    var trackEl = this.videoEl.querySelector('track[data-track-id="' + trackId + '"]') as HTMLTrackElement;
    if (!trackEl) {
      trackEl = document.createElement('track');
      trackEl.kind = 'subtitles';
      trackEl.label = trackInfo.label;
      trackEl.srclang = trackInfo.lang;
      trackEl.src = apiClient.getSubtitlesUrl(trackInfo.id);
      trackEl.setAttribute('data-track-id', trackInfo.id);
      this.videoEl.appendChild(trackEl);
    }

    var self = this;
    if (trackEl.track) {
      trackEl.track.mode = 'showing';
    } else {
      trackEl.addEventListener('load', function () {
        if (trackEl.track && self.activeTrackId === trackId) {
          trackEl.track.mode = 'showing';
        }
      });
    }
  }

  public getActiveTrackId(): string {
    return this.activeTrackId;
  }

  public getActiveTrackLabel(): string {
    if (this.activeTrackId === 'off') return 'Desactivado';
    for (var i = 0; i < this.availableTracks.length; i++) {
      if (this.availableTracks[i].id === this.activeTrackId) {
        return this.availableTracks[i].label;
      }
    }
    return 'Desactivado';
  }

  public getTracks(): SubtitleTrackInfo[] {
    return this.availableTracks;
  }

  public clearTracks(): void {
    var existing = this.videoEl.querySelectorAll('track');
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].parentNode) {
        existing[i].parentNode!.removeChild(existing[i]);
      }
    }
    if (this.videoEl.textTracks) {
      for (var j = 0; j < this.videoEl.textTracks.length; j++) {
        this.videoEl.textTracks[j].mode = 'disabled';
      }
    }
    this.availableTracks = [];
    this.activeTrackId = 'off';
  }
}

export class AudioTrackManager {
  private videoEl: HTMLVideoElement;
  private availableTracks: AudioTrackInfo[] = [];
  private activeTrackIndex: number = 0;

  constructor(videoElement: HTMLVideoElement) {
    this.videoEl = videoElement;
  }

  public async loadTracks(fileId: string): Promise<AudioTrackInfo[]> {
    this.availableTracks = [];
    this.activeTrackIndex = 0;

    var serverTracks: AudioTrackInfo[] = [];
    try {
      serverTracks = await apiClient.getAudioTracks(fileId);
    } catch {
      serverTracks = [];
    }

    // Check if HTML5 AudioTrackList exists (Samsung Tizen / Safari / modern browsers)
    var nativeTracks = (this.videoEl as any).audioTracks;
    if (nativeTracks && nativeTracks.length > 0) {
      var list: AudioTrackInfo[] = [];
      for (var i = 0; i < nativeTracks.length; i++) {
        var nt = nativeTracks[i];
        var sInfo = serverTracks[i] || null;
        var lbl = nt.label || (sInfo ? sInfo.label : ('Pista ' + (i + 1)));
        var lang = nt.language || (sInfo ? sInfo.lang : 'und');
        list.push({
          id: 'native_' + i,
          index: i,
          label: lbl,
          lang: lang,
          codec: sInfo ? sInfo.codec : '',
          isDolby: sInfo ? sInfo.isDolby : false
        });
      }
      this.availableTracks = list;
    } else if (serverTracks && serverTracks.length > 0) {
      this.availableTracks = serverTracks;
    } else {
      this.availableTracks = [
        {
          id: 'audio_0',
          index: 0,
          label: 'Audio Principal (Predeterminado)',
          lang: 'und',
          codec: 'Estéreo',
          isDolby: false
        }
      ];
    }

    // Default to track 0
    this.selectTrack(0);
    return this.availableTracks;
  }

  public selectTrack(index: number): void {
    if (index < 0 || index >= this.availableTracks.length) return;
    this.activeTrackIndex = index;

    var nativeTracks = (this.videoEl as any).audioTracks;
    if (nativeTracks && nativeTracks.length > 0) {
      for (var i = 0; i < nativeTracks.length; i++) {
        nativeTracks[i].enabled = (i === index);
      }
    }
  }

  public getActiveTrackIndex(): number {
    return this.activeTrackIndex;
  }

  public getActiveTrackLabel(): string {
    var t = this.availableTracks[this.activeTrackIndex];
    if (!t) return 'Predeterminado';
    return t.label;
  }

  public getTracks(): AudioTrackInfo[] {
    return this.availableTracks;
  }
}

export class VideoPlayerViewController {
  public videoEl!: HTMLVideoElement;
  public overlayEl!: HTMLElement;
  private autoHideTimer: any = null;
  public subtitleManager!: SubtitleTrackManager;
  public audioManager!: AudioTrackManager;
  public currentTitle: string = '';
  public currentFileId: string = '';
  private lastKnownGoodTime: number = 0;
  private stallWatchdogTimer: any = null;
  private isRecovering: boolean = false;
  public subtitleModalOpen: boolean = false;
  public audioModalOpen: boolean = false;
  public focusedButtonIndex: number = 2; // 0: Back, 1: Rewind, 2: Play/Pause, 3: Forward, 4: Subtitles, 5: Audio, 6: Fullscreen
  private buttons: HTMLElement[] = [];
  private onExitCallback: (() => void) | null = null;
  private subtitleModalFocusIdx: number = 0;
  private audioModalFocusIdx: number = 0;
  private boundMouseMove: any = null;
  private unbindFsChange: (() => void) | null = null;

  public open(fileId: string, title: string, category: string, onExit: () => void): void {
    this.onExitCallback = onExit;
    this.currentTitle = title;
    this.currentFileId = fileId;
    this.lastKnownGoodTime = 0;
    this.isRecovering = false;
    this.clearStallWatchdog();

    var view = document.getElementById('player-container');
    if (!view) return;
    view.style.display = 'block';
    view.classList.remove('hidden');

    this.renderPlayerDom(view);

    this.videoEl = document.getElementById('tvVideoPlayer') as HTMLVideoElement;
    this.overlayEl = document.getElementById('playerControlsOverlay')!;

    var titleEl = document.getElementById('playerMediaTitle');
    if (titleEl) titleEl.textContent = title;

    var badgeEl = document.getElementById('playerCategoryBadge');
    if (badgeEl) badgeEl.textContent = category;

    this.buttons = [
      document.getElementById('btnPlayerBack')!,
      document.getElementById('btnPlayerRewind')!,
      document.getElementById('btnPlayerPlayPause')!,
      document.getElementById('btnPlayerForward')!,
      document.getElementById('btnPlayerSubtitles')!,
      document.getElementById('btnPlayerAudio')!,
      document.getElementById('btnPlayerFullscreen')!
    ];
    this.setButtonFocus(2); // Focus Play/Pause by default

    this.subtitleManager = new SubtitleTrackManager(this.videoEl);
    this.audioManager = new AudioTrackManager(this.videoEl);

    var self = this;
    this.updateFullscreenButtonLabel(isAppFullscreen());
    this.unbindFsChange = onFullscreenChange(function (isFs) {
      self.updateFullscreenButtonLabel(isFs);
    });

    this.subtitleManager.loadTracks(fileId).then(function () {
      self.updateSubtitleButtonLabel();
    });

    this.audioManager.loadTracks(fileId).then(function () {
      self.updateAudioButtonLabel();
    });

    this.videoEl.crossOrigin = 'anonymous';
    this.videoEl.src = apiClient.getStreamUrl(fileId);
    this.videoEl.load();
    this.videoEl.play().catch(function () {});

    this.attachVideoEvents();
    this.attachMouseEvents();
    this.showControls();
  }

  private renderPlayerDom(container: HTMLElement): void {
    container.innerHTML =
      '<div id="videoPlayerView" class="tv-view player-view" data-layer="player">' +
        '<video id="tvVideoPlayer" class="video-element" crossorigin="anonymous" playsinline preload="auto"></video>' +
        '<div id="playerControlsOverlay" class="player-controls-overlay">' +
          '<div class="player-top-bar">' +
            '<div class="player-top-left">' +
              '<button id="btnPlayerBack" class="player-ctrl-btn player-back-btn" data-nav-id="btn_back" title="Volver al catálogo">' +
                '<span class="ctrl-icon">✕</span> Volver al Catálogo' +
              '</button>' +
              '<h1 id="playerMediaTitle" class="player-title">Título del Video</h1>' +
              '<span id="playerCategoryBadge" class="player-badge">Películas</span>' +
            '</div>' +
            '<div class="player-top-right">' +
              '<span id="playerLiveClock" class="player-clock">00:00</span>' +
            '</div>' +
          '</div>' +
          '<div class="player-bottom-bar">' +
            '<div class="player-scrubber-container">' +
              '<span id="playerTimeCurrent" class="player-time-label">00:00:00</span>' +
              '<div id="playerScrubberTrack" class="player-scrubber-track" title="Haz clic para avanzar o retroceder">' +
                '<div id="playerBufferBar" class="player-buffer-bar" style="width: 0%;"></div>' +
                '<div id="playerProgressBar" class="player-progress-bar" style="width: 0%;"></div>' +
                '<div id="playerPlayheadThumb" class="player-playhead-thumb" style="transform: translate3d(0px, 0, 0);"></div>' +
              '</div>' +
              '<span id="playerTimeDuration" class="player-time-label">00:00:00</span>' +
            '</div>' +
            '<div class="player-actions-row">' +
              '<button id="btnPlayerRewind" class="player-ctrl-btn" data-nav-id="btn_rewind" title="Retroceder 10 segundos">' +
                '<span class="ctrl-icon">⏮</span> -10s' +
              '</button>' +
              '<button id="btnPlayerPlayPause" class="player-ctrl-btn is-focused" data-nav-id="btn_play_pause" title="Pausar o Reproducir">' +
                '<span id="playerPlayPauseIcon" class="ctrl-icon">⏸</span> Pausa' +
              '</button>' +
              '<button id="btnPlayerForward" class="player-ctrl-btn" data-nav-id="btn_forward" title="Adelantar 10 segundos">' +
                '<span class="ctrl-icon">⏭</span> +10s' +
              '</button>' +
              '<button id="btnPlayerSubtitles" class="player-ctrl-btn" data-nav-id="btn_subtitles" title="Elegir subtítulos">' +
                '<span class="ctrl-icon">💬</span> <span id="playerSubLabel">Subtítulos: Español</span>' +
              '</button>' +
              '<button id="btnPlayerAudio" class="player-ctrl-btn" data-nav-id="btn_audio" title="Elegir idioma o pista de audio">' +
                '<span class="ctrl-icon">🔊</span> <span id="playerAudioLabel">Audio: Principal</span>' +
              '</button>' +
              '<button id="btnPlayerFullscreen" class="player-ctrl-btn" data-nav-id="btn_fullscreen" title="Pantalla Completa">' +
                '<span class="ctrl-icon">⛶</span> <span id="playerFullscreenLabel">Pantalla Completa</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<!-- Modal Subtítulos -->' +
        '<div id="subtitleModal" class="subtitle-modal-overlay is-hidden">' +
          '<div class="subtitle-modal-dialog">' +
            '<h2 class="subtitle-modal-title">Seleccionar Subtítulos</h2>' +
            '<div id="subtitleOptionsList" class="subtitle-options-list"></div>' +
          '</div>' +
        '</div>' +
        '<!-- Modal Audio -->' +
        '<div id="audioModal" class="subtitle-modal-overlay is-hidden">' +
          '<div class="subtitle-modal-dialog">' +
            '<h2 class="subtitle-modal-title">Seleccionar Pista de Audio</h2>' +
            '<p id="audioModalNotice" class="audio-modal-notice" style="display:none; color: #00a8ff; font-size: 16px; margin-bottom: 18px; line-height: 1.4;"></p>' +
            '<div id="audioOptionsList" class="subtitle-options-list"></div>' +
          '</div>' +
        '</div>' +
        '<!-- Overlay Error / Aviso -->' +
        '<div id="playerErrorOverlay" class="player-error-overlay is-hidden">' +
          '<div class="player-error-box">' +
            '<h2 class="player-error-title" id="playerErrorTitle">Aviso de Reproducción</h2>' +
            '<p class="player-error-msg" id="playerErrorMsg"></p>' +
            '<button id="btnPlayerErrorBack" class="btn-player-error is-focused">✕ Volver al Catálogo</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  private attachVideoEvents(): void {
    var self = this;
    this.videoEl.addEventListener('timeupdate', function () {
      if (self.videoEl && self.videoEl.currentTime > 0) {
        self.lastKnownGoodTime = self.videoEl.currentTime;
      }
      self.clearStallWatchdog();
      self.updateScrubber();
    });
    this.videoEl.addEventListener('progress', function () {
      self.updateBufferBar();
    });
    this.videoEl.addEventListener('play', function () {
      self.updatePlayPauseUI(true);
    });
    this.videoEl.addEventListener('pause', function () {
      self.clearStallWatchdog();
      self.updatePlayPauseUI(false);
    });
    this.videoEl.addEventListener('waiting', function () {
      self.startStallWatchdog();
    });
    this.videoEl.addEventListener('stalled', function () {
      self.startStallWatchdog();
    });
    this.videoEl.addEventListener('playing', function () {
      self.clearStallWatchdog();
      self.isRecovering = false;
      self.updatePlayPauseUI(true);
    });
    this.videoEl.addEventListener('ended', function () {
      self.showControls();
      var dur = self.videoEl.duration || 0;
      var cur = self.videoEl.currentTime || 0;
      var isPrematureEnd = (dur > 0 && cur < dur - 15) || (cur > 10 && dur === 0);
      if (isPrematureEnd) {
        console.warn('[Player] Premature stream end at ' + cur + 's of ' + dur + 's. Triggering auto-recovery...');
        self.recoverStream(self.lastKnownGoodTime || cur);
      }
    });
    this.videoEl.addEventListener('error', function () {
      if (self.lastKnownGoodTime > 5 && !self.isRecovering) {
        console.warn('[Player] Video error during playback. Attempting stream recovery at ' + self.lastKnownGoodTime + 's...');
        self.recoverStream(self.lastKnownGoodTime);
      } else {
        self.handleVideoError();
      }
    });
  }

  private attachMouseEvents(): void {
    var self = this;
    var playerView = document.getElementById('videoPlayerView');
    var scrubberTrack = document.getElementById('playerScrubberTrack');

    // Mouse movement / interaction wakes up controls
    this.boundMouseMove = function () {
      self.showControls();
    };

    if (playerView) {
      playerView.addEventListener('mousemove', this.boundMouseMove);
      playerView.addEventListener('mousedown', function (e) {
        if ((e.target as HTMLElement).id === 'tvVideoPlayer' || (e.target as HTMLElement).id === 'playerControlsOverlay') {
          self.togglePlayPause();
        }
        self.showControls();
      });
      playerView.addEventListener('touchstart', this.boundMouseMove);
    }

    // Direct click listeners for transport buttons
    var btnBack = document.getElementById('btnPlayerBack');
    if (btnBack) {
      btnBack.addEventListener('click', function () { self.close(); });
    }
    var btnRewind = document.getElementById('btnPlayerRewind');
    if (btnRewind) {
      btnRewind.addEventListener('click', function () { self.seekRelative(-10); });
    }
    var btnPlayPause = document.getElementById('btnPlayerPlayPause');
    if (btnPlayPause) {
      btnPlayPause.addEventListener('click', function () { self.togglePlayPause(); });
    }
    var btnForward = document.getElementById('btnPlayerForward');
    if (btnForward) {
      btnForward.addEventListener('click', function () { self.seekRelative(10); });
    }
    var btnSub = document.getElementById('btnPlayerSubtitles');
    if (btnSub) {
      btnSub.addEventListener('click', function () { self.openSubtitleModal(); });
    }
    var btnAudio = document.getElementById('btnPlayerAudio');
    if (btnAudio) {
      btnAudio.addEventListener('click', function () { self.openAudioModal(); });
    }
    var btnFs = document.getElementById('btnPlayerFullscreen');
    if (btnFs) {
      btnFs.addEventListener('click', function () { self.toggleFullscreen(); });
    }

    // Direct click on scrubber to seek
    if (scrubberTrack) {
      scrubberTrack.addEventListener('click', function (e: MouseEvent) {
        var rect = scrubberTrack.getBoundingClientRect();
        var clickX = e.clientX - rect.left;
        var pct = Math.max(0, Math.min(1, clickX / rect.width));
        if (self.videoEl.duration) {
          self.videoEl.currentTime = pct * self.videoEl.duration;
          self.updateScrubber();
          self.showControls();
        }
      });
    }
  }

  private handleVideoError(): void {
    this.cancelAutoHide();
    var err = this.videoEl.error;
    var overlay = document.getElementById('playerErrorOverlay');
    var msgEl = document.getElementById('playerErrorMsg');
    var backBtn = document.getElementById('btnPlayerErrorBack');
    var title = this.currentTitle || '';
    var self = this;

    if (overlay && msgEl) {
      overlay.classList.remove('is-hidden');
      var tLower = title.toLowerCase();

      if (tLower.indexOf('.avi') !== -1 || (this.videoEl.src && this.videoEl.src.toLowerCase().indexOf('.avi') !== -1)) {
        msgEl.textContent = 'El archivo "' + title + '" está en formato .avi. Los navegadores web no admiten el formato AVI de forma nativa. Te recomendamos usar archivos .mp4 o .mkv (H.264) para reproducción web. En la aplicación nativa del Smart TV Samsung (Opción B) la TV cuenta con soporte de hardware adicional para códecs antiguos.';
      } else if (tLower.indexOf('justiciero 2') !== -1 || tLower.indexOf('justiciero') !== -1 || (err && (err.message && err.message.indexOf('DEMUXER_ERROR') !== -1))) {
        msgEl.textContent = 'Esta película está codificada con video HEVC (H.265 / 4K) y audio Dolby Digital AC-3 / TrueHD. Los navegadores de PC (Chrome/Edge) bloquean este formato sin aceleración específica o códec del sistema ("DEMUXER_ERROR_NO_SUPPORTED_STREAMS"). Sin embargo, tu televisor Samsung Smart TV UN50NU7400 cuenta con procesador y decodificador por hardware para HEVC 4K y Dolby Digital, por lo que se reproduce de forma nativa en la TV.';
      } else if (err && err.code === 4) {
        msgEl.textContent = 'El códec de video o audio de este archivo no es compatible directamente con el navegador del PC (' + (err.message || 'MEDIA_ERR_SRC_NOT_SUPPORTED') + '). En tu Smart TV Samsung UN50NU7400, los formatos MKV de alta definición con HEVC y Dolby Digital son decodificados por el hardware del televisor.';
      } else {
        msgEl.textContent = 'Ocurrió un error al cargar el video desde Google Drive. Por favor, compruebe la conexión e intente nuevamente.';
      }

      if (backBtn) {
        backBtn.classList.add('is-focused');
        backBtn.focus();
        backBtn.onclick = function () {
          self.close();
        };
      }
    }
  }

  private updateScrubber(): void {
    var cur = this.videoEl.currentTime || 0;
    var dur = this.videoEl.duration || 0;

    var curEl = document.getElementById('playerTimeCurrent');
    if (curEl) curEl.textContent = this.formatTime(cur);

    var durEl = document.getElementById('playerTimeDuration');
    if (durEl) durEl.textContent = this.formatTime(dur);

    var pct = dur > 0 ? (cur / dur) * 100 : 0;
    var progEl = document.getElementById('playerProgressBar');
    if (progEl) progEl.style.width = pct + '%';

    var thumbEl = document.getElementById('playerPlayheadThumb');
    var trackEl = document.getElementById('playerScrubberTrack');
    if (thumbEl && trackEl) {
      var trackWidth = trackEl.clientWidth || 1000;
      var thumbPos = (pct / 100) * trackWidth;
      thumbEl.style.transform = 'translate3d(' + Math.round(thumbPos) + 'px, 0, 0)';
    }
  }

  private updateBufferBar(): void {
    if (this.videoEl.buffered && this.videoEl.buffered.length > 0) {
      var dur = this.videoEl.duration || 0;
      var bufferedEnd = this.videoEl.buffered.end(this.videoEl.buffered.length - 1);
      var pct = dur > 0 ? (bufferedEnd / dur) * 100 : 0;
      var bufEl = document.getElementById('playerBufferBar');
      if (bufEl) bufEl.style.width = pct + '%';
    }
  }

  public formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    var s = Math.floor(seconds);
    var hrs = Math.floor(s / 3600);
    var mins = Math.floor((s % 3600) / 60);
    var secs = s % 60;
    var pad = function (n: number) { return n < 10 ? '0' + n : String(n); };
    return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
  }

  private updatePlayPauseUI(isPlaying: boolean): void {
    var btn = document.getElementById('btnPlayerPlayPause');
    if (btn) {
      if (isPlaying) {
        btn.innerHTML = '<span id="playerPlayPauseIcon" class="ctrl-icon">⏸</span> Pausa';
      } else {
        btn.innerHTML = '<span id="playerPlayPauseIcon" class="ctrl-icon">▶</span> Reproducir';
      }
    }
  }

  public updateSubtitleButtonLabel(): void {
    var labelEl = document.getElementById('playerSubLabel');
    if (labelEl) {
      labelEl.textContent = 'Subtítulos: ' + this.subtitleManager.getActiveTrackLabel();
    }
  }

  public updateAudioButtonLabel(): void {
    var labelEl = document.getElementById('playerAudioLabel');
    if (labelEl) {
      labelEl.textContent = 'Audio: ' + this.audioManager.getActiveTrackLabel();
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
    var errOverlay = document.getElementById('playerErrorOverlay');
    if (errOverlay && !errOverlay.classList.contains('is-hidden')) {
      if (keyCode === 13 || keyCode === 10009 || keyCode === 27 || keyCode === 8) {
        this.close();
        return true;
      }
      return true;
    }

    if (this.subtitleModalOpen) {
      return this.handleSubtitleModalKey(keyCode);
    }

    if (this.audioModalOpen) {
      return this.handleAudioModalKey(keyCode);
    }

    // If overlay was hidden, any key press reveals it
    var wasHidden = this.overlayEl && this.overlayEl.classList.contains('is-hidden');
    this.showControls();

    if (wasHidden) {
      // Just wake up the controls
      return true;
    }

    switch (keyCode) {
      case 13: // Enter
        return this.handleEnter();

      case 10252: // MediaPlayPause
      case 415:   // MediaPlay
      case 19:    // MediaPause
        this.togglePlayPause();
        return true;

      case 37: // ArrowLeft
        if (this.focusedButtonIndex > 1) {
          this.setButtonFocus(this.focusedButtonIndex - 1);
        } else if (this.focusedButtonIndex === 1) {
          this.seekRelative(-10);
        }
        return true;

      case 39: // ArrowRight
        if (this.focusedButtonIndex === 0) {
          // If on Back, down to transport
          this.setButtonFocus(2);
        } else if (this.focusedButtonIndex < this.buttons.length - 1) {
          this.setButtonFocus(this.focusedButtonIndex + 1);
        } else {
          this.seekRelative(10);
        }
        return true;

      case 38: // ArrowUp
        // Focus the Back button at the top
        this.setButtonFocus(0);
        return true;

      case 40: // ArrowDown
        // Move back down to Play/Pause
        if (this.focusedButtonIndex === 0) {
          this.setButtonFocus(2);
        }
        return true;

      case 412: // MediaRewind: -30s
        this.seekRelative(-30);
        return true;

      case 417: // MediaFastForward: +30s
        this.seekRelative(30);
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
    var focusedBtn = this.buttons[this.focusedButtonIndex];
    if (!focusedBtn) return true;

    if (focusedBtn.id === 'btnPlayerBack') {
      this.close();
    } else if (focusedBtn.id === 'btnPlayerPlayPause') {
      this.togglePlayPause();
    } else if (focusedBtn.id === 'btnPlayerRewind') {
      this.seekRelative(-10);
    } else if (focusedBtn.id === 'btnPlayerForward') {
      this.seekRelative(10);
    } else if (focusedBtn.id === 'btnPlayerSubtitles') {
      this.openSubtitleModal();
    } else if (focusedBtn.id === 'btnPlayerAudio') {
      this.openAudioModal();
    } else if (focusedBtn.id === 'btnPlayerFullscreen') {
      this.toggleFullscreen();
    }
    return true;
  }

  public toggleFullscreen(): void {
    toggleAppFullscreen();
  }

  public updateFullscreenButtonLabel(isFs: boolean): void {
    var labelEl = document.getElementById('playerFullscreenLabel');
    if (labelEl) {
      labelEl.textContent = isFs ? 'Salir Pantalla Completa' : 'Pantalla Completa';
    }
  }

  private startStallWatchdog(): void {
    if (this.stallWatchdogTimer || this.isRecovering) return;
    if (this.videoEl && this.videoEl.paused) return;

    var self = this;
    var checkTime = this.videoEl ? this.videoEl.currentTime : 0;
    this.stallWatchdogTimer = setTimeout(function () {
      self.stallWatchdogTimer = null;
      if (!self.videoEl || self.videoEl.paused) return;
      var dur = self.videoEl.duration || 0;
      var cur = self.videoEl.currentTime || 0;
      if (dur === 0 || cur < dur - 10) {
        console.warn('[Player] Stream stalled for >6s without progress. Auto-reconnecting...');
        self.recoverStream(self.lastKnownGoodTime || checkTime);
      }
    }, 6000);
  }

  private clearStallWatchdog(): void {
    if (this.stallWatchdogTimer) {
      clearTimeout(this.stallWatchdogTimer);
      this.stallWatchdogTimer = null;
    }
  }

  public recoverStream(resumeTime: number): void {
    if (this.isRecovering || !this.currentFileId || !this.videoEl) return;
    this.isRecovering = true;
    this.clearStallWatchdog();

    var self = this;
    var fileId = this.currentFileId;
    var baseStreamUrl = apiClient.getStreamUrl(fileId);
    var separator = baseStreamUrl.indexOf('?') === -1 ? '?' : '&';
    var recoveredUrl = baseStreamUrl + separator + 'reconnect=' + Date.now();

    console.log('[Player] Reconnecting stream to ' + recoveredUrl + ' at position ' + resumeTime + 's');
    var activeSubId = this.subtitleManager ? this.subtitleManager.getActiveTrackId() : 'off';

    this.videoEl.src = recoveredUrl;
    this.videoEl.load();

    var onCanPlay = function () {
      if (!self.videoEl) return;
      self.videoEl.removeEventListener('canplay', onCanPlay);
      try {
        if (resumeTime > 0) {
          self.videoEl.currentTime = resumeTime;
        }
      } catch (e) {
        console.warn('[Player] Could not seek on canplay:', e);
      }
      self.videoEl.play().catch(function () {});
      self.updatePlayPauseUI(true);
      if (self.subtitleManager && activeSubId !== 'off') {
        self.subtitleManager.selectTrack(activeSubId);
      }
    };

    this.videoEl.addEventListener('canplay', onCanPlay);
  }

  public togglePlayPause(): void {
    var dur = this.videoEl.duration || 0;
    var cur = this.videoEl.currentTime || 0;
    var isRealEnd = Boolean(dur > 0 && cur >= dur - 2);

    if (this.videoEl.ended && isRealEnd) {
      this.videoEl.currentTime = 0;
      this.videoEl.play().catch(function () {});
      this.updatePlayPauseUI(true);
      this.scheduleAutoHide();
      return;
    }

    if (this.videoEl.ended && !isRealEnd) {
      this.recoverStream(this.lastKnownGoodTime || cur);
      this.scheduleAutoHide();
      return;
    }

    if (this.videoEl.paused) {
      this.videoEl.play().catch(function () {});
      this.updatePlayPauseUI(true);
      this.scheduleAutoHide();
    } else {
      this.videoEl.pause();
      this.clearStallWatchdog();
      this.updatePlayPauseUI(false);
      this.cancelAutoHide();
    }
  }

  public seekRelative(deltaSeconds: number): void {
    var dur = this.videoEl.duration || 0;
    var target = this.videoEl.currentTime + deltaSeconds;
    this.videoEl.currentTime = Math.max(0, Math.min(dur, target));
    if (this.videoEl.ended) {
      this.videoEl.play().catch(function () {});
      this.updatePlayPauseUI(true);
    }
    this.updateScrubber();
    this.showControls();
  }

  public showControls(): void {
    if (this.overlayEl) {
      this.overlayEl.classList.remove('is-hidden');
    }
    if (this.videoEl && !this.videoEl.paused && !this.subtitleModalOpen && !this.audioModalOpen) {
      this.scheduleAutoHide();
    }
  }

  private scheduleAutoHide(): void {
    this.cancelAutoHide();
    var self = this;
    this.autoHideTimer = setTimeout(function () {
      if (self.videoEl && !self.videoEl.paused && !self.subtitleModalOpen && !self.audioModalOpen && self.overlayEl) {
        self.overlayEl.classList.add('is-hidden');
      }
    }, 3500);
  }

  private cancelAutoHide(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  public close(): void {
    this.cancelAutoHide();
    this.clearStallWatchdog();
    this.isRecovering = false;
    if (this.unbindFsChange) {
      this.unbindFsChange();
      this.unbindFsChange = null;
    }
    if (this.boundMouseMove) {
      var playerView = document.getElementById('videoPlayerView');
      if (playerView) playerView.removeEventListener('mousemove', this.boundMouseMove);
    }
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
    }
    if (this.subtitleManager) {
      this.subtitleManager.clearTracks();
    }

    var view = document.getElementById('player-container');
    if (view) {
      view.style.display = 'none';
      view.classList.add('hidden');
    }

    if (this.onExitCallback) {
      this.onExitCallback();
    }
  }

  // Subtitle Modal
  private openSubtitleModal(): void {
    this.subtitleModalOpen = true;
    this.cancelAutoHide();
    var modal = document.getElementById('subtitleModal');
    if (modal) modal.classList.remove('is-hidden');
    this.renderSubtitleOptions();
  }

  private closeSubtitleModal(): void {
    this.subtitleModalOpen = false;
    var modal = document.getElementById('subtitleModal');
    if (modal) modal.classList.add('is-hidden');
    this.showControls();
  }

  private renderSubtitleOptions(): void {
    var listEl = document.getElementById('subtitleOptionsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    var tracks = this.subtitleManager.getTracks();
    var activeId = this.subtitleManager.getActiveTrackId();

    var options = [{ id: 'off', label: 'Desactivado' }];
    for (var i = 0; i < tracks.length; i++) {
      options.push({ id: tracks[i].id, label: tracks[i].label });
    }

    this.subtitleModalFocusIdx = 0;
    var self = this;

    for (var j = 0; j < options.length; j++) {
      var opt = options[j];
      var btn = document.createElement('button');
      btn.className = 'subtitle-option-btn' + (opt.id === activeId ? ' is-selected' : '');
      btn.id = 'sub_opt_' + opt.id;
      btn.setAttribute('data-track-id', opt.id);
      btn.textContent = opt.label;
      if (j === 0) btn.classList.add('is-focused');

      (function (trackId: string) {
        btn.addEventListener('click', function () {
          self.subtitleManager.selectTrack(trackId);
          self.updateSubtitleButtonLabel();
          self.closeSubtitleModal();
        });
      })(opt.id);

      listEl.appendChild(btn);
    }
  }

  private handleSubtitleModalKey(keyCode: number): boolean {
    if (keyCode === 10009 || keyCode === 27 || keyCode === 8) {
      this.closeSubtitleModal();
      return true;
    }

    var listEl = document.getElementById('subtitleOptionsList');
    if (!listEl) return true;
    var items = listEl.querySelectorAll('.subtitle-option-btn');
    if (items.length === 0) return true;

    if (keyCode === 38) { // ArrowUp
      if (this.subtitleModalFocusIdx > 0) {
        this.subtitleModalFocusIdx--;
      }
    } else if (keyCode === 40) { // ArrowDown
      if (this.subtitleModalFocusIdx < items.length - 1) {
        this.subtitleModalFocusIdx++;
      }
    } else if (keyCode === 13) { // Enter
      var focusedBtn = items[this.subtitleModalFocusIdx] as HTMLElement;
      if (focusedBtn) {
        var trackId = focusedBtn.getAttribute('data-track-id') || 'off';
        this.subtitleManager.selectTrack(trackId);
        this.updateSubtitleButtonLabel();
        this.closeSubtitleModal();
      }
      return true;
    }

    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('is-focused');
    }
    if (items[this.subtitleModalFocusIdx]) {
      items[this.subtitleModalFocusIdx].classList.add('is-focused');
      (items[this.subtitleModalFocusIdx] as HTMLElement).focus();
    }

    return true;
  }

  // Audio Modal
  private openAudioModal(): void {
    this.audioModalOpen = true;
    this.cancelAutoHide();
    var modal = document.getElementById('audioModal');
    if (modal) modal.classList.remove('is-hidden');
    this.renderAudioOptions();
  }

  private closeAudioModal(): void {
    this.audioModalOpen = false;
    var modal = document.getElementById('audioModal');
    if (modal) modal.classList.add('is-hidden');
    this.showControls();
  }

  private renderAudioOptions(): void {
    var listEl = document.getElementById('audioOptionsList');
    var noticeEl = document.getElementById('audioModalNotice');
    if (!listEl) return;
    listEl.innerHTML = '';

    var tracks = this.audioManager.getTracks();
    var activeIdx = this.audioManager.getActiveTrackIndex();

    var hasDolby = tracks.some(function (t) { return t.isDolby; });
    if (noticeEl) {
      if (hasDolby) {
        noticeEl.style.display = 'block';
        noticeEl.textContent = '💡 Nota: Las pistas Dolby (AC3 / TrueHD) se reproducen con sonido envolvente en tu Smart TV Samsung UN50NU7400 por decodificación de hardware.';
      } else {
        noticeEl.style.display = 'none';
      }
    }

    this.audioModalFocusIdx = Math.max(0, activeIdx);
    var self = this;

    for (var j = 0; j < tracks.length; j++) {
      var track = tracks[j];
      var btn = document.createElement('button');
      btn.className = 'subtitle-option-btn' + (j === activeIdx ? ' is-selected' : '');
      btn.id = 'audio_opt_' + j;
      btn.setAttribute('data-track-index', String(j));
      btn.textContent = track.label;
      if (j === this.audioModalFocusIdx) btn.classList.add('is-focused');

      (function (idx: number) {
        btn.addEventListener('click', function () {
          self.audioManager.selectTrack(idx);
          self.updateAudioButtonLabel();
          self.closeAudioModal();
        });
      })(j);

      listEl.appendChild(btn);
    }
  }

  private handleAudioModalKey(keyCode: number): boolean {
    if (keyCode === 10009 || keyCode === 27 || keyCode === 8) {
      this.closeAudioModal();
      return true;
    }

    var listEl = document.getElementById('audioOptionsList');
    if (!listEl) return true;
    var items = listEl.querySelectorAll('.subtitle-option-btn');
    if (items.length === 0) return true;

    if (keyCode === 38) { // ArrowUp
      if (this.audioModalFocusIdx > 0) {
        this.audioModalFocusIdx--;
      }
    } else if (keyCode === 40) { // ArrowDown
      if (this.audioModalFocusIdx < items.length - 1) {
        this.audioModalFocusIdx++;
      }
    } else if (keyCode === 13) { // Enter
      var focusedBtn = items[this.audioModalFocusIdx] as HTMLElement;
      if (focusedBtn) {
        var idxStr = focusedBtn.getAttribute('data-track-index') || '0';
        this.audioManager.selectTrack(parseInt(idxStr, 10));
        this.updateAudioButtonLabel();
        this.closeAudioModal();
      }
      return true;
    }

    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('is-focused');
    }
    if (items[this.audioModalFocusIdx]) {
      items[this.audioModalFocusIdx].classList.add('is-focused');
      (items[this.audioModalFocusIdx] as HTMLElement).focus();
    }

    return true;
  }
}

export var videoPlayerController = new VideoPlayerViewController();
