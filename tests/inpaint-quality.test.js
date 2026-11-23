import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCloneStampStroke, inpaintMaskedRegion } from '../src/engine/inpaint.js';

function makeFixture(width, height, color, includes) {
  const truth = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      truth.set(color(x, y), p * 4);
      mask[p] = Number(includes(x, y));
    }
  }
  const data = truth.slice();
  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) data.set([235, 85, 152, 255], p * 4);
  }
  return { image: { width, height, data }, truth, mask };
}

function measure(fixture) {
  const { image, mask, truth } = fixture;
  let count = 0;
  let exact = 0;
  let absoluteError = 0;
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    if (!mask[p]) {
      assert.deepEqual(image.data.subarray(i, i + 4), truth.subarray(i, i + 4));
      continue;
    }
    count++;
    let error = 0;
    for (let c = 0; c < 3; c++) error += Math.abs(image.data[i + c] - truth[i + c]);
    if (error === 0) exact++;
    absoluteError += error;
    assert.equal(image.data[i + 3], truth[i + 3]);
  }
  return { exact: exact / count, meanError: absoluteError / (count * 3) };
}

test('object removal declines a mask without visible source pixels and leaves the image intact', () => {
  const fixture = makeFixture(24, 24, () => [31, 73, 121, 255], () => true);
  const before = fixture.image.data.slice();
  assert.equal(inpaintMaskedRegion(fixture.image, fixture.mask), false);
  assert.deepEqual(fixture.image.data, before);
  fixture.mask[0] = 0;
  fixture.image.data[3] = 0;
  before[3] = 0;
  assert.equal(inpaintMaskedRegion(fixture.image, fixture.mask), false);
  assert.deepEqual(fixture.image.data, before);
});

test('object removal reconstructs a smooth gradient at the image edge without a seam', () => {
  const fixture = makeFixture(
    96, 80,
    (x, y) => [60 + x, 30 + y, 20 + x + y, 255],
    (x, y) => (x - 92) ** 2 + (y - 40) ** 2 <= 20 ** 2,
  );
  assert.equal(inpaintMaskedRegion(fixture.image, fixture.mask), true);
  assert.ok(measure(fixture).meanError <= 1);
});

test('object removal keeps the alignment of repeated texture across a broad mask', () => {
  const fixture = makeFixture(
    192, 192,
    (x, y) => (Math.floor(x / 8) + Math.floor(y / 8)) % 2
      ? [230, 195, 130, 255]
      : [35, 60, 90, 255],
    (x, y) => (x - 96) ** 2 + (y - 96) ** 2 <= 60 ** 2,
  );
  assert.equal(inpaintMaskedRegion(fixture.image, fixture.mask), true);
  assert.ok(measure(fixture).exact >= 0.95);
});

test('object removal keeps a strong diagonal crossing the rim of the selection', () => {
  const fixture = makeFixture(
    128, 108,
    (x, y) => y * 2 < x + 50 ? [227, 232, 242, 255] : [42, 52, 70, 255],
    (x, y) => (x - 118) ** 2 + (y - 82) ** 2 <= 19 ** 2,
  );
  assert.equal(inpaintMaskedRegion(fixture.image, fixture.mask), true);
  assert.ok(measure(fixture).exact >= 0.9);
});

test('object removal favors observed structure on an irregular striped background', () => {
  const fixture = makeFixture(
    160, 120,
    (x, y) => Math.floor((x + 0.018 * y * y) / 11) % 2
      ? [190 + x / 4, 118 + y / 3, 105, 255]
      : [75, 91, 68, 255],
    (x, y) => (x - 82) ** 2 + (y - 63) ** 2 <= 35 ** 2,
  );
  assert.equal(inpaintMaskedRegion(fixture.image, fixture.mask), true);
  assert.ok(measure(fixture).meanError <= 20);
});

test('clone stamp blends sampled transparency without spreading invisible RGB', () => {
  const { image } = makeFixture(24, 24, (x) => x < 8 ? [250, 250, 250, 0] : [60, 120, 180, 255], () => false);
  applyCloneStampStroke(image, 14, 12, -10, 0, 4, 0.5);
  const center = (12 * image.width + 14) * 4;
  assert.deepEqual([...image.data.subarray(center, center + 4)], [60, 120, 180, 128]);
});

test('mask dilation grows the brush mask by the requested radius only', async () => {
  const { dilateMask } = await import('../src/engine/inpaint.js');
  const mask = new Uint8Array(15 * 15);
  mask[7 * 15 + 7] = 1;
  const grown = dilateMask(mask, 15, 15, 2);
  assert.equal(grown[7 * 15 + 9], 1);
  assert.equal(grown[9 * 15 + 7], 1);
  assert.equal(grown[7 * 15 + 10], 0);
  assert.equal(grown[9 * 15 + 9], 0);
  assert.equal(mask[7 * 15 + 9], 0, 'input is not modified');
});

test('clone stamp with tone matching adopts the brightness around the destination', () => {
  const make = () => makeFixture(80, 40, (x) => (x < 40 ? [200, 200, 200, 255] : [150, 150, 150, 255]), () => false).image;
  const centre = (img) => img.data[(20 * 80 + 60) * 4];
  const plain = make();
  applyCloneStampStroke(plain, 60, 20, -40, 0, 8, 1);
  assert.ok(centre(plain) > 190, 'without tone matching the source brightness is copied');
  const matched = make();
  applyCloneStampStroke(matched, 60, 20, -40, 0, 8, 1, true);
  assert.ok(Math.abs(centre(matched) - 150) <= 6, `tone-matched centre is ${centre(matched)}`);
});
