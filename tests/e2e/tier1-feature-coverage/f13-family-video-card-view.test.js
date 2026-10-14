// Feature F13: Family Video Card View - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F13',
  featureName: 'Family Video Card View',
  tier: 1,
  tests: [
    {
      id: 'F13-01',
      name: 'Family video card payload contains localized date badge in Spanish',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items[0];
        Assert.includes(item.dateFormatted, 'de');
      }
    },
    {
      id: 'F13-02',
      name: 'Family video card payload contains formatted duration string (MM:SS)',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items[0];
        Assert.match(item.durationFormatted, /^\d{1,2}:\d{2}$/);
      }
    },
    {
      id: 'F13-03',
      name: 'Family video card payload specifies 16:9 aspect ratio dimensions (1920x1080 or 3840x2160)',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items[0];
        Assert.equal(item.width / item.height, 16 / 9);
      }
    },
    {
      id: 'F13-04',
      name: 'Activating Enter key on family video card bypasses detail modal and boots Video Player immediately',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40); // move to row 1 (Series)
        sim.dispatchKey(40); // move to row 2 (Videos familiares)
        Assert.equal(sim.focusRow, 2);

        const enterRes = sim.dispatchKey(13); // Enter on family video card
        Assert.equal(enterRes.handled, true);
        Assert.equal(enterRes.action, 'DIRECT_PLAY', 'Must initiate direct playback bypassing modal');
        Assert.equal(sim.activeLayer, 'player');
      }
    },
    {
      id: 'F13-05',
      name: 'Exiting Video Player from family video returns focus directly to the invoked family video card',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40); // row 1
        sim.dispatchKey(40); // row 2
        sim.dispatchKey(39); // col 1 (f1)
        sim.dispatchKey(13); // direct play
        Assert.equal(sim.activeLayer, 'player');

        const returnRes = sim.dispatchKey(10009); // Return
        Assert.equal(returnRes.action, 'EXIT_PLAYER');
        Assert.equal(sim.activeLayer, 'catalog');
        Assert.equal(sim.getCurrentFocus().id, 'f1');
      }
    }
  ]
};
