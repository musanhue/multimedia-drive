// Feature F7: TMDB Metadata Enrichment - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F7',
  featureName: 'TMDB Metadata Enrichment',
  tier: 1,
  tests: [
    {
      id: 'F7-01',
      name: 'GET /api/metadata/enrich returns movie overview, rating, director and cast in Spanish',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Inception&year=2010');
        Assert.status(res, 200);
        Assert.ok(res.json.overview, 'Should include overview');
        Assert.ok(res.json.director, 'Should include director');
        Assert.ok(Array.isArray(res.json.cast), 'Should include cast array');
        Assert.ok(res.json.cast.includes('Leonardo DiCaprio'), 'Cast should include Leonardo DiCaprio');
        Assert.equal(res.json.director, 'Christopher Nolan', 'Director should be Christopher Nolan');
      }
    },
    {
      id: 'F7-02',
      name: 'Enrichment returns HD poster and backdrop URLs for 10-foot UI display',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Interstellar&year=2014');
        Assert.status(res, 200);
        Assert.includes(res.json.posterUrl, 'https://image.tmdb.org/t/p/w500');
        Assert.includes(res.json.backdropUrl, 'https://image.tmdb.org/t/p/w1280');
      }
    },
    {
      id: 'F7-03',
      name: 'Enrichment falls back to title search when release year is omitted',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Inception');
        Assert.status(res, 200);
        Assert.equal(res.json.director, 'Christopher Nolan');
      }
    },
    {
      id: 'F7-04',
      name: 'Enrichment response contains top cast members and genre pills',
      run: async (client) => {
        const res = await client.get('/api/metadata/enrich?title=Interstellar&year=2014');
        Assert.status(res, 200);
        Assert.ok(res.json.cast.length >= 3, 'Cast should have at least 3 actors');
        Assert.ok(Array.isArray(res.json.genres), 'Genres should be array');
      }
    },
    {
      id: 'F7-05',
      name: '2-tier caching: Subsequent identical requests are served from cache with cached=true flag',
      run: async (client) => {
        // First query
        await client.get('/api/metadata/enrich?title=Inception&year=2010');
        // Second query
        const res2 = await client.get('/api/metadata/enrich?title=Inception&year=2010');
        Assert.status(res2, 200);
        Assert.equal(res2.json.cached, true, 'Cached flag should be true on repeated query');
      }
    }
  ]
};
