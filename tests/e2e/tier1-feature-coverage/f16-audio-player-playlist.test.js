// Feature F16: Audio Player with Playlist - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');

module.exports = {
  featureId: 'F16',
  featureName: 'Audio Player with Playlist',
  tier: 1,
  tests: [
    {
      id: 'F16-01',
      name: 'Audio files listing provides metadata: track title, artist, album and artwork link',
      run: async (client) => {
        const res = await client.get('/api/drive/files/musica');
        Assert.status(res, 200);
        Assert.ok(res.json.items.length > 0);
        const track = res.json.items[0];
        Assert.ok(track.title);
        Assert.ok(track.artist);
        Assert.ok(track.album);
        Assert.ok(track.thumbnailLink);
      }
    },
    {
      id: 'F16-02',
      name: 'Activating Enter on audio item launches Audio Player layer with playback active',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40); // 1
        sim.dispatchKey(40); // 2
        sim.dispatchKey(40); // 3
        sim.dispatchKey(40); // 4 (Música)
        Assert.equal(sim.focusRow, 4);

        const openRes = sim.dispatchKey(13); // Enter on track
        Assert.equal(openRes.action, 'OPEN_AUDIO_PLAYER');
        Assert.equal(sim.activeLayer, 'audio');
        Assert.equal(sim.audioState.isPlaying, true);
      }
    },
    {
      id: 'F16-03',
      name: 'MediaTrackNext key (10233) skips to next audio track in playlist',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13); // open audio
        Assert.equal(sim.audioState.currentTrackIdx, 0);

        const nextRes = sim.dispatchKey(10233); // Next Track
        Assert.equal(nextRes.action, 'NEXT_TRACK');
        Assert.equal(sim.audioState.currentTrackIdx, 1);
      }
    },
    {
      id: 'F16-04',
      name: 'MediaTrackPrevious key (10232) skips to previous audio track in playlist',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        sim.dispatchKey(10233); // Track 1

        const prevRes = sim.dispatchKey(10232); // Prev Track
        Assert.equal(prevRes.action, 'PREV_TRACK');
        Assert.equal(sim.audioState.currentTrackIdx, 0);
      }
    },
    {
      id: 'F16-05',
      name: 'Hardware Return key (10009) exits Audio Player back to Catalog layer',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(40);
        sim.dispatchKey(13);
        Assert.equal(sim.activeLayer, 'audio');

        const exitRes = sim.dispatchKey(10009); // Return
        Assert.equal(exitRes.action, 'EXIT_AUDIO');
        Assert.equal(sim.activeLayer, 'catalog');
      }
    }
  ]
};
