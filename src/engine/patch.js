// "Cut & paste to cover": copy a rectangular region of the photo onto another
// spot, with feathered edges and optional tone matching so the pasted piece
// takes on the brightness/colour of where it lands.

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Clamps a selection rectangle (image pixels) to the image; null if too small. */
export function normalizeRect(rect, width, height) {
  if (!rect) return null;
  const x0 = Math.max(0, Math.round(Math.min(rect.x, rect.x + rect.w)));
  const y0 = Math.max(0, Math.round(Math.min(rect.y, rect.y + rect.h)));
  const x1 = Math.min(width, Math.round(Math.max(rect.x, rect.x + rect.w)));
  const y1 = Math.min(height, Math.round(Math.max(rect.y, rect.y + rect.h)));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Smooths a per-sample 3-channel series along an edge, filling gaps (null) from neighbours. */
function smoothEdge(values, radius) {
  const n = values.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const acc = [0, 0, 0];
    let count = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) {
      if (!values[k]) continue;
      acc[0] += values[k][0];
      acc[1] += values[k][1];
      acc[2] += values[k][2];
      count++;
    }
    out[i] = count ? acc.map((v) => v / count) : null;
  }
  // Fill any remaining gaps with the nearest known value, or zero.
  let last = null;
  for (let i = 0; i < n; i++) if (out[i]) last = out[i]; else out[i] = last;
  last = null;
  for (let i = n - 1; i >= 0; i--) if (out[i]) last = out[i]; else out[i] = last;
  return out.map((v) => v ?? [0, 0, 0]);
}

/**
 * Pastes the pixels of `rect` at an offset of (dx, dy).
 * - feather: width in pixels of the soft transition at the edges.
 * - toneMatch: shift the copy by the colour difference measured along its
 *   border (interpolated smoothly inside), like a healing patch.
 * - flip: mirror the copy horizontally.
 * Returns true when any pixel changed.
 */
export function pastePatch(imageData, rect, dx, dy, { feather = 8, toneMatch = true, flip = false } = {}) {
  const { width, height, data } = imageData;
  const r = normalizeRect(rect, width, height);
  if (!r) return false;
  const ox = Math.round(dx);
  const oy = Math.round(dy);
  const { w, h } = r;

  // Snapshot the source (the destination may overlap it).
  const src = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const si = ((r.y + j) * width + r.x + (flip ? w - 1 - i : i)) * 4;
      src.set(data.subarray(si, si + 4), (j * w + i) * 4);
    }
  }

  const destIndex = (i, j) => {
    const x = r.x + ox + i;
    const y = r.y + oy + j;
    return x < 0 || y < 0 || x >= width || y >= height ? -1 : (y * width + x) * 4;
  };
  const borderDiff = (i, j) => {
    const d = destIndex(i, j);
    const s = (j * w + i) * 4;
    if (d < 0 || data[d + 3] < 128 || src[s + 3] < 128) return null;
    return [data[d] - src[s], data[d + 1] - src[s + 1], data[d + 2] - src[s + 2]];
  };

  let top, bottom, left, right;
  if (toneMatch) {
    const radius = Math.max(2, Math.round(Math.min(w, h) / 12));
    const edges = [
      Array.from({ length: w }, (_, i) => borderDiff(i, 0)),
      Array.from({ length: w }, (_, i) => borderDiff(i, h - 1)),
      Array.from({ length: h }, (_, j) => borderDiff(0, j)),
      Array.from({ length: h }, (_, j) => borderDiff(w - 1, j)),
    ];
    // Whatever is being covered often pokes through the target's edge. Its
    // colour difference is far from the typical one, so drop it as an outlier
    // and let the clean part of the border decide the tone.
    // Background-to-background differences are mostly a brightness shift; a
    // difference with a strong hue component means the object is on the edge,
    // even when it covers most of the border.
    const hueShift = (d) => {
      const mean = (d[0] + d[1] + d[2]) / 3;
      return Math.max(Math.abs(d[0] - mean), Math.abs(d[1] - mean), Math.abs(d[2] - mean));
    };
    for (const edge of edges) {
      for (let k = 0; k < edge.length; k++) if (edge[k] && hueShift(edge[k]) > 16) edge[k] = null;
    }
    const all = edges.flat().filter(Boolean);
    if (!all.length) {
      for (const edge of edges) edge.fill([0, 0, 0]);
    } else {
      const median = [0, 1, 2].map((c) => {
        const values = all.map((d) => d[c]).sort((a, b) => a - b);
        return values[values.length >> 1];
      });
      for (const edge of edges) {
        for (let k = 0; k < edge.length; k++) {
          const d = edge[k];
          if (d && Math.max(Math.abs(d[0] - median[0]), Math.abs(d[1] - median[1]), Math.abs(d[2] - median[2])) > 22) {
            edge[k] = null;
          }
        }
        if (!edge.some(Boolean)) edge.fill(median);
      }
    }
    [top, bottom, left, right] = edges.map((edge) => smoothEdge(edge, radius));
  }

  const fw = Math.max(0, feather);
  let changed = false;
  for (let j = 0; j < h; j++) {
    const v = h > 1 ? j / (h - 1) : 0;
    for (let i = 0; i < w; i++) {
      const d = destIndex(i, j);
      if (d < 0) continue;
      const s = (j * w + i) * 4;
      if (src[s + 3] === 0) continue;
      const edgeDistance = Math.min(i, w - 1 - i, j, h - 1 - j);
      const coverage = fw > 0 ? smoothstep(0, fw, edgeDistance + 0.5) : 1;
      const sourceAlpha = src[s + 3] * coverage;
      const previousAlpha = data[d + 3];
      const destinationAlpha = previousAlpha * (1 - sourceAlpha / 255);
      const outputAlpha = sourceAlpha + destinationAlpha;
      data[d + 3] = outputAlpha;
      if (data[d + 3] === 0) continue;
      if (data[d + 3] !== previousAlpha) changed = true;
      // Store straight RGB after blending the premultiplied contributions.
      const sourceWeight = sourceAlpha / outputAlpha;
      const u = w > 1 ? i / (w - 1) : 0;
      for (let c = 0; c < 3; c++) {
        let correction = 0;
        if (toneMatch) {
          // Coons patch: blend of the four edge differences minus the bilinear corners.
          correction = (1 - v) * top[i][c] + v * bottom[i][c] + (1 - u) * left[j][c] + u * right[j][c]
            - ((1 - u) * (1 - v) * top[0][c] + u * (1 - v) * top[w - 1][c]
              + (1 - u) * v * bottom[0][c] + u * v * bottom[w - 1][c]);
        }
        const value = clamp255(src[s + c] + correction);
        const previous = data[d + c];
        data[d + c] = previous * (1 - sourceWeight) + value * sourceWeight;
        if (data[d + c] !== previous) changed = true;
      }
    }
  }
  return changed;
}
