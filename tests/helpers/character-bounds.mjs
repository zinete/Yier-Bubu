import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

// Decode this repository's indexed 8-bit PNG for real character collision sizes.
const png = readFileSync('src/assets/start-screen/characters/characters-sheet.png');
const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
assert.equal(png[24], 8); assert.equal(png[25], 3); assert.equal(png[28], 0);
let alpha; const chunks = [];
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
  if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
  if (type === 'tRNS') alpha = png.subarray(offset + 8, offset + 8 + length);
  offset += length + 12;
}
const raw = inflateSync(Buffer.concat(chunks)), pixels = new Uint8Array(width * height);
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < height; y++) {
  const filter = raw[y * (width + 1)];
  assert.ok(filter <= 4);
  for (let x = 0; x < width; x++) {
    const i = y * width + x, a = x ? pixels[i - 1] : 0, b = y ? pixels[i - width] : 0, c = x && y ? pixels[i - width - 1] : 0;
    pixels[i] = raw[y * (width + 1) + x + 1] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
  }
}
export function characterBounds(_texture, character) {
  let minX = 128, minY = 142, maxX = -1, maxY = -1;
  const row = character === 'bubu' ? 142 : 0;
  for (let frame = 0; frame < 16; frame++) for (let y = 0; y < 142; y++) for (let x = 0; x < 128; x++) {
    if ((alpha?.[pixels[(row + y) * width + frame * 128 + x]] ?? 255) < 32) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
