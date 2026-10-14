// Feature F8: Family Video Isolation Barrier - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F8',
  featureName: 'Family Video Isolation Barrier (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F8-B01',
      name: 'Family video with movie-like name (e.g. Titanic_en_el_lago.mp4) is strictly blocked from TMDB search',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=' + encodeURIComponent('Titanic_en_el_lago') + '&category=familiares');
        Assert.status(res, 403);
        Assert.includes(res.json.error, 'Isolation Barrier');
      }
    },
    {
      id: 'F8-B02',
      name: 'Family video folder with mixed casing (Videos Familiares) preserves strict isolation',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Vacaciones&category=' + encodeURIComponent('Videos Familiares'));
        Assert.status(res, 403);
      }
    },
    {
      id: 'F8-B03',
      name: 'Family video items in catalog listing never include synopsis or cast attributes',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.equal(item.overview, undefined);
          Assert.equal(item.cast, undefined);
          Assert.equal(item.genres, undefined);
        }
      }
    },
    {
      id: 'F8-B04',
      name: 'Search query containing "familia" keywords triggers isolation barrier protection',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=' + encodeURIComponent('Paseo en familia'));
        Assert.status(res, 403);
      }
    },
    {
      id: 'F8-B05',
      name: 'Family video thumbnail replacement preserves query params if thumbnail is already large',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items[0];
        Assert.ok(item.thumbnailLink.endsWith('=s800'));
      }
    }
  ]
};
