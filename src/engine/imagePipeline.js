export const DEFAULT_ADJUSTMENTS = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  sharpen: 0,
  vignette: 0,
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
};

export const DEFAULT_FRAME = {
  enabled: false,
  width: 24,
  color: '#ffffff',
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
      contrast: 18,
      highlights: -18,
      shadows: 16,
      temperature: 12,
      tint: -8,
      saturation: -14,
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

/**
 * Full pixel pipeline: Beauty (skin smooth/brighten/rosy) + Color Adjustments + Sharpen + Vignette.
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

  const expFactor = Math.pow(2, adjustments.exposure / 55);
  const contrastFactor = Math.pow((100 + adjustments.contrast) / 100, 2);
  const hlAmount = adjustments.highlights / 100;
  const shAmount = adjustments.shadows / 100;
  const tempShift = adjustments.temperature * 0.65;
  const tintShift = adjustments.tint * 0.5;
  const satFactor = 1 + adjustments.saturation / 100;
  const vibAmount = adjustments.vibrance / 100;

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
            // Edge preservation: strong edges (eyes, eyebrows, hair) are kept sharp
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

      // 2. Exposure
      if (adjustments.exposure !== 0) {
        r *= expFactor;
        g *= expFactor;
        b *= expFactor;
      }

      // 3. Temperature & Tint
      if (adjustments.temperature !== 0 || adjustments.tint !== 0) {
        r += tempShift + tintShift * 0.35;
        g -= tintShift;
        b -= tempShift - tintShift * 0.35;
      }

      // 4. Highlights & Shadows
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

      // 5. Contrast
      if (adjustments.contrast !== 0) {
        r = (r - 128) * contrastFactor + 128;
        g = (g - 128) * contrastFactor + 128;
        b = (b - 128) * contrastFactor + 128;
      }

      // 6. Saturation & Vibrance
      if (adjustments.saturation !== 0 || vibAmount !== 0) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let effSat = satFactor;
        if (vibAmount !== 0) {
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const curSat = maxC > 0 ? (maxC - minC) / maxC : 0;
          effSat += vibAmount * (1 - curSat);
        }
        r = lum + (r - lum) * effSat;
        g = lum + (g - lum) * effSat;
        b = lum + (b - lum) * effSat;
      }

      // 7. Vignette
      if (vigStrength > 0) {
        const nx = (x - halfW) / halfW;
        const dist2 = nx * nx + ny2;
        const vig = 1 - Math.min(0.85, Math.max(0, (dist2 - 0.35) * 0.55 * vigStrength));
        r *= vig;
        g *= vig;
        b *= vig;
      }

      out[i] = clamp(r);
      out[i + 1] = clamp(g);
      out[i + 2] = clamp(b);
      out[i + 3] = a;
    }
  }

  // 8. Sharpen (fast 3x3 unsharp mask)
  if (adjustments.sharpen > 0) {
    const amount = (adjustments.sharpen / 100) * 1.15;
    const copy = new Uint8ClampedArray(out);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        if (copy[i + 3] === 0) continue;
        const top = i - width * 4;
        const bot = i + width * 4;
        const left = i - 4;
        const right = i + 4;
        for (let c = 0; c < 3; c++) {
          const center = copy[i + c];
          const avg = (copy[top + c] + copy[bot + c] + copy[left + c] + copy[right + c]) * 0.25;
          out[i + c] = clamp(center + (center - avg) * amount);
        }
      }
    }
  }

  return new ImageData(out, width, height);
}

function sampleBilinear(data, width, height, x, y, outArr, outIdx) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  for (let c = 0; c < 4; c++) {
    outArr[outIdx + c] = data[i00 + c] * w00 + data[i10 + c] * w10 + data[i01 + c] * w01 + data[i11 + c] * w11;
  }
}

/**
 * Liquify warp stroke on working ImageData (in-place update via local snapshot).
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

  const snapshot = new Uint8ClampedArray(data);
  const str = strength * 0.55;
  const mvx = x1 - x0;
  const mvy = y1 - y0;

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
      sampleBilinear(snapshot, width, height, sx, sy, data, outIdx);
    }
  }
}

/**
 * Local skin smoothing / blemish healing / restore brush.
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

  const snapshot = new Uint8ClampedArray(data);
  const sampleStep = mode === 'heal' ? Math.max(2, Math.round(r * 0.35)) : Math.max(2, Math.round(r * 0.25));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;

      const i = (y * width + x) * 4;
      let sr = 0, sg = 0, sb = 0, count = 0;

      if (mode === 'heal') {
        // Sample clean ring outside the blemish center
        for (let a = 0; a < 8; a++) {
          const ang = (a * Math.PI) / 4;
          const sx = Math.min(width - 1, Math.max(0, Math.round(cx + Math.cos(ang) * r * 0.95 + dx * 0.25)));
          const sy = Math.min(height - 1, Math.max(0, Math.round(cy + Math.sin(ang) * r * 0.95 + dy * 0.25)));
          const si = (sy * width + sx) * 4;
          sr += snapshot[si];
          sg += snapshot[si + 1];
          sb += snapshot[si + 2];
          count++;
        }
      } else {
        // Edge-preserving local blur
        const cr = snapshot[i], cg = snapshot[i + 1], cb = snapshot[i + 2];
        for (let oy = -sampleStep; oy <= sampleStep; oy += Math.max(1, Math.floor(sampleStep / 2))) {
          for (let ox = -sampleStep; ox <= sampleStep; ox += Math.max(1, Math.floor(sampleStep / 2))) {
            const sx = Math.min(width - 1, Math.max(0, x + ox));
            const sy = Math.min(height - 1, Math.max(0, y + oy));
            const si = (sy * width + sx) * 4;
            const diff = Math.abs(snapshot[si] - cr) + Math.abs(snapshot[si + 1] - cg) + Math.abs(snapshot[si + 2] - cb);
            if (diff < 85) {
              sr += snapshot[si];
              sg += snapshot[si + 1];
              sb += snapshot[si + 2];
              count++;
            }
          }
        }
      }

      if (count > 0) {
        const ar = sr / count;
        const ag = sg / count;
        const ab = sb / count;
        const falloff = Math.pow(1 - d2 / r2, 1.4) * Math.min(0.92, strength * 0.65);
        data[i] = data[i] + (ar - data[i]) * falloff;
        data[i + 1] = data[i + 1] + (ag - data[i + 1]) * falloff;
        data[i + 2] = data[i + 2] + (ab - data[i + 2]) * falloff;
      }
    }
  }
}

/**
 * Composite foreground (with alpha mask) onto selected background mode.
 */
export function compositeWithBackground(fgCanvas, origCanvas, bgState) {
  const w = fgCanvas.width;
  const h = fgCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');

  if (bgState.mode === 'color') {
    ctx.fillStyle = bgState.color || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  } else if (bgState.mode === 'bokeh' && origCanvas) {
    ctx.save();
    ctx.filter = `blur(${bgState.blurAmount || 12}px)`;
    ctx.drawImage(origCanvas, -12, -12, w + 24, h + 24);
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
 * Draw optional text overlay and border frame onto target canvas.
 */
export function renderTextAndFrame(ctx, w, h, textConfig, frameConfig) {
  if (frameConfig?.enabled && frameConfig.width > 0) {
    const fw = Math.min(Math.min(w, h) * 0.15, frameConfig.width * (Math.max(w, h) / 1000));
    ctx.save();
    ctx.strokeStyle = frameConfig.color || '#ffffff';
    ctx.lineWidth = fw * 2;
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  }

  if (textConfig?.enabled && textConfig.content?.trim()) {
    ctx.save();
    const scaledSize = Math.max(12, Math.round(textConfig.fontSize * (Math.max(w, h) / 1000)));
    ctx.font = `600 ${scaledSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.max(0.05, Math.min(1, (textConfig.opacity ?? 85) / 100));
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = textConfig.color || '#ffffff';
    const tx = (w * (textConfig.x ?? 50)) / 100;
    const ty = (h * (textConfig.y ?? 90)) / 100;
    ctx.fillText(textConfig.content, tx, ty);
    ctx.restore();
  }
}

/**
 * Create a built-in studio sample portrait image so users can test immediately.
 */
export function createSamplePortraitDataUrl() {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1120;
  const ctx = c.getContext('2d');

  // Studio backdrop gradient
  const bg = ctx.createLinearGradient(0, 0, 900, 1120);
  bg.addColorStop(0, '#1e293b');
  bg.addColorStop(0.55, '#334155');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 900, 1120);

  // Soft studio rim light
  const glow = ctx.createRadialGradient(450, 420, 40, 450, 420, 460);
  glow.addColorStop(0, 'rgba(251, 191, 36, 0.25)');
  glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 900, 1120);

  // Shoulders / outfit
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(450, 1080, 320, 290, 0, Math.PI, 0);
  ctx.fill();

  // Neck
  ctx.fillStyle = '#e5b293';
  ctx.fillRect(390, 620, 120, 190);

  // Hair back
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(450, 430, 195, 245, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face
  const skinGrad = ctx.createRadialGradient(430, 410, 30, 450, 450, 190);
  skinGrad.addColorStop(0, '#f5cbb0');
  skinGrad.addColorStop(1, '#dca180');
  ctx.fillStyle = skinGrad;
  ctx.beginPath();
  ctx.ellipse(450, 450, 145, 190, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rosy cheeks
  ctx.fillStyle = 'rgba(244, 114, 182, 0.18)';
  ctx.beginPath();
  ctx.ellipse(370, 480, 36, 22, 0, 0, Math.PI * 2);
  ctx.ellipse(530, 480, 36, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrows
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(355, 392);
  ctx.quadraticCurveTo(390, 376, 422, 390);
  ctx.moveTo(478, 390);
  ctx.quadraticCurveTo(510, 376, 545, 392);
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(390, 422, 18, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(510, 422, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(395, 418, 4.5, 0, Math.PI * 2);
  ctx.arc(515, 418, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Nose subtle shadow
  ctx.strokeStyle = 'rgba(180, 110, 80, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(450, 428);
  ctx.lineTo(444, 492);
  ctx.quadraticCurveTo(450, 502, 460, 494);
  ctx.stroke();

  // Lips
  ctx.fillStyle = '#c85a62';
  ctx.beginPath();
  ctx.ellipse(450, 546, 36, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair bangs
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(450, 290, 175, 85, 0, Math.PI, 0);
  ctx.fill();

  return c.toDataURL('image/jpeg', 0.95);
}
