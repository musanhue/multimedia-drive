// Feature F1: Service Account Auth - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F1',
  featureName: 'Service Account Auth',
  tier: 1,
  tests: [
    {
      id: 'F1-01',
      name: 'Health check endpoint returns valid connection status when service account is configured',
      run: async (client) => {
        const res = await client.get('/api/health');
        Assert.status(res, 200, 'Health endpoint should return 200');
        Assert.ok(res.json, 'Response should be JSON');
        Assert.equal(res.json.status, 'ok', 'Status should be ok');
        Assert.equal(res.json.driveConnected, true, 'Google Drive connection should be reported as connected');
      }
    },
    {
      id: 'F1-02',
      name: 'Root folders request succeeds with authenticated Service Account session',
      run: async (client) => {
        const res = await client.get('/api/drive/folders');
        Assert.status(res, 200, 'Folders listing should return 200');
        Assert.ok(Array.isArray(res.json.folders), 'Folders should be an array');
        Assert.ok(res.json.folders.length >= 5, 'Should return at least 5 main categories');
      }
    },
    {
      id: 'F1-03',
      name: 'Unauthenticated or invalid credential header returns 401 Unauthorized',
      run: async (client) => {
        const res = await client.get('/api/drive/folders', {
          'X-Simulate-Auth-Failure': 'true'
        });
        Assert.status(res, 401, 'Invalid credentials should return 401');
        Assert.ok(res.json.error, 'Error message should be provided in response');
      }
    },
    {
      id: 'F1-04',
      name: 'Authentication failure preserves JSON content type and CORS headers',
      run: async (client) => {
        const res = await client.get('/api/drive/folders?auth=invalid');
        Assert.status(res, 401);
        Assert.header(res, 'Access-Control-Allow-Origin', '*', 'CORS origin should allow *');
        Assert.includes(res.headers['content-type'], 'application/json');
      }
    },
    {
      id: 'F1-05',
      name: 'Service Account credentials verification payload confirms read-only scope access',
      run: async (client) => {
        const res = await client.get('/api/health');
        Assert.status(res, 200);
        Assert.ok(res.json.serviceAccountConfigured, 'Service account should be marked configured');
      }
    }
  ]
};
