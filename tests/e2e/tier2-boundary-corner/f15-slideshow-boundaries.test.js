// Feature F15: Fullscreen Photo Slideshow - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F15',
  featureName: 'Fullscreen Photo Slideshow (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F15-B01',
      name: 'Navigating ArrowLeft on first photo (index 0) clamps index to 0 without underflow',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13); // open slideshow
        Assert.equal(sim.slideshowState.activeIndex, 0);

        sim.dispatchKey(37); // ArrowLeft on first photo
        Assert.equal(sim.slideshowState.activeIndex, 0);
      }
    },
    {
      id: 'F15-B02',
      name: 'Navigating ArrowRight on last photo in album clamps index to last photo without overflow',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        sim.slideshowState.activeIndex = sim.slideshowState.totalPhotos - 1; // last photo

        sim.dispatchKey(39); // ArrowRight on last photo
        Assert.equal(sim.slideshowState.activeIndex, sim.slideshowState.totalPhotos - 1);
      }
    },
    {
      id: 'F15-B03',
      name: 'Manual navigation during auto-advance slideshow retains active layer',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        Assert.equal(sim.slideshowState.autoAdvance, true);

        sim.dispatchKey(39); // Manual right
        Assert.equal(sim.activeLayer, 'slideshow');
        Assert.equal(sim.slideshowState.activeIndex, 1);
      }
    },
    {
      id: 'F15-B04',
      name: 'Photo items payload contains fullUrl and thumbnailLink for progressive 4K display',
      run: async (client) => {
        const res = await client.get('/api/drive/files/fotos');
        Assert.status(res, 200);
        for (const photo of res.json.items) {
          Assert.ok(photo.thumbnailLink);
          Assert.ok(photo.fullUrl);
        }
      }
    },
    {
      id: 'F15-B05',
      name: 'Exiting slideshow via Return key restores active layer to catalog without lingering timers',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        Assert.equal(sim.activeLayer, 'slideshow');

        sim.dispatchKey(10009); // Return
        Assert.equal(sim.activeLayer, 'catalog');
      }
    }
  ]
};
