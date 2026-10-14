// Feature F6: Filename Regex Cleaning - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F6',
  featureName: 'Filename Regex Cleaning (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F6-B01',
      name: 'Filename containing only noise tokens (1080p.x264.BluRay.mkv) cleans safely without crashing',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('1080p.x264.BluRay.mkv'));
        Assert.status(res, 200);
        Assert.equal(typeof res.json.cleanTitle, 'string');
      }
    },
    {
      id: 'F6-B02',
      name: 'Historical release year (e.g. 1920) is correctly extracted as 4-digit release year: The.Kid.1921.1080p.mkv',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('The.Kid.1921.1080p.mkv'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'The Kid');
        Assert.equal(res.json.year, 1921);
      }
    },
    {
      id: 'F6-B03',
      name: 'Excessive punctuation and repeated dots collapse cleanly: Dr..No...1962..1080p.mkv -> Dr No (1962)',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('Dr..No...1962..1080p.mkv'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'Dr No');
        Assert.equal(res.json.year, 1962);
      }
    },
    {
      id: 'F6-B04',
      name: 'Spanish inverted punctuation and accents are preserved: El.laberinto.del.fauno.2006.1080p.mkv',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('El.laberinto.del.fauno.2006.1080p.mkv'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'El laberinto del fauno');
        Assert.equal(res.json.year, 2006);
      }
    },
    {
      id: 'F6-B05',
      name: 'Extremely long filename (>200 characters) sanitizes without regex catastrophic backtracking',
      run: async (client) => {
        const longName = 'A'.repeat(150) + '.2020.1080p.BluRay.x264.DTS-HD.MA.5.1.Dual-Audio.Latino.Castellano.Extended.Cut.Remastered-GROUP.mkv';
        const start = Date.now();
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent(longName));
        const elapsed = Date.now() - start;
        Assert.status(res, 200);
        Assert.ok(elapsed < 500, `Cleaning long filename took ${elapsed}ms, should be <500ms`);
        Assert.equal(res.json.year, 2020);
      }
    }
  ]
};
