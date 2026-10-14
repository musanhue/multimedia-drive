import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialNavigationEngine } from '../../../client/src/navigation/engine';
import { RemoteKeys, registerTizenRemoteKeys } from '../../../client/src/navigation/keys';
import { M56Validator } from '../../harness/m56-validator';
import fs from 'fs';
import path from 'path';

// Mock Grid Data matching TV application catalog layout
const mockGrid = [
  // Row 0: Películas (5 items)
  [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
  // Row 1: Series (3 items)
  [{ id: 's0' }, { id: 's1' }, { id: 's2' }],
  // Row 2: Videos familiares (3 items)
  [{ id: 'f0' }, { id: 'f1' }, { id: 'f2' }]
];

test('Spatial Nav Unit: Horizontal D-pad Navigation', () => {
  const engine = new SpatialNavigationEngine(mockGrid);
  assert.equal(engine.focusCol, 0);

  // ArrowRight -> p1
  const r1 = engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(r1.handled, true);
  assert.equal(engine.focusCol, 1);
  assert.equal(engine.getCurrentFocus()?.id, 'p1');

  // ArrowRight -> p2
  const r2 = engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(r2.handled, true);
  assert.equal(engine.focusCol, 2);
  assert.equal(engine.getCurrentFocus()?.id, 'p2');

  // ArrowLeft -> p1
  const r3 = engine.dispatchKey(RemoteKeys.ARROW_LEFT);
  assert.equal(r3.handled, true);
  assert.equal(engine.focusCol, 1);
  assert.equal(engine.getCurrentFocus()?.id, 'p1');
});

test('Spatial Nav Unit: Boundary Conditions Retain Focus Without Wrapping', () => {
  const engine = new SpatialNavigationEngine(mockGrid);

  // Left boundary on col 0
  const leftRes = engine.dispatchKey(RemoteKeys.ARROW_LEFT);
  assert.equal(engine.focusCol, 0);
  assert.equal(leftRes.boundaryReached, true);

  // Top boundary on row 0
  const upRes = engine.dispatchKey(RemoteKeys.ARROW_UP);
  assert.equal(engine.focusRow, 0);
  assert.equal(upRes.boundaryReached, true);

  // Navigate to right boundary
  for (let i = 0; i < 10; i++) engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(engine.focusCol, 4);
  const rightRes = engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(engine.focusCol, 4);
  assert.equal(rightRes.boundaryReached, true);

  // Navigate to bottom boundary
  for (let i = 0; i < 5; i++) engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 2);
  const downRes = engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 2);
  assert.equal(downRes.boundaryReached, true);
});

test('Spatial Nav Unit: Column Memory Preservation (T3-17 Contract)', () => {
  const engine = new SpatialNavigationEngine(mockGrid);

  // 1. Move to Col 2 in Row 0 (p2)
  engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(engine.focusCol, 2);
  assert.equal(engine.getCurrentFocus()?.id, 'p2');

  // 2. Move Down to Row 1 (Series) -> Preserves Col 2 (s2)
  engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 1);
  assert.equal(engine.focusCol, 2);
  assert.equal(engine.getCurrentFocus()?.id, 's2');

  // 3. Move Up back to Row 0 -> Preserves Col 2 (p2)
  engine.dispatchKey(RemoteKeys.ARROW_UP);
  assert.equal(engine.focusRow, 0);
  assert.equal(engine.focusCol, 2);
  assert.equal(engine.getCurrentFocus()?.id, 'p2');
});

test('Spatial Nav Unit: Clamping on Shorter Rows With Column Memory Retention', () => {
  const engine = new SpatialNavigationEngine(mockGrid);

  // Move to Col 4 in Row 0 (p4)
  for (let i = 0; i < 4; i++) engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(engine.focusCol, 4);
  assert.equal(engine.columnMemory, 4);

  // Move Down to Row 1 (length 3, max col 2)
  engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(engine.focusRow, 1);
  assert.equal(engine.focusCol, 2, 'Col clamped to index 2 in row 1');
  assert.equal(engine.columnMemory, 4, 'Column memory remains 4');

  // Move Up back to Row 0 -> Restores Col 4
  engine.dispatchKey(RemoteKeys.ARROW_UP);
  assert.equal(engine.focusRow, 0);
  assert.equal(engine.focusCol, 4, 'Col 4 restored upon returning to row 0');
});

test('Spatial Nav Unit: Modal Layer Stack & Focus Trapping', () => {
  const engine = new SpatialNavigationEngine(mockGrid);

  // Move to p2 and enter modal
  engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(engine.getCurrentFocus()?.id, 'p2');

  const modalButtons = [
    { id: 'btn_play', rect: { left: 400, top: 700, width: 200, height: 60 } },
    { id: 'btn_close', rect: { left: 640, top: 700, width: 200, height: 60 } }
  ];
  engine.registerSpatialLayer('modal', modalButtons, 'btn_play');
  engine.pushLayer('modal', { defaultFocusId: 'btn_play' });

  assert.equal(engine.activeLayer, 'modal');
  assert.equal(engine.getCurrentFocus()?.id, 'btn_play');

  // Vertical navigation inside modal is trapped
  const upRes = engine.dispatchKey(RemoteKeys.ARROW_UP);
  assert.equal(upRes.trapped, true);
  assert.equal(engine.getCurrentFocus()?.id, 'btn_play');

  const downRes = engine.dispatchKey(RemoteKeys.ARROW_DOWN);
  assert.equal(downRes.trapped, true);
  assert.equal(engine.getCurrentFocus()?.id, 'btn_play');

  // Horizontal move to btn_close
  const rightRes = engine.dispatchKey(RemoteKeys.ARROW_RIGHT);
  assert.equal(rightRes.handled, true);
  assert.equal(engine.getCurrentFocus()?.id, 'btn_close');

  // Return key (10009) dismisses modal and restores invoking card focus
  const returnRes = engine.dispatchKey(RemoteKeys.RETURN);
  assert.equal(returnRes.action, 'EXIT_LAYER');
  assert.equal(engine.activeLayer, 'catalog');
  assert.equal(engine.getCurrentFocus()?.id, 'p2');
});

test('Spatial Nav Unit: 2D Geometric Vector Distance Calculation', () => {
  const engine = new SpatialNavigationEngine();
  const src = { left: 100, top: 100, width: 80, height: 80 };
  const targetRight = { left: 220, top: 100, width: 80, height: 80 };
  const targetDiagonal = { left: 220, top: 200, width: 80, height: 80 };

  const distRight = engine.calculateDirectionalDistance(src, targetRight, 'right');
  const distDiagonal = engine.calculateDirectionalDistance(src, targetDiagonal, 'right');

  // Directly horizontal item must score much lower (better candidate) than diagonal
  assert.ok(distRight < distDiagonal, 'Direct horizontal item must have lower distance than diagonal');
  assert.equal(distRight, 40); // 220 - (100 + 80) = 40; secondary = 0
  assert.equal(distDiagonal, 40 + 2.5 * 100); // 40 + 250 = 290
});

test('Spatial Nav Unit: Tizen Key Registration Helper Handles Headless Gracefully', () => {
  const res = registerTizenRemoteKeys();
  assert.equal(res.isTizen, false);
  assert.deepEqual(res.registered, []);
});

test('Spatial Nav Unit: Chromium M56 Static Compatibility of Navigation Sources', () => {
  const navDir = path.resolve(__dirname, '../../../client/src/navigation');
  const files = fs.readdirSync(navDir);
  for (const f of files) {
    if (f.endsWith('.ts')) {
      const code = fs.readFileSync(path.join(navDir, f), 'utf8');
      const res = M56Validator.validateJavaScript(code);
      assert.equal(res.valid, true, `M56 JS violation in ${f}: ${JSON.stringify(res.violations)}`);
    }
  }
});
