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

function chroma(r, g, b) {
  return {
    y: 0.299 * r + 0.587 * g + 0.114 * b,
    cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

/** Chroma peak of skin-like pixels (falls back to a typical skin tone). */
export function findSkinTone(data, width, height) {
  const CB0 = 80, CR0 = 130, BINS_CB = 56, BINS_CR = 50;
  const hist = new Float32Array(BINS_CB * BINS_CR);
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 160000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const { y: lum, cb, cr } = chroma(data[i], data[i + 1], data[i + 2]);
      if (lum < 50 || lum > 245) continue;
      const bcb = Math.round(cb - CB0), bcr = Math.round(cr - CR0);
      if (bcb < 0 || bcb >= BINS_CB || bcr < 0 || bcr >= BINS_CR) continue;
      // Typical skin redness prior: keeps a warm backdrop from winning.
      hist[bcr * BINS_CB + bcb] += Math.exp(-((cr - 153) ** 2) / (2 * 10 * 10));
    }
  }
  let best = -1, peak = null;
  for (let r = 1; r < BINS_CR - 1; r++) {
    for (let c = 1; c < BINS_CB - 1; c++) {
      let s = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) s += hist[(r + dr) * BINS_CB + c + dc];
      if (s > best) {
        best = s;
        peak = { cb: c + CB0, cr: r + CR0 };
      }
    }
  }
  if (!peak || best < 30 || peak.cr < 142 || peak.cr > 172 || peak.cb < 88 || peak.cb > 125) return { ...DEFAULT_PEAK };
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
  const tone = findSkinTone(data, width, height);
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
      const lumGate = Math.min(1, Math.max(0, (lum - 45) / 35));
      sum[l] += w * lumGate;
    }
  }
  for (let l = 0; l < sum.length; l++) sum[l] = count[l] ? sum[l] / count[l] : 0;
  const smooth = boxBlurMap(boxBlurMap(sum, lw, lh, 1), lw, lh, 1);
  const mask = new Uint8Array(lw * lh);
  for (let l = 0; l < mask.length; l++) mask[l] = Math.round(Math.min(1, smooth[l] * 1.25) * 255);
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
