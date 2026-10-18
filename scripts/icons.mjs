/**
 * Draws the TabFlow icons (public/icon/16|32|48|128.png) from the logo of the popup and the main
 * page: a teal rounded square (#2DD4BF) with three tiles and a line in #04201C. No dependencies:
 * the shapes are signed distance fields sampled 4×4 per pixel, the PNG is written with zlib.
 *
 *   node scripts/icons.mjs [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const TEAL = [0x2d, 0xd4, 0xbf];
const INK = [0x04, 0x20, 0x1c];

/**
 * Per size: transparent padding around the square, the share of the square the 24-unit glyph box
 * takes, the stroke in glyph units (bolder on small icons, so the tiles stay visible).
 */
const SIZES = {
  16: { pad: 0, glyph: 0.82, stroke: 3.2 },
  32: { pad: 1, glyph: 0.74, stroke: 2.8 },
  48: { pad: 2, glyph: 0.7, stroke: 2.6 },
  128: { pad: 8, glyph: 0.64, stroke: 2.4 },
};

/** The logo in its 24×24 box (lucide-like strokes): three rounded tiles and a line. */
const TILES = [
  { x: 3, y: 4, w: 7, h: 7, r: 1.5 },
  { x: 14, y: 4, w: 7, h: 7, r: 1.5 },
  { x: 3, y: 14, w: 7, h: 7, r: 1.5 },
];
const LINE = { x1: 14, y1: 17.5, x2: 21, y2: 17.5 };

function roundRectDistance(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

function segmentDistance(px, py, { x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function drawIcon(size) {
  const { pad, glyph, stroke } = SIZES[size];
  const square = size - 2 * pad;
  const radius = square * 0.27;
  const center = size / 2;
  const unit = (square * glyph) / 24;
  // The glyph is a bit lower than its box: shift it up half a unit to look centred.
  const toGlyph = (px, py) => [(px - center) / unit + 12, (py - center) / unit + 12.5];

  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let back = 0;
      let ink = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const inSquare =
            roundRectDistance(px, py, center, center, square / 2, square / 2, radius) <= 0;
          if (!inSquare) continue;
          back++;
          const [gx, gy] = toGlyph(px, py);
          const onTile = TILES.some(
            (t) =>
              Math.abs(
                roundRectDistance(gx, gy, t.x + t.w / 2, t.y + t.h / 2, t.w / 2, t.h / 2, t.r),
              ) <=
              stroke / 2,
          );
          if (onTile || segmentDistance(gx, gy, LINE) <= stroke / 2) ink++;
        }
      }
      const total = samples * samples;
      const alpha = back / total;
      const inkShare = back === 0 ? 0 : ink / back;
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = Math.round(TEAL[c] * (1 - inkShare) + INK[c] * inkShare);
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, size, pixels);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = process.argv[2] ?? join(import.meta.dirname, '..', 'public', 'icon');
mkdirSync(outDir, { recursive: true });
for (const size of Object.keys(SIZES).map(Number)) {
  const file = join(outDir, `${size}.png`);
  writeFileSync(file, drawIcon(size));
  console.log(`${file}`);
}
