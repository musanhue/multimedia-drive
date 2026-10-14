// Feature F4: SRT to WebVTT Subtitle Converter - Tier 1 Tests
const { Assert } = require('../../harness/test-client');

module.exports = {
  featureId: 'F4',
  featureName: 'SRT to WebVTT Subtitle Converter',
  tier: 1,
  tests: [
    {
      id: 'F4-01',
      name: 'GET /api/subtitles/:id delivers text/vtt; charset=utf-8 MIME type',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_inc_es');
        Assert.status(res, 200);
        Assert.header(res, 'Content-Type', 'text/vtt; charset=utf-8');
      }
    },
    {
      id: 'F4-02',
      name: 'Converted subtitle begins strictly with standard WEBVTT header and double newline',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_inc_es');
        Assert.status(res, 200);
        Assert.ok(res.text.startsWith('WEBVTT\n\n') || res.text.startsWith('WEBVTT\r\n\r\n'), 'Must start strictly with WEBVTT header');
      }
    },
    {
      id: 'F4-03',
      name: 'Timestamp conversion converts comma millisecond separators to dot separators (00:01:23.456)',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_inc_es');
        Assert.status(res, 200);
        Assert.notIncludes(res.text, '00:01:23,456', 'Comma separator should not be present');
        Assert.includes(res.text, '00:01:23.456', 'Dot separator must be present');
      }
    },
    {
      id: 'F4-04',
      name: 'Spanish diacritics (á, é, í, ó, ú, ñ, ¿, ¡) are preserved in UTF-8 output',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_inc_es');
        Assert.status(res, 200);
        Assert.includes(res.text, '¡Hola mundo!');
        Assert.includes(res.text, 'español');
        Assert.includes(res.text, 'diacríticos: á, é, í, ó, ú, ñ, ¿, ¡');
      }
    },
    {
      id: 'F4-05',
      name: 'HTML font tags (<font color=...>) and ASS styling tags are cleaned from WebVTT output',
      run: async (client) => {
        const res = await client.get('/api/subtitles/sub_corrupt');
        Assert.status(res, 200);
        Assert.notIncludes(res.text, '<font color="#ff0000">', 'Font open tag should be stripped');
        Assert.notIncludes(res.text, '</font>', 'Font close tag should be stripped');
        Assert.notIncludes(res.text, '{\\an8}', 'ASS positioning tag should be stripped');
        Assert.includes(res.text, 'Texto en rojo', 'Text content should remain intact');
      }
    }
  ]
};
