// Feature F3: HTTP Range 206 Streaming Proxy - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F3',
  featureName: 'HTTP Range 206 Streaming Proxy (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F3-B01',
      name: 'Syntactically invalid Range header (Range: bytes=invalid-syntax) returns HTTP 416 Range Not Satisfiable',
      run: async (client) => {
        const res = await client.getRange('/api/stream/vid_inc', 'bytes=invalid-syntax');
        Assert.status(res, 416);
        Assert.match(res.headers['content-range'], /^bytes \*\/\d+$/);
      }
    },
    {
      id: 'F3-B02',
      name: 'Out-of-bounds start byte (bytes=999999999999-) returns HTTP 416 with Content-Range: bytes */:total',
      run: async (client) => {
        const res = await client.getRange('/api/stream/vid_inc', 'bytes=999999999999-');
        Assert.status(res, 416);
        Assert.match(res.headers['content-range'], /^bytes \*\/\d+$/);
      }
    },
    {
      id: 'F3-B03',
      name: 'Inverted range (bytes=5000-1000 where start > end) returns HTTP 416 Range Not Satisfiable',
      run: async (client) => {
        const res = await client.getRange('/api/stream/vid_inc', 'bytes=5000-1000');
        Assert.status(res, 416);
      }
    },
    {
      id: 'F3-B04',
      name: 'Streaming request for non-existent media file ID returns HTTP 404 Not Found',
      run: async (client) => {
        const res = await client.get('/api/stream/non_existent_file_id_999');
        Assert.status(res, 404);
        Assert.includes(res.json.error, 'not found');
      }
    },
    {
      id: 'F3-B05',
      name: 'Extremely high 64-bit byte seek offset (e.g. byte 4,294,967,296 on 8GB file) handles without 32-bit overflow',
      run: async (client) => {
        // vid_br is 8589934592 bytes (8GB)
        const offset = 4294967296; // 4GB offset
        const res = await client.getRange('/api/stream/vid_br', `bytes=${offset}-${offset + 1023}`);
        Assert.status(res, 206);
        Assert.match(res.headers['content-range'], new RegExp(`^bytes ${offset}-${offset + 1023}/\\d+$`));
        Assert.equal(res.headers['content-length'], '1024');
      }
    }
  ]
};
