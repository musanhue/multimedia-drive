// Feature F11: Catalog Carousel View - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F11',
  featureName: 'Catalog Carousel View',
  tier: 1,
  tests: [
    {
      id: 'F11-01',
      name: 'Catalog payload provides content for all 5 primary carousels',
      run: async (client) => {
        const res = await client.get('/api/drive/folders');
        Assert.status(res, 200);
        Assert.equal(res.json.folders.length, 5);
      }
    },
    {
      id: 'F11-02',
      name: 'Movie carousel items include poster thumbnails, release years and titles',
      run: async (client) => {
        const res = await client.get('/api/drive/files/peliculas');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.ok(item.cleanTitle, 'Item must have cleanTitle');
          Assert.ok(item.year >= 1900, 'Item must have valid 4-digit release year');
          Assert.ok(item.thumbnailLink, 'Item must have thumbnail link');
        }
      }
    },
    {
      id: 'F11-03',
      name: 'Series carousel items include episode identifiers and titles',
      run: async (client) => {
        const res = await client.get('/api/drive/files/series');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.ok(item.cleanTitle, 'Series must have cleanTitle');
          Assert.ok(item.season >= 1, 'Must have season number');
          Assert.ok(item.episode >= 1, 'Must have episode number');
        }
      }
    },
    {
      id: 'F11-04',
      name: 'Family video carousel items include formatted date and duration pill data',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.ok(item.dateFormatted, 'Family video must have formatted date');
          Assert.ok(item.durationFormatted, 'Family video must have formatted duration');
        }
      }
    },
    {
      id: 'F11-05',
      name: 'Empty category payload returns empty array items without throwing errors',
      run: async (client) => {
        const res = await client.get('/api/drive/files/empty');
        Assert.status(res, 200);
        Assert.equal(res.json.total, 0);
        Assert.deepEqual(res.json.items, []);
      }
    }
  ]
};
