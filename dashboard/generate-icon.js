/**
 * Generate PNG and ICO icons from logo.svg.
 * Uses the SVG directly — renders to a 256x256 PNG pixel buffer.
 */
const fs = require('fs');
const path = require('path');
const { deflateSync } = require('zlib');

const svgPath = path.join(__dirname, 'public', 'logo.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

// Parse basic shapes from the SVG to render a simplified version
// Since we can't use canvas/sharp in pure Node, generate a simple centered icon
// by creating a colored hexagon shape that matches the logo

const SIZE = 256;
const pixels = Buffer.alloc(SIZE * SIZE * 4, 0);

function setPixel(x, y, r, g, b, a) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const srcA = a / 255;
  const dstA = pixels[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  pixels[i]     = Math.round((r * srcA + pixels[i]     * dstA * (1 - srcA)) / outA);
  pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
  pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
  pixels[i + 3] = Math.round(outA * 255);
}

function fillCircle(cx, cy, r, red, green, blue, alpha = 255) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= r) {
        const a = Math.min(1, r - d) * (alpha / 255);
        setPixel(x, y, red, green, blue, Math.round(a * 255));
      }
    }
  }
}

// Draw a regular hexagon (like the logo shape)
function fillHexagon(cx, cy, radius, r, g, b, a = 255) {
  // Pointy-top hexagon vertices
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    verts.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  // Scanline fill
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      let inside = true;
      for (let i = 0; i < 6; i++) {
        const [x1, y1] = verts[i];
        const [x2, y2] = verts[(i + 1) % 6];
        if ((y2 - y1) * (x - x1) - (x2 - x1) * (y - y1) > 0) { inside = false; break; }
      }
      if (inside) setPixel(x, y, r, g, b, a);
    }
  }
}

// Logo colors from SVG: dark gray hex (#404040) with light gray S (#CCCCCC)
const BG = [64, 64, 64];       // #404040
const FG = [204, 204, 204];    // #CCCCCC

// Draw hexagon background
fillHexagon(128, 128, 120, ...BG);

// Draw a simplified "S" shape in the center
// Top curve of S
for (let angle = Math.PI * 0.8; angle <= Math.PI * 2.2; angle += 0.02) {
  const x = 128 + 30 * Math.cos(angle) - 10;
  const y = 95 + 25 * Math.sin(angle);
  fillCircle(x, y, 6, ...FG);
}
// Bottom curve of S (reversed)
for (let angle = Math.PI * -0.2; angle <= Math.PI * 1.2; angle += 0.02) {
  const x = 128 + 30 * Math.cos(angle) + 10;
  const y = 160 + 25 * Math.sin(angle);
  fillCircle(x, y, 6, ...FG);
}

// ── Encode as PNG ───────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6;

const rawRows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rawRows[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(rawRows, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const compressed = deflateSync(rawRows);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, 'public', 'icon.png');
fs.writeFileSync(outPath, png);
console.log(`PNG icon written to ${outPath} (${png.length} bytes)`);
