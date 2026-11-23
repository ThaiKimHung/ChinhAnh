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
  x: 84,
  y: 84,
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
      temperature: 28,
      tint: 4,
      vibrance: 20,
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
      temperature: -24,
      tint: 10,
      vibrance: 15,
      vignette: 22,
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
 * Fast skin-tone probability (0..1) in RGB using YCbCr bounds.
 */
function getSkinWeight(r, g, b) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (cb < 72 || cb > 132 || cr < 130 || cr > 178) return 0;
  const cbDist = Math.abs(cb - 102) / 30;
  const crDist = Math.abs(cr - 152) / 26;
  const w = 1 - Math.max(cbDist, crDist);
  return w > 0 ? Math.min(1, w * 1.35) : 0;
}

/**
 * Separable box blur on RGBA buffer for fast surface smoothing.
 */
function boxBlurRGBA(data, width, height, radius) {
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
      sr += data[idx];
      sg += data[idx + 1];
      sb += data[idx + 2];
      sa += data[idx + 3];
    }
    for (let x = 0; x < width; x++) {
      const outIdx = rowOffset + x * 4;
      temp[outIdx] = sr / div;
      temp[outIdx + 1] = sg / div;
      temp[outIdx + 2] = sb / div;
      temp[outIdx + 3] = sa / div;

      const xRemove = Math.max(0, x - r);
      const xAdd = Math.min(width - 1, x + r + 1);
      const iRem = rowOffset + xRemove * 4;
      const iAdd = rowOffset + xAdd * 4;
      sr += data[iAdd] - data[iRem];
      sg += data[iAdd + 1] - data[iRem + 1];
      sb += data[iAdd + 2] - data[iRem + 2];
      sa += data[iAdd + 3] - data[iRem + 3];
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let i = -r; i <= r; i++) {
      const cy = Math.min(height - 1, Math.max(0, i));
      const idx = (cy * width + x) * 4;
      sr += temp[idx];
      sg += temp[idx + 1];
      sb += temp[idx + 2];
      sa += temp[idx + 3];
    }
    for (let y = 0; y < height; y++) {
      const outIdx = (y * width + x) * 4;
      out[outIdx] = sr / div;
      out[outIdx + 1] = sg / div;
      out[outIdx + 2] = sb / div;
      out[outIdx + 3] = sa / div;

      const yRemove = Math.max(0, y - r);
      const yAdd = Math.min(height - 1, y + r + 1);
      const iRem = (yRemove * width + x) * 4;
      const iAdd = (yAdd * width + x) * 4;
      sr += temp[iAdd] - temp[iRem];
      sg += temp[iAdd + 1] - temp[iRem + 1];
      sb += temp[iAdd + 2] - temp[iRem + 2];
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
export function processImagePipeline(srcImageData, adjustments, beauty) {
  const { width, height, data: src } = srcImageData;
  const out = new Uint8ClampedArray(src.length);

  const hasBeauty = beauty.skinSmooth > 0 || beauty.skinBrighten > 0 || beauty.skinRosy > 0;
  let blurred = null;
  if (beauty.skinSmooth > 0) {
    const blurRadius = Math.max(2, Math.round((Math.min(width, height) / 360) * (2 + beauty.skinSmooth * 0.06)));
    blurred = boxBlurRGBA(src, width, height, blurRadius);
  }

  const clarityVal = adjustments.clarity || 0;
  let clarityBlur = null;
  if (clarityVal !== 0) {
    const cRadius = Math.max(3, Math.round(Math.min(width, height) / 140));
    clarityBlur = boxBlurRGBA(src, width, height, cRadius);
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
        const skinW = getSkinWeight(r, g, b);
        if (skinW > 0.02) {
          if (blurred) {
            const br = blurred[i];
            const bg = blurred[i + 1];
            const bb = blurred[i + 2];
            const diff = (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb)) / 3;
            const edgeKeep = Math.exp(-(diff * diff) / 380);
            const blend = smoothStrength * skinW * edgeKeep * 0.85;
            r = r + (br - r) * blend;
            g = g + (bg - g) * blend;
            b = b + (bb - b) * blend;
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
      if (clarityBlur) {
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
        const hash = (((x * 374761393 + y * 668265263) ^ 0x5bf03635) >>> 0) % 256;
        const noise = (hash / 255 - 0.5) * grainAmount;
        r += noise;
        g += noise;
        b += noise;
      }

      out[i] = clamp(r);
      out[i + 1] = clamp(g);
      out[i + 2] = clamp(b);
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

function sampleBilinear(data, width, height, x, y, outArr, outIdx) {
  const boundedX = clamp(x, 0, width - 1);
  const boundedY = clamp(y, 0, height - 1);
  const x0 = Math.floor(boundedX);
  const y0 = Math.floor(boundedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = boundedX - x0;
  const fy = boundedY - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  // Interpolate premultiplied color so invisible pixels cannot tint a warped edge.
  const w00 = (1 - fx) * (1 - fy) * data[i00 + 3];
  const w10 = fx * (1 - fy) * data[i10 + 3];
  const w01 = (1 - fx) * fy * data[i01 + 3];
  const w11 = fx * fy * data[i11 + 3];
  const alpha = w00 + w10 + w01 + w11;
  outArr[outIdx + 3] = alpha;
  for (let c = 0; c < 3; c++) {
    outArr[outIdx + c] = alpha > 0
      ? (data[i00 + c] * w00 + data[i10 + c] * w10 + data[i01 + c] * w01 + data[i11 + c] * w11) / alpha
      : 0;
  }
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

  const str = strength * 0.55;
  const mvx = x1 - x0;
  const mvy = y1 - y0;
  const padX = mode === 'push' ? Math.ceil(Math.abs(mvx) * str) + 3 : 3;
  const padY = mode === 'push' ? Math.ceil(Math.abs(mvy) * str) + 3 : 3;
  const snapMinX = Math.max(0, minX - padX);
  const snapMaxX = Math.min(width - 1, maxX + padX);
  const snapMinY = Math.max(0, minY - padY);
  const snapMaxY = Math.min(height - 1, maxY + padY);
  const { roi, rw, rh, ox, oy } = copyROI(data, width, height, snapMinX, snapMinY, snapMaxX, snapMaxY);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - x1;
      const dy = y - y1;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;

      const t = 1 - d2 / r2;
      const falloff = t * t;
      let sx = x;
      let sy = y;

      if (mode === 'push') {
        sx = x - mvx * falloff * str;
        sy = y - mvy * falloff * str;
      } else if (mode === 'bloat') {
        const scale = 1 - falloff * str * 0.35;
        sx = x1 + dx * scale;
        sy = y1 + dy * scale;
      } else if (mode === 'pinch') {
        const scale = 1 + falloff * str * 0.38;
        sx = x1 + dx * scale;
        sy = y1 + dy * scale;
      }

      const outIdx = (y * width + x) * 4;
      sampleBilinear(roi, rw, rh, sx - ox, sy - oy, data, outIdx);
    }
  }
}

/**
 * Local skin smoothing / blemish healing / restore brush (local ROI snapshot).
 */
export function applySkinBrushStroke(imageData, origImageData, cx, cy, radius, strength, mode) {
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
  const { roi, rw, rh, ox, oy } = copyROI(data, width, height, snapMinX, snapMinY, snapMaxX, snapMaxY);
  const healOffsets = mode === 'heal' ? Array.from({ length: 8 }, (_, direction) => {
    const angle = (direction * Math.PI) / 4;
    return [Math.cos(angle) * r * 0.95, Math.sin(angle) * r * 0.95];
  }) : null;

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
        // Where the ring crosses a contour, use only the destination's color group.
        if (Math.max(maxRed - minRed, maxGreen - minGreen, maxBlue - minBlue) > 42) {
          sr = matchRed;
          sg = matchGreen;
          sb = matchBlue;
          weight = matchWeight;
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

  // Exposure: push median toward ~128 gently
  const exposure = Math.round(clamp((128 - p50) * 0.35, -30, 35));
  // Contrast: expand narrow dynamic range
  const range = Math.max(40, p95 - p05);
  const contrast = Math.round(clamp(((210 - range) / 210) * 38, -10, 26));
  const shadows = p05 < 25 ? Math.round(clamp((30 - p05) * 0.9, 0, 28)) : 0;
  const highlights = p95 > 235 ? Math.round(clamp((230 - p95) * 0.9, -28, 0)) : 0;

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

/**
 * Rotate canvas by an arbitrary straighten angle (-45..+45 deg) and crop to the largest inscribed rectangle.
 */
export function straightenCanvas(src, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const w = src.width;
  const h = src.height;

  // Largest axis-aligned rectangle of the same aspect ratio inside rotated image
  const wr = w * cos + h * sin;
  const hr = w * sin + h * cos;
  const scale = Math.max(wr / w, hr / h);
  const cropW = Math.max(20, Math.round(w / scale));
  const cropH = Math.max(20, Math.round(h / scale));

  const dst = document.createElement('canvas');
  dst.width = cropW;
  dst.height = cropH;
  const ctx = dst.getContext('2d');
  ctx.translate(cropW / 2, cropH / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -w / 2, -h / 2);
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
 * Refine AI cutout alpha mask in-place with a soft circular brush ('keep' -> 255, 'erase' -> 0).
 */
export function applyAlphaMaskBrushStroke(alphaMask, width, height, cx, cy, radius, strength, mode) {
  if (!alphaMask) return;
  const r = Math.max(4, Math.round(radius));
  const r2 = r * r;
  const target = mode === 'keep' ? 255 : 0;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(height - 1, Math.ceil(cy + r));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const falloff = Math.pow(1 - d2 / r2, 1.3) * Math.min(1, strength);
      const p = y * width + x;
      alphaMask[p] = clamp(Math.round(alphaMask[p] + (target - alphaMask[p]) * falloff));
    }
  }
}

/**
 * Tile the edited portrait onto a 1800x1200 px (4x6 inch @ 300 DPI) printable ID photo sheet.
 */
export function generateIdPhotoSheetCanvas(sourceCanvas, cols = 4, rows = 2) {
  const sheetW = 1800;
  const sheetH = 1200;
  const margin = 60;
  const gap = 26;
  const cellW = Math.floor((sheetW - margin * 2 - gap * (cols - 1)) / cols);
  const cellH = Math.floor((sheetH - margin * 2 - gap * (rows - 1)) / rows);

  const out = document.createElement('canvas');
  out.width = sheetW;
  out.height = sheetH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheetW, sheetH);

  const srcRatio = sourceCanvas.width / sourceCanvas.height;
  const cellRatio = cellW / cellH;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = margin + c * (cellW + gap);
      const dy = margin + r * (cellH + gap);

      // Center-crop source to fill cell cleanly
      let sx = 0, sy = 0, sw = sourceCanvas.width, sh = sourceCanvas.height;
      if (srcRatio > cellRatio) {
        sw = Math.round(sourceCanvas.height * cellRatio);
        sx = Math.round((sourceCanvas.width - sw) / 2);
      } else {
        sh = Math.round(sourceCanvas.width / cellRatio);
        sy = Math.round((sourceCanvas.height - sh) / 2);
      }

      ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, cellW, cellH);

      // Thin light-gray cut guide border
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, cellW, cellH);
    }
  }
  return out;
}

/**
 * Draw optional border frame, logo watermark, and text overlay onto target canvas.
 */
export function renderTextAndFrame(ctx, w, h, textConfig, frameConfig, logoConfig) {
  if (frameConfig?.enabled && frameConfig.width > 0) {
    const fw = Math.min(Math.min(w, h) * 0.15, frameConfig.width * (Math.max(w, h) / 1000));
    const style = frameConfig.style || 'classic';
    ctx.save();
    if (style === 'polaroid') {
      const side = fw;
      const bottom = fw * 3.4;
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

  if (logoConfig?.enabled && logoConfig.img) {
    const img = logoConfig.img;
    const targetW = (Math.min(w, h) * (logoConfig.scale ?? 18)) / 100;
    const targetH = targetW * (img.height / img.width);
    const lx = (w * (logoConfig.x ?? 84)) / 100 - targetW / 2;
    const ly = (h * (logoConfig.y ?? 84)) / 100 - targetH / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, (logoConfig.opacity ?? 90) / 100));
    ctx.drawImage(img, lx, ly, targetW, targetH);
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
      const tx = (w * (textConfig.x ?? 50)) / 100;
      const ty = (h * (textConfig.y ?? 90)) / 100;
      drawOne(tx, ty);
    }
    ctx.restore();
  }
}
