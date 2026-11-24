// Per-person skin beauty. `beauty` holds the levels for everyone
// ({ skinSmooth, skinBrighten, skinRosy }) and may hold `perFace`:
// { [faceIndex]: { skinSmooth, skinBrighten, skinRosy } } for people with their own levels.
//
// The pipelines run with the highest level of each effect and a 3-channel
// weight map (smooth, brighten, rosy) on the skin-mask grid: skin × (level of
// the person that owns the cell ÷ highest level). Without per-person levels
// every channel equals the skin mask, i.e. the plain single-level result.

import { SKIN_MASK_SCALE } from './skinMask.js';

export const BEAUTY_KEYS = ['skinSmooth', 'skinBrighten', 'skinRosy'];

const pick = (b) => ({ skinSmooth: b.skinSmooth, skinBrighten: b.skinBrighten, skinRosy: b.skinRosy });

/** Per-person entries that apply to the detected faces. */
function activeOverrides(beauty, faces) {
  if (!beauty.perFace || !faces?.length) return [];
  return Object.entries(beauty.perFace)
    .map(([k, levels]) => [Number(k), levels])
    .filter(([i, levels]) => Number.isInteger(i) && i >= 0 && i < faces.length && levels);
}

/** Levels used for person `index` (their own, or the shared ones). */
export function personLevels(beauty, index) {
  const own = index === null || index === undefined ? null : beauty.perFace?.[index];
  return own ? { ...pick(beauty), ...pick(own) } : pick(beauty);
}

/** Highest level of each effect across everyone: what the pipelines run with. */
export function effectiveBeauty(beauty, faces) {
  const out = pick(beauty);
  for (const [, levels] of activeOverrides(beauty, faces)) {
    for (const k of BEAUTY_KEYS) out[k] = Math.max(out[k], levels[k] ?? 0);
  }
  return out;
}

/** Whether any skin beauty is set, shared or per person. */
export function hasBeautyEffect(beauty) {
  if (BEAUTY_KEYS.some((k) => beauty[k] > 0)) return true;
  return Object.values(beauty.perFace ?? {}).some((levels) => BEAUTY_KEYS.some((k) => levels?.[k] > 0));
}

/** The beauty settings without per-person levels (for copying a style to other photos). */
export function sharedBeauty(beauty) {
  return pick(beauty);
}

/** Sets (levels) or clears (null) person `index`'s own levels. */
export function withPersonLevels(beauty, index, levels) {
  const perFace = { ...(beauty.perFace ?? {}) };
  if (levels) perFace[index] = pick(levels);
  else delete perFace[index];
  const next = { ...beauty, perFace };
  if (!Object.keys(perFace).length) delete next.perFace;
  return next;
}

/**
 * Index of the face that owns pixel (px, py) of a width × height photo, or -1.
 * Uses the same reach as the skin prior: the face, and the neck and body below it.
 */
export function faceOwnerAt(faces, width, height, px, py) {
  let best = -1, bestD = 1.5;
  faces.forEach((f, i) => {
    const cx = (f.x + f.w / 2) * width, cy = (f.y + f.h / 2) * height;
    const fw = f.w * width, fh = f.h * height;
    const dx = (px - cx) / (fw * 1.1);
    const dy = (py - cy) / (py < cy ? fh * 0.9 : fh * 3);
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function blurGrid(src, w, h, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, x - radius); k <= Math.min(w - 1, x + radius); k++, n++) s += src[y * w + k];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, y - radius); k <= Math.min(h - 1, y + radius); k++, n++) s += tmp[k * w + x];
      out[y * w + x] = s / n;
    }
  }
  return out;
}

/**
 * RGBA weight grid ({ data, width, height }) for `skin` (the skin mask of a
 * width × height photo): R smooth, G brighten, B rosy, each 0..255.
 */
export function buildBeautyWeights(skin, faces, beauty, width, height) {
  const n = skin.width * skin.height;
  const data = new Uint8Array(n * 4);
  const overrides = activeOverrides(beauty, faces);
  if (!overrides.length) {
    for (let l = 0; l < n; l++) {
      const v = skin.mask[l];
      data[l * 4] = v;
      data[l * 4 + 1] = v;
      data[l * 4 + 2] = v;
    }
    return { data, width: skin.width, height: skin.height };
  }

  const top = effectiveBeauty(beauty, faces);
  const own = new Map(overrides);
  const owner = new Int16Array(n);
  for (let gy = 0; gy < skin.height; gy++) {
    for (let gx = 0; gx < skin.width; gx++) {
      owner[gy * skin.width + gx] = faceOwnerAt(faces, width, height, (gx + 0.5) * SKIN_MASK_SCALE, (gy + 0.5) * SKIN_MASK_SCALE);
    }
  }
  BEAUTY_KEYS.forEach((key, c) => {
    const ratio = new Float32Array(n);
    if (top[key] > 0) {
      for (let l = 0; l < n; l++) {
        const levels = own.get(owner[l]) ?? beauty;
        ratio[l] = (levels[key] ?? 0) / top[key];
      }
    }
    // Soft hand-over between neighbouring people.
    const soft = blurGrid(ratio, skin.width, skin.height, 2);
    for (let l = 0; l < n; l++) data[l * 4 + c] = Math.round(skin.mask[l] * soft[l]);
  });
  return { data, width: skin.width, height: skin.height };
}

const cache = new WeakMap();

/** `buildBeautyWeights`, cached per skin mask and settings. */
export function getBeautyWeights(skin, faces, beauty, width, height) {
  const key = JSON.stringify([faces?.map((f) => [f.x, f.y, f.w, f.h]) ?? null, pick(beauty), beauty.perFace ?? null]);
  const hit = cache.get(skin);
  if (hit?.key === key) return hit.weights;
  const weights = buildBeautyWeights(skin, faces, beauty, width, height);
  cache.set(skin, { key, weights });
  return weights;
}

/** Bilinear lookup of the three weights (0..1) at pixel (x, y) into `out`, matching GPU LINEAR filtering. */
export function sampleBeautyWeights(weights, x, y, out) {
  const { data, width, height } = weights;
  const u = Math.min(width - 1, Math.max(0, (x + 0.5) / SKIN_MASK_SCALE - 0.5));
  const v = Math.min(height - 1, Math.max(0, (y + 0.5) / SKIN_MASK_SCALE - 0.5));
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = u - x0, ty = v - y0;
  const a = (y0 * width + x0) * 4, b = (y0 * width + x1) * 4;
  const c = (y1 * width + x0) * 4, d = (y1 * width + x1) * 4;
  for (let k = 0; k < 3; k++) {
    out[k] = ((data[a + k] + (data[b + k] - data[a + k]) * tx) * (1 - ty) + (data[c + k] + (data[d + k] - data[c + k]) * tx) * ty) / 255;
  }
  return out;
}
