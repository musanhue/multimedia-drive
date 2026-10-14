import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import crypto from 'crypto';
// @ts-ignore
import { TizenValidator } from '../harness/tizen-validator';
// @ts-ignore
import { generateIconBuffer, generateIconFile } from '../../tizen/generate-icon';
// @ts-ignore
import { buildWgt, createZipBuffer, readZipEntries, calculateCrc32 } from '../../tizen/build-wgt';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const WGT_PATH = path.join(PROJECT_ROOT, 'dist', 'MultimediaDrive.wgt');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'tizen', 'config.xml');
const ICON_PATH = path.join(PROJECT_ROOT, 'tizen', 'icon.png');

// Helper to calculate standard CRC32 independently
function independentCrc32(buf: Buffer): number {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ (((c ^ buf[i]) & 0xff) * 0xedb88320);
  }
  return (c ^ -1) >>> 0;
}

// Helper to create mock PNG buffers with explicit width and height
function createMockPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write('IHDR', 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf.writeUInt8(8, 24); // bit depth
  buf.writeUInt8(6, 25); // color type RGBA
  return buf;
}

// ============================================================================
// SUITE 1: ADVERSARIAL VERIFICATION OF dist/MultimediaDrive.wgt ZIP STRUCTURE
// ============================================================================

test('WGT Adversarial: Archive exists, is non-trivial in size, and passes independent PKZip verification', () => {
  assert.ok(fs.existsSync(WGT_PATH), 'dist/MultimediaDrive.wgt must exist');
  const wgtBuffer = fs.readFileSync(WGT_PATH);
  assert.ok(wgtBuffer.length > 1024, `WGT size ${wgtBuffer.length} must exceed 1KB`);

  // Independent PKZip Central Directory & Local File Header Scanner
  let eocdOffset = -1;
  for (let i = wgtBuffer.length - 22; i >= 0; i--) {
    if (wgtBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset !== -1, 'PKZip End of Central Directory signature (0x06054b50) must be present');

  const diskNumber = wgtBuffer.readUInt16LE(eocdOffset + 4);
  const cdDiskNumber = wgtBuffer.readUInt16LE(eocdOffset + 6);
  const cdEntriesDisk = wgtBuffer.readUInt16LE(eocdOffset + 8);
  const totalEntries = wgtBuffer.readUInt16LE(eocdOffset + 10);
  const cdSize = wgtBuffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = wgtBuffer.readUInt32LE(eocdOffset + 16);
  const commentLen = wgtBuffer.readUInt16LE(eocdOffset + 20);

  assert.equal(diskNumber, 0, 'Multi-disk archives not allowed');
  assert.equal(cdDiskNumber, 0, 'Central directory disk number must be 0');
  assert.equal(cdEntriesDisk, totalEntries, 'CD entries on disk must match total entries');
  assert.ok(totalEntries >= 5, `Total entries (${totalEntries}) must include config, icon, index, assets`);
  assert.equal(commentLen, 0, 'Archive comment should be empty');
  assert.equal(cdOffset + cdSize, eocdOffset, 'Central directory must immediately precede EOCD');

  // Verify Central Directory records and every Local Header & Payload
  let pos = cdOffset;
  const parsedEntries: any[] = [];

  for (let i = 0; i < totalEntries; i++) {
    const cdSig = wgtBuffer.readUInt32LE(pos);
    assert.equal(cdSig, 0x02014b50, `Central directory header signature at index ${i} must be 0x02014b50`);

    const versionMadeBy = wgtBuffer.readUInt16LE(pos + 4);
    const versionNeeded = wgtBuffer.readUInt16LE(pos + 6);
    const bitFlag = wgtBuffer.readUInt16LE(pos + 8);
    const compression = wgtBuffer.readUInt16LE(pos + 10);
    const modTime = wgtBuffer.readUInt16LE(pos + 12);
    const modDate = wgtBuffer.readUInt16LE(pos + 14);
    const crc32 = wgtBuffer.readUInt32LE(pos + 16);
    const compSize = wgtBuffer.readUInt32LE(pos + 20);
    const uncompSize = wgtBuffer.readUInt32LE(pos + 24);
    const nameLen = wgtBuffer.readUInt16LE(pos + 28);
    const extraLen = wgtBuffer.readUInt16LE(pos + 30);
    const commentLength = wgtBuffer.readUInt16LE(pos + 32);
    const localHeaderOffset = wgtBuffer.readUInt32LE(pos + 42);

    assert.equal(compression, 8, `Compression method must be 8 (Deflate) for entry ${i}`);
    assert.equal((bitFlag & 0x0800), 0x0800, `UTF-8 flag (0x0800) must be set for entry ${i}`);

    const entryName = wgtBuffer.toString('utf8', pos + 46, pos + 46 + nameLen);

    // Cross-verify with Local Header at localHeaderOffset
    const localSig = wgtBuffer.readUInt32LE(localHeaderOffset);
    assert.equal(localSig, 0x04034b50, `Local header signature at offset ${localHeaderOffset} must be 0x04034b50`);

    const localVersion = wgtBuffer.readUInt16LE(localHeaderOffset + 4);
    const localBitFlag = wgtBuffer.readUInt16LE(localHeaderOffset + 6);
    const localComp = wgtBuffer.readUInt16LE(localHeaderOffset + 8);
    const localModTime = wgtBuffer.readUInt16LE(localHeaderOffset + 10);
    const localModDate = wgtBuffer.readUInt16LE(localHeaderOffset + 12);
    const localCrc32 = wgtBuffer.readUInt32LE(localHeaderOffset + 14);
    const localCompSize = wgtBuffer.readUInt32LE(localHeaderOffset + 18);
    const localUncompSize = wgtBuffer.readUInt32LE(localHeaderOffset + 22);
    const localNameLen = wgtBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = wgtBuffer.readUInt16LE(localHeaderOffset + 28);

    assert.equal(localComp, compression, `Local compression mismatch for ${entryName}`);
    assert.equal(localCrc32, crc32, `Local CRC32 mismatch for ${entryName}`);
    assert.equal(localCompSize, compSize, `Local compressed size mismatch for ${entryName}`);
    assert.equal(localUncompSize, uncompSize, `Local uncompressed size mismatch for ${entryName}`);
    assert.equal(localNameLen, nameLen, `Local filename length mismatch for ${entryName}`);

    const localName = wgtBuffer.toString('utf8', localHeaderOffset + 30, localHeaderOffset + 30 + localNameLen);
    assert.equal(localName, entryName, `Local entry name mismatch with CD for ${entryName}`);

    // Decompress payload and check independent CRC32
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedData = wgtBuffer.subarray(dataOffset, dataOffset + compSize);
    assert.equal(compressedData.length, compSize, `Data slice length must match compressedSize for ${entryName}`);

    const uncompressedData = zlib.inflateRawSync(compressedData);
    assert.equal(uncompressedData.length, uncompSize, `Decompressed length mismatch for ${entryName}`);

    const calcCrc = independentCrc32(uncompressedData);
    assert.equal(calcCrc, crc32, `CRC32 checksum mismatch for decompressed payload of ${entryName}`);

    parsedEntries.push({
      name: entryName,
      crc32,
      compSize,
      uncompSize,
      localHeaderOffset,
      data: uncompressedData
    });

    pos += 46 + nameLen + extraLen + commentLength;
  }

  assert.equal(pos, cdOffset + cdSize, 'Central directory parsed bytes must match cdSize');

  // Verify mandatory files
  const names = parsedEntries.map(e => e.name);
  assert.ok(names.includes('config.xml'), 'Must contain config.xml');
  assert.ok(names.includes('icon.png'), 'Must contain icon.png');
  assert.ok(names.includes('index.html'), 'Must contain index.html');
  assert.ok(names.some(n => n.startsWith('assets/')), 'Must contain assets/');

  // Verify all entry paths adhere strictly to forward slashes
  for (const entry of parsedEntries) {
    assert.ok(!entry.name.includes('\\'), `Entry ${entry.name} must not contain backslashes`);
    assert.ok(!entry.name.startsWith('/'), `Entry ${entry.name} must not start with slash`);
    assert.ok(!entry.name.includes('//'), `Entry ${entry.name} must not contain empty segment`);
    assert.ok(!entry.name.includes('..'), `Entry ${entry.name} must not contain path traversal`);
  }
});

test('WGT Adversarial: Decompressed config.xml and icon.png from inside WGT pass authoritative TizenValidator', () => {
  const wgtBuffer = fs.readFileSync(WGT_PATH);
  const entries = readZipEntries(wgtBuffer);

  // Extract config.xml
  const configEntry = entries.find((e: any) => e.name === 'config.xml');
  assert.ok(configEntry, 'config.xml must be found in entries');

  const configLocalOffset = configEntry.localHeaderOffset;
  const nameLen = wgtBuffer.readUInt16LE(configLocalOffset + 26);
  const extraLen = wgtBuffer.readUInt16LE(configLocalOffset + 28);
  const configDataOffset = configLocalOffset + 30 + nameLen + extraLen;
  const configCompData = wgtBuffer.subarray(configDataOffset, configDataOffset + configEntry.compressedSize);
  const configXml = zlib.inflateRawSync(configCompData).toString('utf8');

  const configRes = TizenValidator.validateConfigXml(configXml);
  assert.equal(configRes.valid, true, `Decompressed config.xml failed validation: ${configRes.errors?.join(', ')}`);
  assert.match(configXml, /<tizen:profile[^>]*name="tv-samsung"/);
  assert.match(configXml, /hwkey-event="enable"/);
  assert.match(configXml, /package="tB7x9K3qL1"/);

  // Extract icon.png
  const iconEntry = entries.find((e: any) => e.name === 'icon.png');
  assert.ok(iconEntry, 'icon.png must be found in entries');

  const iconLocalOffset = iconEntry.localHeaderOffset;
  const iconNameLen = wgtBuffer.readUInt16LE(iconLocalOffset + 26);
  const iconExtraLen = wgtBuffer.readUInt16LE(iconLocalOffset + 28);
  const iconDataOffset = iconLocalOffset + 30 + iconNameLen + iconExtraLen;
  const iconCompData = wgtBuffer.subarray(iconDataOffset, iconDataOffset + iconEntry.compressedSize);
  const iconBuf = zlib.inflateRawSync(iconCompData);

  const iconRes = TizenValidator.validateIconBuffer(iconBuf);
  assert.equal(iconRes.valid, true, `Decompressed icon.png failed validation: ${iconRes.error}`);
  assert.equal(iconRes.width, 117);
  assert.equal(iconRes.height, 117);
});

// ============================================================================
// SUITE 2: ADVERSARIAL BOUNDARY TESTING OF TizenValidator
// ============================================================================

test('TizenValidator Boundary [config.xml]: Missing or malformed root inputs', () => {
  const invalidInputs = [null, undefined, '', 12345, {}, [], true, false];

  for (const input of invalidInputs) {
    const res = TizenValidator.validateConfigXml(input as any);
    assert.equal(res.valid, false);
    assert.ok(res.errors.length > 0);
    assert.ok(res.errors[0].includes('missing or empty'));
  }

  // Whitespace-only string fails due to missing tags/namespaces
  const wsRes = TizenValidator.validateConfigXml('   \t\n  ');
  assert.equal(wsRes.valid, false);
  assert.ok(wsRes.errors.length > 0);
});

test('TizenValidator Boundary [config.xml]: Missing W3C or Tizen namespaces', () => {
  const xml = fs.readFileSync(CONFIG_PATH, 'utf8');

  // Missing W3C namespace
  const noW3c = xml.replace('xmlns="http://www.w3.org/ns/widgets"', '');
  const r1 = TizenValidator.validateConfigXml(noW3c);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e: string) => e.includes('Missing W3C widget namespace')));

  // Missing Tizen namespace
  const noTizen = xml.replace('xmlns:tizen="http://tizen.org/ns/widgets"', '');
  const r2 = TizenValidator.validateConfigXml(noTizen);
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e: string) => e.includes('Missing Tizen namespace')));
});

test('TizenValidator Boundary [config.xml]: Profiles other than tv-samsung are strictly rejected', () => {
  const xml = fs.readFileSync(CONFIG_PATH, 'utf8');
  const invalidProfiles = ['mobile', 'wearable', 'common', 'tv', 'tv-samsung-2024', '', 'samsung-tv'];

  for (const prof of invalidProfiles) {
    const modified = xml.replace('tv-samsung', prof);
    const res = TizenValidator.validateConfigXml(modified);
    assert.equal(res.valid, false, `Profile '${prof}' should have been rejected`);
    assert.ok(res.errors.some((e: string) => e.includes('tv-samsung')));
  }
});

test('TizenValidator Boundary [config.xml]: Package prefix must be exactly 10 alphanumeric characters', () => {
  const xml = fs.readFileSync(CONFIG_PATH, 'utf8');

  // Empty package attribute results in missing package attribute error
  const emptyPkg = xml.replace('package="tB7x9K3qL1"', 'package=""');
  const rEmpty = TizenValidator.validateConfigXml(emptyPkg);
  assert.equal(rEmpty.valid, false);
  assert.ok(rEmpty.errors.some((e: string) => e.includes('package attribute')));

  const non10Lengths = [
    'a',             // 1 char
    '123456789',     // 9 chars
    '12345678901',   // 11 chars
    'abcdefghijklmn' // 14 chars
  ];

  for (const pkg of non10Lengths) {
    const modified = xml.replace('package="tB7x9K3qL1"', `package="${pkg}"`);
    const res = TizenValidator.validateConfigXml(modified);
    assert.equal(res.valid, false, `Package prefix '${pkg}' of length ${pkg.length} should fail`);
    assert.ok(res.errors.some((e: string) => e.includes('10 alphanumeric characters')));
  }

  // Exactly 10 characters should pass
  const valid10 = xml.replace('package="tB7x9K3qL1"', 'package="0123456789"');
  const validRes = TizenValidator.validateConfigXml(valid10);
  assert.equal(validRes.valid, true);
});

test('TizenValidator Boundary [config.xml]: Missing privileges and disabled hwkey-event', () => {
  const xml = fs.readFileSync(CONFIG_PATH, 'utf8');

  // Missing internet privilege
  const noInternet = xml.replace(/<tizen:privilege[^>]*name="http:\/\/tizen\.org\/privilege\/internet"[^>]*\/>/, '');
  const r1 = TizenValidator.validateConfigXml(noInternet);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e: string) => e.includes('http://tizen.org/privilege/internet')));

  // Missing tv.inputdevice privilege
  const noInput = xml.replace(/<tizen:privilege[^>]*name="http:\/\/tizen\.org\/privilege\/tv\.inputdevice"[^>]*\/>/, '');
  const r2 = TizenValidator.validateConfigXml(noInput);
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e: string) => e.includes('http://tizen.org/privilege/tv.inputdevice')));

  // Missing hwkey-event="enable"
  const disabledHw = xml.replace('hwkey-event="enable"', 'hwkey-event="disable"');
  const r3 = TizenValidator.validateConfigXml(disabledHw);
  assert.equal(r3.valid, false);
  assert.ok(r3.errors.some((e: string) => e.includes('hwkey-event')));

  // Missing icon tag
  const noIcon = xml.replace('<icon src="icon.png"/>', '');
  const r4 = TizenValidator.validateConfigXml(noIcon);
  assert.equal(r4.valid, false);
  assert.ok(r4.errors.some((e: string) => e.includes('<icon src="icon.png"/>')));
});

test('TizenValidator Boundary [icon.png]: Corrupt, short, non-PNG, and off-by-one dimensions', () => {
  // Empty, null, undefined
  assert.equal(TizenValidator.validateIconBuffer(null as any).valid, false);
  assert.equal(TizenValidator.validateIconBuffer(undefined as any).valid, false);
  assert.equal(TizenValidator.validateIconBuffer(Buffer.alloc(0)).valid, false);

  // Short buffer (< 8 bytes)
  const shortBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const rShort = TizenValidator.validateIconBuffer(shortBuf);
  assert.equal(rShort.valid, false);
  assert.match(rShort.error, /Buffer is too small/);

  // Invalid signature (8 bytes but not PNG magic)
  const fakeSig = Buffer.from('GIF89a12');
  const rFake = TizenValidator.validateIconBuffer(fakeSig);
  assert.equal(rFake.valid, false);
  assert.match(rFake.error, /Invalid PNG header signature/);

  // Buffer between 8 and 23 bytes (signature valid, dimensions truncated)
  const trunc16 = Buffer.alloc(16);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(trunc16, 0);
  const rTrunc = TizenValidator.validateIconBuffer(trunc16);
  assert.equal(rTrunc.valid, false);
  assert.match(rTrunc.error, /Buffer is too small to read PNG dimensions/);

  // Off-by-one and boundary dimensions
  const testDimensions = [
    { w: 116, h: 117 },
    { w: 117, h: 116 },
    { w: 118, h: 117 },
    { w: 117, h: 118 },
    { w: 0, h: 0 },
    { w: 1, h: 1 },
    { w: 128, h: 128 },
    { w: 256, h: 256 },
    { w: 1920, h: 1080 },
    { w: 0xffff, h: 0xffff }
  ];

  for (const dim of testDimensions) {
    const mock = createMockPng(dim.w, dim.h);
    const res = TizenValidator.validateIconBuffer(mock);
    assert.equal(res.valid, false, `Dimensions ${dim.w}x${dim.h} must be rejected`);
    assert.match(res.error, /Icon dimensions must be exactly 117x117 pixels/);
  }

  // Exactly 117x117 mock must pass
  const validMock = createMockPng(117, 117);
  const rValid = TizenValidator.validateIconBuffer(validMock);
  assert.equal(rValid.valid, true);
  assert.equal(rValid.width, 117);
  assert.equal(rValid.height, 117);
});

// ============================================================================
// SUITE 3: ADVERSARIAL RESILIENCE OF build-wgt.js
// ============================================================================

test('build-wgt Resilience: Automatically generates icon.png if missing and completes build', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tizen-test-'));
  try {
    const tmpClient = path.join(tmpDir, 'client');
    const tmpTizen = path.join(tmpDir, 'tizen');
    fs.mkdirSync(tmpClient, { recursive: true });
    fs.mkdirSync(tmpTizen, { recursive: true });

    // Copy client index.html and config.xml
    fs.writeFileSync(path.join(tmpClient, 'index.html'), '<!DOCTYPE html><html><body>Test</body></html>');
    fs.copyFileSync(CONFIG_PATH, path.join(tmpTizen, 'config.xml'));

    const tmpIconPath = path.join(tmpTizen, 'icon.png');
    const tmpOutWgt = path.join(tmpDir, 'output.wgt');

    assert.ok(!fs.existsSync(tmpIconPath), 'Icon should be absent initially');

    // Execute buildWgt with missing icon
    const result = buildWgt({
      projectRoot: tmpDir,
      clientDir: tmpClient,
      configPath: path.join(tmpTizen, 'config.xml'),
      iconPath: tmpIconPath,
      outputPath: tmpOutWgt
    });

    assert.ok(fs.existsSync(tmpIconPath), 'icon.png should have been automatically generated');
    assert.ok(fs.existsSync(tmpOutWgt), 'output.wgt should have been created');
    assert.ok(result.entries.some((e: any) => e.name === 'icon.png'), 'Entries must contain generated icon.png');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('build-wgt Resilience: Throws informative error when client directory is missing or empty', () => {
  const nonExistentDir = path.join(os.tmpdir(), `non_existent_${Date.now()}`);

  assert.throws(
    () => {
      buildWgt({
        projectRoot: PROJECT_ROOT,
        clientDir: nonExistentDir
      });
    },
    /Compiled client assets not found/
  );
});

test('build-wgt Resilience: Throws informative error when config.xml is missing or invalid', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tizen-invalid-cfg-'));
  try {
    const tmpClient = path.join(tmpDir, 'client');
    fs.mkdirSync(tmpClient, { recursive: true });
    fs.writeFileSync(path.join(tmpClient, 'index.html'), '<html></html>');

    // Missing config.xml
    assert.throws(
      () => {
        buildWgt({
          projectRoot: tmpDir,
          clientDir: tmpClient,
          configPath: path.join(tmpDir, 'non_existent_config.xml')
        });
      },
      /Manifest file not found/
    );

    // Invalid config.xml (mobile profile)
    const badConfigPath = path.join(tmpDir, 'config.xml');
    const badXml = fs.readFileSync(CONFIG_PATH, 'utf8').replace('tv-samsung', 'mobile');
    fs.writeFileSync(badConfigPath, badXml);

    assert.throws(
      () => {
        buildWgt({
          projectRoot: tmpDir,
          clientDir: tmpClient,
          configPath: badConfigPath
        });
      },
      /Tizen config\.xml manifest failed validation/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('build-wgt Resilience: Throws informative error when icon is corrupted', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tizen-bad-icon-'));
  try {
    const tmpClient = path.join(tmpDir, 'client');
    fs.mkdirSync(tmpClient, { recursive: true });
    fs.writeFileSync(path.join(tmpClient, 'index.html'), '<html></html>');

    const badIconPath = path.join(tmpDir, 'icon.png');
    fs.writeFileSync(badIconPath, Buffer.from('CORRUPTED_PNG_DATA'));

    assert.throws(
      () => {
        buildWgt({
          projectRoot: tmpDir,
          clientDir: tmpClient,
          configPath: CONFIG_PATH,
          iconPath: badIconPath
        });
      },
      /Tizen icon\.png failed validation/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// SUITE 4: ZIP BUILDER & READER ADVERSARIAL PARSING ROBUSTNESS
// ============================================================================

test('readZipEntries Robustness: Rejects truncated buffers, missing EOCD, and corrupt CD headers', () => {
  // Too small
  assert.throws(() => readZipEntries(Buffer.alloc(10)), /Invalid zip buffer/);
  assert.throws(() => readZipEntries(null as any), /Invalid zip buffer/);

  // Missing EOCD signature in non-empty buffer
  const noEocd = Buffer.alloc(100);
  assert.throws(() => readZipEntries(noEocd), /EOCD signature not found/);

  // Corrupt CD signature: craft valid EOCD pointing to corrupt CD
  const crafted = Buffer.alloc(100);
  // Place EOCD at offset 70
  crafted.writeUInt32LE(0x06054b50, 70); // EOCD signature
  crafted.writeUInt16LE(0, 74);          // disk 0
  crafted.writeUInt16LE(0, 76);          // disk 0
  crafted.writeUInt16LE(1, 78);          // 1 entry
  crafted.writeUInt16LE(1, 80);          // 1 entry
  crafted.writeUInt32LE(40, 82);         // CD size: 40 bytes
  crafted.writeUInt32LE(30, 86);         // CD offset: byte 30
  // Byte 30 does NOT have 0x02014b50
  crafted.writeUInt32LE(0xdeadbeef, 30);

  assert.throws(() => readZipEntries(crafted), /Invalid central directory header/);
});

test('createZipBuffer Robustness: Normalizes backslashes, strips leading slashes, and round-trips empty & large files', () => {
  const testEntries = [
    { name: 'windows\\style\\path.txt', data: Buffer.from('hello windows', 'utf8') },
    { name: '/leading/slash/path.txt', data: Buffer.from('hello unix', 'utf8') },
    { name: 'empty_file.bin', data: Buffer.alloc(0) },
    { name: 'large_file.bin', data: crypto.randomBytes(65536) } // 64KB random payload
  ];

  const zipBuf = createZipBuffer(testEntries);
  assert.ok(Buffer.isBuffer(zipBuf));
  assert.ok(zipBuf.length > 0);

  const parsed = readZipEntries(zipBuf);
  assert.equal(parsed.length, 4);

  // Path normalization verified
  assert.equal(parsed[0].name, 'windows/style/path.txt');
  assert.equal(parsed[1].name, 'leading/slash/path.txt');
  assert.equal(parsed[2].name, 'empty_file.bin');
  assert.equal(parsed[2].uncompressedSize, 0);
  assert.equal(parsed[3].name, 'large_file.bin');
  assert.equal(parsed[3].uncompressedSize, 65536);

  // Verify decompression and data integrity of all entries
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const orig = testEntries[i];
    const localOffset = p.localHeaderOffset;
    const nameLen = zipBuf.readUInt16LE(localOffset + 26);
    const extraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + nameLen + extraLen;
    const compSlice = zipBuf.subarray(dataOffset, dataOffset + p.compressedSize);
    const decomp = zlib.inflateRawSync(compSlice);

    assert.equal(decomp.length, orig.data.length);
    assert.ok(decomp.equals(orig.data), `Data roundtrip mismatch for ${p.name}`);
  }
});
