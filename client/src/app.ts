import { SpatialNavigationEngine } from './navigation/engine';
import { DomNavigationAdapter } from './navigation/adapter';
import { RemoteKeys, registerTizenRemoteKeys } from './navigation/keys';
import { CatalogView } from './views/catalog';
import { movieDetailModal } from './views/modal';
import { videoPlayerController } from './views/player';
import { photoSlideshowController } from './views/slideshow';
import { audioPlayerController } from './views/audio';
import type { DriveMediaItem } from './types';

export class App {
  public navEngine: SpatialNavigationEngine;
  public navAdapter: DomNavigationAdapter;
  public catalogView!: CatalogView;
  public activeLayer: string = 'catalog';
  private exitDialogActive: boolean = false;
  private exitDialogFocusIdx: number = 0; // 0: Salir, 1: Cancelar

  constructor() {
    this.navEngine = new SpatialNavigationEngine();
    this.navAdapter = new DomNavigationAdapter(this.navEngine);
  }

  public async init(): Promise<void> {
    registerTizenRemoteKeys();

    var mainContainer = document.getElementById('main-view-container');
    if (!mainContainer) return;

    var self = this;
    this.catalogView = new CatalogView(mainContainer, {
      onPlayMovie: function (item: DriveMediaItem) {
        self.launchPlayer(item, 'Películas');
      },
      onPlayFamilyVideo: function (item: DriveMediaItem) {
        self.launchPlayer(item, 'Videos familiares');
      },
      onOpenPhotoSlideshow: function (item: DriveMediaItem, allPhotos: DriveMediaItem[], index: number) {
        self.launchSlideshow(item, allPhotos, index);
      },
      onOpenAudioPlayer: function (item: DriveMediaItem, playlist: DriveMediaItem[], index: number) {
        self.launchAudio(item, playlist, index);
      },
      onExitApp: function () {
        self.showExitDialog();
      }
    });

    await this.catalogView.init();

    window.addEventListener('keydown', function (e: KeyboardEvent) {
      self.handleGlobalKeyDown(e);
    });
  }

  public handleGlobalKeyDown(event: KeyboardEvent): void {
    var keyCode = event.keyCode || event.which;

    // 1. Exit Dialog
    if (this.exitDialogActive) {
      this.handleExitDialogKey(keyCode);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // 2. Active Layer Routing
    if (this.activeLayer === 'modal' || movieDetailModal.isOpen()) {
      var handled = movieDetailModal.handleKey(keyCode);
      if (handled) {
        if (!movieDetailModal.isOpen()) {
          this.activeLayer = 'catalog';
        }
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (this.activeLayer === 'player') {
      var playerHandled = videoPlayerController.handleKey(keyCode);
      if (playerHandled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (this.activeLayer === 'slideshow') {
      var slideHandled = photoSlideshowController.handleKey(keyCode);
      if (slideHandled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (this.activeLayer === 'audio') {
      var audioHandled = audioPlayerController.handleKey(keyCode);
      if (audioHandled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // 3. Catalog Navigation
    if (this.activeLayer === 'catalog') {
      if (keyCode === 82 || keyCode === RemoteKeys.COLOR_GREEN) {
        // 'r' / 'R' key or Green button on remote
        this.catalogView.refreshCatalog();
        event.preventDefault();
        return;
      }
      if (keyCode === RemoteKeys.ARROW_LEFT) {
        this.catalogView.handleDirection('left');
        event.preventDefault();
      } else if (keyCode === RemoteKeys.ARROW_RIGHT) {
        this.catalogView.handleDirection('right');
        event.preventDefault();
      } else if (keyCode === RemoteKeys.ARROW_UP) {
        this.catalogView.handleDirection('up');
        event.preventDefault();
      } else if (keyCode === RemoteKeys.ARROW_DOWN) {
        this.catalogView.handleDirection('down');
        event.preventDefault();
      } else if (keyCode === RemoteKeys.ENTER) {
        this.catalogView.handleEnter();
        if (movieDetailModal.isOpen()) {
          this.activeLayer = 'modal';
        }
        event.preventDefault();
      } else if (keyCode === RemoteKeys.RETURN || keyCode === RemoteKeys.ESCAPE) {
        this.showExitDialog();
        event.preventDefault();
      }
    }
  }

  private launchPlayer(item: DriveMediaItem, category: string): void {
    this.activeLayer = 'player';
    var self = this;
    videoPlayerController.open(item.id, item.cleanTitle || item.name, category, function () {
      self.activeLayer = 'catalog';
      self.catalogView.restoreFocus();
    });
  }

  private launchSlideshow(_item: DriveMediaItem, allPhotos: DriveMediaItem[], index: number): void {
    this.activeLayer = 'slideshow';
    var photoItems = allPhotos.map(function (p) {
      return {
        id: p.id,
        name: p.cleanTitle || p.name,
        thumbnailLink: p.thumbnailLink || p.thumbnailUrl || '',
        fullUrl: p.thumbnailLink ? p.thumbnailLink.replace(/=s\d+/, '=s1920') : undefined
      };
    });

    var self = this;
    photoSlideshowController.open(photoItems, index, function () {
      self.activeLayer = 'catalog';
      self.catalogView.restoreFocus();
    });
  }

  private launchAudio(item: DriveMediaItem, playlist: DriveMediaItem[], index: number): void {
    this.activeLayer = 'audio';
    var trackItems = playlist.map(function (m) {
      return {
        id: m.id,
        name: m.name,
        title: m.cleanTitle || m.name,
        thumbnailLink: m.thumbnailLink || m.thumbnailUrl,
        durationMillis: m.durationMillis
      };
    });

    var initial = {
      id: item.id,
      name: item.name,
      title: item.cleanTitle || item.name,
      thumbnailLink: item.thumbnailLink || item.thumbnailUrl,
      durationMillis: item.durationMillis
    };

    var self = this;
    audioPlayerController.open(initial, trackItems, index, function () {
      self.activeLayer = 'catalog';
      self.catalogView.restoreFocus();
    });
  }

  public showExitDialog(): void {
    this.exitDialogActive = true;
    this.exitDialogFocusIdx = 0;
    var dialogContainer = document.getElementById('exit-dialog-container');
    if (!dialogContainer) return;

    dialogContainer.innerHTML =
      '<div class="modal-overlay" style="display: flex; z-index: 2000;">' +
        '<div style="background-color: #181b22; border: 2px solid #2a2e3d; border-radius: 12px; padding: 48px; width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.9);">' +
          '<h2 style="font-size: 32px; font-weight: 700; color: #ffffff; margin-bottom: 20px;">¿Salir de la aplicación?</h2>' +
          '<p style="font-size: 20px; color: #a0a5b5; margin-bottom: 36px;">¿Desea cerrar Multimedia Drive y volver al menú principal?</p>' +
          '<div style="display: flex; flex-direction: row; justify-content: center;">' +
            '<button id="btn_exit_confirm" class="btn-nav is-focused" style="background-color: #ff4757; color: #ffffff; margin-right: 20px;">Salir</button>' +
            '<button id="btn_exit_cancel" class="btn-nav">Cancelar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    dialogContainer.classList.remove('hidden');

    var btnConfirm = document.getElementById('btn_exit_confirm');
    var btnCancel = document.getElementById('btn_exit_cancel');
    var self = this;

    if (btnConfirm) {
      btnConfirm.addEventListener('click', function () { self.confirmExit(); });
    }
    if (btnCancel) {
      btnCancel.addEventListener('click', function () { self.dismissExitDialog(); });
    }
  }

  private handleExitDialogKey(keyCode: number): void {
    var btnConfirm = document.getElementById('btn_exit_confirm');
    var btnCancel = document.getElementById('btn_exit_cancel');

    if (keyCode === RemoteKeys.ARROW_LEFT || keyCode === RemoteKeys.ARROW_RIGHT) {
      this.exitDialogFocusIdx = this.exitDialogFocusIdx === 0 ? 1 : 0;
      if (btnConfirm && btnCancel) {
        if (this.exitDialogFocusIdx === 0) {
          btnConfirm.classList.add('is-focused');
          btnCancel.classList.remove('is-focused');
          btnConfirm.focus();
        } else {
          btnCancel.classList.add('is-focused');
          btnConfirm.classList.remove('is-focused');
          btnCancel.focus();
        }
      }
    } else if (keyCode === RemoteKeys.ENTER) {
      if (this.exitDialogFocusIdx === 0) {
        this.confirmExit();
      } else {
        this.dismissExitDialog();
      }
    } else if (keyCode === RemoteKeys.RETURN || keyCode === RemoteKeys.ESCAPE) {
      this.dismissExitDialog();
    }
  }

  private dismissExitDialog(): void {
    this.exitDialogActive = false;
    var dialogContainer = document.getElementById('exit-dialog-container');
    if (dialogContainer) {
      dialogContainer.innerHTML = '';
      dialogContainer.classList.add('hidden');
    }
    this.catalogView.restoreFocus();
  }

  private confirmExit(): void {
    if (typeof window !== 'undefined' && window.tizen && window.tizen.application) {
      try {
        window.tizen.application.getCurrentApplication().exit();
        return;
      } catch (e) {
        console.warn('Tizen exit failed:', e);
      }
    }
    this.dismissExitDialog();
  }
}

// Auto-bootstrap in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  function startApp() {
    var app = new App();
    app.init();
    (window as any).__app__ = app;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
}
