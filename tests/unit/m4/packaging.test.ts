import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { TizenValidator } from '../../harness/tizen-validator';
// @ts-ignore
import { generateIconBuffer, generateIconFile } from '../../../tizen/generate-icon';
// @ts-ignore
import { buildWgt, createZipBuffer, readZipEntries } from '../../../tizen/build-wgt';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'tizen', 'config.xml');
const ICON_PATH = path.join(PROJECT_ROOT, 'tizen', 'icon.png');
const WGT_PATH = path.join(PROJECT_ROOT, 'dist', 'MultimediaDrive.wgt');

test('Packaging Unit: config.xml exists and validates cleanly against Tizen 4.0 requirements', () => {
  assert.ok(fs.existsSync(CONFIG_PATH), 'tizen/config.xml must exist');
  const xml = fs.readFileSync(CONFIG_PATH, 'utf8');
  const result = TizenValidator.validateConfigXml(xml);
  assert.equal(result.valid, true, `Validation errors: ${result.errors.join(', ')}`);
  assert.equal(result.errors.length, 0);
});

test('Packaging Unit: config.xml contains all mandatory attributes and tags for Samsung TV UN50NU7400', () => {
  const xml = fs.readFileSync(CONFIG_PATH, 'utf8');
  assert.match(xml, /xmlns="http:\/\/www\.w3\.org\/ns\/widgets"/);
  assert.match(xml, /xmlns:tizen="http:\/\/tizen\.org\/ns\/widgets"/);
  assert.match(xml, /package="tB7x9K3qL1"/);
  assert.match(xml, /id="tB7x9K3qL1\.MultimediaDrive"/);
  assert.match(xml, /<tizen:profile[^>]*name="tv-samsung"/);
  assert.match(xml, /hwkey-event="enable"/);
  assert.match(xml, /<tizen:privilege[^>]*name="http:\/\/tizen\.org\/privilege\/internet"/);
  assert.match(xml, /<tizen:privilege[^>]*name="http:\/\/tizen\.org\/privilege\/tv\.inputdevice"/);
  assert.match(xml, /<content[^>]*src="index\.html"/);
  assert.match(xml, /<icon[^>]*src="icon\.png"/);
});

test('Packaging Unit: Manifest validator rejects invalid profile, missing privileges, or invalid package length', () => {
  const xml = fs.readFileSync(CONFIG_PATH, 'utf8');

  // Mobile profile rejection
  const invalidProfile = xml.replace('tv-samsung', 'mobile');
  const r1 = TizenValidator.validateConfigXml(invalidProfile);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e: string) => e.includes('tv-samsung')));

  // Missing input device privilege rejection
  const missingPriv = xml.replace(/<tizen:privilege[^>]*name="http:\/\/tizen\.org\/privilege\/tv\.inputdevice"[^>]*\/>/, '');
  const r2 = TizenValidator.validateConfigXml(missingPriv);
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e: string) => e.includes('tv.inputdevice')));

  // Package prefix length not 10 characters
  const invalidPkg = xml.replace('package="tB7x9K3qL1"', 'package="shortPkg"');
  const r3 = TizenValidator.validateConfigXml(invalidPkg);
  assert.equal(r3.valid, false);
  assert.ok(r3.errors.some((e: string) => e.includes('10 alphanumeric characters')));
});

test('Packaging Unit: Pure Node.js generateIconBuffer creates valid 117x117 PNG binary', () => {
  const buf = generateIconBuffer();
  assert.ok(Buffer.isBuffer(buf), 'Must return a Buffer');
  assert.ok(buf.length > 50, 'Buffer should be larger than minimal PNG overhead');

  // Validate PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buf.subarray(0, 8).equals(signature), 'Header must match PNG signature');

  // Validate dimensions via TizenValidator
  const validation = TizenValidator.validateIconBuffer(buf);
  assert.equal(validation.valid, true, `Validation failed: ${validation.error}`);
  assert.equal(validation.width, 117);
  assert.equal(validation.height, 117);
});

test('Packaging Unit: tizen/icon.png on disk exists and passes TizenValidator', () => {
  if (!fs.existsSync(ICON_PATH)) {
    generateIconFile(ICON_PATH);
  }
  const buf = fs.readFileSync(ICON_PATH);
  const validation = TizenValidator.validateIconBuffer(buf);
  assert.equal(validation.valid, true);
  assert.equal(validation.width, 117);
  assert.equal(validation.height, 117);
});

test('Packaging Unit: Icon buffer validator rejects corrupted, truncated, or non-117x117 images', () => {
  // Corrupted header
  const corrupt = Buffer.from('NOT_A_VALID_PNG_BUFFER_HEADER');
  const r1 = TizenValidator.validateIconBuffer(corrupt);
  assert.equal(r1.valid, false);
  assert.match(r1.error, /Invalid PNG header/);

  // Truncated buffer
  const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const r2 = TizenValidator.validateIconBuffer(truncated);
  assert.equal(r2.valid, false);
  assert.match(r2.error, /too small/);

  // 128x128 dimensions
  const buf128 = generateIconBuffer({ width: 128, height: 128 });
  const r3 = TizenValidator.validateIconBuffer(buf128);
  assert.equal(r3.valid, false);
  assert.match(r3.error, /Icon dimensions must be exactly 117x117 pixels/);
});

test('Packaging Unit: createZipBuffer and readZipEntries round-trip archive integrity', () => {
  const entries = [
    { name: 'config.xml', data: Buffer.from('<widget/>', 'utf8') },
    { name: 'icon.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    { name: 'assets/app.js', data: Buffer.from('console.log("hello");', 'utf8') },
  ];

  const zipBuf = createZipBuffer(entries);
  assert.ok(Buffer.isBuffer(zipBuf));
  assert.ok(zipBuf.length > 0);

  const parsed = readZipEntries(zipBuf);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].name, 'config.xml');
  assert.equal(parsed[1].name, 'icon.png');
  assert.equal(parsed[2].name, 'assets/app.js');
  assert.equal(parsed[0].uncompressedSize, '<widget/>'.length);
});

test('Packaging Unit: buildWgt generates compliant dist/MultimediaDrive.wgt package', () => {
  const result = buildWgt({ projectRoot: PROJECT_ROOT });
  assert.ok(fs.existsSync(result.outputPath));
  assert.ok(result.size > 1000, 'Archive should be non-trivial');
  assert.ok(result.sha256.length === 64, 'SHA-256 hash must be 64 hex characters');

  // Inspect entries inside .wgt
  const entryNames = result.entries.map((e: any) => e.name);
  assert.ok(entryNames.includes('config.xml'), 'Must contain config.xml at root');
  assert.ok(entryNames.includes('icon.png'), 'Must contain icon.png at root');
  assert.ok(entryNames.includes('index.html'), 'Must contain index.html at root');
  assert.ok(entryNames.some((n: string) => n.startsWith('assets/')), 'Must contain assets directory');

  // Strict check: No entry path can contain backslashes
  for (const entry of result.entries) {
    assert.equal(entry.name.includes('\\'), false, `Entry path ${entry.name} must not contain backslashes`);
    assert.equal(entry.name.startsWith('/'), false, `Entry path ${entry.name} must not start with leading slash`);
  }
});

test('Packaging Unit: buildWgt throws descriptive error when client build is missing', () => {
  assert.throws(
    () => {
      buildWgt({
        projectRoot: PROJECT_ROOT,
        clientDir: path.join(PROJECT_ROOT, 'non_existent_client_dir_xyz'),
      });
    },
    /Compiled client assets not found/
  );
});
