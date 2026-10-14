// Feature F14: Custom Video Player - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F14',
  featureName: 'Custom Video Player (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F14-B01',
      name: 'Seeking forward past total duration clamps scrubber time to exact video duration',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13);
        sim.dispatchKey(13); // start player
        sim.playerState.currentTime = sim.playerState.duration - 5; // 5s before end

        sim.dispatchKey(39); // seek forward +10s
        Assert.equal(sim.playerState.currentTime, sim.playerState.duration, 'Must clamp to duration');
      }
    },
    {
      id: 'F14-B02',
      name: 'Seeking backward before 0:00 clamps scrubber time to 0 without negative timestamps',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        sim.playerState.currentTime = 3;

        sim.dispatchKey(37); // seek back -10s
        Assert.equal(sim.playerState.currentTime, 0, 'Must clamp to 0');
      }
    },
    {
      id: 'F14-B03',
      name: 'Multiple rapid Play/Pause toggles maintain correct binary playing state',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        Assert.equal(sim.playerState.playing, true);

        // 4 toggles: false, true, false, true
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        Assert.equal(sim.playerState.playing, true);
      }
    },
    {
      id: 'F14-B04',
      name: 'Seeking during paused state preserves paused state while updating scrubber position',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        sim.dispatchKey(13); // pause playback
        Assert.equal(sim.playerState.playing, false);

        sim.dispatchKey(39); // seek forward +10s
        Assert.equal(sim.playerState.playing, false, 'Must remain paused');
        Assert.equal(sim.playerState.currentTime, 10);
      }
    },
    {
      id: 'F14-B05',
      name: 'Fast-forward key (417) clamps to duration at end of media',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13);
        sim.dispatchKey(13);
        sim.playerState.currentTime = sim.playerState.duration - 15;

        sim.dispatchKey(417); // FF +30s
        Assert.equal(sim.playerState.currentTime, sim.playerState.duration);
      }
    }
  ]
};
