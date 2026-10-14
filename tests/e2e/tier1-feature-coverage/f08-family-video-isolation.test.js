// Feature F8: Family Video Isolation Barrier - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F8',
  featureName: 'Family Video Isolation Barrier',
  tier: 1,
  tests: [
    {
      id: 'F8-01',
      name: 'Family video items from /api/drive/files/familiares contain zero commercial TMDB fields',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        Assert.ok(res.json.items.length > 0, 'Family video items should exist');
        for (const item of res.json.items) {
          Assert.equal(item.tmdbEnriched, false, 'tmdbEnriched flag must be false');
          Assert.equal(item.director, undefined, 'Director must not be present');
          Assert.equal(item.cast, undefined, 'Cast must not be present');
          Assert.notIncludes(item.thumbnailLink, 'image.tmdb.org', 'Thumbnail must not point to TMDB');
        }
      }
    },
    {
      id: 'F8-02',
      name: 'Family video items contain native Drive metadata: creation date, duration and dimensions',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items[0];
        Assert.ok(item.createdTime || item.modifiedTime, 'Must have creation or modified date');
        Assert.ok(item.durationMillis > 0, 'Must have positive durationMillis');
        Assert.ok(item.width > 0 && item.height > 0, 'Must have video dimensions');
      }
    },
    {
      id: 'F8-03',
      name: 'Family video thumbnail links are upgraded to high-definition =s800 preview resolution',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.includes(item.thumbnailLink, '=s800', 'Thumbnail link must be upgraded to =s800 for 4K TV clarity');
        }
      }
    },
    {
      id: 'F8-04',
      name: 'Direct request to enrich family video category returns 403 Forbidden under strict isolation barrier',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Cumpleanos&category=familiares');
        Assert.status(res, 403, 'Attempting to query TMDB for family category must be rejected with 403');
        Assert.includes(res.json.error, 'Isolation Barrier');
      }
    },
    {
      id: 'F8-05',
      name: 'Family video titles are formatted as readable Title Case without scene tags',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items[0];
        Assert.equal(item.cleanTitle, 'Cumpleaños De Lucas 2021');
      }
    }
  ]
};
