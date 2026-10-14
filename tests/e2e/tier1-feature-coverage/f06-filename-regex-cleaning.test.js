// Feature F6: Filename Regex Cleaning - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F6',
  featureName: 'Filename Regex Cleaning',
  tier: 1,
  tests: [
    {
      id: 'F6-01',
      name: 'Sanitizes scene release filename: Inception.2010.1080p.BluRay.x264-SPARKS.mkv -> Inception (2010)',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('Inception.2010.1080p.BluRay.x264-SPARKS.mkv'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'Inception');
        Assert.equal(res.json.year, 2010);
      }
    },
    {
      id: 'F6-02',
      name: 'Sanitizes parenthetical/bracketed tags: El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4 -> El Secreto De Sus Ojos (2009)',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('El.Secreto.De.Sus.Ojos.(2009).[1080p].mp4'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'El Secreto De Sus Ojos');
        Assert.equal(res.json.year, 2009);
      }
    },
    {
      id: 'F6-03',
      name: 'Preserves numeric title distinct from release year: Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('Blade.Runner.2049.2017.2160p.UHD.HDR.x265.mkv'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'Blade Runner 2049');
        Assert.equal(res.json.year, 2017);
      }
    },
    {
      id: 'F6-04',
      name: 'Detects TV series season and episode tags: Stranger.Things.S04E09.1080p.NF.mkv',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('Stranger.Things.S04E09.1080p.NF.mkv'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'Stranger Things');
        Assert.equal(res.json.isSeries, true);
        Assert.equal(res.json.season, 4);
        Assert.equal(res.json.episode, 9);
      }
    },
    {
      id: 'F6-05',
      name: 'Strips multi-audio tags and preserves Spanish title: Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv',
      run: async (client) => {
        const res = await client.get('/api/metadata/clean-title?filename=' + encodeURIComponent('Relatos.salvajes.2014.1080p.DUAL.Latino-Castellano.mkv'));
        Assert.status(res, 200);
        Assert.equal(res.json.cleanTitle, 'Relatos salvajes');
        Assert.equal(res.json.year, 2014);
      }
    }
  ]
};
