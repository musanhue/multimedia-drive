// Feature F5: Embedded Subtitles / Media Support - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F5',
  featureName: 'Embedded Subtitles / Media Support',
  tier: 1,
  tests: [
    {
      id: 'F5-01',
      name: 'Streaming proxy maps MP4 video container to video/mp4 MIME type',
      run: async (client) => {
        const res = await client.head('/api/stream/vid_sec');
        Assert.status(res, 200);
        Assert.header(res, 'Content-Type', 'video/mp4');
      }
    },
    {
      id: 'F5-02',
      name: 'Streaming proxy maps MKV Matroska container to video/x-matroska MIME type',
      run: async (client) => {
        const res = await client.head('/api/stream/vid_inc');
        Assert.status(res, 200);
        Assert.header(res, 'Content-Type', 'video/x-matroska');
      }
    },
    {
      id: 'F5-03',
      name: 'Subtitle list endpoint /api/subtitles/list/:fileId returns associated external subtitle tracks',
      run: async (client) => {
        const res = await client.get('/api/subtitles/list/vid_inc');
        Assert.status(res, 200);
        Assert.ok(Array.isArray(res.json.subtitles), 'Should return array of subtitle tracks');
        Assert.ok(res.json.subtitles.length > 0, 'Should find external subtitle for Inception');
        Assert.equal(res.json.subtitles[0].lang, 'es', 'Subtitle should be Spanish');
      }
    },
    {
      id: 'F5-04',
      name: 'Media metadata payload contains video dimensions and duration in milliseconds',
      run: async (client) => {
        const res = await client.get('/api/drive/files/peliculas');
        Assert.status(res, 200);
        const item = res.json.items.find(i => i.id === 'vid_inc');
        Assert.ok(item, 'Item must exist');
        Assert.equal(item.width, 1920, 'Width must be 1920');
        Assert.equal(item.height, 1080, 'Height must be 1080');
        Assert.ok(item.durationMillis > 0, 'DurationMillis must be positive');
      }
    },
    {
      id: 'F5-05',
      name: 'Streaming proxy maps audio container files to audio/mpeg MIME type',
      run: async (client) => {
        const res = await client.head('/api/stream/mus_001');
        Assert.status(res, 200);
        Assert.header(res, 'Content-Type', 'audio/mpeg');
      }
    }
  ]
};
