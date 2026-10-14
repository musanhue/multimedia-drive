// Feature F14: Custom Video Player - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F14',
  featureName: 'Custom Video Player',
  tier: 1,
  tests: [
    {
      id: 'F14-01',
      name: 'Video Player supports play/pause toggle via Enter key (13) and MediaPlayPause key (10252)',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        sim.dispatchKey(13); // start play
        Assert.equal(sim.activeLayer, 'player');
        Assert.equal(sim.playerState.playing, true);

        sim.dispatchKey(13); // Enter toggles pause
        Assert.equal(sim.playerState.playing, false);

        sim.dispatchKey(10252); // MediaPlayPause toggles resume
        Assert.equal(sim.playerState.playing, true);
      }
    },
    {
      id: 'F14-02',
      name: 'ArrowRight key (39) scrubs playback forward by 10 seconds and wakes controls overlay',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        sim.dispatchKey(13); // start play
        sim.playerState.currentTime = 50;

        const res = sim.dispatchKey(39); // ArrowRight
        Assert.equal(res.action, 'SEEK_FORWARD');
        Assert.equal(sim.playerState.currentTime, 60);
        Assert.equal(sim.playerState.controlsVisible, true);
      }
    },
    {
      id: 'F14-03',
      name: 'ArrowLeft key (37) scrubs playback backward by 10 seconds without dropping below 0:00',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // open modal
        sim.dispatchKey(13); // start play
        sim.playerState.currentTime = 15;

        sim.dispatchKey(37); // ArrowLeft (-10s)
        Assert.equal(sim.playerState.currentTime, 5);

        sim.dispatchKey(37); // ArrowLeft again (-10s clamped to 0)
        Assert.equal(sim.playerState.currentTime, 0);
      }
    },
    {
      id: 'F14-04',
      name: 'Fast-Forward media key (417) and Rewind media key (412) jump 30 seconds',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        sim.playerState.currentTime = 100;

        sim.dispatchKey(417); // FF (+30s)
        Assert.equal(sim.playerState.currentTime, 130);

        sim.dispatchKey(412); // RW (-30s)
        Assert.equal(sim.playerState.currentTime, 100);
      }
    },
    {
      id: 'F14-05',
      name: 'Hardware Return key (10009) terminates video playback and exits Player layer',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        Assert.equal(sim.activeLayer, 'player');

        const exitRes = sim.dispatchKey(10009); // Return
        Assert.equal(exitRes.action, 'EXIT_PLAYER');
        Assert.equal(sim.playerState.playing, false, 'Playback must be stopped on exit');
        Assert.equal(sim.activeLayer, 'modal');
      }
    }
  ]
};
