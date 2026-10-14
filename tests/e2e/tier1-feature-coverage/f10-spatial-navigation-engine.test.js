// Feature F10: 2D Spatial Navigation Engine - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F10',
  featureName: '2D Spatial Navigation Engine',
  tier: 1,
  tests: [
    {
      id: 'F10-01',
      name: 'ArrowRight key (keycode 39) moves horizontal focus to next card in carousel',
      run: async () => {
        const sim = new SpatialNavSimulator();
        Assert.equal(sim.focusCol, 0, 'Initial column should be 0');
        const res = sim.dispatchKey(39); // ArrowRight
        Assert.equal(res.handled, true);
        Assert.equal(sim.focusCol, 1, 'Column should advance to 1');
        Assert.equal(sim.getCurrentFocus().id, 'p1');
      }
    },
    {
      id: 'F10-02',
      name: 'ArrowDown key (keycode 40) moves vertical focus from row 0 to row 1',
      run: async () => {
        const sim = new SpatialNavSimulator();
        Assert.equal(sim.focusRow, 0);
        const res = sim.dispatchKey(40); // ArrowDown
        Assert.equal(res.handled, true);
        Assert.equal(sim.focusRow, 1, 'Row should advance to 1');
        Assert.equal(sim.getCurrentFocus().id, 's0');
      }
    },
    {
      id: 'F10-03',
      name: 'Enter key (keycode 13) on movie card opens Movie Detail Modal with focus on Play button',
      run: async () => {
        const sim = new SpatialNavSimulator();
        const res = sim.dispatchKey(13); // Enter on movie card
        Assert.equal(res.handled, true);
        Assert.equal(res.action, 'OPEN_MODAL');
        Assert.equal(sim.activeLayer, 'modal');
        Assert.equal(sim.getCurrentFocus().id, 'btn_play', 'Focus must default to Reproducir button');
      }
    },
    {
      id: 'F10-04',
      name: 'Hardware Return key (keycode 10009) closes active modal and restores focus to invoking card',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(39); // move to card p1
        sim.dispatchKey(13); // open modal
        Assert.equal(sim.activeLayer, 'modal');

        const returnRes = sim.dispatchKey(10009); // Return key
        Assert.equal(returnRes.handled, true);
        Assert.equal(returnRes.action, 'EXIT_MODAL');
        Assert.equal(sim.activeLayer, 'catalog');
        Assert.equal(sim.getCurrentFocus().id, 'p1', 'Focus must be restored to card p1');
      }
    },
    {
      id: 'F10-05',
      name: 'Spatial navigation traps focus within active modal layer (vertical D-pad does not leak)',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        Assert.equal(sim.activeLayer, 'modal');

        const upRes = sim.dispatchKey(38); // ArrowUp inside modal
        Assert.equal(upRes.trapped, true, 'Navigation must be trapped inside modal');
        Assert.equal(sim.activeLayer, 'modal', 'Active layer must remain modal');
      }
    }
  ]
};
