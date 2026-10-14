// Feature F12: Movie Detail Modal - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F12',
  featureName: 'Movie Detail Modal (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F12-B01',
      name: 'Movie with missing synopsis displays fallback notice without blank screen error',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=InexistentFilm123');
        Assert.status(res, 200);
        Assert.ok(res.json.overview.length > 0, 'Overview fallback should be provided');
      }
    },
    {
      id: 'F12-B02',
      name: 'Rapid double Enter press on Play button does not spawn duplicate player layers',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        sim.dispatchKey(13); // first Enter (Play)
        Assert.equal(sim.activeLayer, 'player');

        sim.dispatchKey(13); // second Enter (toggles pause inside player, not new layer)
        Assert.equal(sim.activeLayer, 'player');
        Assert.equal(sim.layerStack.filter(l => l === 'player').length, 1, 'Only 1 player in stack');
      }
    },
    {
      id: 'F12-B03',
      name: 'Modal button navigation at left/right boundaries retains focus on edge buttons',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        Assert.equal(sim.modalFocusIdx, 0); // Reproducir

        sim.dispatchKey(37); // Left on edge button (col 0)
        Assert.equal(sim.modalFocusIdx, 0, 'Idx should remain 0');

        sim.dispatchKey(39); // Right (Volver)
        Assert.equal(sim.modalFocusIdx, 1);

        sim.dispatchKey(39); // Right on edge button (col 1)
        Assert.equal(sim.modalFocusIdx, 1, 'Idx should remain 1');
      }
    },
    {
      id: 'F12-B04',
      name: 'Detail modal with 0 rating displays neutral rating badge without NaN rendering',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=UnknownMovie');
        Assert.status(res, 200);
        Assert.equal(isNaN(res.json.rating), false);
      }
    },
    {
      id: 'F12-B05',
      name: 'Modal backdrop with null value falls back to dark gradient without broken image icon',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=UnknownMovie');
        Assert.status(res, 200);
        Assert.equal(res.json.backdropUrl, null);
      }
    }
  ]
};
