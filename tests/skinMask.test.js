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

function paint(w, h, colourAt) {
  const data = new Uint8ClampedArray(w * h * 4);
  let s = 7;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s % 9) - 4;
      const c = colourAt(x, y);
      data.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

test('dark photos still get a skin mask', () => {
  const dark = (c) => c.map((v) => v * 0.33);
  const img = paint(120, 160, (x, y) => ((x - 60) ** 2 / 30 ** 2 + (y - 60) ** 2 / 40 ** 2 < 1 ? dark(SKIN) : dark([90, 100, 115])));
  const skin = computeSkinMask(img);
  assert.ok(sampleSkinMask(skin, 60, 60) > 0.6, `face ${sampleSkinMask(skin, 60, 60)}`);
});

test('a face is preferred over a larger beige top lower in the picture', () => {
  const face = [110, 75, 60]; // deeper skin tone
  const top = [150, 120, 95]; // beige top, similar hue but less red
  const img = paint(120, 160, (x, y) => {
    if ((x - 60) ** 2 / 22 ** 2 + (y - 50) ** 2 / 30 ** 2 < 1) return face;
    if (y > 95) return top;
    return [70, 75, 85];
  });
  const skin = computeSkinMask(img);
  assert.ok(sampleSkinMask(skin, 60, 50) > 0.6, `face ${sampleSkinMask(skin, 60, 50)}`);
  assert.ok(sampleSkinMask(skin, 60, 135) < 0.3, `top ${sampleSkinMask(skin, 60, 135)}`);
});

test('a photo that is skin-coloured all over (wood, sand) is not treated as skin', () => {
  const img = paint(120, 160, (x, y) => [196 + ((x * 7 + y * 3) % 20), 150 + ((x * 5) % 16), 120]);
  const skin = computeSkinMask(img);
  assert.ok(sampleSkinMask(skin, 60, 80) < 0.15, `wood ${sampleSkinMask(skin, 60, 80)}`);
});

test('overexposed (washed-out) photos still get a skin mask', () => {
  const wash = (c) => c.map((v) => v * 0.65 + 0.35 * 255);
  const img = paint(120, 160, (x, y) => {
    if ((x - 60) ** 2 / 30 ** 2 + (y - 60) ** 2 / 40 ** 2 < 1) return wash(SKIN);
    if (x < 8) return wash([20, 20, 25]); // some dark detail (hair) lifted by the wash
    return wash([90, 100, 115]);
  });
  const skin = computeSkinMask(img);
  assert.ok(sampleSkinMask(skin, 60, 60) > 0.6, `face ${sampleSkinMask(skin, 60, 60)}`);
  assert.ok(sampleSkinMask(skin, 100, 140) < 0.15, `backdrop ${sampleSkinMask(skin, 100, 140)}`);
});
