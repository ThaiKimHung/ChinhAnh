import assert from 'node:assert/strict';
import test from 'node:test';
import { idCropRect, idSheetLayout, withPrintDpi } from '../src/engine/idPhoto.js';

test('3 × 4 cm sheet: eight photos of exactly 3 × 4 cm on a 10 × 15 cm landscape sheet', () => {
  const l = idSheetLayout('3x4');
  assert.deepEqual([l.sheetW, l.sheetH], [1800, 1200]);
  assert.deepEqual([l.photoW, l.photoH], [354, 472]);
  assert.equal(l.cells.length, 8);
  for (const c of l.cells) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + l.photoW <= l.sheetW && c.y + l.photoH <= l.sheetH);
  }
});

test('4 × 6 cm sheet: four portrait photos on a 10 × 15 cm portrait sheet', () => {
  const l = idSheetLayout('4x6');
  assert.deepEqual([l.sheetW, l.sheetH], [1200, 1800]);
  assert.deepEqual([l.photoW, l.photoH], [472, 709]);
  assert.equal(l.cells.length, 4);
  assert.ok(l.photoH > l.photoW, 'cells are portrait, so heads are not cut off');
});

test('the crop keeps the face in the upper part and never crops the top of a tall portrait by centring', () => {
  // Source wider than 3:4 → crop the sides around the face.
  const side = idCropRect(1200, 1000, 0.75, { x: 0.3, y: 0.4 });
  assert.equal(side.h, 1000);
  assert.equal(side.w, 750);
  assert.equal(side.x, 0);
  // Source taller than 3:4 → face sits about 42% from the top.
  const tall = idCropRect(900, 1600, 0.75, { x: 0.5, y: 0.45 });
  assert.equal(tall.w, 900);
  assert.equal(tall.h, 1200);
  assert.ok(Math.abs(tall.y + tall.h * 0.42 - 720) <= 1);
  // A face near the top cannot go higher than the picture allows.
  assert.equal(idCropRect(900, 1600, 0.75, { x: 0.5, y: 0.1 }).y, 0);
  // No face found → favour the top rather than the middle.
  assert.ok(idCropRect(900, 1600, 0.75).y < (1600 - 1200) / 2);
});

test('print resolution is written into JPEG and PNG files', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const j = new Uint8Array(await (await withPrintDpi(new Blob([jpeg], { type: 'image/jpeg' }))).arrayBuffer());
  assert.deepEqual([...j.subarray(13, 18)], [1, 1, 44, 1, 44]);

  const png = new Uint8Array(8 + 25 + 12);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const p = new Uint8Array(await (await withPrintDpi(new Blob([png], { type: 'image/png' }))).arrayBuffer());
  assert.equal(p.length, png.length + 21);
  assert.equal(String.fromCharCode(...p.subarray(37, 41)), 'pHYs');
  assert.equal(new DataView(p.buffer).getUint32(41), 11811);
});

test('print DPI replaces an existing PNG density instead of adding a second chunk', async () => {
  const original = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const output = Buffer.from(await (await withPrintDpi(new Blob([original], { type: 'image/png' }))).arrayBuffer());
  const chunks = [];
  for (let offset = 8; offset < output.length;) {
    const length = output.readUInt32BE(offset);
    chunks.push({ type: output.toString('ascii', offset + 4, offset + 8), start: offset });
    offset += 12 + length;
  }
  assert.deepEqual(chunks.map(({ type }) => type), ['IHDR', 'pHYs', 'IDAT', 'IEND']);
  const density = chunks[1].start;
  assert.equal(output.readUInt32BE(density + 8), 11811);
  assert.equal(output.readUInt32BE(density + 12), 11811);
  assert.equal(output.readUInt8(density + 16), 1);
  assert.deepEqual(output.subarray(chunks[2].start), original.subarray(54), 'image data and end chunks are unchanged');
});

test('print DPI updates JFIF following another APP segment', async () => {
  const app = [0xff, 0xe1, 0, 6, 0x45, 0x78, 0x69, 0x66];
  const jfif = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const jpeg = new Uint8Array([0xff, 0xd8, ...app, ...jfif, 0xff, 0xd9]);
  const output = new Uint8Array(await (await withPrintDpi(new Blob([jpeg], { type: 'image/jpeg' }))).arrayBuffer());
  assert.equal(output.length, jpeg.length);
  assert.deepEqual([...output.subarray(2, 10)], app);
  assert.deepEqual([...output.subarray(21, 26)], [1, 1, 44, 1, 44]);
});

test('print DPI adds JFIF to JPEG output that lacks a density segment', async () => {
  const app = [0xff, 0xe1, 0, 6, 0x45, 0x78, 0x69, 0x66];
  const jpeg = new Uint8Array([0xff, 0xd8, ...app, 0xff, 0xd9]);
  const output = new Uint8Array(await (await withPrintDpi(new Blob([jpeg], { type: 'image/jpeg' }))).arrayBuffer());
  assert.equal(output.length, jpeg.length + 18);
  assert.equal(String.fromCharCode(...output.subarray(6, 10)), 'JFIF');
  assert.deepEqual([...output.subarray(13, 18)], [1, 1, 44, 1, 44]);
  assert.deepEqual([...output.subarray(20)], [...app, 0xff, 0xd9]);
});
