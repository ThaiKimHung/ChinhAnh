// Liquify with a displacement field.
//
// Each dab updates a per-pixel "sample from" offset (fx, fy) and the affected
// area is re-rendered from the untouched base image with a single bilinear
// sample. Unlike warping the already-warped pixels again, many strokes do not
// accumulate blur, and a local Jacobian check stops bloat/pinch/push before
// the warp collapses (flat disc) or folds over itself.

// Limits on the local area change (Jacobian determinant). Bloat/pinch stop at
// ≈1.8× magnification / 2× shrink so they cannot collapse into a flat disc or a
// fan; push only needs to be kept from folding the image over itself.
const LIMITS = {
  bloat: [0.3, 4],
  pinch: [0.3, 4],
  push: [0.08, 12],
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createLiquifySession(imageData) {
  const { width, height, data } = imageData;
  return {
    width,
    height,
    base: new Uint8ClampedArray(data),
    fx: new Float32Array(width * height),
    fy: new Float32Array(width * height),
  };
}

function sampleField(field, width, height, x, y) {
  const bx = clamp(x, 0, width - 1);
  const by = clamp(y, 0, height - 1);
  const x0 = Math.floor(bx), y0 = Math.floor(by);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = bx - x0, ty = by - y0;
  const a = field[y0 * width + x0], b = field[y0 * width + x1];
  const c = field[y1 * width + x0], d = field[y1 * width + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Premultiplied bilinear sample so invisible pixels never tint a warped edge. */
function sampleImage(data, width, height, x, y, out, o) {
  const bx = clamp(x, 0, width - 1);
  const by = clamp(y, 0, height - 1);
  const x0 = Math.floor(bx), y0 = Math.floor(by);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = bx - x0, fy = by - y0;
  const i00 = (y0 * width + x0) * 4, i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4, i11 = (y1 * width + x1) * 4;
  const w00 = (1 - fx) * (1 - fy) * data[i00 + 3];
  const w10 = fx * (1 - fy) * data[i10 + 3];
  const w01 = (1 - fx) * fy * data[i01 + 3];
  const w11 = fx * fy * data[i11 + 3];
  const alpha = w00 + w10 + w01 + w11;
  out[o + 3] = alpha;
  for (let c = 0; c < 3; c++) {
    out[o + c] = alpha > 0 ? (data[i00 + c] * w00 + data[i10 + c] * w10 + data[i01 + c] * w01 + data[i11 + c] * w11) / alpha : 0;
  }
}

/**
 * Applies one dab ending at (x1, y1) — for push the stroke moved from (x0, y0) —
 * and re-renders the affected pixels of `target` (same size as the session).
 * Modes: 'push' | 'bloat' | 'pinch' | 'restore'.
 */
export function liquifyDab(session, target, x0, y0, x1, y1, radius, strength, mode) {
  const { width, height, fx, fy, base } = session;
  const r = Math.max(8, radius);
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(x1 - r)), maxX = Math.min(width - 1, Math.ceil(x1 + r));
  const minY = Math.max(0, Math.floor(y1 - r)), maxY = Math.min(height - 1, Math.ceil(y1 + r));
  if (minX > maxX || minY > maxY) return;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const nfx = new Float32Array(bw * bh);
  const nfy = new Float32Array(bw * bh);
  const str = strength * 0.55;
  const mvx = x1 - x0, mvy = y1 - y0;

  // Candidate field for this dab at `scale` × its normal strength, composed
  // with the existing field (new sample position = old sample position of p + offset).
  const build = (scale) => {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = (y - minY) * bw + (x - minX);
        const p = y * width + x;
        const dx = x - x1, dy = y - y1;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) {
          nfx[k] = fx[p];
          nfy[k] = fy[p];
          continue;
        }
        const t = 1 - d2 / r2;
        const falloff = t * t;
        if (mode === 'restore') {
          const keep = 1 - falloff * Math.min(1, strength * 0.6);
          nfx[k] = fx[p] * keep;
          nfy[k] = fy[p] * keep;
          continue;
        }
        let ox = 0, oy = 0;
        if (mode === 'push') {
          ox = -mvx * falloff * str;
          oy = -mvy * falloff * str;
        } else if (mode === 'bloat') {
          const sc = -falloff * str * 0.35;
          ox = dx * sc;
          oy = dy * sc;
        } else if (mode === 'pinch') {
          const sc = falloff * str * 0.38;
          ox = dx * sc;
          oy = dy * sc;
        }
        ox *= scale;
        oy *= scale;
        nfx[k] = ox + sampleField(fx, width, height, x + ox, y + oy);
        nfy[k] = oy + sampleField(fy, width, height, x + ox, y + oy);
      }
    }
  };

  // Smallest/largest local area change (Jacobian determinant) of the candidate.
  const detRange = () => {
    let lo = Infinity, hi = -Infinity;
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const k = (y - minY) * bw + (x - minX);
        const det = (1 + nfx[k + 1] - nfx[k]) * (1 + nfy[k + bw] - nfy[k]) - (nfx[k + bw] - nfx[k]) * (nfy[k + 1] - nfy[k]);
        if (det < lo) lo = det;
        if (det > hi) hi = det;
      }
    }
    return [lo, hi];
  };

  // 1–2. Take the whole dab at a uniform strength that keeps the warp within
  // limits, so it saturates smoothly instead of collapsing or folding.
  // Limits are relative to the current warp: a dab may not push the area past
  // MIN_DET/MAX_DET, but one that relaxes an already-strong warp is allowed.
  let curLo = 1, curHi = 1;
  if (mode !== 'restore') {
    build(0);
    [curLo, curHi] = detRange();
  }
  const [MIN_DET, MAX_DET] = LIMITS[mode] ?? LIMITS.push;
  const allowed = ([lo, hi]) => lo >= Math.min(MIN_DET, curLo) - 1e-4 && hi <= Math.max(MAX_DET, curHi) + 1e-4;
  let scale = 1;
  build(scale);
  if (mode !== 'restore' && !allowed(detRange())) {
    let ok = 0;
    let bad = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (ok + bad) / 2;
      build(mid);
      if (allowed(detRange())) ok = mid;
      else bad = mid;
    }
    scale = ok;
    build(scale);
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const k = (y - minY) * bw + (x - minX);
      const p = y * width + x;
      fx[p] = nfx[k];
      fy[p] = nfy[k];
    }
  }

  // 3. Render from the base image with one sample per pixel.
  const out = target.data;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = y * width + x;
      sampleImage(base, width, height, x + fx[p], y + fy[p], out, p * 4);
    }
  }
}
