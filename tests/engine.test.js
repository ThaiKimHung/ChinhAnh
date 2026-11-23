import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal ImageData polyfill for Node unit tests
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(dataOrWidth, widthOrHeight, maybeHeight) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = maybeHeight ?? dataOrWidth.length / (4 * widthOrHeight);
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  };
}

import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BEAUTY,
  processImagePipeline,
  applyLiquifyStroke,
  applySkinBrushStroke,
  applyAlphaMaskBrushStroke,
  featherAlphaMask,
  computeAutoEnhance,
} from '../src/engine/imagePipeline.js';
import { inpaintMaskedRegion, applyCloneStampStroke } from '../src/engine/inpaint.js';

function makeSolidImage(w, h, r, g, b, a = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return new ImageData(data, w, h);
}

test('processImagePipeline preserves pixels with default settings and preserves alpha=0', () => {
  const img = makeSolidImage(8, 8, 120, 80, 200, 255);
  img.data[0] = 50;
  img.data[3] = 0; // transparent pixel

  const out = processImagePipeline(img, DEFAULT_ADJUSTMENTS, DEFAULT_BEAUTY);
  assert.equal(out.data[3], 0);
  assert.equal(out.data[4], 120);
  assert.equal(out.data[5], 80);
  assert.equal(out.data[6], 200);
});

test('processImagePipeline exposure, fade, grain, and HSL adjust pixels', () => {
  const img = makeSolidImage(10, 10, 200, 40, 40, 255); // strong red
  const adj = {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 20,
    fade: 30,
    grain: 20,
    hsl: {
      ...DEFAULT_ADJUSTMENTS.hsl,
      red: [0, -50, 0],
    },
  };
  const out = processImagePipeline(img, adj, DEFAULT_BEAUTY);
  // Red channel should differ from original due to exposure + HSL desat + fade + grain
  assert.notEqual(out.data[4], 200);
  assert.equal(out.data[7], 255);
});

test('applyAlphaMaskBrushStroke keep & erase modify alpha mask locally', () => {
  const w = 20;
  const h = 20;
  const alpha = new Uint8ClampedArray(w * h).fill(100);

  applyAlphaMaskBrushStroke(alpha, w, h, 10, 10, 5, 1.0, 'keep');
  assert.equal(alpha[10 * w + 10], 255);
  assert.equal(alpha[0], 100); // untouched outside radius

  applyAlphaMaskBrushStroke(alpha, w, h, 10, 10, 5, 1.0, 'erase');
  assert.equal(alpha[10 * w + 10], 0);
});

test('featherAlphaMask softens sharp mask boundary', () => {
  const w = 16;
  const h = 16;
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 8; x < w; x++) alpha[y * w + x] = 255;
  }
  const soft = featherAlphaMask(alpha, w, h, 2);
  assert.ok(soft[8 * w + 7] > 0 && soft[8 * w + 7] < 255);
  assert.ok(soft[8 * w + 8] > 0 && soft[8 * w + 8] < 255);
});

test('computeAutoEnhance lifts dark image exposure', () => {
  const darkImg = makeSolidImage(16, 16, 40, 40, 40, 255);
  const auto = computeAutoEnhance(darkImg);
  assert.ok(auto.exposure > 0);
});

test('applyLiquifyStroke and applySkinBrushStroke run safely near boundaries', () => {
  const img = makeSolidImage(24, 24, 150, 120, 100, 255);
  const orig = makeSolidImage(24, 24, 150, 120, 100, 255);
  img.data[(12 * 24 + 12) * 4] = 250;

  applyLiquifyStroke(img, orig, 0, 0, 4, 4, 10, 0.7, 'push');
  applySkinBrushStroke(img, orig, 12, 12, 8, 0.8, 'heal');
  assert.equal(img.width, 24);
  assert.equal(img.height, 24);
});

test('inpaintMaskedRegion fills masked pixels and applyCloneStampStroke copies source region', () => {
  const w = 24;
  const h = 24;
  const img = makeSolidImage(w, h, 30, 140, 60, 255);
  // Corrupt center 4x4 block with bright white
  const mask = new Uint8Array(w * h);
  for (let y = 10; y < 14; y++) {
    for (let x = 10; x < 14; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      mask[y * w + x] = 1;
    }
  }

  const changed = inpaintMaskedRegion(img, mask);
  assert.equal(changed, true);
  // Center should now closely match surrounding green (30, 140, 60)
  const ci = (12 * w + 12) * 4;
  assert.ok(Math.abs(img.data[ci] - 30) < 10);
  assert.ok(Math.abs(img.data[ci + 1] - 140) < 10);

  // Clone stamp test
  const cloneImg = makeSolidImage(20, 20, 10, 20, 30, 255);
  cloneImg.data[(2 * 20 + 2) * 4] = 220;
  applyCloneStampStroke(cloneImg, 12, 12, -10, -10, 4, 1.0);
  assert.equal(cloneImg.data[(12 * 20 + 12) * 4], 220);
});

test('vibrance keeps near-black pixels neutral when earlier steps push channels below zero', () => {
  const img = new ImageData(new Uint8ClampedArray([40, 39, 39, 255]), 1, 1);
  const adj = {
    ...DEFAULT_ADJUSTMENTS,
    exposure: -15, contrast: 20, highlights: 30, shadows: -20, temperature: -25, tint: 15, saturation: -20, vibrance: 45,
  };
  const [r, g, b] = processImagePipeline(img, adj, DEFAULT_BEAUTY).data;
  // A dark grey must stay dark and nearly neutral; it used to become pure yellow (255, 255, 0).
  assert.ok(Math.max(r, g, b) < 80 && Math.max(r, g, b) - Math.min(r, g, b) < 40, `got ${r},${g},${b}`);
});
