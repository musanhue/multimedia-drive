// Feature F15: Fullscreen Photo Slideshow - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F15',
  featureName: 'Fullscreen Photo Slideshow',
  tier: 1,
  tests: [
    {
      id: 'F15-01',
      name: 'Activating Enter on a photo card launches Fullscreen Slideshow layer',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40); // row 1
        sim.dispatchKey(40); // row 2
        sim.dispatchKey(40); // row 3 (Fotos)
        Assert.equal(sim.focusRow, 3);

        const res = sim.dispatchKey(13); // Enter on photo
        Assert.equal(res.action, 'OPEN_SLIDESHOW');
        Assert.equal(sim.activeLayer, 'slideshow');
      }
    },
    {
      id: 'F15-02',
      name: 'ArrowRight key (39) manually advances to next photo in slideshow',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13); // open slideshow
        Assert.equal(sim.slideshowState.activeIndex, 0);

        const nextRes = sim.dispatchKey(39); // ArrowRight
        Assert.equal(nextRes.action, 'NEXT_PHOTO');
        Assert.equal(sim.slideshowState.activeIndex, 1);
      }
    },
    {
      id: 'F15-03',
      name: 'ArrowLeft key (37) navigates to previous photo in slideshow',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        sim.dispatchKey(39); // index 1

        const prevRes = sim.dispatchKey(37); // ArrowLeft
        Assert.equal(prevRes.action, 'PREV_PHOTO');
        Assert.equal(sim.slideshowState.activeIndex, 0);
      }
    },
    {
      id: 'F15-04',
      name: 'Enter key (13) and MediaPlayPause key (10252) toggle auto-advance slideshow timer',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        Assert.equal(sim.slideshowState.autoAdvance, true);

        sim.dispatchKey(13); // pause auto-advance
        Assert.equal(sim.slideshowState.autoAdvance, false);

        sim.dispatchKey(10252); // resume auto-advance
        Assert.equal(sim.slideshowState.autoAdvance, true);
      }
    },
    {
      id: 'F15-05',
      name: 'Hardware Return key (10009) exits slideshow back to photos carousel',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        Assert.equal(sim.activeLayer, 'slideshow');

        const exitRes = sim.dispatchKey(10009); // Return
        Assert.equal(exitRes.action, 'EXIT_SLIDESHOW');
        Assert.equal(sim.activeLayer, 'catalog');
      }
    }
  ]
};
