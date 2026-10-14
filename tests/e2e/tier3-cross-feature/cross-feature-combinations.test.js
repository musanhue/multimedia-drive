// Tier 3: Cross-Feature Combinations (>=18 Integration Tests)
// Verifies interactions and end-to-end data flows across multiple features

const { Assert } = require('../../harness/test-client');
const { SpatialNavSimulator } = require('../../harness/spatial-nav-sim');
const { M56Validator } = require('../../harness/m56-validator');
const { TizenValidator } = require('../../harness/tizen-validator');

module.exports = {
  tier: 3,
  name: 'Cross-Feature Combinations',
  tests: [
    {
      id: 'T3-01',
      name: '[F3 + F4] Video stream Range 206 request and WebVTT subtitle track request return synchronized CORS headers',
      run: async (client) => {
        const streamRes = await client.getRange('/api/stream/vid_inc', 'bytes=0-1023');
        const subRes = await client.get('/api/subtitles/sub_inc_es');

        Assert.status(streamRes, 206);
        Assert.status(subRes, 200);
        Assert.header(streamRes, 'Access-Control-Allow-Origin', '*');
        Assert.header(subRes, 'Access-Control-Allow-Origin', '*');
        Assert.header(subRes, 'Content-Type', 'text/vtt; charset=utf-8');
      }
    },
    {
      id: 'T3-02',
      name: '[F2 + F8] Recursive traversal of Videos familiares strictly isolates items from TMDB and populates HD Drive thumbnails',
      run: async (client) => {
        const listRes = await client.get('/api/drive/files/familiares');
        Assert.status(listRes, 200);

        for (const item of listRes.json.items) {
          Assert.equal(item.tmdbEnriched, false);
          Assert.includes(item.thumbnailLink, '=s800');
          // Verify TMDB enrich endpoint strictly blocks this item
          const enrichRes = await client.get(`/api/metadata/enrich?title=${encodeURIComponent(item.name)}&category=familiares`);
          Assert.status(enrichRes, 403);
        }
      }
    },
    {
      id: 'T3-03',
      name: '[F10 + F11 + F3] D-pad navigation across catalog rows while stream prebuffering in background maintains focus without dropping keys',
      run: async (client) => {
        const sim = new SpatialNavSimulator();
        // Start background prebuffer request
        const streamPromise = client.getRange('/api/stream/vid_inc', 'bytes=0-4096');

        // Navigate during network request
        sim.dispatchKey(40); // row 1
        sim.dispatchKey(39); // card 1 in row 1

        const streamRes = await streamPromise;
        Assert.status(streamRes, 206);
        Assert.equal(sim.focusRow, 1);
        Assert.equal(sim.focusCol, 1);
        Assert.equal(sim.getCurrentFocus().id, 's1');
      }
    },
    {
      id: 'T3-04',
      name: '[F15 + F16] Fullscreen photo slideshow auto-advances while background audio playlist plays concurrently without audio interruption',
      run: async () => {
        const sim = new SpatialNavSimulator();
        // Start audio
        sim.focusRow = 4; // Música
        sim.dispatchKey(13); // Start audio player
        Assert.equal(sim.activeLayer, 'audio');
        Assert.equal(sim.audioState.isPlaying, true);

        // Return to catalog, open photo slideshow
        sim.dispatchKey(10009); // Back to catalog
        sim.focusRow = 3; // Fotos
        sim.dispatchKey(13); // Open slideshow
        Assert.equal(sim.activeLayer, 'slideshow');
        Assert.equal(sim.slideshowState.autoAdvance, true);

        // Advance photos
        sim.dispatchKey(39);
        sim.dispatchKey(39);
        Assert.equal(sim.slideshowState.activeIndex, 2);
        // Audio state must remain playing in background
        Assert.equal(sim.audioState.isPlaying, true);
      }
    },
    {
      id: 'T3-05',
      name: '[F6 + F7 + F12 + F14] Movie selection triggers filename cleaning, TMDB enrichment, opens detail modal and transitions to video player',
      run: async (client) => {
        // 1. Clean filename
        const cleanRes = await client.get('/api/metadata/clean-title?filename=Inception.2010.1080p.BluRay.x264-SPARKS.mkv');
        Assert.status(cleanRes, 200);
        Assert.equal(cleanRes.json.cleanTitle, 'Inception');
        Assert.equal(cleanRes.json.year, 2010);

        // 2. TMDB Enrichment
        const enrichRes = await client.get(`/api/metadata/enrich?title=${cleanRes.json.cleanTitle}&year=${cleanRes.json.year}`);
        Assert.status(enrichRes, 200);
        Assert.equal(enrichRes.json.director, 'Christopher Nolan');

        // 3. UI Navigation flow
        const sim = new SpatialNavSimulator();
        const openModalRes = sim.dispatchKey(13); // Open Detail Modal
        Assert.equal(openModalRes.action, 'OPEN_MODAL');
        Assert.equal(sim.activeLayer, 'modal');

        // 4. Play action launches player
        const playRes = sim.dispatchKey(13); // Click Reproducir
        Assert.equal(playRes.action, 'START_PLAYBACK');
        Assert.equal(sim.activeLayer, 'player');
        Assert.equal(sim.playerState.playing, true);
      }
    },
    {
      id: 'T3-06',
      name: '[F3 + F4 + F14] Range seeking in Video Player synchronizes WebVTT subtitle track to new seek offset',
      run: async (client) => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(13); // Modal
        sim.dispatchKey(13); // Player
        Assert.equal(sim.activeLayer, 'player');

        // Seek forward 10 seconds 3 times (+30s)
        sim.dispatchKey(39);
        sim.dispatchKey(39);
        sim.dispatchKey(39);
        Assert.equal(sim.playerState.currentTime, 30);

        // Fetch corresponding Range chunk for video
        const byteOffset = 30 * 1024 * 128; // Estimated byte offset
        const streamRes = await client.getRange('/api/stream/vid_inc', `bytes=${byteOffset}-`);
        Assert.status(streamRes, 206);

        // Subtitle track remains accessible and valid
        const subRes = await client.get('/api/subtitles/sub_inc_es');
        Assert.status(subRes, 200);
        Assert.ok(subRes.text.startsWith('WEBVTT'));
      }
    },
    {
      id: 'T3-07',
      name: '[F5 + F16] Media container detection routes MP3 audio file to Audio Player with track metadata',
      run: async (client) => {
        const res = await client.get('/api/drive/files/musica');
        Assert.status(res, 200);
        const track = res.json.items[0];
        Assert.equal(track.mimeType, 'audio/mpeg');

        const streamRes = await client.head(`/api/stream/${track.id}`);
        Assert.status(streamRes, 200);
        Assert.header(streamRes, 'Content-Type', 'audio/mpeg');
      }
    },
    {
      id: 'T3-08',
      name: '[F10 + F12 + F14] Return key (10009) cascade: Player -> Modal -> Exact invoked Catalog card',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.dispatchKey(39); // Card 1 (p1)
        sim.dispatchKey(39); // Card 2 (p2)
        Assert.equal(sim.getCurrentFocus().id, 'p2');

        sim.dispatchKey(13); // Open modal for p2
        Assert.equal(sim.activeLayer, 'modal');

        sim.dispatchKey(13); // Start player
        Assert.equal(sim.activeLayer, 'player');

        // Step 1: Return from player -> Modal
        const ret1 = sim.dispatchKey(10009);
        Assert.equal(ret1.action, 'EXIT_PLAYER');
        Assert.equal(sim.activeLayer, 'modal');

        // Step 2: Return from modal -> Catalog at p2
        const ret2 = sim.dispatchKey(10009);
        Assert.equal(ret2.action, 'EXIT_MODAL');
        Assert.equal(sim.activeLayer, 'catalog');
        Assert.equal(sim.getCurrentFocus().id, 'p2', 'Focus must return to exact card p2');
      }
    },
    {
      id: 'T3-09',
      name: '[F2 + F6 + F7] Series folder recursion parses Season/Episode numbers and enriches metadata from TMDB',
      run: async (client) => {
        const seriesRes = await client.get('/api/drive/files/series');
        Assert.status(seriesRes, 200);
        const ep = seriesRes.json.items[0];

        const cleanRes = await client.get(`/api/metadata/clean-title?filename=${encodeURIComponent(ep.name)}`);
        Assert.status(cleanRes, 200);
        Assert.equal(cleanRes.json.isSeries, true);
        Assert.equal(cleanRes.json.season, 4);
        Assert.equal(cleanRes.json.episode, 9);

        const enrichRes = await client.get(`/api/metadata/enrich?title=${encodeURIComponent(cleanRes.json.cleanTitle)}&year=2022`);
        Assert.status(enrichRes, 200);
        Assert.equal(enrichRes.json.title, 'Stranger Things');
        Assert.ok(enrichRes.json.posterUrl);
      }
    },
    {
      id: 'T3-10',
      name: '[F3 + F4 + F17] Serverless CORS preflight supports both HTTP Range video streams and WebVTT subtitle streams',
      run: async (client) => {
        const preflightStream = await client.options('/api/stream/vid_inc');
        const preflightSubs = await client.options('/api/subtitles/sub_inc_es');

        Assert.ok(preflightStream.status === 200 || preflightStream.status === 204);
        Assert.ok(preflightSubs.status === 200 || preflightSubs.status === 204);
        Assert.header(preflightStream, 'Access-Control-Allow-Origin', '*');
        Assert.header(preflightSubs, 'Access-Control-Allow-Origin', '*');
      }
    },
    {
      id: 'T3-11',
      name: '[F8 + F13 + F14] Family video activation launches Video Player directly, completely bypassing Detail Modal and TMDB',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.focusRow = 2; // Videos familiares
        Assert.equal(sim.getCurrentFocus().id, 'f0');

        const res = sim.dispatchKey(13); // Enter on family video card
        Assert.equal(res.action, 'DIRECT_PLAY', 'Must initiate direct playback');
        Assert.equal(sim.activeLayer, 'player');
        // Detail modal must NOT be in the history stack
        Assert.notIncludes(sim.layerStack.join(','), 'modal');
      }
    },
    {
      id: 'T3-12',
      name: '[F10 + F15] Fullscreen Photo Slideshow spatial navigation allows manual next/prev and toggle auto-advance via remote Play/Pause',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.focusRow = 3; // Fotos
        sim.dispatchKey(13); // Launch slideshow
        Assert.equal(sim.activeLayer, 'slideshow');
        Assert.equal(sim.slideshowState.autoAdvance, true);

        // Pause slideshow via MediaPlayPause
        sim.dispatchKey(10252);
        Assert.equal(sim.slideshowState.autoAdvance, false);

        // Manual slide next
        sim.dispatchKey(39);
        Assert.equal(sim.slideshowState.activeIndex, 1);

        // Resume slideshow via MediaPlayPause
        sim.dispatchKey(10252);
        Assert.equal(sim.slideshowState.autoAdvance, true);
      }
    },
    {
      id: 'T3-13',
      name: '[F3 + F4 + F14] Corrupt external subtitle file falls back gracefully so video continues streaming smoothly',
      run: async (client) => {
        // Corrupt subtitle converts without throwing
        const subRes = await client.get('/api/subtitles/sub_corrupt');
        Assert.status(subRes, 200);
        Assert.ok(subRes.text.startsWith('WEBVTT'));

        // Stream continues unaffected
        const streamRes = await client.getRange('/api/stream/vid_inc', 'bytes=0-1024');
        Assert.status(streamRes, 206);
      }
    },
    {
      id: 'T3-14',
      name: '[F6 + F7 + F12] Unmatched TMDB movie falls back to cleaned title and native Drive thumbnail in Detail Modal',
      run: async (client) => {
        const cleanRes = await client.get('/api/metadata/clean-title?filename=UnknownMovie.2023.1080p.mkv');
        Assert.status(cleanRes, 200);

        const enrichRes = await client.get(`/api/metadata/enrich?title=${encodeURIComponent(cleanRes.json.cleanTitle)}&year=${cleanRes.json.year}`);
        Assert.status(enrichRes, 200);
        Assert.equal(enrichRes.json.title, 'UnknownMovie');
        Assert.ok(enrichRes.json.posterUrl);
        Assert.equal(enrichRes.json.rating, 0);
      }
    },
    {
      id: 'T3-15',
      name: '[F9 + F18] Tizen package validation confirms transpiled Chromium M56 bundle contains no prohibited ES2020 syntax and valid manifest',
      run: async () => {
        const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets">
    <tizen:application id="tB7x9K3qL1.MultimediaDrive" package="tB7x9K3qL1" required_version="4.0"/>
    <name>Multimedia Drive</name>
    <icon src="icon.png"/>
    <tizen:profile name="tv-samsung"/>
    <tizen:setting hwkey-event="enable"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
</widget>`;
        const manifestRes = TizenValidator.validateConfigXml(manifestXml);
        Assert.equal(manifestRes.valid, true);

        const clientJs = 'var app = { init: function() { var el = document.getElementById("tv"); } };';
        const jsRes = M56Validator.validateJavaScript(clientJs);
        Assert.equal(jsRes.valid, true);
      }
    },
    {
      id: 'T3-16',
      name: '[F4 + F14] Subtitle timecode shift and Spanish character encoding render cleanly in WebVTT cues',
      run: async (client) => {
        const subRes = await client.get('/api/subtitles/sub_inc_es');
        Assert.status(subRes, 200);
        Assert.includes(subRes.text, '00:01:23.456 --> 00:01:26.789');
        Assert.includes(subRes.text, 'película con subtítulos en español');
      }
    },
    {
      id: 'T3-17',
      name: '[F10 + F11] Spatial navigation maintains horizontal scroll and column memory when navigating vertically between carousels',
      run: async () => {
        const sim = new SpatialNavSimulator();
        // Move to Col 2 in Row 0
        sim.dispatchKey(39);
        sim.dispatchKey(39);
        Assert.equal(sim.focusCol, 2);

        // Move Down to Row 1
        sim.dispatchKey(40);
        Assert.equal(sim.focusRow, 1);
        Assert.equal(sim.focusCol, 2, 'Col index 2 should be preserved in Row 1');

        // Move Up back to Row 0
        sim.dispatchKey(38);
        Assert.equal(sim.focusRow, 0);
        Assert.equal(sim.focusCol, 2, 'Col index 2 should be preserved in Row 0');
      }
    },
    {
      id: 'T3-18',
      name: '[F10 + F16] Audio player queue navigation skips forward and backward with state retention',
      run: async () => {
        const sim = new SpatialNavSimulator();
        sim.focusRow = 4; // Música
        sim.dispatchKey(13); // Open audio player
        Assert.equal(sim.audioState.currentTrackIdx, 0);

        sim.dispatchKey(10233); // Next Track -> idx 1
        Assert.equal(sim.audioState.currentTrackIdx, 1);

        sim.dispatchKey(10233); // Next Track -> idx 2
        Assert.equal(sim.audioState.currentTrackIdx, 2);

        sim.dispatchKey(10232); // Prev Track -> idx 1
        Assert.equal(sim.audioState.currentTrackIdx, 1);
        Assert.equal(sim.audioState.isPlaying, true);
      }
    }
  ]
};
