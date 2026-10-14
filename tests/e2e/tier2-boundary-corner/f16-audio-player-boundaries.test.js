// Feature F16: Audio Player with Playlist - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F16',
  featureName: 'Audio Player with Playlist (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F16-B01',
      name: 'MediaTrackPrevious on first audio track (track 0) clamps track index to 0 without underflow',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13); // open audio
        Assert.equal(sim.audioState.currentTrackIdx, 0);

        sim.dispatchKey(10232); // TrackPrev on track 0
        Assert.equal(sim.audioState.currentTrackIdx, 0);
      }
    },
    {
      id: 'F16-B02',
      name: 'MediaTrackNext on last audio track in playlist clamps track index to last track without overflow',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        sim.audioState.currentTrackIdx = sim.audioState.totalTracks - 1; // last track

        sim.dispatchKey(10233); // TrackNext on last track
        Assert.equal(sim.audioState.currentTrackIdx, sim.audioState.totalTracks - 1);
      }
    },
    {
      id: 'F16-B03',
      name: 'Audio files listing provides positive duration in milliseconds for timeline scrubber',
      run: async (client) => {
        const res = await client.get('/api/drive/files/musica');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.ok(item.durationMillis > 0);
        }
      }
    },
    {
      id: 'F16-B04',
      name: 'MediaPlayPause key (10252) toggles audio playback state cleanly',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        Assert.equal(sim.audioState.isPlaying, true);

        sim.dispatchKey(10252); // Pause
        Assert.equal(sim.audioState.isPlaying, false);

        sim.dispatchKey(10252); // Resume
        Assert.equal(sim.audioState.isPlaying, true);
      }
    },
    {
      id: 'F16-B05',
      name: 'Audio items specify audio/* MIME type across MP3 and FLAC tracks',
      run: async (client) => {
        const res = await client.get('/api/drive/files/musica');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.includes(item.mimeType, 'audio/');
        }
      }
    }
  ]
};
