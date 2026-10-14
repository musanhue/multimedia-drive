// Feature F3: HTTP Range 206 Streaming Proxy - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F3',
  featureName: 'HTTP Range 206 Streaming Proxy',
  tier: 1,
  tests: [
    {
      id: 'F3-01',
      name: 'Explicit range request bytes=0-1023 returns HTTP status 206 and matching Content-Range',
      run: async (client) => {
        const res = await client.getRange('/api/stream/vid_inc', 'bytes=0-1023');
        Assert.status(res, 206, 'Must return 206 Partial Content');
        Assert.header(res, 'Accept-Ranges', 'bytes', 'Must return Accept-Ranges: bytes');
        Assert.match(res.headers['content-range'], /^bytes 0-1023\/\d+$/, 'Content-Range must match bytes 0-1023/:total');
        Assert.equal(res.headers['content-length'], '1024', 'Content-Length must be 1024 bytes');
      }
    },
    {
      id: 'F3-02',
      name: 'Streaming response exposes Content-Range, Content-Length and Accept-Ranges in CORS headers',
      run: async (client) => {
        const res = await client.getRange('/api/stream/vid_inc', 'bytes=0-100');
        Assert.status(res, 206);
        Assert.header(res, 'Access-Control-Allow-Origin', '*');
        const exposeHeaders = res.headers['access-control-expose-headers'] || '';
        Assert.includes(exposeHeaders, 'Content-Range', 'Must expose Content-Range');
        Assert.includes(exposeHeaders, 'Accept-Ranges', 'Must expose Accept-Ranges');
        Assert.includes(exposeHeaders, 'Content-Length', 'Must expose Content-Length');
      }
    },
    {
      id: 'F3-03',
      name: 'Open-ended range request bytes=0- returns bounded chunk <= 8MB with 206 status',
      run: async (client) => {
        const res = await client.getRange('/api/stream/vid_inc', 'bytes=0-');
        Assert.status(res, 206, 'Open-ended range must return 206');
        const rangeMatch = res.headers['content-range'].match(/^bytes 0-(\d+)\/(\d+)$/);
        Assert.ok(rangeMatch, 'Content-Range should start at 0');
        const chunkEnd = parseInt(rangeMatch[1], 10);
        // Bounded chunk rule: chunkEnd + 1 <= 8MB (8388608 bytes)
        Assert.ok(chunkEnd + 1 <= 8 * 1024 * 1024, 'Chunk must be bounded to at most 8MB');
      }
    },
    {
      id: 'F3-04',
      name: 'HEAD request to stream endpoint returns 200 OK with Content-Length, Content-Type and Accept-Ranges',
      run: async (client) => {
        const res = await client.head('/api/stream/vid_inc');
        Assert.status(res, 200, 'HEAD probe must return 200');
        Assert.header(res, 'Accept-Ranges', 'bytes');
        Assert.ok(parseInt(res.headers['content-length'], 10) > 0, 'Must have valid Content-Length');
        Assert.includes(res.headers['content-type'], 'video/');
      }
    },
    {
      id: 'F3-05',
      name: 'Mid-file seek request bytes=10485760- returns 206 starting at exact seek offset',
      run: async (client) => {
        const startOffset = 10485760; // 10MB
        const res = await client.getRange('/api/stream/vid_inc', `bytes=${startOffset}-`);
        Assert.status(res, 206);
        Assert.match(res.headers['content-range'], new RegExp(`^bytes ${startOffset}-\\d+/\\d+$`), 'Must start from seek offset');
      }
    }
  ]
};
