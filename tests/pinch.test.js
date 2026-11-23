import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ZOOM, startPinch, updatePinch } from '../src/engine/pinch.js';

const imagePointUnder = (screen, zoom, pan) => ({ x: (screen.x - pan.x) / zoom, y: (screen.y - pan.y) / zoom });

test('spreading fingers zooms in around the midpoint', () => {
  const start = startPinch({ x: -50, y: 0 }, { x: 50, y: 0 }, 1, { x: 0, y: 0 });
  const { zoom, pan } = updatePinch(start, { x: -100, y: 0 }, { x: 100, y: 0 });
  assert.equal(zoom, 2);
  assert.deepEqual(pan, { x: 0, y: 0 });
});

test('the image point under the fingers stays under the fingers while moving', () => {
  const start = startPinch({ x: 10, y: 20 }, { x: 110, y: 60 }, 0.5, { x: 30, y: -15 });
  const before = imagePointUnder(start.mid, start.zoom, start.pan);
  const a = { x: 70, y: 90 };
  const b = { x: 250, y: 150 };
  const { zoom, pan } = updatePinch(start, a, b);
  const after = imagePointUnder({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom, pan);
  assert.ok(Math.abs(after.x - before.x) < 1e-9);
  assert.ok(Math.abs(after.y - before.y) < 1e-9);
});

test('two-finger drag without spreading only pans', () => {
  const start = startPinch({ x: 0, y: 0 }, { x: 100, y: 0 }, 1.5, { x: 5, y: 5 });
  const { zoom, pan } = updatePinch(start, { x: 20, y: 30 }, { x: 120, y: 30 });
  assert.equal(zoom, 1.5);
  assert.deepEqual(pan, { x: 25, y: 35 });
});

test('zoom is clamped', () => {
  const start = startPinch({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, { x: 0, y: 0 });
  assert.equal(updatePinch(start, { x: 0, y: 0 }, { x: 1000, y: 0 }).zoom, MAX_ZOOM);
  assert.equal(updatePinch(start, { x: 0, y: 0 }, { x: 0.1, y: 0 }).zoom, 0.15);
});
