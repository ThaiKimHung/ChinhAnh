import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCutoutMatte } from '../src/engine/cutout.js';

function imageFromRow(row, height = 1) {
  const data = new Uint8ClampedArray(row.length * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < row.length; x++) data.set(row[x], (y * row.length + x) * 4);
  }
  return { width: row.length, height, data };
}

test('cutout recovers the foreground color where an opaque photo includes old background spill', () => {
  const background = [220, 212, 190, 255];
  const foreground = [28, 62, 91, 255];
  const image = imageFromRow([background, background, [124, 137, 140, 255], foreground, foreground]);
  const matte = new Uint8ClampedArray([0, 0, 128, 255, 255]);

  applyCutoutMatte(image, matte, { feather: 0 });

  const edge = [...image.data.slice(8, 12)];
  assert.ok(edge.slice(0, 3).every((value, channel) => Math.abs(value - foreground[channel]) <= 2));
  assert.equal(edge[3], 128);
  assert.deepEqual([...image.data.slice(12, 16)], foreground);
  assert.deepEqual([...matte], [0, 0, 128, 255, 255]);
});

test('cutout keeps the straight colors of a strand if the original pixel already has transparency', () => {
  const background = [220, 212, 190, 255];
  const image = imageFromRow([background, [118, 131, 143, 128], [28, 62, 91, 255]]);

  applyCutoutMatte(image, new Uint8ClampedArray([0, 128, 255]), { feather: 0 });

  assert.deepEqual([...image.data.slice(4, 8)], [118, 131, 143, 64]);
});

test('cutout preserves the edge RGB when adjacent opaque foreground and background cannot be sampled', () => {
  const image = imageFromRow([[105, 115, 125, 255], [120, 20, 10, 255], [65, 75, 85, 255]]);

  applyCutoutMatte(image, new Uint8ClampedArray([70, 128, 210]), { feather: 0 });

  assert.deepEqual([...image.data.slice(4, 8)], [120, 20, 10, 128]);
});

test('cutout avoids expanding feather into erased background and retains a one-pixel hair strand', () => {
  const opaque = [50, 65, 75, 255];
  const image = imageFromRow(new Array(9).fill(opaque), 9);
  const matte = new Uint8ClampedArray(81);
  for (let y = 0; y < 9; y++) matte[y * 9 + 4] = 255;

  applyCutoutMatte(image, matte, { feather: 2 });

  assert.equal(image.data[(4 * 9 + 3) * 4 + 3], 0);
  assert.equal(image.data[(4 * 9 + 5) * 4 + 3], 0);
  assert.ok(image.data[(4 * 9 + 4) * 4 + 3] >= 225);
});

test('feather softens the edge of a broad subject and leaves its opaque interior unchanged', () => {
  const opaque = [50, 65, 75, 255];
  const image = imageFromRow(new Array(11).fill(opaque), 7);
  const matte = new Uint8ClampedArray(77);
  for (let y = 0; y < 7; y++) matte.fill(255, y * 11 + 5, (y + 1) * 11);

  applyCutoutMatte(image, matte, { feather: 2 });

  const edge = image.data[(3 * 11 + 5) * 4 + 3];
  assert.ok(edge > 210 && edge < 255);
  assert.equal(image.data[(3 * 11 + 9) * 4 + 3], 255);
});
