// Feature F11: Catalog Carousel View - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F11',
  featureName: 'Catalog Carousel View (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F11-B01',
      name: 'Carousel with 1 single card navigates Left/Right without index out of bounds error',
      run: async () => {
        const singleItemGrid = [[{ id: 'single_item', label: 'Solo Movie' }]];
        const sim = new SpatialNavSimulator(singleItemGrid);
        Assert.equal(sim.focusCol, 0);

        sim.dispatchKey(39); // Right
        Assert.equal(sim.focusCol, 0);

        sim.dispatchKey(37); // Left
        Assert.equal(sim.focusCol, 0);
      }
    },
    {
      id: 'F11-B02',
      name: 'Rapid directional key bursts (5 keypresses within 100ms) do not desynchronize focus state',
      run: async () => {
        const sim = new SpatialNavSimulator();
        // Burst 4 rights then 2 lefts
        sim.dispatchKey(39);
        sim.dispatchKey(39);
        sim.dispatchKey(39);
        sim.dispatchKey(39);
        sim.dispatchKey(37);
        sim.dispatchKey(37);
        Assert.equal(sim.focusCol, 2, 'Col should be accurately 2');
        Assert.equal(sim.getCurrentFocus().id, 'p2');
      }
    },
    {
      id: 'F11-B03',
      name: 'Transitioning vertically between rows with unequal column lengths clamps column gracefully',
      run: async () => {
        const sim = new SpatialNavSimulator();
        // Row 0 has 5 items (idx 0..4). Move to col 4.
        sim.focusCol = 4;
        Assert.equal(sim.focusRow, 0);

        // Move Down to Row 1 (Series has only 3 items: idx 0..2)
        sim.dispatchKey(40);
        Assert.equal(sim.focusRow, 1);
        Assert.equal(sim.focusCol, 2, 'Column must be clamped to 2 (last item of Row 1)');
      }
    },
    {
      id: 'F11-B04',
      name: 'Pressing Return key (10009) on root catalog view activates exit confirmation modal',
      run: async () => {
        const sim = new SpatialNavSimulator();
        Assert.equal(sim.activeLayer, 'catalog');
        const res = sim.dispatchKey(10009); // Return on root catalog
        Assert.equal(res.action, 'SHOW_EXIT_CONFIRMATION');
        Assert.equal(sim.exitDialogActive, true);
      }
    },
    {
      id: 'F11-B05',
      name: 'Dismissing exit confirmation dialog via Return key restores normal catalog focus',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(10009); // Show exit dialog
        Assert.equal(sim.exitDialogActive, true);

        const res = sim.dispatchKey(10009); // Dismiss exit dialog
        Assert.equal(res.action, 'DISMISS_EXIT_DIALOG');
        Assert.equal(sim.exitDialogActive, false);
      }
    }
  ]
};
