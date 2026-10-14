// Feature F13: Family Video Card View - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F13',
  featureName: 'Family Video Card View (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F13-B01',
      name: 'Family video item with 4K resolution displays 3840x2160 native dimensions',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item4k = res.json.items.find(i => i.id === 'vid_fam_2');
        Assert.ok(item4k);
        Assert.equal(item4k.width, 3840);
        Assert.equal(item4k.height, 2160);
      }
    },
    {
      id: 'F13-B02',
      name: 'Family video with duration over 30 minutes displays MM:SS formatting without hour truncation',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items.find(i => i.id === 'vid_fam_2');
        Assert.equal(item.durationFormatted, '32:30');
      }
    },
    {
      id: 'F13-B03',
      name: 'Family video with filename containing underscores and numbers converts cleanly to Title Case',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        const item = res.json.items.find(i => i.id === 'vid_fam_3');
        Assert.equal(item.cleanTitle, 'Navidad En Familia 2022');
      }
    },
    {
      id: 'F13-B04',
      name: 'Family video creation date complies with ISO 8601 UTC timestamp format',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.match(item.createdTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        }
      }
    },
    {
      id: 'F13-B05',
      name: 'All family video items have thumbnailLink defined with =s800 suffix',
      run: async (client) => {
        const res = await client.get('/api/drive/files/familiares');
        Assert.status(res, 200);
        for (const item of res.json.items) {
          Assert.ok(item.thumbnailLink);
          Assert.includes(item.thumbnailLink, '=s800');
        }
      }
    }
  ]
};
