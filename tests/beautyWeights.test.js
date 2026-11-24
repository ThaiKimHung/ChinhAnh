import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBeautyWeights,
  effectiveBeauty,
  faceOwnerAt,
  hasBeautyEffect,
  personLevels,
  sharedBeauty,
  withPersonLevels,
} from '../src/engine/beautyWeights.js';
import { SKIN_MASK_SCALE } from '../src/engine/skinMask.js';

// Two people side by side in a 400 × 200 photo.
const faces = [
  { x: 0.1, y: 0.2, w: 0.2, h: 0.3 },
  { x: 0.6, y: 0.2, w: 0.2, h: 0.3 },
];
const W = 400, H = 200;
const skin = (() => {
  const w = W / SKIN_MASK_SCALE, h = H / SKIN_MASK_SCALE;
  return { mask: new Uint8Array(w * h).fill(200), width: w, height: h };
})();
const cellAt = (weights, px, py) => {
  const l = (Math.floor(py / SKIN_MASK_SCALE) * weights.width + Math.floor(px / SKIN_MASK_SCALE)) * 4;
  return [...weights.data.subarray(l, l + 3)];
};

test('without per-person levels every channel is the skin mask', () => {
  const weights = buildBeautyWeights(skin, faces, { skinSmooth: 40, skinBrighten: 10, skinRosy: 0 }, W, H);
  assert.deepEqual(cellAt(weights, 80, 70), [200, 200, 200]);
  assert.deepEqual(cellAt(weights, 280, 70), [200, 200, 200]);
});

test('each person gets their own level; the pipeline runs with the highest', () => {
  let beauty = { skinSmooth: 40, skinBrighten: 20, skinRosy: 0 };
  beauty = withPersonLevels(beauty, 1, { skinSmooth: 80, skinBrighten: 0, skinRosy: 30 });
  assert.deepEqual(effectiveBeauty(beauty, faces), { skinSmooth: 80, skinBrighten: 20, skinRosy: 30 });
  assert.deepEqual(personLevels(beauty, 0), { skinSmooth: 40, skinBrighten: 20, skinRosy: 0 });
  assert.deepEqual(personLevels(beauty, 1), { skinSmooth: 80, skinBrighten: 0, skinRosy: 30 });

  const weights = buildBeautyWeights(skin, faces, beauty, W, H);
  const left = cellAt(weights, 80, 70); // person 0 (shared levels)
  const right = cellAt(weights, 280, 70); // person 1 (own levels)
  assert.deepEqual(left, [100, 200, 0]); // 40/80 smooth, full brighten, no rosy
  assert.deepEqual(right, [200, 0, 200]);
  // Per-person levels only count for faces that exist.
  assert.deepEqual(effectiveBeauty(withPersonLevels(beauty, 5, { skinSmooth: 100 }), faces).skinSmooth, 80);
});

test('ownership follows the face down to the body, and nobody owns the far corners', () => {
  assert.equal(faceOwnerAt(faces, W, H, 80, 70), 0);
  assert.equal(faceOwnerAt(faces, W, H, 280, 190), 1);
  assert.equal(faceOwnerAt(faces, W, H, 399, 0), -1);
});

test('helpers for clearing and copying', () => {
  const beauty = withPersonLevels({ skinSmooth: 0, skinBrighten: 0, skinRosy: 0 }, 0, { skinSmooth: 50, skinBrighten: 0, skinRosy: 0 });
  assert.ok(hasBeautyEffect(beauty));
  assert.equal(sharedBeauty(beauty).perFace, undefined);
  const cleared = withPersonLevels(beauty, 0, null);
  assert.equal(cleared.perFace, undefined);
  assert.ok(!hasBeautyEffect(cleared));
});

test('pasting a style onto another photo keeps that photo\'s per-person levels', async () => {
  const { applyStyleToSession } = await import('../src/engine/history.js');
  const own = { skinSmooth: 10, skinBrighten: 0, skinRosy: 0, perFace: { 1: { skinSmooth: 90, skinBrighten: 0, skinRosy: 0 } } };
  const session = { beauty: own, adjustments: {}, history: [{}], historyIdx: 0 };
  const next = applyStyleToSession(session, { beauty: { skinSmooth: 50, skinBrighten: 5, skinRosy: 0 } });
  assert.equal(next.beauty.skinSmooth, 50);
  assert.deepEqual(next.beauty.perFace, own.perFace);
});
