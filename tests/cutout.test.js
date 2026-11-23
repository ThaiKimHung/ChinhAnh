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

test('flyaway strands get their own colour and the background haze around them disappears', () => {
  const W = 41, H = 21;
  const bg = [120, 135, 150];
  const hair = [30, 25, 20];
  const data = new Uint8ClampedArray(W * H * 4);
  const matte = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      let a = 0;
      if (x === 20) a = 90; // thin strand, far from any solid foreground
      else if (Math.abs(x - 20) <= 3) a = 40; // matte haze over plain background
      const mix = x === 20 ? a / 255 : 0;
      data.set([0, 1, 2].map((c) => hair[c] * mix + bg[c] * (1 - mix)).concat(255), p * 4);
      matte[p] = a;
    }
  }
  applyCutoutMatte({ width: W, height: H, data }, matte, { feather: 0 });
  const strand = (10 * W + 20) * 4;
  assert.ok([0, 1, 2].every((c) => Math.abs(data[strand + c] - hair[c]) <= 12), `strand ${[...data.slice(strand, strand + 3)]}`);
  assert.ok(data[strand + 3] >= 80, 'strand keeps its opacity');
  const haze = (10 * W + 22) * 4;
  assert.ok(data[haze + 3] <= 8, `haze alpha ${data[haze + 3]}`);
});

test('matte pixels that are really old background fade out even at fairly high alpha', () => {
  const W = 41, H = 21;
  const bg = [120, 135, 150];
  const data = new Uint8ClampedArray(W * H * 4);
  const matte = new Uint8ClampedArray(W * H);
  for (let p = 0; p < W * H; p++) {
    const x = p % W;
    data.set([...bg, 255], p * 4);
    matte[p] = x === 20 ? 180 : 0; // AI marked a line of plain background as subject
  }
  applyCutoutMatte({ width: W, height: H, data }, matte, { feather: 0 });
  const i = (10 * W + 20) * 4;
  assert.ok(data[i + 3] <= 40, `alpha ${data[i + 3]}`);
});

test('a strand the matte made too opaque is thinned to what its colour shows', () => {
  const W = 61, H = 21;
  const bg = [120, 135, 150];
  const hair = [30, 25, 20];
  const data = new Uint8ClampedArray(W * H * 4);
  const matte = new Uint8ClampedArray(W * H);
  for (let p = 0; p < W * H; p++) {
    const x = p % W;
    let colour = bg, a = 0;
    if (x < 20) { colour = hair; a = 255; } // solid hair nearby
    else if (x === 30) { colour = [0, 1, 2].map((c) => hair[c] * 0.1 + bg[c] * 0.9); a = 160; } // faint strand, over-estimated
    else if (x === 36) { colour = [0, 1, 2].map((c) => hair[c] * 0.6 + bg[c] * 0.4); a = 160; } // real strand
    data.set([...colour, 255], p * 4);
    matte[p] = a;
  }
  applyCutoutMatte({ width: W, height: H, data }, matte, { feather: 0 });
  const faint = (10 * W + 30) * 4;
  const real = (10 * W + 36) * 4;
  assert.ok(data[faint + 3] <= 45, `faint strand alpha ${data[faint + 3]}`);
  assert.ok(data[real + 3] >= 130, `real strand alpha ${data[real + 3]}`);
  assert.ok(data[real] < 60, `real strand colour ${data[real]}`);
});

test('a light subject edge next to dark hair is not thinned by colour evidence', () => {
  const W = 61, H = 21;
  const bg = [120, 135, 150];
  const data = new Uint8ClampedArray(W * H * 4);
  const matte = new Uint8ClampedArray(W * H);
  for (let p = 0; p < W * H; p++) {
    const x = p % W;
    let colour = bg, a = 0;
    if (x < 20) { colour = [30, 25, 20]; a = 255; }
    else if (x === 24) { colour = [214, 170, 150]; a = 200; } // soft skin edge
    data.set([...colour, 255], p * 4);
    matte[p] = a;
  }
  applyCutoutMatte({ width: W, height: H, data }, matte, { feather: 0 });
  assert.ok(data[(10 * W + 24) * 4 + 3] >= 190, `skin edge alpha ${data[(10 * W + 24) * 4 + 3]}`);
});
