// Feature F18: Native Tizen .wgt Packaging - Tier 1 Tests
const { Assert } = require('../../harness/test-client');
const { TizenValidator } = require('../../harness/tizen-validator');

const AUTHORITATIVE_CONFIG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" 
        xmlns:tizen="http://tizen.org/ns/widgets" 
        id="http://multimediadrive.samsung.tv/app" 
        version="1.0.0" 
        viewmodes="fullscreen">
    <tizen:application id="tB7x9K3qL1.MultimediaDrive" 
                       package="tB7x9K3qL1" 
                       required_version="4.0"/>
    <name>Multimedia Drive</name>
    <content src="index.html"/>
    <icon src="icon.png"/>
    <tizen:profile name="tv-samsung"/>
    <tizen:setting screen-orientation="landscape" hwkey-event="enable"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
</widget>`;

// Minimal 117x117 PNG buffer for testing icon dimensions validator
function createMockPngBuffer(width, height) {
  const buf = Buffer.alloc(33);
  // PNG Signature
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(buf, 0);
  // IHDR length = 13
  buf.writeUInt32BE(13, 8);
  // 'IHDR'
  buf.write('IHDR', 12);
  // Width & Height
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

module.exports = {
  featureId: 'F18',
  featureName: 'Native Tizen .wgt Packaging',
  tier: 1,
  tests: [
    {
      id: 'F18-01',
      name: 'Manifest config.xml declares mandatory W3C and Tizen widget namespaces',
      run: async () => {
        const res = TizenValidator.validateConfigXml(AUTHORITATIVE_CONFIG_XML);
        Assert.equal(res.valid, true, 'Authoritative config.xml should validate cleanly');
      }
    },
    {
      id: 'F18-02',
      name: 'Manifest declares mandatory <tizen:profile name="tv-samsung"/>',
      run: async () => {
        const xmlWithoutProfile = AUTHORITATIVE_CONFIG_XML.replace('tv-samsung', 'mobile');
        const res = TizenValidator.validateConfigXml(xmlWithoutProfile);
        Assert.equal(res.valid, false);
        Assert.includes(res.errors[0], 'tv-samsung');
      }
    },
    {
      id: 'F18-03',
      name: 'Manifest includes required privileges for network and physical TV remote control',
      run: async () => {
        const xmlNoInput = AUTHORITATIVE_CONFIG_XML.replace('<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>', '');
        const res = TizenValidator.validateConfigXml(xmlNoInput);
        Assert.equal(res.valid, false);
        Assert.includes(res.errors[0], 'tv.inputdevice');
      }
    },
    {
      id: 'F18-04',
      name: 'Application icon asset conforms strictly to 117x117 PNG dimensions',
      run: async () => {
        const validIcon = createMockPngBuffer(117, 117);
        const validRes = TizenValidator.validateIconBuffer(validIcon);
        Assert.equal(validRes.valid, true);

        const invalidIcon = createMockPngBuffer(128, 128);
        const invalidRes = TizenValidator.validateIconBuffer(invalidIcon);
        Assert.equal(invalidRes.valid, false);
        Assert.includes(invalidRes.error, '117x117');
      }
    },
    {
      id: 'F18-05',
      name: 'Manifest hwkey-event setting is enabled for physical remote control event dispatch',
      run: async () => {
        const xmlNoHwKey = AUTHORITATIVE_CONFIG_XML.replace('hwkey-event="enable"', 'hwkey-event="disable"');
        const res = TizenValidator.validateConfigXml(xmlNoHwKey);
        Assert.equal(res.valid, false);
        Assert.includes(res.errors[0], 'hwkey-event');
      }
    }
  ]
};
