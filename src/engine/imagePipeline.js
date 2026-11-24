import { createLiquifySession, liquifyDab } from './liquify.js';
import { getEffectiveSkinMask, sampleSkinMask } from './skinMask.js';
import { fitOverlay, wrapCaption } from './overlayLayout.js';

export const DEFAULT_HSL = {
  red: [0, 0, 0],
  orange: [0, 0, 0],
  yellow: [0, 0, 0],
  green: [0, 0, 0],
  blue: [0, 0, 0],
  purple: [0, 0, 0],
};

export const DEFAULT_ADJUSTMENTS = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  clarity: 0,
  fade: 0,
  grain: 0,
  sharpen: 0,
  vignette: 0,
  hsl: {
    red: [0, 0, 0],
    orange: [0, 0, 0],
    yellow: [0, 0, 0],
    green: [0, 0, 0],
    blue: [0, 0, 0],
    purple: [0, 0, 0],
  },
};

export const DEFAULT_BEAUTY = {
  skinSmooth: 0,
  skinBrighten: 0,
  skinRosy: 0,
};

export const DEFAULT_BG_STATE = {
  mode: 'original', // 'original' | 'transparent' | 'color' | 'bokeh' | 'image'
  color: '#ffffff',
  blurAmount: 14,
  feather: 2,
  customBgUrl: null,
  customBgImg: null,
};

export const DEFAULT_TEXT = {
  enabled: false,
  content: 'LK Magic Studio',
  fontSize: 42,
  color: '#ffffff',
  opacity: 85,
  x: 50, // percentage 0..100
  y: 90,
  fontFamily: 'Inter, system-ui, sans-serif',
  bold: true,
  italic: false,
  repeatWatermark: false,
  strokeEnabled: false,
  strokeColor: '#000000',
};

export const DEFAULT_LOGO = {
  enabled: false,
  url: null,
  img: null,
  scale: 18, // % of shorter image dimension
  opacity: 90,
  x: 86,
  y: 12, // top-right, clear of the default caption at the bottom
};

export const DEFAULT_FRAME = {
  enabled: false,
  width: 24,
  color: '#ffffff',
  style: 'classic', // 'classic' | 'polaroid' | 'rounded'
};

export const PRESETS = [
  {
    id: 'original',
    name: 'Ảnh gốc',
    badge: '#64748b',
    values: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: 'studio-clean',
    name: 'Studio Trong Trẻo',
    badge: '#38bdf8',
    values: {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 10,
      contrast: 12,
      highlights: -15,
      shadows: 20,
      temperature: -6,
      vibrance: 16,
      sharpen: 18,
    },
  },
  {
    id: 'korean-wedding',
    name: 'Cưới Hàn Quốc',
    badge: '#f9a8d4',
    values: {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 14,
      contrast: -8,
      highlights: -20,
      shadows: 28,
      temperature: 8,
      tint: 6,
      saturation: -10,
      vibrance: 14,
    },
  },
  {
    id: 'golden-hour',
    name: 'Nắng Ấm',
    badge: '#f59e0b',
    values: {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 6,
      contrast: 10,
      highlights: -10,
      shadows: 12,
      temperature: 16,
      tint: 4,
      vibrance: 8,
      vignette: 18,
    },
  },
  {
    id: 'classic-film',
    name: 'Film Cổ Điển',
    badge: '#10b981',
    values: {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 4,
      contrast: 16,
      highlights: -18,
      shadows: 16,
      temperature: 12,
      tint: -8,
      saturation: -14,
      fade: 18,
      grain: 14,
      vignette: 28,
    },
  },
  {
    id: 'bright-portrait',
    name: 'Chân Dung Sáng Da',
    badge: '#fb7185',
    values: {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 12,
      contrast: 6,
      highlights: -12,
      shadows: 24,
      temperature: 5,
      tint: 8,
      vibrance: 12,
      sharpen: 12,
    },
  },
  {
    id: 'cool-cyber',
    name: 'Tông Lạnh Hiện Đại',
    badge: '#818cf8',
    values: {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 2,
      contrast: 18,
      highlights: -10,
      shadows: 10,
      temperature: -18,
      tint: -8,
      vibrance: 15,
      vignette: 22,
      // Pull skin back from magenta under the cool cast.
      hsl: { ...DEFAULT_HSL, red: [8, 0, 0], orange: [8, 0, 0] },
    },
  },
  {
    id: 'artistic-bw',
    name: 'Đen Trắng Nghệ Thuật',
    badge: '#e2e8f0',
    values: {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 4,
      contrast: 28,
      highlights: -12,
      shadows: 14,
      saturation: -100,
      sharpen: 22,
      vignette: 30,
    },
  },
];

function clamp(v, min = 0, max = 255) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Separable box blur. Coverage weighting keeps invisible colors out of
 * RGB averages for operations that derive contrast from the blur.
 */
function boxBlurRGBA(data, width, height, radius, alphaWeighted = false) {
  const r = Math.max(1, Math.round(radius));
  const temp = new Uint8ClampedArray(data.length);
  const out = new Uint8ClampedArray(data.length);
  const div = r * 2 + 1;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let i = -r; i <= r; i++) {
      const cx = Math.min(width - 1, Math.max(0, i));
      const idx = rowOffset + cx * 4;
      const weight = alphaWeighted ? data[idx + 3] : 1;
      sr += data[idx] * weight;
      sg += data[idx + 1] * weight;
      sb += data[idx + 2] * weight;
      sa += data[idx + 3];
    }
    for (let x = 0; x < width; x++) {
      const outIdx = rowOffset + x * 4;
      const colorDiv = alphaWeighted ? sa || 1 : div;
      temp[outIdx] = sr / colorDiv;
      temp[outIdx + 1] = sg / colorDiv;
      temp[outIdx + 2] = sb / colorDiv;
      temp[outIdx + 3] = sa / div;

      const xRemove = Math.max(0, x - r);
      const xAdd = Math.min(width - 1, x + r + 1);
      const iRem = rowOffset + xRemove * 4;
      const iAdd = rowOffset + xAdd * 4;
      const addWeight = alphaWeighted ? data[iAdd + 3] : 1;
      const removeWeight = alphaWeighted ? data[iRem + 3] : 1;
      sr += data[iAdd] * addWeight - data[iRem] * removeWeight;
      sg += data[iAdd + 1] * addWeight - data[iRem + 1] * removeWeight;
      sb += data[iAdd + 2] * addWeight - data[iRem + 2] * removeWeight;
      sa += data[iAdd + 3] - data[iRem + 3];
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let i = -r; i <= r; i++) {
      const cy = Math.min(height - 1, Math.max(0, i));
      const idx = (cy * width + x) * 4;
      const weight = alphaWeighted ? temp[idx + 3] : 1;
      sr += temp[idx] * weight;
      sg += temp[idx + 1] * weight;
      sb += temp[idx + 2] * weight;
      sa += temp[idx + 3];
    }
    for (let y = 0; y < height; y++) {
      const outIdx = (y * width + x) * 4;
      const colorDiv = alphaWeighted ? sa || 1 : div;
      out[outIdx] = sr / colorDiv;
      out[outIdx + 1] = sg / colorDiv;
      out[outIdx + 2] = sb / colorDiv;
      out[outIdx + 3] = sa / div;

      const yRemove = Math.max(0, y - r);
      const yAdd = Math.min(height - 1, y + r + 1);
      const iRem = (yRemove * width + x) * 4;
      const iAdd = (yAdd * width + x) * 4;
      const addWeight = alphaWeighted ? temp[iAdd + 3] : 1;
      const removeWeight = alphaWeighted ? temp[iRem + 3] : 1;
      sr += temp[iAdd] * addWeight - temp[iRem] * removeWeight;
      sg += temp[iAdd + 1] * addWeight - temp[iRem + 1] * removeWeight;
      sb += temp[iAdd + 2] * addWeight - temp[iRem + 2] * removeWeight;
      sa += temp[iAdd + 3] - temp[iRem + 3];
    }
  }

  return out;
}

const HSL_BANDS = [
  { key: 'red', center: 0, span: 35 },
  { key: 'orange', center: 30, span: 30 },
  { key: 'yellow', center: 60, span: 35 },
  { key: 'green', center: 125, span: 55 },
  { key: 'blue', center: 215, span: 55 },
  { key: 'purple', center: 290, span: 50 },
];

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) * 0.5;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hue2rgb(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(hDeg, s, l) {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  if (s <= 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ];
}

/**
 * Full pixel pipeline: Beauty + Color Adjustments + HSL Mixer + Clarity + Fade + Grain + Sharpen + Vignette.
 */
/**
 * Per-pixel grain value 0..255 from a 32-bit integer hash (murmur3 finaliser),
 * so the grain has no visible pattern. Mirrored exactly in the WebGL shader.
 */
export function grainHash(x, y) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h & 255;
}

/** Highlight shoulder: values above KNEE approach 255 smoothly instead of clipping. */
export const HIGHLIGHT_KNEE = 200;
export const HIGHLIGHT_SOFTNESS = 55;

function shoulder(v) {
  return v <= HIGHLIGHT_KNEE ? v : HIGHLIGHT_KNEE + HIGHLIGHT_SOFTNESS * (1 - Math.exp(-(v - HIGHLIGHT_KNEE) / HIGHLIGHT_SOFTNESS));
}

/**
 * Compresses only the part of a channel that the edit pushed up (`v` above the
 * source value `base`), so untouched pixels stay exact and brightened
 * highlights keep their gradation instead of flattening at 255.
 */
function rollOff(v, base) {
  return v <= base ? v : base + shoulder(v) - shoulder(base);
}

/** Share of fine pore texture put back after skin smoothing (avoids a waxy look). */
export const SKIN_TEXTURE_KEEP = 0.6;

export function processImagePipeline(srcImageData, adjustments, beauty, skinOverride = null, faces = null) {
  const { width, height, data: src } = srcImageData;
  const out = new Uint8ClampedArray(src.length);

  const hasBeauty = beauty.skinSmooth > 0 || beauty.skinBrighten > 0 || beauty.skinRosy > 0;
  const skin = hasBeauty ? getEffectiveSkinMask(srcImageData, skinOverride, faces) : null;
  let blurred = null;
  let fineBlur = null;
  if (beauty.skinSmooth > 0) {
    // 3×3 average: src − fineBlur is the pore-level texture restored after smoothing.
    fineBlur = boxBlurRGBA(src, width, height, 1);
    const blurRadius = Math.max(2, Math.round((Math.min(width, height) / 360) * (2 + beauty.skinSmooth * 0.06)));
    blurred = boxBlurRGBA(src, width, height, blurRadius);
  }

  const clarityVal = adjustments.clarity || 0;
  let clarityBlur = null;
  if (clarityVal !== 0) {
    const cRadius = Math.max(3, Math.round(Math.min(width, height) / 140));
    clarityBlur = boxBlurRGBA(src, width, height, cRadius, true);
  }

  const hslMap = adjustments.hsl;
  const hasHsl =
    hslMap &&
    HSL_BANDS.some((b) => {
      const vals = hslMap[b.key];
      return vals && (vals[0] !== 0 || vals[1] !== 0 || vals[2] !== 0);
    });

  const expFactor = Math.pow(2, adjustments.exposure / 55);
  const contrastFactor = Math.pow((100 + adjustments.contrast) / 100, 2);
  const hlAmount = adjustments.highlights / 100;
  const shAmount = adjustments.shadows / 100;
  const tempShift = adjustments.temperature * 0.65;
  const tintShift = adjustments.tint * 0.5;
  const satFactor = 1 + adjustments.saturation / 100;
  const vibAmount = adjustments.vibrance / 100;
  const monochrome = satFactor === 0 && vibAmount === 0;
  const clarityAmount = clarityVal / 100;
  const fadeAmount = (adjustments.fade || 0) * 0.42;
  const grainAmount = (adjustments.grain || 0) * 0.45;

  const smoothStrength = beauty.skinSmooth / 100;
  const brightenAmount = beauty.skinBrighten * 0.35;
  const rosyAmount = beauty.skinRosy * 0.22;

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const vigStrength = adjustments.vignette / 100;

  for (let y = 0; y < height; y++) {
    const ny = (y - halfH) / halfH;
    const ny2 = ny * ny;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = src[i];
      let g = src[i + 1];
      let b = src[i + 2];
      const a = src[i + 3];

      if (a === 0) {
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = 0;
        continue;
      }

      // 1. Portrait Beauty (skin-masked + edge-preserving)
      if (hasBeauty) {
        const skinW = sampleSkinMask(skin, x, y);
        if (skinW > 0.02) {
          if (blurred) {
            const br = blurred[i];
            const bg = blurred[i + 1];
            const bb = blurred[i + 2];
            const diff = (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb)) / 3;
            const edgeKeep = Math.exp(-(diff * diff) / 380);
            const blend = smoothStrength * skinW * edgeKeep * 0.85;
            const keep = blend * SKIN_TEXTURE_KEEP;
            r = r + (br - r) * blend + (src[i] - fineBlur[i]) * keep;
            g = g + (bg - g) * blend + (src[i + 1] - fineBlur[i + 1]) * keep;
            b = b + (bb - b) * blend + (src[i + 2] - fineBlur[i + 2]) * keep;
          }
          if (brightenAmount > 0) {
            const add = brightenAmount * skinW;
            r += add;
            g += add * 0.96;
            b += add * 0.92;
          }
          if (rosyAmount > 0) {
            r += rosyAmount * skinW;
            g -= rosyAmount * 0.15 * skinW;
            b += rosyAmount * 0.12 * skinW;
          }
        }
      }

      // 2. Clarity (local midtone contrast)
      if (clarityBlur?.[i + 3]) {
        const dr = r - clarityBlur[i];
        const dg = g - clarityBlur[i + 1];
        const db = b - clarityBlur[i + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const midMask = 1 - Math.abs(lum - 0.5) * 1.4;
        const cGain = clarityAmount * Math.max(0.2, midMask) * 0.85;
        r += dr * cGain;
        g += dg * cGain;
        b += db * cGain;
      }

      // 3. Exposure
      if (adjustments.exposure !== 0) {
        r *= expFactor;
        g *= expFactor;
        b *= expFactor;
      }

      // 4. Temperature & Tint
      if (adjustments.temperature !== 0 || adjustments.tint !== 0) {
        r += tempShift + tintShift * 0.35;
        g -= tintShift;
        b -= tempShift - tintShift * 0.35;
      }

      // 5. Highlights & Shadows
      if (hlAmount !== 0 || shAmount !== 0) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (shAmount !== 0) {
          const shadowMask = Math.pow(1 - Math.min(1, Math.max(0, lum)), 1.6);
          const lift = shAmount * shadowMask * 75;
          r += lift;
          g += lift;
          b += lift;
        }
        if (hlAmount !== 0) {
          const highMask = Math.pow(Math.min(1, Math.max(0, lum)), 1.6);
          const pull = hlAmount * highMask * 75;
          r += pull;
          g += pull;
          b += pull;
        }
      }

      // 6. Contrast
      if (adjustments.contrast !== 0) {
        r = (r - 128) * contrastFactor + 128;
        g = (g - 128) * contrastFactor + 128;
        b = (b - 128) * contrastFactor + 128;
      }

      // 7. Saturation & Vibrance
      if (adjustments.saturation !== 0 || vibAmount !== 0) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let effSat = satFactor;
        if (vibAmount !== 0) {
          // Measure saturation on displayable values: channels pushed below 0 by
          // earlier steps would otherwise make (max - min) / max blow up.
          const maxC = clamp(Math.max(r, g, b));
          const minC = clamp(Math.min(r, g, b));
          const curSat = maxC > 0 ? (maxC - minC) / maxC : 0;
          effSat += vibAmount * (1 - curSat);
        }
        r = lum + (r - lum) * effSat;
        g = lum + (g - lum) * effSat;
        b = lum + (b - lum) * effSat;
      }

      // 8. HSL per-channel mixer
      if (hasHsl) {
        const [hDeg, sat, lig] = rgbToHsl(clamp(r), clamp(g), clamp(b));
        if (sat > 0.02) {
          let dh = 0;
          let ds = 0;
          let dl = 0;
          for (let k = 0; k < HSL_BANDS.length; k++) {
            const band = HSL_BANDS[k];
            const vals = hslMap[band.key];
            if (!vals || (vals[0] === 0 && vals[1] === 0 && vals[2] === 0)) continue;
            const rawDist = Math.abs(hDeg - band.center);
            const dist = Math.min(rawDist, 360 - rawDist);
            if (dist < band.span) {
              const w = 1 - dist / band.span;
              dh += vals[0] * w;
              ds += vals[1] * w;
              dl += vals[2] * w;
            }
          }
          if (dh !== 0 || ds !== 0 || dl !== 0) {
            const nh = hDeg + dh * 0.45;
            const ns = Math.min(1, Math.max(0, sat * (1 + ds / 100)));
            const nl = Math.min(1, Math.max(0, lig + (dl / 100) * 0.35 * (1 - Math.abs(lig - 0.5) * 1.2)));
            [r, g, b] = hslToRgb(nh, ns, nl);
          }
        }
      }

      // 9. Film Fade (matte lifted blacks)
      if (fadeAmount > 0) {
        r += fadeAmount * (1 - clamp(r) / 255);
        g += fadeAmount * (1 - clamp(g) / 255);
        b += fadeAmount * (1 - clamp(b) / 255);
      }

      // 10. Vignette
      if (vigStrength > 0) {
        const nx = (x - halfW) / halfW;
        const dist2 = nx * nx + ny2;
        const vig = 1 - Math.min(0.85, Math.max(0, (dist2 - 0.35) * 0.55 * vigStrength));
        r *= vig;
        g *= vig;
        b *= vig;
      }

      // 11. Film Grain (deterministic pixel hash)
      if (grainAmount > 0) {
        const hash = grainHash(x, y);
        const noise = (hash / 255 - 0.5) * grainAmount;
        r += noise;
        g += noise;
        b += noise;
      }

      if (monochrome) {
        const base = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
        out[i] = out[i + 1] = out[i + 2] = clamp(rollOff(r, base));
      } else {
        out[i] = clamp(rollOff(r, src[i]));
        out[i + 1] = clamp(rollOff(g, src[i + 1]));
        out[i + 2] = clamp(rollOff(b, src[i + 2]));
      }
      out[i + 3] = a;
    }
  }

  // 12. Sharpen (fast 3x3 unsharp mask)
  if (adjustments.sharpen > 0) {
    const gain = (adjustments.sharpen / 100) * 1.15 / (4 * 255);
    const copy = new Uint8ClampedArray(out);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        if (copy[i + 3] === 0) continue;
        const top = i - width * 4;
        const bot = i + width * 4;
        const left = i - 4;
        const right = i + 4;
        const alphaTop = copy[top + 3];
        const alphaBottom = copy[bot + 3];
        const alphaLeft = copy[left + 3];
        const alphaRight = copy[right + 3];
        for (let c = 0; c < 3; c++) {
          const center = copy[i + c];
          // Transparent neighbors have no visible contrast to sharpen.
          const contrast = (center - copy[top + c]) * alphaTop
            + (center - copy[bot + c]) * alphaBottom
            + (center - copy[left + c]) * alphaLeft
            + (center - copy[right + c]) * alphaRight;
          out[i + c] = clamp(center + contrast * gain);
        }
      }
    }
  }

  return new ImageData(out, width, height);
}

/**
 * Copy a rectangular ROI from a full RGBA buffer.
 */
function copyROI(data, width, height, minX, minY, maxX, maxY) {
  const rw = maxX - minX + 1;
  const rh = maxY - minY + 1;
  const roi = new Uint8ClampedArray(rw * rh * 4);
  for (let y = minY; y <= maxY; y++) {
    const srcStart = (y * width + minX) * 4;
    const dstStart = (y - minY) * rw * 4;
    roi.set(data.subarray(srcStart, srcStart + rw * 4), dstStart);
  }
  return { roi, rw, rh, ox: minX, oy: minY };
}

/**
 * Liquify warp stroke on working ImageData (in-place update via local ROI snapshot).
 */
export function applyLiquifyStroke(imageData, origImageData, x0, y0, x1, y1, radius, strength, mode) {
  const { width, height, data } = imageData;
  const r = Math.max(8, radius);
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(x1 - r));
  const maxX = Math.min(width - 1, Math.ceil(x1 + r));
  const minY = Math.max(0, Math.floor(y1 - r));
  const maxY = Math.min(height - 1, Math.ceil(y1 + r));

  if (mode === 'restore' && origImageData) {
    const orig = origImageData.data;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - x1;
        const dy = y - y1;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const falloff = Math.pow(1 - d2 / r2, 2) * Math.min(1, strength * 0.6);
        const i = (y * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          data[i + c] = data[i + c] + (orig[i + c] - data[i + c]) * falloff;
        }
      }
    }
    return;
  }

  // One-off dab (no session): warp from the current pixels once.
  liquifyDab(createLiquifySession(imageData), imageData, x0, y0, x1, y1, radius, strength, mode);
}

/**
 * Local skin smoothing / blemish healing / restore brush (local ROI snapshot).
 */
/**
 * Skin brushes. 'smooth' takes `baseImageData` (the pixels when the brush
 * session began): its target is computed from that base — edge-aware average
 * plus part of the base's own pore texture — so scrubbing converges instead of
 * flattening the skin further with every pass.
 */
export function applySkinBrushStroke(imageData, origImageData, cx, cy, radius, strength, mode, baseImageData = null) {
  const { width, height, data } = imageData;
  const r = Math.max(4, Math.round(radius));
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(height - 1, Math.ceil(cy + r));

  if (mode === 'restore' && origImageData) {
    const orig = origImageData.data;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 >= r2) continue;
        const falloff = (1 - d2 / r2) * Math.min(1, strength);
        const i = (y * width + x) * 4;
        for (let c = 0; c < 4; c++) {
          data[i + c] = data[i + c] + (orig[i + c] - data[i + c]) * falloff;
        }
      }
    }
    return;
  }

  const sampleStep = mode === 'heal' ? Math.max(2, Math.round(r * 0.35)) : Math.max(2, Math.round(r * 0.25));
  const pad = mode === 'heal' ? Math.ceil(r * 0.3) + 2 : sampleStep + 2;
  const snapMinX = Math.max(0, minX - pad);
  const snapMaxX = Math.min(width - 1, maxX + pad);
  const snapMinY = Math.max(0, minY - pad);
  const snapMaxY = Math.min(height - 1, maxY + pad);
  const smoothFromBase = mode !== 'heal' && baseImageData?.width === width && baseImageData.height === height;
  const { roi, rw, rh, ox, oy } = copyROI(smoothFromBase ? baseImageData.data : data, width, height, snapMinX, snapMinY, snapMaxX, snapMaxY);
  const healOffsets = mode === 'heal' ? Array.from({ length: 8 }, (_, direction) => {
    const angle = (direction * Math.PI) / 4;
    return [Math.cos(angle) * r * 0.95, Math.sin(angle) * r * 0.95];
  }) : null;

  // Does a contour (crease, lip line, eyelid) cross this dab? Checked once on a
  // dense ring so thin lines between the eight per-pixel samples are not missed.
  let crossesContour = false;
  if (healOffsets) {
    const count = Math.min(64, Math.max(16, Math.round((2 * Math.PI * r) / 3)));
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let k = 0; k < count; k++) {
      const angle = (k * 2 * Math.PI) / count;
      const sx = clamp(Math.round(cx + Math.cos(angle) * r * 0.95 - ox), 0, rw - 1);
      const sy = clamp(Math.round(cy + Math.sin(angle) * r * 0.95 - oy), 0, rh - 1);
      const si = (sy * rw + sx) * 4;
      if (roi[si + 3] === 0) continue;
      for (let c = 0; c < 3; c++) {
        lo[c] = Math.min(lo[c], roi[si + c]);
        hi[c] = Math.max(hi[c], roi[si + c]);
      }
    }
    crossesContour = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) > 42;
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;

      const i = (y * width + x) * 4;
      const li = ((y - oy) * rw + (x - ox)) * 4;
      let sr = 0, sg = 0, sb = 0, weight = 0;

      if (healOffsets) {
        if (roi[li + 3] === 0) continue;
        const currentRed = roi[li];
        const currentGreen = roi[li + 1];
        const currentBlue = roi[li + 2];
        let minRed = 255, minGreen = 255, minBlue = 255;
        let maxRed = 0, maxGreen = 0, maxBlue = 0;
        let matchRed = 0, matchGreen = 0, matchBlue = 0, matchWeight = 0;

        for (const [offsetX, offsetY] of healOffsets) {
          const sx = clamp(Math.round(cx + offsetX + dx * 0.25 - ox), 0, rw - 1);
          const sy = clamp(Math.round(cy + offsetY + dy * 0.25 - oy), 0, rh - 1);
          const si = (sy * rw + sx) * 4;
          const alpha = roi[si + 3];
          if (alpha === 0) continue;

          const red = roi[si];
          const green = roi[si + 1];
          const blue = roi[si + 2];
          minRed = Math.min(minRed, red);
          maxRed = Math.max(maxRed, red);
          minGreen = Math.min(minGreen, green);
          maxGreen = Math.max(maxGreen, green);
          minBlue = Math.min(minBlue, blue);
          maxBlue = Math.max(maxBlue, blue);
          sr += red * alpha;
          sg += green * alpha;
          sb += blue * alpha;
          weight += alpha;

          const difference = Math.max(Math.abs(red - currentRed), Math.abs(green - currentGreen), Math.abs(blue - currentBlue));
          if (difference <= 32) {
            matchRed += red * alpha;
            matchGreen += green * alpha;
            matchBlue += blue * alpha;
            matchWeight += alpha;
          }
        }

        // A uniform ring can repair a blemish that differs from every sample.
        // Where the ring crosses a contour (nostril, lip, eyelid), copying from the
        // ring would paint the contour beside itself. Smooth in place instead,
        // averaging only nearby pixels of the same colour so the contour stays put.
        if (crossesContour || Math.max(maxRed - minRed, maxGreen - minGreen, maxBlue - minBlue) > 42) {
          sr = 0;
          sg = 0;
          sb = 0;
          weight = 0;
          const reach = Math.max(2, Math.round(r * 0.3));
          const stride = Math.max(1, Math.round(reach / 3));
          for (let oyOff = -reach; oyOff <= reach; oyOff += stride) {
            const sy = y + oyOff - oy;
            if (sy < 0 || sy >= rh) continue;
            for (let oxOff = -reach; oxOff <= reach; oxOff += stride) {
              const sx = x + oxOff - ox;
              if (sx < 0 || sx >= rw) continue;
              const si = (sy * rw + sx) * 4;
              const alpha = roi[si + 3];
              if (alpha === 0) continue;
              const diff = Math.max(Math.abs(roi[si] - currentRed), Math.abs(roi[si + 1] - currentGreen), Math.abs(roi[si + 2] - currentBlue));
              const w = alpha * Math.exp(-(diff * diff) / 450);
              sr += roi[si] * w;
              sg += roi[si + 1] * w;
              sb += roi[si + 2] * w;
              weight += w;
            }
          }
        }
      } else {
        const cr = roi[li], cg = roi[li + 1], cb = roi[li + 2];
        const step = Math.max(1, Math.floor(sampleStep / 2));
        for (let oyOff = -sampleStep; oyOff <= sampleStep; oyOff += step) {
          for (let oxOff = -sampleStep; oxOff <= sampleStep; oxOff += step) {
            const sx = Math.min(rw - 1, Math.max(0, x + oxOff - ox));
            const sy = Math.min(rh - 1, Math.max(0, y + oyOff - oy));
            const si = (sy * rw + sx) * 4;
            const diff = Math.abs(roi[si] - cr) + Math.abs(roi[si + 1] - cg) + Math.abs(roi[si + 2] - cb);
            if (diff < 85) {
              sr += roi[si];
              sg += roi[si + 1];
              sb += roi[si + 2];
              weight++;
            }
          }
        }
        if (weight > 0) {
          // Put back part of the fine texture (pixel minus its 3×3 mean).
          let fr = 0, fg = 0, fbl = 0, fn = 0;
          for (let dyy = -1; dyy <= 1; dyy++) {
            const sy = Math.min(rh - 1, Math.max(0, y + dyy - oy));
            for (let dxx = -1; dxx <= 1; dxx++) {
              const si = (sy * rw + Math.min(rw - 1, Math.max(0, x + dxx - ox))) * 4;
              fr += roi[si];
              fg += roi[si + 1];
              fbl += roi[si + 2];
              fn++;
            }
          }
          const keep = SKIN_TEXTURE_KEEP * weight;
          sr += (cr - fr / fn) * keep;
          sg += (cg - fg / fn) * keep;
          sb += (cb - fbl / fn) * keep;
        }
      }

      if (weight > 0) {
        const ar = sr / weight;
        const ag = sg / weight;
        const ab = sb / weight;
        const falloff = Math.pow(1 - d2 / r2, 1.4) * Math.min(0.92, strength * 0.65);
        data[i] = data[i] + (ar - data[i]) * falloff;
        data[i + 1] = data[i + 1] + (ag - data[i + 1]) * falloff;
        data[i + 2] = data[i + 2] + (ab - data[i + 2]) * falloff;
      }
    }
  }
}

/**
 * Separable box blur on 1-channel Uint8ClampedArray alpha mask for soft cutout edges.
 */
export function featherAlphaMask(alpha, width, height, radius) {
  const r = Math.round(radius);
  if (r <= 0) return alpha;
  const div = r * 2 + 1;
  const temp = new Uint8ClampedArray(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let i = -r; i <= r; i++) {
      sum += alpha[row + Math.min(width - 1, Math.max(0, i))];
    }
    for (let x = 0; x < width; x++) {
      temp[row + x] = sum / div;
      const xRem = Math.max(0, x - r);
      const xAdd = Math.min(width - 1, x + r + 1);
      sum += alpha[row + xAdd] - alpha[row + xRem];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) {
      sum += temp[Math.min(height - 1, Math.max(0, i)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / div;
      const yRem = Math.max(0, y - r);
      const yAdd = Math.min(height - 1, y + r + 1);
      sum += temp[yAdd * width + x] - temp[yRem * width + x];
    }
  }
  return out;
}

/**
 * Analyze image data to produce automatic exposure/contrast/white-balance adjustments.
 */
export function computeAutoEnhance(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  const stride = Math.max(1, Math.floor(totalPixels / 15000));
  const lumaBins = new Uint32Array(256);
  let sumR = 0, sumG = 0, sumB = 0, count = 0;

  for (let p = 0; p < totalPixels; p += stride) {
    const i = p * 4;
    if (data[i + 3] < 10) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
    lumaBins[lum]++;
    sumR += r;
    sumG += g;
    sumB += b;
    count++;
  }
  if (count === 0) return { ...DEFAULT_ADJUSTMENTS };

  let acc = 0;
  let p05 = 0, p95 = 255, p50 = 128;
  for (let v = 0; v < 256; v++) {
    acc += lumaBins[v];
    if (acc >= count * 0.05 && p05 === 0) p05 = v;
    if (acc >= count * 0.5 && p50 === 128) p50 = v;
    if (acc >= count * 0.95) {
      p95 = v;
      break;
    }
  }

  // Exposure: aim the median at a normal brightness. Keep part of the original
  // mood (a low-key photo stays a bit darker) and use the pipeline's own
  // exposure curve (factor = 2^(exposure / 55)) so the result lands where intended.
  const targetMedian = p50 + (118 - p50) * 0.85;
  const factor = clamp(targetMedian / Math.max(4, p50), 0.45, 3.2);
  const exposure = Math.round(clamp(55 * Math.log2(factor), -60, 90));
  const gain = Math.pow(2, exposure / 55);
  const lo = p05 * gain;
  const hi = Math.min(255, p95 * gain);

  // Shadows/highlights recover the ends that exposure pushed too far.
  const shadows = lo < 22 ? Math.round(clamp((22 - lo) * 1.2, 0, 30)) : 0;
  const highlights = hi > 238 ? Math.round(clamp((236 - hi) * 1.2, -35, 0)) : 0;

  // Contrast: widen a narrow range, but never so much that the 5th / 95th
  // percentiles are pushed into pure black or white.
  const range = Math.max(40, hi - lo);
  let contrastFactor = Math.pow(1 + clamp(((200 - range) / 200) * 0.3, -0.1, 0.26), 2);
  if (lo < 128) contrastFactor = Math.min(contrastFactor, (128 - 10) / (128 - lo));
  if (hi > 128) contrastFactor = Math.min(contrastFactor, (245 - 128) / (hi - 128));
  const contrast = Math.round(clamp((Math.sqrt(contrastFactor) - 1) * 100, -10, 26));

  // Mild gray-world temperature & tint balance
  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;
  const temperature = Math.round(clamp((avgB - avgR) * 0.3, -18, 18));
  const tint = Math.round(clamp((avgG - (avgR + avgB) * 0.5) * 0.25, -12, 12));

  return {
    ...DEFAULT_ADJUSTMENTS,
    exposure,
    contrast,
    highlights,
    shadows,
    temperature,
    tint,
    vibrance: 14,
    sharpen: 10,
  };
}

/**
 * Compute 64-bin RGB + Luma histogram from a canvas for UI display.
 */
export function computeHistogram(canvas, bins = 48) {
  if (!canvas) return null;
  const w = Math.min(180, canvas.width);
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const r = new Float32Array(bins);
  const g = new Float32Array(bins);
  const b = new Float32Array(bins);
  const l = new Float32Array(bins);
  const scale = bins / 256;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    const rv = data[i], gv = data[i + 1], bv = data[i + 2];
    const lv = 0.299 * rv + 0.587 * gv + 0.114 * bv;
    r[Math.min(bins - 1, Math.floor(rv * scale))]++;
    g[Math.min(bins - 1, Math.floor(gv * scale))]++;
    b[Math.min(bins - 1, Math.floor(bv * scale))]++;
    l[Math.min(bins - 1, Math.floor(lv * scale))]++;
  }

  let maxVal = 1;
  for (let k = 1; k < bins - 1; k++) {
    maxVal = Math.max(maxVal, r[k], g[k], b[k], l[k]);
  }
  const norm = (arr) => Array.from(arr, (v) => Math.min(1, v / maxVal));
  return { r: norm(r), g: norm(g), b: norm(b), l: norm(l) };
}

/** Fit the largest centered, same-aspect rectangle inside a rotated image. */
export function getStraightenedSize({ width, height }, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const scale = Math.max(cos + (height / width) * sin, cos + (width / height) * sin);
  return {
    width: Math.max(1, Math.floor(width / scale)),
    height: Math.max(1, Math.floor(height / scale)),
  };
}

/** Rotate by a small angle and crop inside the original edges. */
export function straightenCanvas(src, angleDeg) {
  const { width, height } = getStraightenedSize(src, angleDeg);
  const dst = document.createElement('canvas');
  dst.width = width;
  dst.height = height;
  const ctx = dst.getContext('2d');
  ctx.translate(width / 2, height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return dst;
}

/**
 * Composite foreground (with alpha mask) onto selected background mode.
 */
export function compositeWithBackground(fgCanvas, backdropCanvas, bgState, resolutionScale = 1) {
  const w = fgCanvas.width;
  const h = fgCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');

  if (bgState.mode === 'color') {
    ctx.fillStyle = bgState.color || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  } else if (bgState.mode === 'bokeh' && backdropCanvas?.preBlurred) {
    ctx.drawImage(backdropCanvas, 0, 0, w, h);
  } else if (bgState.mode === 'bokeh' && backdropCanvas) {
    ctx.save();
    const bleed = 16 * resolutionScale;
    ctx.filter = `blur(${(bgState.blurAmount || 12) * resolutionScale}px)`;
    ctx.drawImage(backdropCanvas, -bleed, -bleed, w + bleed * 2, h + bleed * 2);
    ctx.restore();
  } else if (bgState.mode === 'image' && bgState.customBgImg) {
    const img = bgState.customBgImg;
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  ctx.drawImage(fgCanvas, 0, 0);
  return out;
}

/**
 * Blurred background for the 'bokeh' mode with the subject taken out first, so
 * the subject's hair and clothes do not bleed into the blur as a dark halo.
 * The subject becomes transparent and the canvas blur (premultiplied) then
 * averages only background pixels; areas deep inside the subject are filled
 * from a wider blur.
 */
export function bokehBackdrop(workData, cutoutAlpha, blurPx) {
  const { width, height, data } = workData;
  const holes = new ImageData(width, height);
  const hd = holes.data;
  let hasBackground = false;
  for (let p = 0, i = 0; p < cutoutAlpha.length; p++, i += 4) {
    const keep = 1 - cutoutAlpha[p] / 255;
    hd[i] = data[i];
    hd[i + 1] = data[i + 1];
    hd[i + 2] = data[i + 2];
    hd[i + 3] = Math.round(data[i + 3] * keep * keep * keep);
    if (hd[i + 3]) hasBackground = true;
  }
  if (!hasBackground) return null;
  const src = document.createElement('canvas');
  src.width = width;
  src.height = height;
  src.getContext('2d').putImageData(holes, 0, 0);
  const blurred = (radius) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.filter = `blur(${radius}px)`;
    cx.drawImage(src, 0, 0);
    return cx.getImageData(0, 0, width, height).data;
  };
  const near = blurred(blurPx);
  const far = blurred(Math.max(blurPx * 4, Math.min(width, height) / 6));
  const out = new ImageData(width, height);
  const od = out.data;
  for (let i = 0; i < od.length; i += 4) {
    const nearAlpha = near[i + 3];
    const farAlpha = far[i + 3];
    if (!data[i + 3] || (!nearAlpha && !farAlpha)) continue;
    // Readback is un-premultiplied: colour = average of background pixels only.
    const t = farAlpha ? Math.min(1, nearAlpha / 40) : 1;
    for (let c = 0; c < 3; c++) od[i + c] = near[i + c] * t + far[i + c] * (1 - t);
    od[i + 3] = 255;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(out, 0, 0);
  canvas.preBlurred = true;
  return canvas;
}

/** Average colour of pixels whose mask value passes `test`, within `radius` of (cx, cy). */
function localMaskColor(data, alpha, width, height, cx, cy, radius, test) {
  const step = Math.max(1, Math.round(radius / 12));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, Math.round(cy - radius)); y <= Math.min(height - 1, Math.round(cy + radius)); y += step) {
    for (let x = Math.max(0, Math.round(cx - radius)); x <= Math.min(width - 1, Math.round(cx + radius)); x += step) {
      const p = y * width + x;
      if (!test(alpha[p]) || data[p * 4 + 3] < 255) continue;
      r += data[p * 4];
      g += data[p * 4 + 1];
      b += data[p * 4 + 2];
      n++;
    }
  }
  return n >= 6 ? [r / n, g / n, b / n] : null;
}

/**
 * Refine the AI cutout mask with a soft brush. 'erase' fades to transparent.
 * 'keep' brings pixels back, but when the photo is given it only restores as
 * much as each pixel differs from the old background around it — plain
 * background stays transparent, so a stroke never paints a grey patch.
 */
export function applyAlphaMaskBrushStroke(alphaMask, width, height, cx, cy, radius, strength, mode, imageData = null) {
  if (!alphaMask) return;
  const r = Math.max(4, Math.round(radius));
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(height - 1, Math.ceil(cy + r));

  let B = null, F = null, fb = null, contrast = 0;
  const data = imageData?.data;
  if (mode === 'keep' && data && imageData.width === width) {
    // Sampled before this dab changes the mask.
    B = localMaskColor(data, alphaMask, width, height, cx, cy, r * 3, (a) => a <= 8)
      ?? localMaskColor(data, alphaMask, width, height, cx, cy, r * 10, (a) => a <= 8);
    F = localMaskColor(data, alphaMask, width, height, cx, cy, r * 4, (a) => a >= 247);
    if (B && F) {
      fb = [F[0] - B[0], F[1] - B[1], F[2] - B[2]];
      contrast = fb[0] * fb[0] + fb[1] * fb[1] + fb[2] * fb[2];
    }
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const falloff = Math.pow(1 - d2 / r2, 1.3) * Math.min(1, strength);
      const p = y * width + x;
      let target = mode === 'keep' ? 255 : 0;
      if (mode === 'keep' && B) {
        const i = p * 4;
        const ib = [data[i] - B[0], data[i + 1] - B[1], data[i + 2] - B[2]];
        let a;
        if (contrast >= 40 * 40) {
          // Position between background and subject colour = how opaque it really is.
          a = (ib[0] * fb[0] + ib[1] * fb[1] + ib[2] * fb[2]) / contrast;
          a = a * 1.15 + 0.03;
        } else {
          a = (Math.max(Math.abs(ib[0]), Math.abs(ib[1]), Math.abs(ib[2])) - 8) / 30;
        }
        target = Math.max(alphaMask[p], Math.round(Math.min(1, Math.max(0, a)) * 255));
      }
      alphaMask[p] = clamp(Math.round(alphaMask[p] + (target - alphaMask[p]) * falloff));
    }
  }
}


/**
 * Draw optional border frame, logo watermark, and text overlay onto target canvas.
 */
export function renderTextAndFrame(ctx, w, h, textConfig, frameConfig, logoConfig) {
  let textAnchor = null;
  if (frameConfig?.enabled && frameConfig.width > 0) {
    const fw = Math.min(Math.min(w, h) * 0.15, frameConfig.width * (Math.max(w, h) / 1000));
    const style = frameConfig.style || 'classic';
    ctx.save();
    if (style === 'polaroid') {
      const side = Math.min(fw, h / (3.4 * 3));
      const bottom = side * 3.4;
      ctx.fillStyle = frameConfig.color || '#ffffff';
      ctx.fillRect(0, 0, w, side);
      ctx.fillRect(0, 0, side, h);
      ctx.fillRect(w - side, 0, side, h);
      ctx.fillRect(0, h - bottom, w, bottom);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = Math.max(1, side * 0.06);
      ctx.strokeRect(side, side, w - side * 2, h - side - bottom);
    } else if (style === 'rounded') {
      const radius = Math.min(w, h) * 0.05;
      ctx.strokeStyle = frameConfig.color || '#ffffff';
      ctx.lineWidth = fw * 2;
      ctx.beginPath();
      ctx.roundRect(fw * 0.5, fw * 0.5, w - fw, h - fw, radius);
      ctx.stroke();
    } else {
      ctx.strokeStyle = frameConfig.color || '#ffffff';
      ctx.lineWidth = fw * 2;
      ctx.strokeRect(0, 0, w, h);
    }
    ctx.restore();
  }

  if (logoConfig?.enabled && logoConfig.img?.width > 0 && logoConfig.img.height > 0) {
    const img = logoConfig.img;
    const targetW = (Math.min(w, h) * (logoConfig.scale ?? 18)) / 100;
    const targetH = targetW * (img.height / img.width);
    const placement = fitOverlay(w, h, targetW, targetH, logoConfig.x ?? 84, logoConfig.y ?? 84);
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, (logoConfig.opacity ?? 90) / 100));
    ctx.drawImage(img, placement.x, placement.y, placement.width, placement.height);
    ctx.restore();
  }

  if (textConfig?.enabled && textConfig.content?.trim()) {
    ctx.save();
    const scaledSize = Math.max(12, Math.round(textConfig.fontSize * (Math.max(w, h) / 1000)));
    const weight = textConfig.bold === false ? '400' : '700';
    const italic = textConfig.italic ? 'italic ' : '';
    const family = textConfig.fontFamily || 'Inter, system-ui, sans-serif';
    ctx.font = `${italic}${weight} ${scaledSize}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, (textConfig.opacity ?? 85) / 100));
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = textConfig.color || '#ffffff';
    ctx.strokeStyle = textConfig.strokeColor || '#000000';
    ctx.lineWidth = Math.max(2, scaledSize * 0.08);
    ctx.lineJoin = 'round';

    const drawOne = (tx, ty) => {
      if (textConfig.strokeEnabled) {
        ctx.strokeText(textConfig.content, tx, ty);
      }
      ctx.fillText(textConfig.content, tx, ty);
    };

    if (textConfig.repeatWatermark) {
      ctx.rotate((-24 * Math.PI) / 180);
      const stepX = Math.max(scaledSize * 6, ctx.measureText(textConfig.content).width + scaledSize * 2);
      const stepY = scaledSize * 4;
      for (let yy = -h; yy < h * 2; yy += stepY) {
        for (let xx = -w; xx < w * 2; xx += stepX) {
          drawOne(xx, yy);
        }
      }
    } else {
      // Long captions wrap onto up to three balanced lines before shrinking.
      const margin = Math.min(w, h) * 0.025;
      const lines = wrapCaption(textConfig.content, (t) => ctx.measureText(t).width, w - margin * 2);
      const lineHeight = scaledSize * 1.25;
      const blockWidth = Math.max(...lines.map((t) => {
        const m = ctx.measureText(t);
        return Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight || 0);
      }));
      const blockHeight = lines.length === 1 ? scaledSize * 1.2 : lineHeight * lines.length;
      const fit = fitOverlay(w, h, blockWidth, blockHeight, textConfig.x ?? 50, textConfig.y ?? 90);
      const fitSize = scaledSize * fit.scale;
      ctx.font = `${italic}${weight} ${fitSize}px ${family}`;
      ctx.lineWidth = Math.min(Math.min(w, h) * 0.03, Math.max(2, fitSize * 0.08));
      const tx = fit.x + fit.width / 2;
      const ty = fit.y + fit.height / 2;
      const step = fit.height / lines.length;
      lines.forEach((line, k) => {
        const ly = fit.y + step * (k + 0.5);
        if (textConfig.strokeEnabled) ctx.strokeText(line, tx, ly);
        ctx.fillText(line, tx, ly);
      });
      textAnchor = { x: 100 * tx / w, y: 100 * ty / h };
    }
    ctx.restore();
  }
  return textAnchor;
}
