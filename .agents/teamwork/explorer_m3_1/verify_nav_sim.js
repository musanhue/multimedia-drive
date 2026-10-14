const assert = require('assert');

class TestSpatialNavEngine {
  constructor(grid) {
    this.grid = grid;
    this.focusRow = 0;
    this.focusCol = 0;
    this.columnMemory = 0;
    this.activeLayer = 'catalog';
    this.layerStack = [{ layerId: 'catalog', focusRow: 0, focusCol: 0 }];
    this.modalButtons = [{ id: 'btn_play' }, { id: 'btn_close' }];
    this.modalFocusIdx = 0;
  }

  getCurrentFocus() {
    if (this.activeLayer === 'modal') {
      return this.modalButtons[this.modalFocusIdx];
    }
    return this.grid[this.focusRow][this.focusCol];
  }

  dispatchKey(keyCode) {
    switch (keyCode) {
      case 37: return this.handleLeft();
      case 38: return this.handleUp();
      case 39: return this.handleRight();
      case 40: return this.handleDown();
      case 13: return this.handleEnter();
      case 10009:
      case 27:
      case 8: return this.handleReturn();
      default: return { handled: false, reason: 'UNMAPPED_KEY' };
    }
  }

  handleLeft() {
    if (this.activeLayer === 'modal') {
      if (this.modalFocusIdx > 0) this.modalFocusIdx--;
      return { handled: true, layer: this.activeLayer, focus: this.modalButtons[this.modalFocusIdx] };
    }
    if (this.focusCol > 0) {
      this.focusCol--;
      this.columnMemory = this.focusCol;
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusCol === 0 };
    }
    return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: true };
  }

  handleRight() {
    if (this.activeLayer === 'modal') {
      if (this.modalFocusIdx < this.modalButtons.length - 1) this.modalFocusIdx++;
      return { handled: true, layer: this.activeLayer, focus: this.modalButtons[this.modalFocusIdx] };
    }
    const rowLen = this.grid[this.focusRow].length;
    if (this.focusCol < rowLen - 1) {
      this.focusCol++;
      this.columnMemory = this.focusCol;
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusCol === rowLen - 1 };
    }
    return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: true };
  }

  handleDown() {
    if (this.activeLayer === 'modal') {
      return { handled: true, trapped: true, layer: 'modal' };
    }
    if (this.focusRow < this.grid.length - 1) {
      this.focusRow++;
      const rowLen = this.grid[this.focusRow].length;
      this.focusCol = Math.min(this.columnMemory, rowLen - 1);
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusRow === this.grid.length - 1 };
    }
    return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: true };
  }

  handleUp() {
    if (this.activeLayer === 'modal') {
      return { handled: true, trapped: true, layer: 'modal' };
    }
    if (this.focusRow > 0) {
      this.focusRow--;
      const rowLen = this.grid[this.focusRow].length;
      this.focusCol = Math.min(this.columnMemory, rowLen - 1);
      return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: this.focusRow === 0 };
    }
    return { handled: true, focus: this.grid[this.focusRow][this.focusCol], boundaryReached: true };
  }

  handleEnter() {
    if (this.activeLayer === 'catalog') {
      // Open modal
      this.layerStack.push({
        layerId: 'modal',
        restoreRow: this.focusRow,
        restoreCol: this.focusCol,
        invokingId: this.grid[this.focusRow][this.focusCol].id
      });
      this.activeLayer = 'modal';
      this.modalFocusIdx = 0;
      return { handled: true, action: 'OPEN_MODAL', focus: this.modalButtons[0] };
    }
    return { handled: true, action: 'ACTIVATE', focus: this.getCurrentFocus() };
  }

  handleReturn() {
    if (this.layerStack.length > 1) {
      const popped = this.layerStack.pop();
      const top = this.layerStack[this.layerStack.length - 1];
      this.activeLayer = top.layerId;
      this.focusRow = popped.restoreRow;
      this.focusCol = popped.restoreCol;
      this.columnMemory = this.focusCol;
      return { handled: true, action: 'EXIT_MODAL', focus: this.grid[this.focusRow][this.focusCol] };
    }
    return { handled: true, action: 'SHOW_EXIT_DIALOG' };
  }
}

// Verification suite:
const grid = [
  [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
  [{ id: 's0' }, { id: 's1' }, { id: 's2' }],
  [{ id: 'f0' }, { id: 'f1' }, { id: 'f2' }]
];

const sim = new TestSpatialNavEngine(grid);

// 1. Move right to Col 2
sim.dispatchKey(39); // p1
sim.dispatchKey(39); // p2
assert.strictEqual(sim.focusCol, 2);
assert.strictEqual(sim.getCurrentFocus().id, 'p2');

// 2. Move down to Row 1 (preserve Col 2)
sim.dispatchKey(40);
assert.strictEqual(sim.focusRow, 1);
assert.strictEqual(sim.focusCol, 2);
assert.strictEqual(sim.getCurrentFocus().id, 's2');

// 3. Move up back to Row 0 (preserve Col 2)
sim.dispatchKey(38);
assert.strictEqual(sim.focusRow, 0);
assert.strictEqual(sim.focusCol, 2);
assert.strictEqual(sim.getCurrentFocus().id, 'p2');

// 4. Open modal
const openRes = sim.dispatchKey(13);
assert.strictEqual(openRes.action, 'OPEN_MODAL');
assert.strictEqual(sim.activeLayer, 'modal');
assert.strictEqual(sim.getCurrentFocus().id, 'btn_play');

// 5. Test modal focus trapping (ArrowUp should not escape)
const upRes = sim.dispatchKey(38);
assert.strictEqual(upRes.trapped, true);
assert.strictEqual(sim.activeLayer, 'modal');

// 6. Test Return key restores invoking card
const retRes = sim.dispatchKey(10009);
assert.strictEqual(retRes.action, 'EXIT_MODAL');
assert.strictEqual(sim.activeLayer, 'catalog');
assert.strictEqual(sim.getCurrentFocus().id, 'p2');

console.log('ALL SPATIAL NAV SIMULATION CHECKS PASSED!');
