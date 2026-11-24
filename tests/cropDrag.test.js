import assert from 'node:assert/strict';
import test from 'node:test';
import { cropPercentRatio, dragCropRect } from '../src/engine/cropDrag.js';

const box = { x: 10, y: 10, w: 50, h: 50 };

test('moving keeps the size and stays inside the photo', () => {
  assert.deepEqual(dragCropRect(box, 'move', 100, -100), { x: 50, y: 0, w: 50, h: 50 });
});

test('free resize from the top-left keeps the bottom-right corner and a minimum size', () => {
  const r = dragCropRect(box, 'nw', 70, 5);
  assert.equal(r.x + r.w, 60);
  assert.equal(r.y + r.h, 60);
  assert.equal(r.w, 8);
  assert.equal(r.y, 15);
});

test('aspect-locked resize keeps the ratio and the opposite corner', () => {
  const ratio = cropPercentRatio('3:4', 1200, 1600); // same shape as the photo
  assert.equal(ratio, 1);
  const r = dragCropRect(box, 'se', 20, 0, ratio);
  assert.deepEqual([r.x, r.y], [10, 10]);
  assert.equal(r.w, 70);
  assert.equal(r.h, 70);
  // Clamped by the bottom edge rather than spilling outside.
  const big = dragCropRect(box, 'se', 80, 0, 2);
  assert.ok(big.y + big.h <= 100 + 1e-9 && big.x + big.w <= 100 + 1e-9);
  assert.ok(Math.abs(big.h / big.w - 2) < 1e-9);
  assert.equal(cropPercentRatio('free', 100, 100), null);
});
