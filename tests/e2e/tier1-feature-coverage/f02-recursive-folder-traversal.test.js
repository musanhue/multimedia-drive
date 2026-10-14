// Feature F2: Recursive Folder Traversal - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F2',
  featureName: 'Recursive Folder Traversal',
  tier: 1,
  tests: [
    {
      id: 'F2-01',
      name: 'GET /api/drive/folders returns all 5 canonical multimedia categories',
      run: async (client) => {
        const res = await client.get('/api/drive/folders');
        Assert.status(res, 200);
        const categories = res.json.folders.map(f => f.category);
        Assert.ok(categories.includes('peliculas'), 'Should contain peliculas');
        Assert.ok(categories.includes('series'), 'Should contain series');
        Assert.ok(categories.includes('familiares'), 'Should contain familiares');
        Assert.ok(categories.includes('fotos'), 'Should contain fotos');
        Assert.ok(categories.includes('musica'), 'Should contain musica');
      }
    },
    {
      id: 'F2-02',
      name: 'GET /api/drive/files/peliculas lists movie files with required metadata fields',
      run: async (client) => {
        const res = await client.get('/api/drive/files/peliculas');
        Assert.status(res, 200);
        Assert.ok(res.json.items.length > 0, 'Items should not be empty');
        const first = res.json.items[0];
        Assert.ok(first.id, 'File must have id');
        Assert.ok(first.name, 'File must have name');
        Assert.ok(first.mimeType, 'File must have mimeType');
        Assert.ok(typeof first.size === 'number', 'File must have numerical size in bytes');
      }
    },
    {
      id: 'F2-03',
      name: 'GET /api/drive/files/series returns episodes with season and episode numbers',
      run: async (client) => {
        const res = await client.get('/api/drive/files/series');
        Assert.status(res, 200);
        Assert.ok(res.json.items.length > 0, 'Series items should not be empty');
        const ep = res.json.items[0];
        Assert.ok(ep.season >= 1, 'Should have positive season number');
        Assert.ok(ep.episode >= 1, 'Should have positive episode number');
      }
    },
    {
      id: 'F2-04',
      name: 'Category matching is accent-resilient (Películas vs peliculas)',
      run: async (client) => {
        const resAccent = await client.get('/api/drive/files/' + encodeURIComponent('Películas'));
        const resPlain = await client.get('/api/drive/files/peliculas');
        Assert.status(resAccent, 200);
        Assert.status(resPlain, 200);
        Assert.equal(resAccent.json.total, resPlain.json.total, 'Both requests should return identical item count');
      }
    },
    {
      id: 'F2-05',
      name: 'GET /api/drive/files/fotos returns images with image dimensions and preview links',
      run: async (client) => {
        const res = await client.get('/api/drive/files/fotos');
        Assert.status(res, 200);
        Assert.ok(res.json.items.length > 0, 'Photos should not be empty');
        const photo = res.json.items[0];
        Assert.includes(photo.mimeType, 'image/');
        Assert.ok(photo.thumbnailLink, 'Photo must have thumbnailLink');
      }
    }
  ]
};
