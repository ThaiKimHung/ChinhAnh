import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRect, pastePatch } from '../src/engine/patch.js';

function image(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(color(x, y), (y * width + x) * 4);
  return { width, height, data };
}
const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

test('selection rectangles are normalised, clamped and rejected when tiny', () => {
  assert.deepEqual(normalizeRect({ x: 30, y: 20, w: -10, h: -5 }, 100, 100), { x: 20, y: 15, w: 10, h: 5 });
  assert.deepEqual(normalizeRect({ x: -5, y: 90, w: 20, h: 30 }, 100, 100), { x: 0, y: 90, w: 15, h: 10 });
  assert.equal(normalizeRect({ x: 10, y: 10, w: 2, h: 40 }, 100, 100), null);
});

test('a hard-edged paste copies the source exactly', () => {
  const img = image(60, 30, (x) => (x < 30 ? [200, 50, 50, 255] : [20, 40, 60, 255]));
  assert.equal(pastePatch(img, { x: 2, y: 5, w: 20, h: 20 }, 34, 0, { feather: 0, toneMatch: false }), true);
  assert.deepEqual(px(img, 40, 15), [200, 50, 50, 255]);
  assert.deepEqual(px(img, 36, 5), [200, 50, 50, 255]);
  assert.deepEqual(px(img, 35, 15), [20, 40, 60, 255], 'outside the pasted area is untouched');
});

test('feathering blends the edge but keeps the centre fully pasted', () => {
  const img = image(60, 30, (x) => (x < 30 ? [200, 200, 200, 255] : [0, 0, 0, 255]));
  pastePatch(img, { x: 2, y: 2, w: 24, h: 24 }, 32, 0, { feather: 6, toneMatch: false });
  assert.deepEqual(px(img, 46, 14), [200, 200, 200, 255]);
  const edge = px(img, 34, 14)[0];
  assert.ok(edge > 0 && edge < 120, `edge ${edge}`);
});

test('tone matching adopts the brightness around the destination while keeping texture', () => {
  // Source: bright with a 1-px dark line; destination: a darker plain area.
  const img = image(80, 40, (x, y) => (x < 40 ? (y === 20 ? [120, 120, 120, 255] : [210, 210, 210, 255]) : [150, 150, 150, 255]));
  pastePatch(img, { x: 4, y: 4, w: 32, h: 32 }, 40, 0, { feather: 0, toneMatch: true });
  assert.ok(Math.abs(px(img, 60, 10)[0] - 150) <= 2, `plain area ${px(img, 60, 10)[0]}`);
  assert.ok(px(img, 60, 20)[0] < px(img, 60, 19)[0] - 60, 'the copied line is still visible');
});

test('flip mirrors the copy and pasting partly outside the image is safe', () => {
  const img = image(40, 10, (x) => [x * 5, 0, 0, 255]);
  pastePatch(img, { x: 0, y: 0, w: 10, h: 10 }, 20, 0, { feather: 0, toneMatch: false, flip: true });
  assert.equal(px(img, 20, 5)[0], 45);
  assert.equal(px(img, 29, 5)[0], 0);
  assert.doesNotThrow(() => pastePatch(img, { x: 0, y: 0, w: 10, h: 10 }, 35, 5, { feather: 3 }));
});

test('tone matching ignores an object that pokes through the edge of the target', () => {
  // Plain grey destination with a green "leaf" crossing the left edge of the target.
  const img = image(90, 40, (x, y) => {
    if (x < 40) return [200, 200, 200, 255];
    if (x >= 48 && x <= 54 && y >= 8 && y <= 30) return [40, 120, 40, 255];
    return [150, 150, 150, 255];
  });
  pastePatch(img, { x: 4, y: 4, w: 32, h: 32 }, 48, 0, { feather: 0, toneMatch: true });
  const centre = px(img, 68, 20);
  assert.ok(Math.abs(centre[0] - 150) <= 4 && Math.abs(centre[1] - 150) <= 4, `centre ${centre}`);
});
