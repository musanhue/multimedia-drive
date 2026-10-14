// Feature F10: 2D Spatial Navigation Engine - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F10',
  featureName: '2D Spatial Navigation Engine (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F10-B01',
      name: 'Navigation at top boundary: ArrowUp on first row (row 0) retains focus without wrapping or error',
      run: async () => {
        const sim = new SpatialNavSimulator();
        Assert.equal(sim.focusRow, 0);
        const res = sim.dispatchKey(38); // ArrowUp on row 0
        Assert.equal(sim.focusRow, 0, 'Row should remain 0');
        Assert.equal(res.boundaryReached, true);
      }
    },
    {
      id: 'F10-B02',
      name: 'Navigation at bottom boundary: ArrowDown on last row (row 4) retains focus on last row',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.focusRow = 4; // last row (Música)
        const res = sim.dispatchKey(40); // ArrowDown
        Assert.equal(sim.focusRow, 4, 'Row should remain 4');
        Assert.equal(res.boundaryReached, true);
      }
    },
    {
      id: 'F10-B03',
      name: 'Navigation at left boundary: ArrowLeft on first column (col 0) retains focus on first card',
      run: async () => {
        const sim = new SpatialNavSimulator();
        Assert.equal(sim.focusCol, 0);
        const res = sim.dispatchKey(37); // ArrowLeft on col 0
        Assert.equal(sim.focusCol, 0);
        Assert.equal(res.boundaryReached, true);
      }
    },
    {
      id: 'F10-B04',
      name: 'Navigation at right boundary: ArrowRight on last card of row retains focus on last card',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.focusCol = sim.grid[0].length - 1; // last card in row 0
        const res = sim.dispatchKey(39); // ArrowRight
        Assert.equal(sim.focusCol, sim.grid[0].length - 1);
        Assert.equal(res.boundaryReached, true);
      }
    },
    {
      id: 'F10-B05',
      name: 'Unmapped keycode (e.g. keycode 999 or TV volume key) is handled safely without throwing exceptions',
      run: async () => {
        const sim = new SpatialNavSimulator();
        const res = sim.dispatchKey(999);
        Assert.equal(res.handled, false);
        Assert.equal(res.reason, 'UNMAPPED_KEY');
      }
    }
  ]
};
