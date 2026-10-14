// Feature F12: Movie Detail Modal - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F12',
  featureName: 'Movie Detail Modal',
  tier: 1,
  tests: [
    {
      id: 'F12-01',
      name: 'Detail modal metadata query provides complete composition: title, poster, backdrop, synopsis, cast, director',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Inception&year=2010');
        Assert.status(res, 200);
        Assert.equal(res.json.title, 'Origen');
        Assert.ok(res.json.posterUrl);
        Assert.ok(res.json.backdropUrl);
        Assert.ok(res.json.overview);
        Assert.equal(res.json.director, 'Christopher Nolan');
        Assert.ok(res.json.cast.length >= 3);
        Assert.ok(res.json.rating >= 7.0);
      }
    },
    {
      id: 'F12-02',
      name: 'Modal action buttons are navigable via Left/Right D-pad keys',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        Assert.equal(sim.activeLayer, 'modal');
        Assert.equal(sim.getCurrentFocus().id, 'btn_play');

        sim.dispatchKey(39); // ArrowRight to Volver button
        Assert.equal(sim.getCurrentFocus().id, 'btn_close');

        sim.dispatchKey(37); // ArrowLeft back to Reproducir button
        Assert.equal(sim.getCurrentFocus().id, 'btn_play');
      }
    },
    {
      id: 'F12-03',
      name: 'Activating Reproducir button transitions state to Video Player layer',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        const playRes = sim.dispatchKey(13); // Enter on Reproducir
        Assert.equal(playRes.handled, true);
        Assert.equal(playRes.action, 'START_PLAYBACK');
        Assert.equal(sim.activeLayer, 'player');
      }
    },
    {
      id: 'F12-04',
      name: 'Activating Volver button in modal closes modal and returns to Catalog layer',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        sim.dispatchKey(39); // focus Volver
        const closeRes = sim.dispatchKey(13); // Enter on Volver
        Assert.equal(closeRes.action, 'CLOSE_MODAL');
        Assert.equal(sim.activeLayer, 'catalog');
      }
    },
    {
      id: 'F12-05',
      name: 'Hardware Return key (10009) dismisses modal regardless of which button is currently focused',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        sim.dispatchKey(39); // focus Volver
        const returnRes = sim.dispatchKey(10009); // Return
        Assert.equal(returnRes.action, 'EXIT_MODAL');
        Assert.equal(sim.activeLayer, 'catalog');
      }
    }
  ]
};
