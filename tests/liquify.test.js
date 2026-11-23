import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCutoutMatte } from '../src/engine/cutout.js';
import { createLiquifySession, liquifyDab } from '../src/engine/liquify.js';

// Photo-like texture: random values softened by a 3×3 average.
function noiseImage(w, h, seed = 3) {
  const v = new Float32Array(w * h);
  let s = seed;
  for (let p = 0; p < w * h; p++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    v[p] = 40 + (s % 170);
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let t = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) t += v[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
      }
      data.set([t / 9, t / 9, t / 9, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

function detail(img, x0, y0, x1, y1) {
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      sum += Math.abs(4 * img.data[i] - img.data[i - 4] - img.data[i + 4] - img.data[i - img.width * 4] - img.data[i + img.width * 4]);
      n++;
    }
  }
  return sum / n;
}

test('pushing back and forth over the same spot does not accumulate blur', () => {
  const img = noiseImage(120, 120);
  const before = detail(img, 40, 40, 80, 80);
  const session = createLiquifySession(img);
  for (let k = 0; k < 20; k++) {
    liquifyDab(session, img, 54, 60, 60, 60, 30, 0.7, 'push'); // drag right
    liquifyDab(session, img, 66, 60, 60, 60, 30, 0.7, 'push'); // and back
  }
  // Warping the warped pixels again each time would lose most of the detail.
  assert.ok(detail(img, 40, 40, 80, 80) >= before * 0.85, `detail ${detail(img, 40, 40, 80, 80)} vs ${before}`);
});

test('repeated bloat saturates instead of collapsing into a flat disc', () => {
  const img = noiseImage(120, 120);
  const session = createLiquifySession(img);
  for (let k = 0; k < 30; k++) liquifyDab(session, img, 60, 60, 60, 60, 35, 1, 'bloat');
  // The centre is magnified but still has texture (a collapsed warp is flat).
  assert.ok(detail(img, 50, 50, 70, 70) > 4, `centre detail ${detail(img, 50, 50, 70, 70)}`);
  let maxShift = 0;
  for (let p = 0; p < session.fx.length; p++) maxShift = Math.max(maxShift, Math.hypot(session.fx[p], session.fy[p]));
  assert.ok(maxShift < 35, `max displacement ${maxShift}`);
});

test('a push moves content in the stroke direction', () => {
  const w = 80, h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(x < 40 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * w + x) * 4);
  const img = { width: w, height: h, data };
  const session = createLiquifySession(img);
  liquifyDab(session, img, 40, 20, 50, 20, 20, 1, 'push');
  // Dark content was pushed right past the original edge.
  assert.ok(img.data[(20 * w + 43) * 4] < 128);
});

test('a push after cutting out a subject moves its edge without showing the old background', () => {
  const width = 96, height = 64;
  for (const fromX of [36, 60]) {
    const data = new Uint8ClampedArray(width * height * 4);
    const matte = new Uint8ClampedArray(width * height);
    for (let p = 0; p < matte.length; p++) {
      const subject = p % width < 48;
      data.set(subject ? [230, 35, 35, 255] : [25, 190, 210, 255], p * 4);
      matte[p] = subject ? 255 : 0;
    }
    const img = { width, height, data };
    const session = createLiquifySession(img, matte);
    liquifyDab(session, img, fromX, 32, 48, 32, 14, 1, 'push', matte);
    applyCutoutMatte(img, matte);

    if (fromX < 48) {
      const i = (32 * width + 50) * 4;
      assert.equal(data[i], 230, 'red subject moved past its old edge');
      assert.ok(data[i + 3] >= 245, 'the extended subject stays opaque');
    } else {
      const i = (32 * width + 45) * 4;
      assert.equal(data[i + 3], 0, 'the old cyan backdrop stays transparent');
    }
    assert.equal(matte[4 * width + 47], 255, 'the matte outside the brush stays in place');
  }
});

test('every liquify mode resamples a soft cutout matte with the same mapping as image alpha', () => {
  const width = 64, height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  const matte = new Uint8ClampedArray(width * height);
  for (let p = 0; p < matte.length; p++) {
    const x = p % width;
    matte[p] = x < 22 ? 255 : x < 31 ? 110 : 0;
    data[p * 4 + 3] = matte[p];
  }
  const img = { width, height, data };
  const session = createLiquifySession(img, matte);
  for (const [mode, fromX] of [['push', 20], ['bloat', 30], ['pinch', 30], ['restore', 30]]) {
    const before = matte.slice();
    liquifyDab(session, img, fromX, 24, 30, 24, 18, 1, mode, matte);
    assert.ok(matte.some((alpha, p) => alpha !== before[p]), mode + ' changes the matte');
    for (let p = 0; p < matte.length; p++) {
      // Both planes use bilinear interpolation. Allow one rounding level.
      assert.ok(Math.abs(matte[p] - data[p * 4 + 3]) <= 1, mode + ' keeps pixel ' + p + ' aligned');
    }
  }
});

test('restore brings the area back to the state when the session began', () => {
  const img = noiseImage(80, 80);
  const original = img.data.slice();
  const session = createLiquifySession(img);
  for (let k = 0; k < 5; k++) liquifyDab(session, img, 40, 40, 40, 40, 25, 1, 'pinch');
  for (let k = 0; k < 12; k++) liquifyDab(session, img, 40, 40, 40, 40, 30, 1, 'restore');
  let diff = 0;
  for (let i = 0; i < original.length; i += 4) diff = Math.max(diff, Math.abs(original[i] - img.data[i]));
  assert.ok(diff <= 10, `max difference ${diff}`);
  let shift = 0;
  for (let p = 0; p < session.fx.length; p++) shift = Math.max(shift, Math.hypot(session.fx[p], session.fy[p]));
  assert.ok(shift < 0.3, `remaining warp ${shift}`);
});

test('a saturated warp stays smooth (no streaks between neighbouring pixels)', () => {
  const img = noiseImage(140, 140);
  const session = createLiquifySession(img);
  for (let k = 0; k < 25; k++) liquifyDab(session, img, 70, 70, 70, 70, 45, 1, 'bloat');
  for (let k = 0; k < 25; k++) liquifyDab(session, img, 70, 95, 70, 95, 35, 1, 'pinch');
  // Second differences of the field are tiny for a smooth warp; streaks make them jump.
  let worst = 0;
  const { fx, fy, width } = session;
  for (let y = 30; y < 120; y++) {
    for (let x = 30; x < 110; x++) {
      const p = y * width + x;
      worst = Math.max(worst,
        Math.abs(fx[p - 1] - 2 * fx[p] + fx[p + 1]), Math.abs(fy[p - width] - 2 * fy[p] + fy[p + width]));
    }
  }
  assert.ok(worst < 0.35, `field roughness ${worst.toFixed(2)}`);
});
