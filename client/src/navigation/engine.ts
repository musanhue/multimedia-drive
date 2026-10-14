import { RemoteKeys } from './keys';
import type { NavNode, NavRect, LayerState, KeyDispatchResult } from '../types';

export class SpatialNavigationEngine {
  public grid: NavNode[][];
  public focusRow: number;
  public focusCol: number;
  public columnMemory: number;
  public activeLayer: string;
  public layerStack: LayerState[];
  public spatialNodes: Map<string, NavNode[]>;
  public spatialFocus: Map<string, string>;

  constructor(initialGrid: NavNode[][] = []) {
    this.grid = initialGrid;
    this.focusRow = 0;
    this.focusCol = 0;
    this.columnMemory = 0;
    this.activeLayer = 'catalog';
    this.layerStack = [{ layerId: 'catalog', restoreRow: 0, restoreCol: 0 }];
    this.spatialNodes = new Map();
    this.spatialFocus = new Map();
  }

  public setGrid(grid: NavNode[][]): void {
    this.grid = grid;
    if (this.focusRow >= grid.length) this.focusRow = Math.max(0, grid.length - 1);
    if (grid[this.focusRow] && this.focusCol >= grid[this.focusRow].length) {
      this.focusCol = Math.max(0, grid[this.focusRow].length - 1);
    }
    this.columnMemory = this.focusCol;
  }

  public registerSpatialLayer(layerId: string, nodes: NavNode[], defaultFocusId?: string): void {
    this.spatialNodes.set(layerId, nodes);
    if (defaultFocusId) {
      this.spatialFocus.set(layerId, defaultFocusId);
    } else if (nodes.length > 0) {
      this.spatialFocus.set(layerId, nodes[0].id);
    }
  }

  public getCurrentFocus(): NavNode | null {
    if (this.activeLayer === 'catalog') {
      if (this.grid.length > this.focusRow && this.grid[this.focusRow].length > this.focusCol) {
        return this.grid[this.focusRow][this.focusCol];
      }
      return null;
    }

    const nodes = this.spatialNodes.get(this.activeLayer) || [];
    const activeId = this.spatialFocus.get(this.activeLayer);
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === activeId) return nodes[i];
    }
    return nodes.length > 0 ? nodes[0] : null;
  }

  public dispatchKey(keyCode: number): KeyDispatchResult {
    switch (keyCode) {
      case RemoteKeys.ARROW_LEFT:
        return this.handleLeft();
      case RemoteKeys.ARROW_RIGHT:
        return this.handleRight();
      case RemoteKeys.ARROW_UP:
        return this.handleUp();
      case RemoteKeys.ARROW_DOWN:
        return this.handleDown();
      case RemoteKeys.ENTER:
        return this.handleEnter();
      case RemoteKeys.RETURN:
      case RemoteKeys.ESCAPE:
      case RemoteKeys.BACKSPACE:
        return this.handleReturn();
      case RemoteKeys.MEDIA_PLAY:
      case RemoteKeys.MEDIA_PAUSE:
      case RemoteKeys.MEDIA_PLAY_PAUSE:
        return { handled: true, action: 'MEDIA_PLAY_PAUSE', layer: this.activeLayer };
      case RemoteKeys.MEDIA_FAST_FORWARD:
        return { handled: true, action: 'MEDIA_FF', layer: this.activeLayer };
      case RemoteKeys.MEDIA_REWIND:
        return { handled: true, action: 'MEDIA_RW', layer: this.activeLayer };
      case RemoteKeys.MEDIA_STOP:
        return { handled: true, action: 'MEDIA_STOP', layer: this.activeLayer };
      case RemoteKeys.MEDIA_TRACK_NEXT:
        return { handled: true, action: 'MEDIA_NEXT', layer: this.activeLayer };
      case RemoteKeys.MEDIA_TRACK_PREVIOUS:
        return { handled: true, action: 'MEDIA_PREV', layer: this.activeLayer };
      default:
        return { handled: false, reason: 'UNMAPPED_KEY', keyCode: keyCode };
    }
  }

  private handleLeft(): KeyDispatchResult {
    if (this.activeLayer !== 'catalog') {
      return this.moveSpatial('left');
    }

    if (this.focusCol > 0) {
      this.focusCol--;
      this.columnMemory = this.focusCol;
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusCol === 0 };
    }
    return { handled: true, focus: this.grid[this.focusRow] ? this.grid[this.focusRow][this.focusCol] : null, boundaryReached: true };
  }

  private handleRight(): KeyDispatchResult {
    if (this.activeLayer !== 'catalog') {
      return this.moveSpatial('right');
    }

    const rowLen = this.grid[this.focusRow] ? this.grid[this.focusRow].length : 0;
    if (this.focusCol < rowLen - 1) {
      this.focusCol++;
      this.columnMemory = this.focusCol;
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusCol === rowLen - 1 };
    }
    return { handled: true, focus: this.grid[this.focusRow] ? this.grid[this.focusRow][this.focusCol] : null, boundaryReached: true };
  }

  private handleDown(): KeyDispatchResult {
    if (this.activeLayer !== 'catalog') {
      return this.moveSpatial('down');
    }

    if (this.focusRow < this.grid.length - 1) {
      this.focusRow++;
      const rowLen = this.grid[this.focusRow].length;
      // Preserve column memory
      this.focusCol = Math.min(this.columnMemory, rowLen - 1);
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusRow === this.grid.length - 1 };
    }
    return { handled: true, focus: this.grid[this.focusRow] ? this.grid[this.focusRow][this.focusCol] : null, boundaryReached: true };
  }

  private handleUp(): KeyDispatchResult {
    if (this.activeLayer !== 'catalog') {
      return this.moveSpatial('up');
    }

    if (this.focusRow > 0) {
      this.focusRow--;
      const rowLen = this.grid[this.focusRow].length;
      // Preserve column memory
      this.focusCol = Math.min(this.columnMemory, rowLen - 1);
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusRow === 0 };
    }
    return { handled: true, focus: this.grid[this.focusRow] ? this.grid[this.focusRow][this.focusCol] : null, boundaryReached: true };
  }

  private handleEnter(): KeyDispatchResult {
    const focusNode = this.getCurrentFocus();
    return {
      handled: true,
      action: 'ENTER',
      layer: this.activeLayer,
      focus: focusNode
    };
  }

  private handleReturn(): KeyDispatchResult {
    if (this.layerStack.length > 1) {
      const popped = this.layerStack.pop()!;
      if (popped.onClose) popped.onClose();

      const top = this.layerStack[this.layerStack.length - 1];
      this.activeLayer = top.layerId;

      if (this.activeLayer === 'catalog') {
        if (popped.restoreRow !== undefined) this.focusRow = popped.restoreRow;
        if (popped.restoreCol !== undefined) this.focusCol = popped.restoreCol;
        this.columnMemory = this.focusCol;
      } else if (popped.invokingId) {
        this.spatialFocus.set(this.activeLayer, popped.invokingId);
      }

      return {
        handled: true,
        action: 'EXIT_LAYER',
        layer: this.activeLayer,
        focus: this.getCurrentFocus()
      };
    }

    return {
      handled: true,
      action: 'SHOW_EXIT_DIALOG',
      layer: 'catalog'
    };
  }

  public pushLayer(layerId: string, options: { defaultFocusId?: string; onClose?: () => void } = {}): void {
    const currentFocus = this.getCurrentFocus();
    this.layerStack.push({
      layerId: layerId,
      invokingId: currentFocus ? currentFocus.id : null,
      restoreRow: this.focusRow,
      restoreCol: this.focusCol,
      onClose: options.onClose
    });
    this.activeLayer = layerId;
    if (options.defaultFocusId) {
      this.spatialFocus.set(layerId, options.defaultFocusId);
    }
  }

  public popLayer(): KeyDispatchResult {
    return this.handleReturn();
  }

  private moveSpatial(direction: 'left' | 'right' | 'up' | 'down'): KeyDispatchResult {
    const nodes = this.spatialNodes.get(this.activeLayer) || [];
    if (nodes.length <= 1) {
      return { handled: true, trapped: true, layer: this.activeLayer, focus: this.getCurrentFocus() };
    }

    const currentFocus = this.getCurrentFocus();
    if (!currentFocus || !currentFocus.rect) {
      return { handled: true, trapped: true, layer: this.activeLayer, focus: currentFocus };
    }

    const src = currentFocus.rect;
    let bestNode: NavNode | null = null;
    let minDistance = Infinity;

    for (let i = 0; i < nodes.length; i++) {
      const target = nodes[i];
      if (target.id === currentFocus.id || !target.rect) continue;

      const dist = this.calculateDirectionalDistance(src, target.rect, direction);
      if (dist < minDistance) {
        minDistance = dist;
        bestNode = target;
      }
    }

    if (bestNode) {
      this.spatialFocus.set(this.activeLayer, bestNode.id);
      return { handled: true, focus: bestNode, layer: this.activeLayer };
    }

    // Trapped within layer when no valid candidate exists in that direction
    return { handled: true, trapped: true, layer: this.activeLayer, focus: currentFocus };
  }

  public calculateDirectionalDistance(src: NavRect, tgt: NavRect, direction: 'left' | 'right' | 'up' | 'down'): number {
    const srcCenter = { x: src.left + src.width / 2, y: src.top + src.height / 2 };
    const tgtCenter = { x: tgt.left + tgt.width / 2, y: tgt.top + tgt.height / 2 };

    let primaryDist: number;
    let secondaryDist: number;

    switch (direction) {
      case 'right':
        if (tgt.left <= src.left + 5) return Infinity;
        primaryDist = tgt.left - (src.left + src.width);
        secondaryDist = Math.abs(tgtCenter.y - srcCenter.y);
        break;
      case 'left':
        if (tgt.left + tgt.width >= src.left + src.width - 5) return Infinity;
        primaryDist = src.left - (tgt.left + tgt.width);
        secondaryDist = Math.abs(tgtCenter.y - srcCenter.y);
        break;
      case 'down':
        if (tgt.top <= src.top + 5) return Infinity;
        primaryDist = tgt.top - (src.top + src.height);
        secondaryDist = Math.abs(tgtCenter.x - srcCenter.x);
        break;
      case 'up':
        if (tgt.top + tgt.height >= src.top + src.height - 5) return Infinity;
        primaryDist = src.top - (tgt.top + tgt.height);
        secondaryDist = Math.abs(tgtCenter.x - srcCenter.x);
        break;
      default:
        return Infinity;
    }

    if (primaryDist < 0) primaryDist = 0;
    // 2.5x perpendicular penalty preserves row/column alignment
    return primaryDist + 2.5 * secondaryDist;
  }
}
