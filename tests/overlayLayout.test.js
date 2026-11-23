import assert from 'node:assert/strict';
import test from 'node:test';
import { fitOverlay } from '../src/engine/overlayLayout.js';

test('a tall sticker stays entirely inside the image and retains its aspect ratio', () => {
  const placement = fitOverlay(600, 600, 360, 1440, 95, 95);
  assert.equal(placement.height / placement.width, 4);
  assert.ok(placement.x >= 0 && placement.y >= 0);
  assert.ok(placement.x + placement.width <= 600);
  assert.ok(placement.y + placement.height <= 600);
});

test('an oversized caption fits while a smaller caption keeps its requested anchor', () => {
  const long = fitOverlay(500, 600, 1300, 100, 95, 95);
  assert.ok(long.width < 500);
  assert.ok(long.x + long.width <= 500);
  const short = fitOverlay(500, 600, 260, 30, 50, 90);
  assert.equal(short.scale, 1);
  assert.equal(short.x + short.width / 2, 250);
  assert.equal(short.y + short.height / 2, 540);
});
