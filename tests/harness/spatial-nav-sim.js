// Headless Spatial Navigation Simulator for Samsung Smart TV Remote Control
// Simulates D-pad navigation, focus rings, keycodes, and layer hierarchies

class SpatialNavSimulator {
  constructor(initialGrid = null) {
    this.grid = initialGrid || [
      // Row 0: Películas (5 items)
      [{ id: 'p0', label: 'Película 1' }, { id: 'p1', label: 'Película 2' }, { id: 'p2', label: 'Película 3' }, { id: 'p3', label: 'Película 4' }, { id: 'p4', label: 'Película 5' }],
      // Row 1: Series (3 items)
      [{ id: 's0', label: 'Serie 1' }, { id: 's1', label: 'Serie 2' }, { id: 's2', label: 'Serie 3' }],
      // Row 2: Videos familiares (3 items)
      [{ id: 'f0', label: 'Video Fam 1' }, { id: 'f1', label: 'Video Fam 2' }, { id: 'f2', label: 'Video Fam 3' }],
      // Row 3: Fotos (4 items)
      [{ id: 'ph0', label: 'Foto 1' }, { id: 'ph1', label: 'Foto 2' }, { id: 'ph2', label: 'Foto 3' }, { id: 'ph3', label: 'Foto 4' }],
      // Row 4: Música (2 items)
      [{ id: 'm0', label: 'Música 1' }, { id: 'm1', label: 'Música 2' }]
    ];

    this.focusRow = 0;
    this.focusCol = 0;
    this.activeLayer = 'catalog'; // 'catalog' | 'modal' | 'player' | 'slideshow' | 'audio' | 'exit_dialog'
    this.layerStack = ['catalog'];
    this.modalButtons = [{ id: 'btn_play', label: 'Reproducir' }, { id: 'btn_close', label: 'Volver' }];
    this.modalFocusIdx = 0;
    this.playerState = { playing: false, currentTime: 0, duration: 7200, controlsVisible: true, subtitleTrack: 'es' };
    this.slideshowState = { activeIndex: 0, totalPhotos: 10, autoAdvance: true };
    this.audioState = { currentTrackIdx: 0, totalTracks: 5, isPlaying: false };
    this.lastCardMemory = { row: 0, col: 0 };
    this.exitDialogActive = false;
  }

  getCurrentFocus() {
    if (this.activeLayer === 'modal') {
      return this.modalButtons[this.modalFocusIdx];
    }
    if (this.activeLayer === 'catalog') {
      return this.grid[this.focusRow][this.focusCol];
    }
    return { layer: this.activeLayer, state: this.playerState };
  }

  dispatchKey(keyCode) {
    switch (keyCode) {
      case 37: // ArrowLeft
        return this.handleLeft();
      case 38: // ArrowUp
        return this.handleUp();
      case 39: // ArrowRight
        return this.handleRight();
      case 40: // ArrowDown
        return this.handleDown();
      case 13: // Enter
        return this.handleEnter();
      case 10009: // Return (Samsung Tizen hardware back button)
      case 27: // Escape
        return this.handleReturn();
      case 10252: // MediaPlayPause
      case 415: // MediaPlay
      case 19: // MediaPause
        return this.handleMediaPlayPause();
      case 417: // MediaFF (+30s)
        return this.handleFastForward();
      case 412: // MediaRW (-30s)
        return this.handleRewind();
      case 10233: // MediaTrackNext
        return this.handleTrackNext();
      case 10232: // MediaTrackPrevious
        return this.handleTrackPrev();
      default:
        // Safely ignore unmapped keys
        return { handled: false, reason: 'UNMAPPED_KEY', keyCode };
    }
  }

  handleLeft() {
    if (this.activeLayer === 'modal') {
      if (this.modalFocusIdx > 0) this.modalFocusIdx--;
      return { handled: true, layer: this.activeLayer, focus: this.modalButtons[this.modalFocusIdx] };
    }
    if (this.activeLayer === 'player') {
      // Seek -10s
      this.playerState.currentTime = Math.max(0, this.playerState.currentTime - 10);
      this.playerState.controlsVisible = true;
      return { handled: true, action: 'SEEK_BACK', currentTime: this.playerState.currentTime };
    }
    if (this.activeLayer === 'slideshow') {
      this.slideshowState.activeIndex = Math.max(0, this.slideshowState.activeIndex - 1);
      return { handled: true, action: 'PREV_PHOTO', index: this.slideshowState.activeIndex };
    }
    if (this.activeLayer === 'catalog') {
      // Boundary check
      if (this.focusCol > 0) {
        this.focusCol--;
      }
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusCol === 0 };
    }
    return { handled: true };
  }

  handleRight() {
    if (this.activeLayer === 'modal') {
      if (this.modalFocusIdx < this.modalButtons.length - 1) this.modalFocusIdx++;
      return { handled: true, layer: this.activeLayer, focus: this.modalButtons[this.modalFocusIdx] };
    }
    if (this.activeLayer === 'player') {
      // Seek +10s
      this.playerState.currentTime = Math.min(this.playerState.duration, this.playerState.currentTime + 10);
      this.playerState.controlsVisible = true;
      return { handled: true, action: 'SEEK_FORWARD', currentTime: this.playerState.currentTime };
    }
    if (this.activeLayer === 'slideshow') {
      this.slideshowState.activeIndex = Math.min(this.slideshowState.totalPhotos - 1, this.slideshowState.activeIndex + 1);
      return { handled: true, action: 'NEXT_PHOTO', index: this.slideshowState.activeIndex };
    }
    if (this.activeLayer === 'catalog') {
      const rowLen = this.grid[this.focusRow].length;
      if (this.focusCol < rowLen - 1) {
        this.focusCol++;
      }
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusCol === rowLen - 1 };
    }
    return { handled: true };
  }

  handleUp() {
    if (this.activeLayer === 'catalog') {
      if (this.focusRow > 0) {
        this.focusRow--;
        // Preserve column or clamp to new row length
        this.focusCol = Math.min(this.focusCol, this.grid[this.focusRow].length - 1);
      }
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusRow === 0 };
    }
    // In modal, vertical is trapped
    return { handled: true, trapped: true };
  }

  handleDown() {
    if (this.activeLayer === 'catalog') {
      if (this.focusRow < this.grid.length - 1) {
        this.focusRow++;
        this.focusCol = Math.min(this.focusCol, this.grid[this.focusRow].length - 1);
      }
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusRow === this.grid.length - 1 };
    }
    return { handled: true, trapped: true };
  }

  handleEnter() {
    if (this.activeLayer === 'catalog') {
      const focusedItem = this.grid[this.focusRow][this.focusCol];
      this.lastCardMemory = { row: this.focusRow, col: this.focusCol };

      if (this.focusRow === 0 || this.focusRow === 1) {
        // Movies or Series -> Opens Detail Modal
        this.activeLayer = 'modal';
        this.layerStack.push('modal');
        this.modalFocusIdx = 0; // default focus on [ Reproducir ]
        return { handled: true, action: 'OPEN_MODAL', item: focusedItem };
      } else if (this.focusRow === 2) {
        // Videos familiares -> Direct Playback (bypasses modal!)
        this.activeLayer = 'player';
        this.layerStack.push('player');
        this.playerState.playing = true;
        return { handled: true, action: 'DIRECT_PLAY', item: focusedItem };
      } else if (this.focusRow === 3) {
        // Fotos -> Photo Slideshow
        this.activeLayer = 'slideshow';
        this.layerStack.push('slideshow');
        return { handled: true, action: 'OPEN_SLIDESHOW', item: focusedItem };
      } else if (this.focusRow === 4) {
        // Música -> Audio Player
        this.activeLayer = 'audio';
        this.layerStack.push('audio');
        this.audioState.isPlaying = true;
        return { handled: true, action: 'OPEN_AUDIO_PLAYER', item: focusedItem };
      }
    } else if (this.activeLayer === 'modal') {
      const selectedBtn = this.modalButtons[this.modalFocusIdx];
      if (selectedBtn.id === 'btn_play') {
        this.activeLayer = 'player';
        this.layerStack.push('player');
        this.playerState.playing = true;
        return { handled: true, action: 'START_PLAYBACK' };
      } else if (selectedBtn.id === 'btn_close') {
        this.layerStack.pop();
        this.activeLayer = 'catalog';
        return { handled: true, action: 'CLOSE_MODAL', restoredFocus: this.grid[this.lastCardMemory.row][this.lastCardMemory.col] };
      }
    } else if (this.activeLayer === 'player') {
      // Toggle play/pause
      this.playerState.playing = !this.playerState.playing;
      return { handled: true, action: 'TOGGLE_PLAY', playing: this.playerState.playing };
    } else if (this.activeLayer === 'slideshow') {
      // Toggle slideshow
      this.slideshowState.autoAdvance = !this.slideshowState.autoAdvance;
      return { handled: true, action: 'TOGGLE_SLIDESHOW', autoAdvance: this.slideshowState.autoAdvance };
    } else if (this.activeLayer === 'audio') {
      this.audioState.isPlaying = !this.audioState.isPlaying;
      return { handled: true, action: 'TOGGLE_AUDIO', isPlaying: this.audioState.isPlaying };
    }
    return { handled: true };
  }

  handleReturn() {
    if (this.exitDialogActive) {
      this.exitDialogActive = false;
      return { handled: true, action: 'DISMISS_EXIT_DIALOG' };
    }

    if (this.activeLayer === 'player') {
      // Close player, return to modal or catalog
      this.playerState.playing = false;
      this.layerStack.pop();
      this.activeLayer = this.layerStack[this.layerStack.length - 1];
      return { handled: true, action: 'EXIT_PLAYER', currentLayer: this.activeLayer };
    }

    if (this.activeLayer === 'modal') {
      // Close modal, restore focus to catalog
      this.layerStack.pop();
      this.activeLayer = 'catalog';
      return { handled: true, action: 'EXIT_MODAL', restoredFocus: this.grid[this.lastCardMemory.row][this.lastCardMemory.col] };
    }

    if (this.activeLayer === 'slideshow') {
      this.layerStack.pop();
      this.activeLayer = 'catalog';
      return { handled: true, action: 'EXIT_SLIDESHOW' };
    }

    if (this.activeLayer === 'audio') {
      this.layerStack.pop();
      this.activeLayer = 'catalog';
      return { handled: true, action: 'EXIT_AUDIO' };
    }

    if (this.activeLayer === 'catalog') {
      // At root -> Open Exit Confirmation Dialog
      this.exitDialogActive = true;
      return { handled: true, action: 'SHOW_EXIT_CONFIRMATION' };
    }

    return { handled: true };
  }

  handleMediaPlayPause() {
    if (this.activeLayer === 'player') {
      this.playerState.playing = !this.playerState.playing;
      return { handled: true, action: 'TOGGLE_PLAY', playing: this.playerState.playing };
    }
    if (this.activeLayer === 'slideshow') {
      this.slideshowState.autoAdvance = !this.slideshowState.autoAdvance;
      return { handled: true, action: 'TOGGLE_SLIDESHOW', autoAdvance: this.slideshowState.autoAdvance };
    }
    if (this.activeLayer === 'audio') {
      this.audioState.isPlaying = !this.audioState.isPlaying;
      return { handled: true, action: 'TOGGLE_AUDIO', isPlaying: this.audioState.isPlaying };
    }
    return { handled: false, reason: 'NOT_IN_PLAYBACK_LAYER' };
  }

  handleFastForward() {
    if (this.activeLayer === 'player') {
      this.playerState.currentTime = Math.min(this.playerState.duration, this.playerState.currentTime + 30);
      return { handled: true, action: 'SEEK_FF_30S', currentTime: this.playerState.currentTime };
    }
    return { handled: false };
  }

  handleRewind() {
    if (this.activeLayer === 'player') {
      this.playerState.currentTime = Math.max(0, this.playerState.currentTime - 30);
      return { handled: true, action: 'SEEK_RW_30S', currentTime: this.playerState.currentTime };
    }
    return { handled: false };
  }

  handleTrackNext() {
    if (this.activeLayer === 'audio') {
      if (this.audioState.currentTrackIdx < this.audioState.totalTracks - 1) {
        this.audioState.currentTrackIdx++;
      }
      return { handled: true, action: 'NEXT_TRACK', index: this.audioState.currentTrackIdx };
    }
    return { handled: false };
  }

  handleTrackPrev() {
    if (this.activeLayer === 'audio') {
      if (this.audioState.currentTrackIdx > 0) {
        this.audioState.currentTrackIdx--;
      }
      return { handled: true, action: 'PREV_TRACK', index: this.audioState.currentTrackIdx };
    }
    return { handled: false };
  }
}

module.exports = {
  SpatialNavSimulator
};
