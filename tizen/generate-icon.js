/**
 * Pure Node.js 117x117 PNG Icon Generator for Samsung Smart TV UN50NU7400
 * Milestone M4: Dual Deployment & Native Tizen Packaging
 *
 * Generates an authoritative 117x117 RGBA PNG icon adhering strictly to ISO/IEC 15948
 * and passing tests/harness/tizen-validator.js checks without any external dependencies.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { TizenValidator } = require('../tests/harness/tizen-validator');

// CRC32 table for fallback
let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function calculateCrc32(buf) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  const table = getCrcTable();
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcTarget = Buffer.concat([typeBuf, data]);
  const crcVal = calculateCrc32(crcTarget);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Generates a 117x117 RGBA PNG buffer with Samsung TV themed icon artwork
 */
function generateIconBuffer(options = {}) {
  const width = options.width || 117;
  const height = options.height || 117;

  // 1. IHDR Chunk Data (13 bytes)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth: 8
  ihdrData.writeUInt8(6, 9); // color type: 6 (RGBA)
  ihdrData.writeUInt8(0, 10); // compression method: deflate
  ihdrData.writeUInt8(0, 11); // filter method: 0
  ihdrData.writeUInt8(0, 12); // interlace method: 0 (no interlace)

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // 2. Raster Data
  // Each row has 1 filter byte (0) + width * 4 bytes RGBA
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Distance from center
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);

      // Rounded container box
      const cornerRadius = 18;
      const boxPad = 6;
      const inBoxX = x >= boxPad && x < width - boxPad;
      const inBoxY = y >= boxPad && y < height - boxPad;

      // Check if inside rounded rectangle
      const qx = Math.max(0, Math.abs(x - (width - 1) / 2) - ((width - 2 * boxPad) / 2 - cornerRadius));
      const qy = Math.max(0, Math.abs(y - (height - 1) / 2) - ((height - 2 * boxPad) / 2 - cornerRadius));
      const distCorner = Math.sqrt(qx * qx + qy * qy);
      const insideBadge = distCorner <= cornerRadius;

      if (!insideBadge) {
        // Transparent outside badge
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Border check (2px border)
      const isBorder = distCorner >= cornerRadius - 2.5;

      // Play button triangle centered
      // Vertices: (45, 36), (45, 80), (82, 58)
      const x1 = 45, y1 = 36;
      const x2 = 45, y2 = 80;
      const x3 = 83, y3 = 58;

      // Point-in-triangle check using barycentric / cross product
      const sign = (p1x, p1y, p2x, p2y, p3x, p3y) =>
        (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);

      const d1 = sign(x, y, x1, y1, x2, y2);
      const d2 = sign(x, y, x2, y2, x3, y3);
      const d3 = sign(x, y, x3, y3, x1, y1);

      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      const inTriangle = !(hasNeg && hasPos);

      if (isBorder) {
        // Cyan border #00a8e8
        rawData[pxOffset] = 0x00;
        rawData[pxOffset + 1] = 0xa8;
        rawData[pxOffset + 2] = 0xe8;
        rawData[pxOffset + 3] = 0xff;
      } else if (inTriangle) {
        // Vibrant neon cyan play glyph #00e5ff
        rawData[pxOffset] = 0x00;
        rawData[pxOffset + 1] = 0xe5;
        rawData[pxOffset + 2] = 0xff;
        rawData[pxOffset + 3] = 0xff;
      } else {
        // Badge background: dark navy gradient from top to bottom
        const gradT = y / height;
        const r = Math.round(15 + gradT * 10); // 15 to 25
        const g = Math.round(23 + gradT * 12); // 23 to 35
        const b = Math.round(42 + gradT * 20); // 42 to 62
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
        rawData[pxOffset + 3] = 0xff;
      }
    }
  }

  // 3. IDAT Chunk Data (zlib compressed)
  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);

  // 4. IEND Chunk Data (0 bytes)
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  // 5. PNG Signature (8 bytes)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Generates and saves the icon to destination file
 */
function generateIconFile(targetPath = path.join(__dirname, 'icon.png')) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const iconBuffer = generateIconBuffer();
  const validation = TizenValidator.validateIconBuffer(iconBuffer);

  if (!validation.valid) {
    throw new Error(`Generated icon failed validation: ${validation.error}`);
  }

  fs.writeFileSync(targetPath, iconBuffer);
  console.log(`[Icon Generator] Successfully generated 117x117 icon at: ${targetPath}`);
  console.log(`[Icon Generator] Size: ${iconBuffer.length} bytes, Dimensions: ${validation.width}x${validation.height}`);
  return { buffer: iconBuffer, path: targetPath, validation };
}

// CLI execution
if (require.main === module) {
  try {
    const targetFile = process.argv[2] || path.join(__dirname, 'icon.png');
    generateIconFile(targetFile);
  } catch (err) {
    console.error('[Icon Generator] Error:', err.message);
    process.exit(1);
  }
}

module.exports = {
  generateIconBuffer,
  generateIconFile,
  calculateCrc32,
  makeChunk
};
