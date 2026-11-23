/**
 * Client-side Object Removal (Exemplar Patch Inpainting + Clone Stamp)
 */

function clamp(v, min = 0, max = 255) {
  return v < min ? min : v > max ? max : v;
}

function colorDistance(buf, a, b) {
  return Math.max(Math.abs(buf[a] - buf[b]), Math.abs(buf[a + 1] - buf[b + 1]), Math.abs(buf[a + 2] - buf[b + 2]));
}

function fitColorPlane(samples) {
  if (samples.length < 16) return null;
  let sx = 0, sy = 0, xx = 0, yy = 0, xy = 0;
  const sum = [0, 0, 0];
  const crossX = [0, 0, 0];
  const crossY = [0, 0, 0];
  for (const [x, y, ...rgb] of samples) {
    sx += x;
    sy += y;
    xx += x * x;
    yy += y * y;
    xy += x * y;
    for (let c = 0; c < 3; c++) {
      sum[c] += rgb[c];
      crossX[c] += x * rgb[c];
      crossY[c] += y * rgb[c];
    }
  }
  const n = samples.length;
  xx -= sx * sx / n;
  yy -= sy * sy / n;
  xy -= sx * sy / n;
  const determinant = xx * yy - xy * xy;
  if (determinant <= 0.001 * xx * yy || determinant <= 0) return null;
  return sum.map((total, c) => {
    const vx = crossX[c] - sx * total / n;
    const vy = crossY[c] - sy * total / n;
    const dx = (yy * vx - xy * vy) / determinant;
    const dy = (xx * vy - xy * vx) / determinant;
    return [(total - sx * dx - sy * dy) / n, dx, dy];
  });
}

function planeError([x, y, ...rgb], plane) {
  return Math.max(...plane.map(([base, dx, dy], c) => Math.abs(rgb[c] - (base + dx * x + dy * y))));
}

function predictSmoothBackground(buf, known, width, height, order, bounds) {
  const [minX, minY, maxX, maxY] = bounds;
  const left = Math.max(0, minX - 12), top = Math.max(0, minY - 12);
  const right = Math.min(width - 1, maxX + 12), bottom = Math.min(height - 1, maxY + 12);
  const step = Math.max(1, Math.floor(Math.sqrt((right - left + 1) * (bottom - top + 1) / 1800)));
  const samples = [];
  for (let y = top; y <= bottom; y += step) {
    for (let x = left; x <= right; x += step) {
      const p = y * width + x;
      if (known[p]) samples.push([x, y, buf[p * 3], buf[p * 3 + 1], buf[p * 3 + 2]]);
    }
  }
  const initial = fitColorPlane(samples);
  if (!initial) return false;
  const ranked = samples.map((sample) => ({ sample, error: planeError(sample, initial) }));
  ranked.sort((a, b) => a.error - b.error);
  const core = Math.ceil(samples.length * 0.82);
  const plane = fitColorPlane(ranked.slice(0, core).map(({ sample }) => sample));
  if (!plane) return false;
  let support = 0;
  let errorSum = 0;
  for (const sample of samples) {
    const error = planeError(sample, plane);
    if (error <= 7) {
      support++;
      errorSum += error;
    }
  }
  if (support < samples.length * 0.82 || errorSum > support * 3) return false;

  for (const p of order) {
    const x = p % width, y = (p - x) / width;
    for (let c = 0; c < 3; c++) {
      const [base, dx, dy] = plane[c];
      buf[p * 3 + c] = clamp(base + dx * x + dy * y);
    }
  }
  return true;
}

function matchesTranslation(buf, known, width, height, dx, dy, step) {
  let pairs = 0;
  let outliers = 0;
  let totalError = 0;
  for (let p = 0; p < known.length; p += step) {
    if (!known[p]) continue;
    const x = p % width, y = (p - x) / width;
    const sx = x + dx, sy = y + dy;
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
    const source = sy * width + sx;
    if (!known[source]) continue;
    const error = colorDistance(buf, p * 3, source * 3);
    pairs++;
    totalError += error;
    if (error > 5) outliers++;
  }
  return pairs >= 32 && outliers <= pairs * 0.003 && totalError <= pairs;
}

function copyRepeatedTexture(buf, known, width, height, order) {
  if (order.length > 120000 || width < 3 || height < 3) return false;
  const translations = [[1, 1], [1, -1], [2, 1], [2, -1], [1, 2], [1, -2]];
  for (let spacing = 1; spacing <= 40; spacing++) {
    if (spacing <= width / 2) translations.push([spacing, 0]);
    if (spacing <= height / 2) translations.push([0, spacing]);
  }
  const stride = Math.max(1, Math.floor(known.length / 1600)) | 1;
  const confirmStride = Math.max(1, Math.floor(known.length / 30000));
  const maxSteps = Math.min(160, Math.floor(1000000 / order.length));
  const sources = new Int32Array(order.length);
  for (const [dx, dy] of translations) {
    if (!matchesTranslation(buf, known, width, height, dx, dy, stride)
      || !matchesTranslation(buf, known, width, height, dx, dy, confirmStride)) continue;
    let covered = 0;
    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      const x = p % width, y = (p - x) / width;
      let source = -1;
      for (let step = 1; step <= maxSteps; step++) {
        const ax = x + dx * step, ay = y + dy * step;
        const bx = x - dx * step, by = y - dy * step;
        const a = ax >= 0 && ax < width && ay >= 0 && ay < height;
        const b = bx >= 0 && bx < width && by >= 0 && by < height;
        if (!a && !b) break;
        if (a && known[ay * width + ax]) {
          source = ay * width + ax;
          break;
        }
        if (b && known[by * width + bx]) {
          source = by * width + bx;
          break;
        }
      }
      if (source < 0) break;
      sources[i] = source;
      covered++;
    }
    if (covered !== order.length) continue;
    for (let i = 0; i < order.length; i++) {
      const target = order[i] * 3, source = sources[i] * 3;
      buf[target] = buf[source];
      buf[target + 1] = buf[source + 1];
      buf[target + 2] = buf[source + 2];
    }
    return true;
  }
  return false;
}

function writeInpaintedPixels(data, buf, order, width, regionWidth, left, top) {
  for (const p of order) {
    const x = p % regionWidth, y = (p - x) / regionWidth;
    const to = ((top + y) * width + left + x) * 4;
    const from = p * 3;
    data[to] = buf[from];
    data[to + 1] = buf[from + 1];
    data[to + 2] = buf[from + 2];
  }
}

/**
 * Extend smooth surfaces and repeating textures from visible pixels, then
 * use local exemplar patches for other backgrounds.
 */
export function inpaintMaskedRegion(imageData, mask) {
  const { width, height, data } = imageData;
  if (mask.length !== width * height) return false;

  // 1. Find bounding box of mask
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let maskCount = 0;
  let visibleCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!data[p * 4 + 3]) continue;
      visibleCount++;
      if (mask[p] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        maskCount++;
      }
    }
  }
  if (maskCount === 0 || maskCount === visibleCount) return false;

  const pad = Math.min(96, Math.max(48, Math.round(Math.max(maxX - minX, maxY - minY) * 0.45)));
  const rx0 = Math.max(0, minX - pad);
  const ry0 = Math.max(0, minY - pad);
  const rx1 = Math.min(width - 1, maxX + pad);
  const ry1 = Math.min(height - 1, maxY + pad);
  const rw = rx1 - rx0 + 1;
  const rh = ry1 - ry0 + 1;
  if (rw * rh > 4_000_000) return false;

  const origKnown = new Uint8Array(rw * rh);
  const filled = new Uint8Array(rw * rh);
  const dist = new Int32Array(rw * rh);
  dist.fill(-1);

  const buf = new Float32Array(rw * rh * 3);
  const queue = new Int32Array(rw * rh);
  let qHead = 0, qTail = 0;

  for (let y = 0; y < rh; y++) {
    const gy = ry0 + y;
    for (let x = 0; x < rw; x++) {
      const gx = rx0 + x;
      const li = y * rw + x;
      const gi = gy * width + gx;
      if (!data[gi * 4 + 3]) {
        dist[li] = -2;
        continue;
      }
      const isMasked = mask[gi] > 0;
      if (!isMasked) {
        origKnown[li] = 1;
        filled[li] = 1;
        dist[li] = 0;
        queue[qTail++] = li;
      }
      buf[li * 3] = data[gi * 4];
      buf[li * 3 + 1] = data[gi * 4 + 1];
      buf[li * 3 + 2] = data[gi * 4 + 2];
    }
  }
  if (qTail === 0) return false;

  // 2. BFS onion-peel distance from unmasked boundary
  const layerOrder = [];
  const dx4 = [1, -1, 0, 0];
  const dy4 = [0, 0, 1, -1];
  while (qHead < qTail) {
    const li = queue[qHead++];
    const x = li % rw;
    const y = (li - x) / rw;
    const d = dist[li];
    for (let k = 0; k < 4; k++) {
      const nx = x + dx4[k];
      const ny = y + dy4[k];
      if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
      const nli = ny * rw + nx;
      if (dist[nli] === -1) {
        dist[nli] = d + 1;
        queue[qTail++] = nli;
        layerOrder.push(nli);
      }
    }
  }
  if (layerOrder.length !== maskCount) return false;

  if (predictSmoothBackground(buf, origKnown, rw, rh, layerOrder, [minX - rx0, minY - ry0, maxX - rx0, maxY - ry0])
    || copyRepeatedTexture(buf, origKnown, rw, rh, layerOrder)) {
    writeInpaintedPixels(data, buf, layerOrder, width, rw, rx0, ry0);
    return true;
  }

  // 3. Initial smooth structure fill from neighbors (outer-to-inner)
  const initFilled = new Uint8Array(origKnown);
  for (let idx = 0; idx < layerOrder.length; idx++) {
    const li = layerOrder[idx];
    const x = li % rw;
    const y = (li - x) / rw;
    let sr = 0, sg = 0, sb = 0, wsum = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
        const nli = ny * rw + nx;
        if (initFilled[nli]) {
          const w = ox === 0 || oy === 0 ? 1.0 : 0.7;
          sr += buf[nli * 3] * w;
          sg += buf[nli * 3 + 1] * w;
          sb += buf[nli * 3 + 2] * w;
          wsum += w;
        }
      }
    }
    if (wsum > 0) {
      buf[li * 3] = sr / wsum;
      buf[li * 3 + 1] = sg / wsum;
      buf[li * 3 + 2] = sb / wsum;
      initFilled[li] = 1;
    }
  }

  // 4. Pre-mark valid candidate patch centers (entire 7x7 must be unmasked)
  const patchR = 3;
  const stampR = maskCount > 15000 ? 2 : 1; // 5x5 stamp for huge masks, 3x3 for crisp detail
  const validSrc = new Uint8Array(rw * rh);
  for (let y = patchR; y < rh - patchR; y++) {
    for (let x = patchR; x < rw - patchR; x++) {
      let ok = true;
      for (let oy = -patchR; oy <= patchR && ok; oy++) {
        const row = (y + oy) * rw + x;
        for (let ox = -patchR; ox <= patchR; ox++) {
          if (!origKnown[row + ox]) {
            ok = false;
            break;
          }
        }
      }
      if (ok) validSrc[y * rw + x] = 1;
    }
  }

  // Collect candidate pool sampled sparsely for speed
  const candStep = rw * rh > 160000 ? 4 : 3;
  const candidates = [];
  for (let y = patchR; y < rh - patchR; y += candStep) {
    for (let x = patchR; x < rw - patchR; x += candStep) {
      if (validSrc[y * rw + x]) {
        candidates.push({ x, y });
      }
    }
  }

  // 5. Exemplar patch synthesis from boundary inward
  if (candidates.length > 0) {
    const maxLocalCand = Math.min(140, Math.max(12, Math.floor(1_500_000 / maskCount)));
    for (let idx = 0; idx < layerOrder.length; idx++) {
      const li = layerOrder[idx];
      if (filled[li]) continue;

      const px = li % rw;
      const py = (li - px) / rw;

      // Collect nearby known pixels inside 7x7 around (px, py) for SSD comparison
      const offsets = [];
      for (let oy = -patchR; oy <= patchR; oy++) {
        const ny = py + oy;
        if (ny < 0 || ny >= rh) continue;
        for (let ox = -patchR; ox <= patchR; ox++) {
          const nx = px + ox;
          if (nx < 0 || nx >= rw) continue;
          const nli = ny * rw + nx;
          if (filled[nli]) {
            offsets.push([ox, oy, nli * 3, origKnown[nli] ? 2 : 1]);
          }
        }
      }

      if (offsets.length === 0) {
        filled[li] = 1;
        continue;
      }

      // Filter candidates to a reasonable local radius first
      let bestX = -1;
      let bestY = -1;
      let bestErr = Infinity;
      const searchR2 = pad * pad;
      let checked = 0;

      // Deterministic pseudo-random start offset so texture doesn't repeat in stripes
      const start = (idx * 2654435761) >>> 0;
      const totalC = candidates.length;
      const stride = totalC > maxLocalCand ? Math.floor(totalC / maxLocalCand) : 1;

      for (let c = 0; c < totalC && checked < maxLocalCand; c += stride) {
        const cand = candidates[(start + c) % totalC];
        const ddx = cand.x - px;
        const ddy = cand.y - py;
        if (ddx * ddx + ddy * ddy > searchR2 && checked > 15) continue;
        checked++;
        let error = 0;
        for (const [ox, oy, target, weight] of offsets) {
          const source = ((cand.y + oy) * rw + cand.x + ox) * 3;
          const dr = buf[source] - buf[target];
          const dg = buf[source + 1] - buf[target + 1];
          const db = buf[source + 2] - buf[target + 2];
          error += weight * (dr * dr + dg * dg + db * db);
          if (error >= bestErr) break;
        }
        if (error < bestErr) {
          bestErr = error;
          bestX = cand.x;
          bestY = cand.y;
        }
      }

      // Fallback to any candidate if local search missed
      if (bestX === -1) {
        const cand = candidates[start % totalC];
        bestX = cand.x;
        bestY = cand.y;
      }

      // Stamp patch block into unfilled pixels
      for (let oy = -stampR; oy <= stampR; oy++) {
        const ty = py + oy;
        const sy = bestY + oy;
        if (ty < 0 || ty >= rh || sy < 0 || sy >= rh) continue;
        for (let ox = -stampR; ox <= stampR; ox++) {
          const tx = px + ox;
          const sx = bestX + ox;
          if (tx < 0 || tx >= rw || sx < 0 || sx >= rw) continue;
          const tli = ty * rw + tx;
          if (dist[tli] <= 0) continue;
          const sIdx = (sy * rw + sx) * 3;
          if (!filled[tli]) {
            buf[tli * 3] = buf[sIdx];
            buf[tli * 3 + 1] = buf[sIdx + 1];
            buf[tli * 3 + 2] = buf[sIdx + 2];
            filled[tli] = 1;
          } else {
            // Soft blend on overlap
            buf[tli * 3] = buf[tli * 3] * 0.65 + buf[sIdx] * 0.35;
            buf[tli * 3 + 1] = buf[tli * 3 + 1] * 0.65 + buf[sIdx + 1] * 0.35;
            buf[tli * 3 + 2] = buf[tli * 3 + 2] * 0.65 + buf[sIdx + 2] * 0.35;
          }
        }
      }
    }
  }

  // 6. Smooth minor joins on the rim while preserving contrasting edges.
  let rimLength = 0;
  while (rimLength < layerOrder.length && dist[layerOrder[rimLength]] <= 2) rimLength++;
  const rim = new Float32Array(rimLength * 3);
  for (let idx = 0; idx < rimLength; idx++) {
    const li = layerOrder[idx];
    const x = li % rw;
    const y = (li - x) / rw;
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
        const nIdx = (ny * rw + nx) * 3;
        if (dist[ny * rw + nx] < 0 || colorDistance(buf, li * 3, nIdx) > 28) continue;
        sr += buf[nIdx];
        sg += buf[nIdx + 1];
        sb += buf[nIdx + 2];
        cnt++;
      }
    }
    rim[idx * 3] = buf[li * 3] * 0.55 + (sr / cnt) * 0.45;
    rim[idx * 3 + 1] = buf[li * 3 + 1] * 0.55 + (sg / cnt) * 0.45;
    rim[idx * 3 + 2] = buf[li * 3 + 2] * 0.55 + (sb / cnt) * 0.45;
  }
  for (let idx = 0; idx < rimLength; idx++) {
    const li = layerOrder[idx];
    buf[li * 3] = rim[idx * 3];
    buf[li * 3 + 1] = rim[idx * 3 + 1];
    buf[li * 3 + 2] = rim[idx * 3 + 2];
  }

  writeInpaintedPixels(data, buf, layerOrder, width, rw, rx0, ry0);
  return true;
}

/**
 * Clone Stamp brush: copies clean pixels from (srcX, srcY) offset to (cx, cy).
 */
export function applyCloneStampStroke(imageData, cx, cy, offsetX, offsetY, radius, strength) {
  const { width, height, data } = imageData;
  const r = Math.max(4, Math.round(radius));
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(height - 1, Math.ceil(cy + r));

  // Snapshot only the destination bounding box so brush moves stay fast on large images
  const roiW = maxX - minX + 1;
  const roiH = maxY - minY + 1;
  const dstSnap = new Uint8ClampedArray(roiW * roiH * 4);
  for (let y = minY; y <= maxY; y++) {
    const srcStart = (y * width + minX) * 4;
    const dstStart = (y - minY) * roiW * 4;
    dstSnap.set(data.subarray(srcStart, srcStart + roiW * 4), dstStart);
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;

      const sx = Math.round(x + offsetX);
      const sy = Math.round(y + offsetY);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

      const falloff = Math.pow(1 - d2 / r2, 1.5) * Math.min(1, strength);
      const ti = (y * width + x) * 4;

      // Snapshot overlapping samples and interpolate premultiplied channels.
      const overlap = sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
      const source = overlap ? dstSnap : data;
      const si = overlap ? ((sy - minY) * roiW + sx - minX) * 4 : (sy * width + sx) * 4;
      const srcWeight = source[si + 3] * falloff;
      const dstWeight = data[ti + 3] * (1 - falloff);
      const alpha = srcWeight + dstWeight;
      for (let c = 0; c < 3; c++) {
        data[ti + c] = alpha ? (source[si + c] * srcWeight + data[ti + c] * dstWeight) / alpha : 0;
      }
      data[ti + 3] = alpha;
    }
  }
}
