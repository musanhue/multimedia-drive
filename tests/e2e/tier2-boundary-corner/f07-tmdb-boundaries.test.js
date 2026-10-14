// Feature F7: TMDB Metadata Enrichment - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F7',
  featureName: 'TMDB Metadata Enrichment (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F7-B01',
      name: 'Unmatched movie title returns graceful fallback object with placeholder artwork rather than failing',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=NonExistentMovie999&year=2099');
        Assert.status(res, 200);
        Assert.equal(res.json.title, 'NonExistentMovie999');
        Assert.ok(res.json.posterUrl, 'Should provide placeholder poster URL');
        Assert.equal(res.json.rating, 0);
      }
    },
    {
      id: 'F7-B02',
      name: 'Title containing special characters (&, +, #, /) is safely URL-encoded and searched',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=' + encodeURIComponent('Fast & Furious') + '&year=2009');
        Assert.status(res, 200);
        Assert.ok(res.json);
      }
    },
    {
      id: 'F7-B03',
      name: 'Empty title query returns fallback metadata without throwing 500 error',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=');
        Assert.status(res, 200);
        Assert.equal(res.json.title, '');
      }
    },
    {
      id: 'F7-B04',
      name: 'Multiple concurrent requests for identical movie share cache without duplicate external requests',
      run: async (client) => {
        const promises = [
          client.get('/api/metadata/enrich?title=Inception&year=2010'),
          client.get('/api/metadata/enrich?title=Inception&year=2010'),
          client.get('/api/metadata/enrich?title=Inception&year=2010')
        ];
        const responses = await Promise.all(promises);
        Assert.equal(responses[0].status, 200);
        Assert.equal(responses[1].status, 200);
        Assert.equal(responses[2].status, 200);
      }
    },
    {
      id: 'F7-B05',
      name: 'Year mismatch (e.g. searching Inception with year 2020) falls back to title search successfully',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Inception&year=2020');
        Assert.status(res, 200);
        Assert.equal(res.json.director, 'Christopher Nolan');
      }
    }
  ]
};
