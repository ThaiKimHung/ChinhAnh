import assert from 'node:assert/strict';
import test from 'node:test';
import { biggestFace, eyeEnlargeDabs, faceSlimDabs, idCropFromFace, mergeFaces, normalizeDetections, readingOrder, tileRects } from '../src/engine/faces.js';

const face = {
  x: 0.35, y: 0.25, w: 0.3, h: 0.3, score: 0.95,
  rightEye: { x: 0.44, y: 0.35 }, leftEye: { x: 0.56, y: 0.35 }, nose: { x: 0.5, y: 0.42 }, mouth: { x: 0.5, y: 0.48 },
};

test('detections are normalised, also from a tile of the photo', () => {
  const result = {
    detections: [
      { boundingBox: { originX: 100, originY: 50, width: 80, height: 90 }, keypoints: [{ x: 0.3, y: 0.2 }, { x: 0.4, y: 0.2 }], categories: [{ score: 0.9 }] },
    ],
  };
  const [whole] = normalizeDetections(result, 400, 300);
  assert.deepEqual([whole.x, whole.y, whole.w, whole.h], [0.25, 50 / 300, 0.2, 0.3]);
  assert.deepEqual(whole.rightEye, { x: 0.3, y: 0.2 });
  assert.equal(whole.mouth, null);
  // The same input showing a 800 × 600 tile at (1000, 600) of a 2000 × 1200 photo (scaled by 2).
  const [tiled] = normalizeDetections(result, 400, 300, { x: 1000, y: 600, w: 800, h: 600 }, 2000, 1200);
  assert.deepEqual([tiled.x, tiled.y, tiled.w, tiled.h], [0.6, 0.5 + 100 / 1200, 0.08, 0.15]);
  assert.deepEqual(tiled.rightEye, { x: (1000 + 0.3 * 800) / 2000, y: (600 + 0.2 * 600) / 1200 });
});

test('tiles cover a large photo with overlap; small photos need none', () => {
  assert.deepEqual(tileRects(700, 500), []);
  const rects = tileRects(2400, 1200);
  assert.ok(rects.length > 1);
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 2400 && r.y + r.h <= 1200);
  // Every point is inside some tile.
  for (const [x, y] of [[0, 0], [2399, 1199], [1200, 600], [1799, 10]]) {
    assert.ok(rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), `${x},${y}`);
  }
});

test('duplicate detections are merged and people are numbered left to right', () => {
  const box = (x, y, w, h, score) => ({ x, y, w, h, score });
  const merged = mergeFaces([
    box(0.6, 0.2, 0.1, 0.1, 0.9),
    box(0.61, 0.21, 0.1, 0.1, 0.7), // same face from another pass
    box(0.6, 0.2, 0.04, 0.1, 0.6), // partial box from a tile edge
    box(0.1, 0.19, 0.12, 0.12, 0.8),
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].x, 0.1);
  assert.equal(merged[1].score, 0.9);
  assert.equal(biggestFace(merged), 0);
  assert.equal(biggestFace([]), -1);
});

test('people in two rows are numbered row by row', () => {
  const at = (x, y) => ({ x, y, w: 0.08, h: 0.1, score: 0.9 });
  // Back row slightly uneven, front row lower.
  const order = readingOrder([at(0.5, 0.55), at(0.1, 0.22), at(0.2, 0.55), at(0.4, 0.2), at(0.7, 0.24)]);
  assert.deepEqual(order.map((f) => [f.x, f.y]), [[0.1, 0.22], [0.4, 0.2], [0.7, 0.24], [0.2, 0.55], [0.5, 0.55]]);
});

test('eye enlarging places bloat dabs on both eyes, more for a stronger setting', () => {
  const light = eyeEnlargeDabs(face, 1000, 1000, 0.1);
  const strong = eyeEnlargeDabs(face, 1000, 1000, 1);
  assert.ok(strong.length > light.length);
  assert.ok(light.every((d) => d.mode === 'bloat'));
  const xs = new Set(light.map((d) => Math.round(d.x1)));
  assert.deepEqual([...xs].sort(), [440, 560]);
});

test('face slimming pushes both sides of the lower face toward the middle', () => {
  const dabs = faceSlimDabs(face, 1000, 1000, 0.5);
  const centre = 500;
  for (const d of dabs) {
    assert.equal(d.mode, 'push');
    assert.ok(Math.abs(d.x1 - centre) < Math.abs(d.x0 - centre), 'moves inward');
    assert.ok(d.y0 > 250 + 300 * 0.5, 'below the eyes');
  }
  assert.ok(dabs.some((d) => d.x0 < centre) && dabs.some((d) => d.x0 > centre));
});

test('ID crop frames the head at about 70% of the photo height with room above', () => {
  const crop = idCropFromFace(1000, 1400, 0.75, face);
  const headTop = 0.25 * 1400 - 0.3 * 1400 * 0.45;
  const headH = 0.3 * 1400 * 1.45;
  assert.ok(Math.abs(headH / crop.h - 0.7) < 0.02, `head share ${headH / crop.h}`);
  assert.ok(crop.y < headTop && headTop - crop.y < crop.h * 0.15, 'small margin above the hair');
  assert.ok(Math.abs(crop.w / crop.h - 0.75) < 0.01);
  assert.ok(Math.abs(crop.x + crop.w / 2 - 500) <= 1, 'centred on the face');
  // A face filling the whole photo cannot be framed like that.
  assert.equal(idCropFromFace(1000, 1000, 0.75, { ...face, y: 0, h: 0.95, w: 0.9, x: 0.05 }), null);
});
