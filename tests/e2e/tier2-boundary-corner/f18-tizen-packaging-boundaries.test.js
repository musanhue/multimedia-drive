// Feature F18: Native Tizen .wgt Packaging - Tier 2 Boundary & Corner Cases
const { Assert } = require('../../harness/test-client');
const { TizenValidator } = require('../../harness/tizen-validator');

function createMockPngBuffer(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

module.exports = {
  featureId: 'F18',
  featureName: 'Native Tizen .wgt Packaging (Boundaries)',
  tier: 2,
  tests: [
    {
      id: 'F18-B01',
      name: 'Manifest missing internet privilege fails validation check',
      run: async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets">
    <tizen:application id="tB7x9K3qL1.MultimediaDrive" package="tB7x9K3qL1" required_version="4.0"/>
    <icon src="icon.png"/>
    <tizen:profile name="tv-samsung"/>
    <tizen:setting hwkey-event="enable"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
</widget>`;
        const res = TizenValidator.validateConfigXml(xml);
        Assert.equal(res.valid, false);
        Assert.includes(res.errors[0], 'internet');
      }
    },
    {
      id: 'F18-B02',
      name: 'Package prefix with invalid character count (!= 10 chars) fails validation check',
      run: async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets">
    <tizen:application id="short.MultimediaDrive" package="short" required_version="4.0"/>
    <icon src="icon.png"/>
    <tizen:profile name="tv-samsung"/>
    <tizen:setting hwkey-event="enable"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
</widget>`;
        const res = TizenValidator.validateConfigXml(xml);
        Assert.equal(res.valid, false);
        Assert.includes(res.errors[0], '10 alphanumeric characters');
      }
    },
    {
      id: 'F18-B03',
      name: 'Empty or malformed config.xml string fails validation check',
      run: async () => {
        const res = TizenValidator.validateConfigXml('');
        Assert.equal(res.valid, false);
        Assert.includes(res.errors[0], 'missing or empty');
      }
    },
    {
      id: 'F18-B04',
      name: 'Corrupt icon buffer without valid PNG header signature fails validation check',
      run: async () => {
        const corruptBuf = Buffer.from('NOT_A_PNG_IMAGE_DATA');
        const res = TizenValidator.validateIconBuffer(corruptBuf);
        Assert.equal(res.valid, false);
        Assert.includes(res.error, 'Invalid PNG header');
      }
    },
    {
      id: 'F18-B05',
      name: 'Truncated icon buffer (<24 bytes) fails validation check safely',
      run: async () => {
        const shortBuf = Buffer.from([0x89, 0x50, 0x4E]);
        const res = TizenValidator.validateIconBuffer(shortBuf);
        Assert.equal(res.valid, false);
        Assert.includes(res.error, 'too small');
      }
    }
  ]
};
