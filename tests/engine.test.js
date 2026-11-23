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

test('healing across a dark crease does not copy the crease beside itself', () => {
  const W = 40, H = 40;
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const crease = Math.abs(x - 20) <= 1;
      img.data.set(crease ? [90, 55, 45, 255] : [214, 170, 150, 255], i);
    }
  }
  const orig = new ImageData(new Uint8ClampedArray(img.data), W, H);
  for (let x = 10; x <= 30; x += 2) applySkinBrushStroke(img, orig, x, 20, 8, 1, 'heal');
  let worstSkin = 0;
  for (let y = 14; y <= 26; y++) {
    for (const x of [12, 14, 15, 16, 24, 25, 26, 28]) {
      const i = (y * W + x) * 4;
      worstSkin = Math.max(worstSkin, 214 - img.data[i]);
    }
  }
  assert.ok(worstSkin <= 12, `skin beside the crease darkened by ${worstSkin}`);
  assert.ok(img.data[(20 * W + 20) * 4] < 160, 'the crease itself is kept');
});

test('maximum skin smoothing keeps fine pore texture instead of a waxy flat surface', () => {
  const W = 360, H = 360;
  const img = new ImageData(W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // A face-sized patch of textured skin in the middle of a grey backdrop.
  for (let p = 0; p < W * H; p++) {
    const n = (rnd() - 0.5) * 24;
    const x = p % W, y = Math.floor(p / W);
    const face = (x - 180) ** 2 / 150 ** 2 + (y - 170) ** 2 / 165 ** 2 < 1;
    img.data.set(face ? [214 + n, 170 + n, 150 + n, 255] : [110 + n, 118 + n, 128 + n, 255], p * 4);
  }
  const out = processImagePipeline(img, DEFAULT_ADJUSTMENTS, { skinSmooth: 100, skinBrighten: 0, skinRosy: 0 });
  const std = (d) => {
    let s = 0, s2 = 0, n = 0;
    for (let y = 110; y < 230; y++) {
      for (let x = 120; x < 240; x++) {
        const v = d[(y * W + x) * 4 + 1];
        s += v;
        s2 += v * v;
        n++;
      }
    }
    return Math.sqrt(s2 / n - (s / n) ** 2);
  };
  const kept = std(out.data) / std(img.data);
  assert.ok(kept >= 0.5 && kept <= 0.8, `texture kept ${kept.toFixed(2)}`);
});

test('brightening rolls highlights off smoothly instead of clipping skin to pure red', () => {
  const skin = [205, 146, 128, 255];
  const img = new ImageData(new Uint8ClampedArray([...skin, 120, 120, 120, 255, 250, 250, 250, 255]), 3, 1);
  const adj = { ...DEFAULT_ADJUSTMENTS, exposure: 25, temperature: 28, vibrance: 20 };
  const out = processImagePipeline(img, adj, DEFAULT_BEAUTY).data;
  assert.ok(out[0] < 252, `red ${out[0]} still has headroom`);
  assert.ok(out[0] > out[1] && out[1] > out[2], 'skin keeps its warm order');
  // Unchanged settings leave pixels untouched, including bright ones.
  const same = processImagePipeline(img, DEFAULT_ADJUSTMENTS, DEFAULT_BEAUTY).data;
  assert.deepEqual([...same], [...img.data]);
});

test('film grain is random-looking, not diagonal stripes', () => {
  const W = 128, H = 128;
  const img = new ImageData(W, H);
  for (let p = 0; p < W * H; p++) img.data.set([128, 128, 128, 255], p * 4);
  const out = processImagePipeline(img, { ...DEFAULT_ADJUSTMENTS, grain: 100 }, DEFAULT_BEAUTY).data;
  const v = (x, y) => out[(y * W + x) * 4] - 128;
  const corr = (dx, dy) => {
    let s = 0, a = 0, b = 0;
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        s += v(x, y) * v(x + dx, y + dy);
        a += v(x, y) ** 2;
        b += v(x + dx, y + dy) ** 2;
      }
    }
    return s / Math.sqrt(a * b);
  };
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1], [2, 1], [1, 2]]) {
    assert.ok(Math.abs(corr(dx, dy)) < 0.1, `correlation at (${dx},${dy}) = ${corr(dx, dy).toFixed(2)}`);
  }
});

test('the "keep" mask brush restores strands but not plain old background', () => {
  const W = 60, H = 40;
  const img = new ImageData(W, H);
  const alpha = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const hair = x < 15 || x === 32; // solid hair on the left, one lost strand at x = 32
      img.data.set(hair ? [30, 25, 20, 255] : [120, 135, 150, 255], p * 4);
      alpha[p] = x < 15 ? 255 : 0;
    }
  }
  for (let y = 5; y < 35; y += 3) applyAlphaMaskBrushStroke(alpha, W, H, 32, y, 8, 1, 'keep', img);
  assert.ok(alpha[20 * W + 32] > 200, `strand alpha ${alpha[20 * W + 32]}`);
  assert.ok(alpha[20 * W + 36] < 20, `background alpha ${alpha[20 * W + 36]}`);
});

function sceneImage(map) {
  const W = 160, H = 120;
  const img = new ImageData(W, H);
  let s = 5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const u = (x / W) * 0.6 + (y / H) * 0.3 + (s % 100) / 1000; // 0..1, photo-like spread
      const v = 25 + u * 200;
      img.data.set(map([v * 1.05, v, v * 0.92]).concat(255), (y * W + x) * 4);
    }
  }
  return img;
}

function lumaStats(img) {
  const l = [];
  for (let i = 0; i < img.data.length; i += 4) l.push(0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]);
  l.sort((a, b) => a - b);
  const crushed = l.filter((v) => v <= 3).length / l.length;
  const clipped = l.filter((v) => v >= 252).length / l.length;
  return { median: l[l.length >> 1], crushed, clipped };
}

test('auto enhance brings an underexposed photo to a normal brightness without crushing shadows', () => {
  const dark = sceneImage((c) => c.map((v) => v * 0.35));
  const out = processImagePipeline(dark, computeAutoEnhance(dark), DEFAULT_BEAUTY);
  const st = lumaStats(out);
  assert.ok(st.median >= 95 && st.median <= 140, `median ${st.median}`);
  assert.ok(st.crushed < 0.03, `crushed ${st.crushed}`);
});

test('auto enhance tames an overexposed photo without clipping', () => {
  const bright = sceneImage((c) => c.map((v) => Math.min(255, v * 1.4 + 35)));
  const out = processImagePipeline(bright, computeAutoEnhance(bright), DEFAULT_BEAUTY);
  const st = lumaStats(out);
  assert.ok(st.median >= 100 && st.median <= 160, `median ${st.median}`);
  assert.ok(st.clipped < 0.03, `clipped ${st.clipped}`);
});

test('auto enhance leaves a well exposed photo nearly as it is', () => {
  const ok = sceneImage((c) => c);
  const auto = computeAutoEnhance(ok);
  assert.ok(Math.abs(auto.exposure) <= 12, `exposure ${auto.exposure}`);
  const st = lumaStats(processImagePipeline(ok, auto, DEFAULT_BEAUTY));
  assert.ok(st.crushed < 0.02 && st.clipped < 0.02, JSON.stringify(st));
});

test('the smoothing brush keeps pore texture and scrubbing does not keep flattening the skin', () => {
  const W = 120, H = 80;
  const make = () => {
    const img = new ImageData(W, H);
    let s = 21;
    for (let p = 0; p < W * H; p++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s % 25) - 12;
      img.data.set([206 + n, 150 + n, 132 + n, 255], p * 4);
    }
    return img;
  };
  const spread = (img) => {
    let a = 0, b = 0, n = 0;
    for (let y = 30; y < 50; y++) {
      for (let x = 45; x < 75; x++) {
        const v = img.data[(y * W + x) * 4 + 1];
        a += v;
        b += v * v;
        n++;
      }
    }
    return Math.sqrt(b / n - (a / n) ** 2);
  };
  const orig = make();
  const before = spread(orig);
  const once = make();
  const base = make();
  for (let x = 30; x <= 90; x += 4) applySkinBrushStroke(once, orig, x, 40, 20, 1, 'smooth', base);
  const scrubbed = make();
  for (let k = 0; k < 8; k++) for (let x = 30; x <= 90; x += 4) applySkinBrushStroke(scrubbed, orig, x, 40, 20, 1, 'smooth', base);
  assert.ok(spread(once) >= before * 0.4, `one pass keeps ${(spread(once) / before).toFixed(2)}`);
  assert.ok(spread(scrubbed) >= spread(once) * 0.85, `scrubbing ${spread(scrubbed).toFixed(1)} vs ${spread(once).toFixed(1)}`);
});
