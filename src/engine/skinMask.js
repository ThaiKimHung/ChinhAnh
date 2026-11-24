// Skin mask for portrait retouching (smoothing, brightening, rosy tone).
//
// A fixed YCbCr box also accepts warm backgrounds, cream clothes and sunlit
// hair, and flips on/off pixel by pixel (blotches). Instead:
//   1. find this photo's own skin tone: the peak of a chroma histogram of
//      skin-like pixels, biased toward typical skin redness;
//   2. weight every pixel by a narrow Gaussian around that tone;
//   3. average into a quarter-resolution map and blur it, so the mask is
//      smooth and has no hard edges.
// The map is stored as 8-bit values and sampled bilinearly, identically on the
// CPU and as a LINEAR texture on the GPU.

export const SKIN_MASK_SCALE = 4;
const SIGMA_CB = 8;
const SIGMA_CR = 7;
const DEFAULT_PEAK = { cb: 108, cr: 153 };

/**
 * YCbCr with the chroma of dark pixels scaled up to what it would be at a
 * normal brightness: Cb/Cr shrink toward 128 as a colour gets darker, so dark
 * or deeper skin tones would otherwise fall outside the skin range.
 */
function chroma(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const k = Math.min(3, Math.max(1, 140 / Math.max(1, y)));
  return {
    y,
    cb: 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b) * k,
    cr: 128 + (0.5 * r - 0.418688 * g - 0.081312 * b) * k,
  };
}

/** Luminance below which a pixel is too dark to judge: adapts to dark photos. */
function darkLimit(data, width, height) {
  const hist = new Uint32Array(256);
  let n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      hist[Math.round(chroma(data[i], data[i + 1], data[i + 2]).y)]++;
      n++;
    }
  }
  let acc = 0, p05 = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * 0.05) {
      p05 = v;
      break;
    }
  }
  return Math.min(45, Math.max(10, p05 + 6));
}

/**
 * Chroma peak of skin-like pixels (falls back to a typical skin tone). Pixels
 * near the upper middle of the frame count more: that is where faces are,
 * while tops, tables and backdrops fill the bottom and the edges.
 */
export function findSkinTone(data, width, height, lumLow = 50) {
  const CB0 = 70, CR0 = 130, BINS_CB = 60, BINS_CR = 62;
  const hist = new Float32Array(BINS_CB * BINS_CR);
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 160000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const { y: lum, cb, cr } = chroma(data[i], data[i + 1], data[i + 2]);
      if (lum < lumLow || lum > 245) continue;
      const bcb = Math.round(cb - CB0), bcr = Math.round(cr - CR0);
      if (bcb < 0 || bcb >= BINS_CB || bcr < 0 || bcr >= BINS_CR) continue;
      // Typical skin redness prior: keeps a warm backdrop from winning.
      const u = x / width - 0.5, v = y / height - 0.38;
      const central = Math.exp(-(u * u) / (2 * 0.2 * 0.2) - (v * v) / (2 * 0.18 * 0.18));
      // Broad redness prior covering light to deep skin tones; pixels near the
      // dark limit have noisy (amplified) chroma and count less.
      const reliable = Math.min(1, (lum - lumLow) / 30);
      hist[bcr * BINS_CB + bcb] += Math.exp(-((cr - 160) ** 2) / (2 * 18 * 18)) * (0.03 + central) * reliable;
    }
  }
  // Only skin-plausible chroma can be the peak (Cr 140–188, Cb 75–125).
  let best = -1, peak = null;
  for (let r = Math.max(1, 140 - CR0); r < Math.min(BINS_CR - 1, 189 - CR0); r++) {
    for (let c = Math.max(1, 75 - CB0); c < Math.min(BINS_CB - 1, 126 - CB0); c++) {
      let s = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) s += hist[(r + dr) * BINS_CB + c + dc];
      if (s > best) {
        best = s;
        peak = { cb: c + CB0, cr: r + CR0 };
      }
    }
  }
  if (!peak || best < 5) return { ...DEFAULT_PEAK };
  return peak;
}

function boxBlurMap(map, w, h, radius) {
  const tmp = new Float32Array(map.length);
  const out = new Float32Array(map.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, x - radius); k <= Math.min(w - 1, x + radius); k++) {
        s += map[y * w + k];
        n++;
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, y - radius); k <= Math.min(h - 1, y + radius); k++) {
        s += tmp[k * w + x];
        n++;
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

/** Builds the quarter-resolution skin map: { mask (Uint8Array), width, height, tone }. */
export function computeSkinMask(imageData) {
  const { width, height, data } = imageData;
  const lumLow = darkLimit(data, width, height);
  const tone = findSkinTone(data, width, height, lumLow);
  const lw = Math.ceil(width / SKIN_MASK_SCALE);
  const lh = Math.ceil(height / SKIN_MASK_SCALE);
  const sum = new Float32Array(lw * lh);
  const count = new Float32Array(lw * lh);
  for (let y = 0; y < height; y++) {
    const ly = Math.floor(y / SKIN_MASK_SCALE);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = ly * lw + Math.floor(x / SKIN_MASK_SCALE);
      count[l]++;
      if (data[i + 3] < 8) continue;
      const { y: lum, cb, cr } = chroma(data[i], data[i + 1], data[i + 2]);
      const dcb = cb - tone.cb, dcr = cr - tone.cr;
      const w = Math.exp(-(dcb * dcb) / (2 * SIGMA_CB * SIGMA_CB) - (dcr * dcr) / (2 * SIGMA_CR * SIGMA_CR));
      const lumGate = Math.min(1, Math.max(0, (lum - lumLow) / 30));
      sum[l] += w * lumGate;
    }
  }
  for (let l = 0; l < sum.length; l++) sum[l] = count[l] ? sum[l] / count[l] : 0;
  const smooth = boxBlurMap(boxBlurMap(sum, lw, lh, 1), lw, lh, 1);
  // Skin almost never fills the whole frame; when "skin" does, it is wood,
  // sand or a wall of that colour, so fade the mask out.
  let total = 0;
  for (let l = 0; l < smooth.length; l++) total += Math.min(1, smooth[l] * 1.25);
  const coverage = total / smooth.length;
  const trust = Math.min(1, Math.max(0, (0.85 - coverage) / 0.25));
  const mask = new Uint8Array(lw * lh);
  for (let l = 0; l < mask.length; l++) mask[l] = Math.round(Math.min(1, smooth[l] * 1.25) * trust * 255);
  return { mask, width: lw, height: lh, tone };
}

/** Bilinear lookup (0..1) at full-resolution pixel (x, y), matching GPU LINEAR filtering. */
export function sampleSkinMask(skin, x, y) {
  const { mask, width, height } = skin;
  const u = Math.min(width - 1, Math.max(0, (x + 0.5) / SKIN_MASK_SCALE - 0.5));
  const v = Math.min(height - 1, Math.max(0, (y + 0.5) / SKIN_MASK_SCALE - 0.5));
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = u - x0, ty = v - y0;
  const a = mask[y0 * width + x0], b = mask[y0 * width + x1];
  const c = mask[y1 * width + x0], d = mask[y1 * width + x1];
  return ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) / 255;
}

const cache = new WeakMap();

/** Cached per image buffer; recomputed when sampled pixels change (e.g. after a brush edit). */
export function getSkinMask(imageData) {
  const { data } = imageData;
  let signature = 0;
  const stride = Math.max(4, Math.floor(data.length / 4096) * 4);
  for (let i = 0; i < data.length; i += stride) signature = (Math.imul(signature, 31) + data[i] + data[i + 1] * 3) | 0;
  const hit = cache.get(imageData);
  if (hit && hit.signature === signature) return hit.skin;
  const skin = computeSkinMask(imageData);
  cache.set(imageData, { signature, skin });
  return skin;
}

// --- Manual skin region ------------------------------------------------------
// A per-photo override painted with the "Thêm vùng da" / "Bớt vùng da" brushes,
// stored on the skin mask grid (1/4 resolution). 128 = automatic, 255 = always
// skin, 0 = never skin; values in between blend toward those ends.

export const SKIN_OVERRIDE_NEUTRAL = 128;

/** Empty override (all automatic) for an image of width × height pixels. */
export function createSkinOverride(width, height) {
  const w = Math.ceil(width / SKIN_MASK_SCALE);
  const h = Math.ceil(height / SKIN_MASK_SCALE);
  return { width: w, height: h, data: new Uint8ClampedArray(w * h).fill(SKIN_OVERRIDE_NEUTRAL) };
}

export function isSkinOverrideEmpty(override) {
  return !override || override.data.every((v) => v === SKIN_OVERRIDE_NEUTRAL);
}

/**
 * Paints the override with a soft round brush centred at image pixel (cx, cy).
 * mode: 'add' (mark as skin) or 'remove' (mark as not skin).
 */
export function paintSkinOverride(override, cx, cy, radius, strength, mode) {
  const { width, height, data } = override;
  const gx = cx / SKIN_MASK_SCALE - 0.5;
  const gy = cy / SKIN_MASK_SCALE - 0.5;
  const r = Math.max(1, radius / SKIN_MASK_SCALE);
  const target = mode === 'add' ? 255 : 0;
  for (let y = Math.max(0, Math.floor(gy - r)); y <= Math.min(height - 1, Math.ceil(gy + r)); y++) {
    for (let x = Math.max(0, Math.floor(gx - r)); x <= Math.min(width - 1, Math.ceil(gx + r)); x++) {
      const d2 = ((x - gx) ** 2 + (y - gy) ** 2) / (r * r);
      if (d2 >= 1) continue;
      const falloff = (1 - d2) ** 1.5 * Math.min(1, strength);
      const i = y * width + x;
      data[i] = Math.round(data[i] + (target - data[i]) * falloff);
    }
  }
}

/** Override value (0..255) at a grid cell of a mask that may have a different size. */
function overrideAt(override, x, y, w, h) {
  if (override.width === w && override.height === h) return override.data[y * w + x];
  const ox = Math.min(override.width - 1, Math.floor(((x + 0.5) * override.width) / w));
  const oy = Math.min(override.height - 1, Math.floor(((y + 0.5) * override.height) / h));
  return override.data[oy * override.width + ox];
}

/**
 * Combines the automatic mask with the painted override. Also handles an
 * override painted on the working copy being applied at full export size.
 */
export function applySkinOverride(skin, override) {
  if (isSkinOverrideEmpty(override)) return skin;
  const mask = new Uint8Array(skin.mask.length);
  for (let y = 0; y < skin.height; y++) {
    for (let x = 0; x < skin.width; x++) {
      const i = y * skin.width + x;
      const auto = skin.mask[i];
      const o = (overrideAt(override, x, y, skin.width, skin.height) - SKIN_OVERRIDE_NEUTRAL) / 127;
      mask[i] = Math.round(o >= 0 ? auto + (255 - auto) * Math.min(1, o) : auto * (1 + Math.max(-1, o)));
    }
  }
  return { ...skin, mask };
}

/** Skin mask of the photo with the user's painted corrections applied. */
export function getEffectiveSkinMask(imageData, override) {
  return applySkinOverride(getSkinMask(imageData), override);
}

export function cloneSkinOverride(override) {
  return override ? { ...override, data: new Uint8ClampedArray(override.data) } : null;
}
