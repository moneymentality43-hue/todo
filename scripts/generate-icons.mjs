// Generates the PWA / notification PNG icons into public/. Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// RGBA PNG: `bg` fills the square (null = transparent), a white dot is drawn in the centre.
function png(size, dotRatio, bg) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2;
  const r = size * dotRatio;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const o = row + 1 + x * 4;
      const a = Math.min(1, Math.max(0, r - d + 0.5));
      const [br, bgc, bb, ba] = bg ?? [0, 0, 0, 0];
      raw[o] = Math.round(255 * a + br * (1 - a));
      raw[o + 1] = Math.round(255 * a + bgc * (1 - a));
      raw[o + 2] = Math.round(255 * a + bb * (1 - a));
      raw[o + 3] = Math.round(255 * a + ba * (1 - a));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, 0.2, [0, 0, 0, 255]));
writeFileSync('public/icon-512.png', png(512, 0.2, [0, 0, 0, 255]));
// Android status-bar badge: monochrome on transparent
writeFileSync('public/badge.png', png(96, 0.32, null));
console.log('icons written');
