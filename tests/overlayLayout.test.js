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

test('a long caption wraps into balanced lines instead of shrinking on one line', async () => {
  const { wrapCaption } = await import('../src/engine/overlayLayout.js');
  const measure = (t) => t.length * 10;
  const text = 'Studio Ánh Hồng — Chụp ảnh cưới, ảnh thẻ, ảnh gia đình — 0909 123 456';
  const lines = wrapCaption(text, measure, 400);
  assert.ok(lines.length >= 2 && lines.length <= 3, JSON.stringify(lines));
  assert.equal(lines.join(' '), text);
  assert.ok(lines.every((l) => measure(l) <= 400));
  const widths = lines.map(measure);
  assert.ok(Math.max(...widths) - Math.min(...widths) <= 200, 'lines are roughly balanced');
  assert.deepEqual(wrapCaption('Ngắn', measure, 400), ['Ngắn']);
  // Far too long for three lines: still at most three lines (the renderer scales them).
  assert.equal(wrapCaption('a '.repeat(200).trim(), measure, 100).length, 3);
});
