import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSkinMask, sampleSkinMask } from '../src/engine/skinMask.js';

// Colours measured on the sample portrait: skin, a warm bokeh blob, a cream shirt.
const SKIN = [205, 146, 128];
const BOKEH = [180, 158, 150]; // Cb ≈ 120, Cr ≈ 140
const SHIRT = [222, 205, 185];

function scene() {
  const w = 120, h = 90;
  const data = new Uint8ClampedArray(w * h * 4);
  let s = 11;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s % 13) - 6; // fabric/skin texture noise
      const base = x < 40 ? BOKEH : x < 80 ? SKIN : SHIRT;
      data.set([base[0] + n, base[1] + n, base[2] + n, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

test('skin is selected while a warm backdrop and a cream shirt are not', () => {
  const skin = computeSkinMask(scene());
  assert.ok(sampleSkinMask(skin, 60, 45) > 0.8, `skin ${sampleSkinMask(skin, 60, 45)}`);
  assert.ok(sampleSkinMask(skin, 15, 45) < 0.15, `bokeh ${sampleSkinMask(skin, 15, 45)}`);
  assert.ok(sampleSkinMask(skin, 105, 45) < 0.05, `shirt ${sampleSkinMask(skin, 105, 45)}`);
});

test('the mask is smooth: textured areas do not flicker on and off', () => {
  const skin = computeSkinMask(scene());
  let lo = 1, hi = 0;
  for (let y = 20; y < 70; y++) {
    for (let x = 90; x < 115; x++) {
      const v = sampleSkinMask(skin, x, y);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  assert.ok(hi - lo < 0.05, `shirt mask range ${lo}..${hi}`);
});
