/**
 * Pure Node.js Tizen .wgt Package Generator for Samsung Smart TV UN50NU7400
 * Milestone M4: Dual Deployment & Native Tizen Packaging
 *
 * Packages dist/client/, tizen/config.xml, and tizen/icon.png into a standard PKZip 2.0
 * widget archive (.wgt) installable on Tizen 4.0 via SDB without external CLI dependencies.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { TizenValidator } = require('../tests/harness/tizen-validator');
const { generateIconFile } = require('./generate-icon');

// CRC32 calculation helper
function calculateCrc32(buf) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ (((c ^ buf[i]) & 0xff) * 0xedb88320);
  }
  return (c ^ (-1)) >>> 0;
}

// Convert Date to MS-DOS date/time format
function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Creates a valid PKZip 2.0 buffer from an array of { name: string, data: Buffer } entries
 */
function createZipBuffer(entries) {
  const localChunks = [];
  const cdChunks = [];
  let currentOffset = 0;
  const { dosTime, dosDate } = toDosDateTime();

  for (const entry of entries) {
    // Normalize path to forward slashes, strip any leading slashes
    const entryName = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBuf = Buffer.from(entryName, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const uncompressedSize = dataBuf.length;
    const crc = calculateCrc32(dataBuf);

    // Deflate compression
    const compressedBuf = zlib.deflateRawSync(dataBuf, { level: 9 });
    const compressedSize = compressedBuf.length;

    // 1. Local File Header (30 bytes + nameBuf.length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6);     // Bit flag: UTF-8 encoding
    localHeader.writeUInt16LE(8, 8);          // Compression method: 8 (Deflate)
    localHeader.writeUInt16LE(dosTime, 10);    // Mod time
    localHeader.writeUInt16LE(dosDate, 12);    // Mod date
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28);              // Extra field length (0)

    localChunks.push(localHeader, nameBuf, compressedBuf);

    // 2. Central Directory Header (46 bytes + nameBuf.length)
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Signature PK\x01\x02
    cdHeader.writeUInt16LE(20, 4);         // Version made by: 2.0
    cdHeader.writeUInt16LE(20, 6);         // Version needed: 2.0
    cdHeader.writeUInt16LE(0x0800, 8);     // Bit flag: UTF-8 encoding
    cdHeader.writeUInt16LE(8, 10);         // Compression method: 8 (Deflate)
    cdHeader.writeUInt16LE(dosTime, 12);   // Mod time
    cdHeader.writeUInt16LE(dosDate, 14);   // Mod date
    cdHeader.writeUInt32LE(crc, 16);       // CRC-32
    cdHeader.writeUInt32LE(compressedSize, 20);
    cdHeader.writeUInt32LE(uncompressedSize, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28); // Filename length
    cdHeader.writeUInt16LE(0, 30);              // Extra field length (0)
    cdHeader.writeUInt16LE(0, 32);              // Comment length (0)
    cdHeader.writeUInt16LE(0, 34);              // Disk start (0)
    cdHeader.writeUInt16LE(0, 36);              // Internal attributes
    cdHeader.writeUInt32LE(0x81a40000, 38);     // External attributes: standard regular file
    cdHeader.writeUInt32LE(currentOffset, 42);  // Relative offset of local header

    cdChunks.push(cdHeader, nameBuf);

    // Advance offset
    currentOffset += localHeader.length + nameBuf.length + compressedBuf.length;
  }

  const cdStartOffset = currentOffset;
  const cdBuffer = Buffer.concat(cdChunks);
  const cdSize = cdBuffer.length;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature PK\x05\x06
  eocd.writeUInt16LE(0, 4);          // Disk number (0)
  eocd.writeUInt16LE(0, 6);          // Disk with CD (0)
  eocd.writeUInt16LE(entries.length, 8);  // CD entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total CD entries
  eocd.writeUInt32LE(cdSize, 12);         // Size of CD
  eocd.writeUInt32LE(cdStartOffset, 16);  // Offset of CD
  eocd.writeUInt16LE(0, 20);              // Comment length (0)

  return Buffer.concat([...localChunks, cdBuffer, eocd]);
}

/**
 * Inspects a PKZip buffer and extracts file entries
 */
function readZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error('Invalid zip buffer');
  }

  // Find EOCD by scanning backward from end of file
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('EOCD signature not found in archive');
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let pos = cdOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error(`Invalid central directory header at offset ${pos}`);
    }

    const compression = buffer.readUInt16LE(pos + 10);
    const crc32 = buffer.readUInt32LE(pos + 16);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const uncompressedSize = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const commentLen = buffer.readUInt16LE(pos + 32);
    const localHeaderOffset = buffer.readUInt32LE(pos + 42);

    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);

    entries.push({
      name,
      compression,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Recursively scans a directory for files
 */
function scanDirectory(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...scanDirectory(fullPath, baseDir));
    } else if (item.isFile()) {
      const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      results.push({
        name: relPath,
        filePath: fullPath,
        data: fs.readFileSync(fullPath)
      });
    }
  }
  return results;
}

/**
 * Builds the native Tizen .wgt package
 */
function buildWgt(options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const clientDir = options.clientDir || path.join(projectRoot, 'dist', 'client');
  const configPath = options.configPath || path.join(projectRoot, 'tizen', 'config.xml');
  const iconPath = options.iconPath || path.join(projectRoot, 'tizen', 'icon.png');
  const outputPath = options.outputPath || path.join(projectRoot, 'dist', 'MultimediaDrive.wgt');

  console.log('[Tizen Packager] Starting Native Tizen Packaging...');
  console.log(`[Tizen Packager] Project Root: ${projectRoot}`);
  console.log(`[Tizen Packager] Client Dir:   ${clientDir}`);
  console.log(`[Tizen Packager] Config XML:   ${configPath}`);
  console.log(`[Tizen Packager] Icon PNG:     ${iconPath}`);
  console.log(`[Tizen Packager] Output .wgt:  ${outputPath}`);

  // 1. Verify Client Build
  const clientIndexHtml = path.join(clientDir, 'index.html');
  if (!fs.existsSync(clientIndexHtml)) {
    throw new Error(
      `Compiled client assets not found at ${clientDir} (missing index.html). Please run 'npm run build:client' first.`
    );
  }

  // 2. Validate config.xml
  if (!fs.existsSync(configPath)) {
    throw new Error(`Manifest file not found: ${configPath}`);
  }
  const configContent = fs.readFileSync(configPath, 'utf8');
  const configValidation = TizenValidator.validateConfigXml(configContent);
  if (!configValidation.valid) {
    throw new Error(
      `Tizen config.xml manifest failed validation:\n - ${configValidation.errors.join('\n - ')}`
    );
  }
  console.log('[Tizen Packager] config.xml validated successfully.');

  // 3. Validate icon.png (generate if absent)
  if (!fs.existsSync(iconPath)) {
    console.log('[Tizen Packager] icon.png not found, generating automatically...');
    generateIconFile(iconPath);
  }
  const iconBuffer = fs.readFileSync(iconPath);
  const iconValidation = TizenValidator.validateIconBuffer(iconBuffer);
  if (!iconValidation.valid) {
    throw new Error(`Tizen icon.png failed validation: ${iconValidation.error}`);
  }
  console.log(`[Tizen Packager] icon.png validated successfully (${iconValidation.width}x${iconValidation.height}).`);

  // 4. Collect package files
  const packageEntries = [];

  // Root files
  packageEntries.push({
    name: 'config.xml',
    data: Buffer.from(configContent, 'utf8')
  });

  packageEntries.push({
    name: 'icon.png',
    data: iconBuffer
  });

  // Client assets from dist/client/
  const clientFiles = scanDirectory(clientDir);
  console.log(`[Tizen Packager] Bundling ${clientFiles.length} files from ${clientDir}...`);
  for (const file of clientFiles) {
    packageEntries.push({
      name: file.name,
      data: file.data
    });
  }

  // 5. Construct PKZip archive buffer
  const zipBuffer = createZipBuffer(packageEntries);

  // 6. Ensure output directory and write file
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, zipBuffer);

  // 7. Verification of generated archive
  const parsedEntries = readZipEntries(zipBuffer);
  const sha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');

  console.log('----------------------------------------------------');
  console.log('[Tizen Packager] WGT Package Built Successfully!');
  console.log(`[Tizen Packager] Output File:     ${outputPath}`);
  console.log(`[Tizen Packager] Archive Size:    ${zipBuffer.length} bytes (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`[Tizen Packager] Total Files:     ${parsedEntries.length}`);
  console.log(`[Tizen Packager] SHA-256:         ${sha256}`);
  console.log('----------------------------------------------------');
  console.log('[Tizen Packager] Archive Root Entries:');
  parsedEntries.forEach(e => {
    console.log(`   - ${e.name} (${e.uncompressedSize} -> ${e.compressedSize} bytes)`);
  });
  console.log('----------------------------------------------------');

  return {
    outputPath,
    size: zipBuffer.length,
    sha256,
    entries: parsedEntries,
    buffer: zipBuffer
  };
}

// CLI execution
if (require.main === module) {
  try {
    buildWgt();
  } catch (err) {
    console.error('[Tizen Packager] Fatal error:', err.message);
    process.exit(1);
  }
}

module.exports = {
  buildWgt,
  createZipBuffer,
  readZipEntries,
  scanDirectory,
  calculateCrc32
};
