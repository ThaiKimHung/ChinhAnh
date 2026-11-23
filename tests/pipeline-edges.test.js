import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLiquifyStroke,
  applySkinBrushStroke,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BEAUTY,
  processImagePipeline,
} from '../src/engine/imagePipeline.js';

globalThis.ImageData ??= class ImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
};

function makeImage(width, height, rgbaAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(rgbaAt(x, y), (y * width + x) * 4);
    }
  }
  return new ImageData(data, width, height);
}

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(offset, offset + 4));
}

test('liquify keeps edge pixels when the source coordinate crosses the image boundary', () => {
  const image = makeImage(20, 20, (x) => [x === 0 ? 20 : 220, 80, 60, 255]);
  applyLiquifyStroke(image, null, 0, 8, 3, 8, 10, 0.6, 'push');
  assert.deepEqual(pixelAt(image, 0, 8), [20, 80, 60, 255]);
  assert.deepEqual(pixelAt(image, 19, 8), [220, 80, 60, 255]);
});

test('liquify moves alpha edges without mixing hidden RGB into visible pixels', () => {
  const image = makeImage(20, 20, (x) => x < 8 ? [210, 100, 40, 255] : [0, 240, 255, 0]);
  applyLiquifyStroke(image, null, 4, 8, 8, 8, 10, 0.3, 'push');
  assert.deepEqual(pixelAt(image, 8, 8), [210, 100, 40, 168]);
});

test('sharpen ignores hidden color and still enhances visible contrasts', () => {
  const image = makeImage(5, 5, (x, y) => {
    if (x === 2 && y === 2) return [120, 140, 160, 255];
    if (x === 3 && y === 2) return [100, 120, 140, 255];
    return [0, 230, 255, 0];
  });
  const result = processImagePipeline(image, { ...DEFAULT_ADJUSTMENTS, sharpen: 100 }, DEFAULT_BEAUTY);
  assert.deepEqual(pixelAt(result, 2, 2), [126, 146, 166, 255]);
  assert.deepEqual(pixelAt(result, 2, 1), [0, 230, 255, 0]);
});

test('healing still softens a dark blemish on a flat patch of skin', () => {
  const image = makeImage(40, 40, (x, y) => x === 20 && y === 20
    ? [98, 62, 48, 255]
    : [200, 144, 118, 255]);
  applySkinBrushStroke(image, null, 20, 20, 8, 1, 'heal');
  assert.deepEqual(pixelAt(image, 20, 20), [164, 115, 94, 255]);
  assert.deepEqual(pixelAt(image, 10, 20), [200, 144, 118, 255]);
});

test('healing protects the skin and hair colors on their respective sides of a sharp contour', () => {
  const image = makeImage(40, 40, (x) => x < 20 ? [25, 32, 39, 255] : [200, 144, 118, 255]);
  applySkinBrushStroke(image, null, 20, 20, 8, 1, 'heal');
  assert.deepEqual(pixelAt(image, 20, 20), [200, 144, 118, 255]);
  assert.deepEqual(pixelAt(image, 19, 20), [25, 32, 39, 255]);
});

test('healing a blemish near a transparent edge uses only the visible samples', () => {
  const image = makeImage(40, 40, (x, y) => {
    if (y < 20) return [20, 240, 255, 0];
    if (x === 20 && y === 20) return [98, 62, 48, 255];
    return [200, 144, 118, 255];
  });
  applySkinBrushStroke(image, null, 20, 20, 8, 1, 'heal');
  assert.deepEqual(pixelAt(image, 20, 20), [164, 115, 94, 255]);
  assert.deepEqual(pixelAt(image, 20, 19), [20, 240, 255, 0]);
});
