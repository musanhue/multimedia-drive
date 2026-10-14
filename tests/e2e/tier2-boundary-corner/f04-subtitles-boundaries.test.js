// Feature F4: SRT to WebVTT Subtitle Converter - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F4',
  featureName: 'SRT to WebVTT Subtitle Converter (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F4-B01',
      name: 'Subtitle file with UTF-8 Byte Order Mark (BOM) strips BOM to prevent silent failure on Chromium M56',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_with_bom');
        Assert.status(res, 200);
        // Byte 0 must NOT be BOM character \uFEFF
        Assert.equal(res.text.charCodeAt(0), 87, 'First character must be ASCII W (87)');
        Assert.ok(res.text.startsWith('WEBVTT\n\n') || res.text.startsWith('WEBVTT\r\n\r\n'), 'Must start cleanly with WEBVTT');
      }
    },
    {
      id: 'F4-B02',
      name: 'Zero-byte empty subtitle file converts to valid minimal WebVTT header without crashing',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_empty');
        Assert.status(res, 200);
        Assert.equal(res.text.trim(), 'WEBVTT');
      }
    },
    {
      id: 'F4-B03',
      name: 'Legacy ISO-8859-1 (Latin-1) encoded SRT converts to valid UTF-8 without unicode replacement characters (U+FFFD)',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_latin1');
        Assert.status(res, 200);
        Assert.notIncludes(res.text, '\uFFFD', 'Should not contain replacement character U+FFFD');
        Assert.includes(res.text, 'canción');
        Assert.includes(res.text, 'niño');
      }
    },
    {
      id: 'F4-B04',
      name: 'Corrupt subtitle file with missing timestamps discards corrupt cue and preserves subsequent valid cues',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_corrupt');
        Assert.status(res, 200);
        Assert.includes(res.text, '00:00:10.500 --> 00:00:12.800');
        Assert.includes(res.text, 'Subtítulo normal recuperado');
      }
    },
    {
      id: 'F4-B05',
      name: 'Subtitle request for non-existent subtitle ID returns empty WebVTT or 404 handled gracefully',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_unknown_id');
        Assert.status(res, 200);
        Assert.includes(res.text, 'WEBVTT');
      }
    }
  ]
};
