import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceBrushStroke, createBrushStroke, finishBrushStroke } from '../src/engine/brushStroke.js';

function paint(points) {
  const dabbed = [];
  const stroke = createBrushStroke(0, 0, 10);
  for (const [x, y] of points) {
    advanceBrushStroke(stroke, x, y, (fromX, fromY, toX, toY) => {
      dabbed.push([fromX, fromY, Math.round(toX * 1e6) / 1e6, Math.round(toY * 1e6) / 1e6]);
    });
  }
  return dabbed;
}

test('long pointer moves produce the same connected dabs as short moves', () => {
  const sparse = paint([[14, 0]]);
  assert.deepEqual(sparse, paint([[1, 0], [4, 0], [9, 0], [14, 0]]));
  assert.deepEqual(sparse, [[0, 0, 4, 0], [4, 0, 8, 0], [8, 0, 12, 0]]);
});

test('a stroke accumulates short moves through a corner and ignores repeats', () => {
  assert.deepEqual(paint([[2, 0], [2, 0], [2, 6]]), [[0, 0, 2, 2], [2, 2, 2, 6]]);
});

test('a push stroke can apply motion shorter than the regular spacing at release', () => {
  const stroke = createBrushStroke(7, 9, 20);
  const dabs = [];
  const stamp = (...dab) => dabs.push(dab);
  advanceBrushStroke(stroke, 9, 9, stamp);
  assert.deepEqual(dabs, []);
  finishBrushStroke(stroke, stamp);
  assert.deepEqual(dabs, [[7, 9, 9, 9]]);
});
