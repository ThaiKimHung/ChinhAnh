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

  // 3. Structure-first exemplar fill (Criminisi-style): patches are copied in
  // order of priority, so contours entering the hole are continued before
  // flat areas are filled.
  const srcMap = new Int32Array(rw * rh).fill(-1);
  exemplarFill(buf, origKnown, filled, dist, rw, rh, maskCount, srcMap);
  poissonBlend(buf, origKnown, srcMap, dist, layerOrder, rw, rh);

  // 4. Smooth minor joins on the rim while preserving contrasting edges.
  smoothRim(buf, dist, layerOrder, rw, rh);

  writeInpaintedPixels(data, buf, layerOrder, width, rw, rx0, ry0);
  return true;
}

const PATCH_R = 4; // 9×9 patches

function luminance(buf, p) {
  return 0.299 * buf[p * 3] + 0.587 * buf[p * 3 + 1] + 0.114 * buf[p * 3 + 2];
}

/** Isophote strength along the fill front: |∇I⊥ · n| / 255 (Criminisi data term). */
function dataTerm(buf, filled, rw, rh, x, y) {
  // Image gradient from filled neighbours (central differences where possible).
  let gx = 0, gy = 0, best = -1;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = x + ox, cy = y + oy;
      if (cx < 1 || cy < 1 || cx >= rw - 1 || cy >= rh - 1) continue;
      const c = cy * rw + cx;
      if (!filled[c - 1] || !filled[c + 1] || !filled[c - rw] || !filled[c + rw]) continue;
      const dx = (luminance(buf, c + 1) - luminance(buf, c - 1)) * 0.5;
      const dy = (luminance(buf, c + rw) - luminance(buf, c - rw)) * 0.5;
      const m = dx * dx + dy * dy;
      if (m > best) {
        best = m;
        gx = dx;
        gy = dy;
      }
    }
  }
  if (best <= 0) return 0;
  // Front normal from the filled-indicator gradient.
  const f = (cx, cy) => (cx < 0 || cy < 0 || cx >= rw || cy >= rh ? 1 : filled[cy * rw + cx]);
  let nx = f(x + 1, y) - f(x - 1, y);
  let ny = f(x, y + 1) - f(x, y - 1);
  const nl = Math.hypot(nx, ny);
  if (nl === 0) return 0;
  nx /= nl;
  ny /= nl;
  // Isophote is the gradient rotated by 90°.
  return Math.abs(-gy * nx + gx * ny) / 255;
}

function exemplarFill(buf, origKnown, filled, dist, rw, rh, maskCount, srcMap) {
  const P = PATCH_R;
  const conf = new Float32Array(rw * rh);
  for (let i = 0; i < conf.length; i++) conf[i] = origKnown[i] ? 1 : 0;

  // Valid source centres: the whole patch is original, visible pixels.
  const validSrc = new Uint8Array(rw * rh);
  let validCount = 0;
  const rowRun = new Int32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    let run = 0;
    for (let x = 0; x < rw; x++) {
      run = origKnown[y * rw + x] ? run + 1 : 0;
      rowRun[y * rw + x] = run;
    }
  }
  for (let y = P; y < rh - P; y++) {
    for (let x = P; x < rw - P; x++) {
      let ok = true;
      for (let oy = -P; oy <= P && ok; oy++) ok = rowRun[(y + oy) * rw + x + P] >= 2 * P + 1;
      if (ok) {
        validSrc[y * rw + x] = 1;
        validCount++;
      }
    }
  }
  const unknown = (i) => dist[i] > 0 && !filled[i];
  if (validCount === 0) {
    fillByDiffusion(buf, filled, dist, rw, rh);
    return;
  }

  const priority = new Float32Array(rw * rh);
  const isFront = new Uint8Array(rw * rh);
  let front = [];
  const computePriority = (i) => {
    const x = i % rw, y = (i - x) / rw;
    let c = 0, n = 0;
    for (let oy = -P; oy <= P; oy++) {
      const yy = y + oy;
      if (yy < 0 || yy >= rh) continue;
      for (let ox = -P; ox <= P; ox++) {
        const xx = x + ox;
        if (xx < 0 || xx >= rw) continue;
        const j = yy * rw + xx;
        if (dist[j] < 0) continue;
        n++;
        if (filled[j]) c += conf[j];
      }
    }
    const C = n ? c / n : 0;
    conf[i] = C;
    priority[i] = C * (dataTerm(buf, filled, rw, rh, x, y) + 0.001);
  };
  const updateFront = (i) => {
    if (!unknown(i)) {
      isFront[i] = 0;
      return;
    }
    const x = i % rw, y = (i - x) / rw;
    const edge = (x > 0 && filled[i - 1]) || (x < rw - 1 && filled[i + 1])
      || (y > 0 && filled[i - rw]) || (y < rh - 1 && filled[i + rw]);
    if (edge) {
      if (!isFront[i]) front.push(i);
      isFront[i] = 1;
      computePriority(i);
    } else {
      isFront[i] = 0;
    }
  };
  for (let i = 0; i < rw * rh; i++) if (unknown(i)) updateFront(i);

  // Search locally first (nearby texture matches best), widening if needed.
  const baseWindow = Math.max(24, Math.min(72, Math.round(Math.sqrt(maskCount) * 0.9)));
  const step = maskCount > 30000 ? 2 : 1;
  let remaining = 0;
  for (let i = 0; i < rw * rh; i++) if (unknown(i)) remaining++;
  let iterations = 0;

  while (remaining > 0 && iterations++ < 200000) {
    // Pick the highest-priority front pixel (compacting stale entries).
    let best = -1, bestP = -1, w = 0;
    for (let k = 0; k < front.length; k++) {
      const i = front[k];
      if (!isFront[i]) continue;
      front[w++] = i;
      if (priority[i] > bestP) {
        bestP = priority[i];
        best = i;
      }
    }
    front.length = w;
    if (best < 0) {
      for (let i = 0; i < rw * rh; i++) if (unknown(i)) updateFront(i);
      if (!front.length) break;
      continue;
    }
    const px = best % rw, py = (best - px) / rw;

    // Known pixels of the target patch drive the match.
    const offs = [];
    for (let oy = -P; oy <= P; oy++) {
      const ty = py + oy;
      if (ty < 0 || ty >= rh) continue;
      for (let ox = -P; ox <= P; ox++) {
        const tx = px + ox;
        if (tx < 0 || tx >= rw) continue;
        const t = ty * rw + tx;
        if (filled[t] && dist[t] >= 0) offs.push(ox, oy, t * 3, origKnown[t] ? 1.6 : 1);
      }
    }

    let bx = -1, by = -1, bestErr = Infinity;
    for (let win = baseWindow; bx < 0; win *= 2) {
      const x0 = Math.max(P, px - win), x1 = Math.min(rw - P - 1, px + win);
      const y0 = Math.max(P, py - win), y1 = Math.min(rh - P - 1, py + win);
      for (let cy = y0; cy <= y1; cy += step) {
        for (let cx = x0; cx <= x1; cx += step) {
          if (!validSrc[cy * rw + cx]) continue;
          let err = 0;
          for (let k = 0; k < offs.length; k += 4) {
            const s = ((cy + offs[k + 1]) * rw + cx + offs[k]) * 3;
            const t = offs[k + 2];
            const dr = buf[s] - buf[t], dg = buf[s + 1] - buf[t + 1], db = buf[s + 2] - buf[t + 2];
            err += offs[k + 3] * (dr * dr + dg * dg + db * db);
            if (err >= bestErr) break;
          }
          // Mild preference for nearby sources keeps texture scale and lighting local.
          err += ((cx - px) * (cx - px) + (cy - py) * (cy - py)) * 0.02 * offs.length;
          if (err < bestErr) {
            bestErr = err;
            bx = cx;
            by = cy;
          }
        }
      }
      if (win > Math.max(rw, rh)) break;
    }
    if (bx < 0) {
      fillByDiffusion(buf, filled, dist, rw, rh);
      return;
    }
    // Refine around the coarse match when searching with a stride.
    if (step > 1) {
      for (let cy = by - 1; cy <= by + 1; cy++) {
        for (let cx = bx - 1; cx <= bx + 1; cx++) {
          if (cy < P || cx < P || cy >= rh - P || cx >= rw - P || !validSrc[cy * rw + cx]) continue;
          let err = 0;
          for (let k = 0; k < offs.length; k += 4) {
            const s = ((cy + offs[k + 1]) * rw + cx + offs[k]) * 3;
            const t = offs[k + 2];
            const dr = buf[s] - buf[t], dg = buf[s + 1] - buf[t + 1], db = buf[s + 2] - buf[t + 2];
            err += offs[k + 3] * (dr * dr + dg * dg + db * db);
          }
          err += ((cx - px) * (cx - px) + (cy - py) * (cy - py)) * 0.02 * offs.length;
          if (err < bestErr) {
            bestErr = err;
            bx = cx;
            by = cy;
          }
        }
      }
    }

    // Copy the source patch into the unknown pixels of the target patch.
    const c = conf[best];
    for (let oy = -P; oy <= P; oy++) {
      const ty = py + oy;
      if (ty < 0 || ty >= rh) continue;
      for (let ox = -P; ox <= P; ox++) {
        const tx = px + ox;
        if (tx < 0 || tx >= rw) continue;
        const t = ty * rw + tx;
        if (!unknown(t)) continue;
        const sPix = (by + oy) * rw + bx + ox;
        const sIdx = sPix * 3;
        srcMap[t] = sPix;
        buf[t * 3] = buf[sIdx];
        buf[t * 3 + 1] = buf[sIdx + 1];
        buf[t * 3 + 2] = buf[sIdx + 2];
        filled[t] = 1;
        conf[t] = c;
        isFront[t] = 0;
        remaining--;
      }
    }
    // Refresh front membership and priorities around the patch.
    const R = 2 * P + 1;
    for (let yy = Math.max(0, py - R); yy <= Math.min(rh - 1, py + R); yy++) {
      for (let xx = Math.max(0, px - R); xx <= Math.min(rw - 1, px + R); xx++) {
        const i = yy * rw + xx;
        if (unknown(i)) updateFront(i);
      }
    }
  }
  if (remaining > 0) fillByDiffusion(buf, filled, dist, rw, rh);
}

/**
 * Gradient-domain clean-up: keeps the texture (gradients) of each copied patch
 * but removes brightness steps where neighbouring patches came from different
 * places, and where the fill meets the surrounding pixels.
 */
function poissonBlend(buf, origKnown, srcMap, dist, order, rw, rh) {
  const n = order.length;
  if (!n) return;
  const DIRS = [1, -1, rw, -rw];
  // Guidance gradient for each (pixel, direction): the same step at the patch source.
  const guide = new Float32Array(n * 4 * 3);
  const neighbor = new Int32Array(n * 4).fill(-1);
  for (let k = 0; k < n; k++) {
    const p = order[k];
    const x = p % rw;
    const s = srcMap[p];
    for (let d = 0; d < 4; d++) {
      const q = p + DIRS[d];
      if ((d === 0 && x === rw - 1) || (d === 1 && x === 0) || q < 0 || q >= rw * rh || dist[q] < 0) continue;
      // Across a patch seam (or onto the surrounding pixels), only even out small
      // tone steps; a large jump there is a contour and must stay sharp.
      const inPatch = s >= 0 && srcMap[q] === s + DIRS[d];
      if (!inPatch) {
        // Similar colours meeting at a seam should join without a step (zero gradient).
        if (colorDistance(buf, p * 3, q * 3) <= 24) neighbor[k * 4 + d] = q;
        continue;
      }
      // Inside a patch, keep the source's own gradient (its texture).
      const sq = s + DIRS[d];
      neighbor[k * 4 + d] = q;
      for (let c = 0; c < 3; c++) guide[(k * 4 + d) * 3 + c] = buf[s * 3 + c] - buf[sq * 3 + c];
    }
  }
  const before = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) before[k * 3 + c] = buf[order[k] * 3 + c];
  const iterations = Math.min(600, 60 + Math.round(Math.sqrt(n) * 2));
  const omega = 1.85;
  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < n; k++) {
      const p = order[k];
      let cnt = 0, r = 0, g = 0, b = 0;
      for (let d = 0; d < 4; d++) {
        const q = neighbor[k * 4 + d];
        if (q < 0) continue;
        const gi = (k * 4 + d) * 3;
        r += buf[q * 3] + guide[gi];
        g += buf[q * 3 + 1] + guide[gi + 1];
        b += buf[q * 3 + 2] + guide[gi + 2];
        cnt++;
      }
      if (!cnt) continue;
      buf[p * 3] += omega * (r / cnt - buf[p * 3]);
      buf[p * 3 + 1] += omega * (g / cnt - buf[p * 3 + 1]);
      buf[p * 3 + 2] += omega * (b / cnt - buf[p * 3 + 2]);
    }
  }
  // Keep only the low-frequency part of the correction: it evens out tone
  // steps between patches without smearing structure the patches got right.
  const corr = new Float32Array(rw * rh * 3);
  const inside = new Uint8Array(rw * rh);
  for (let k = 0; k < n; k++) {
    const p = order[k];
    inside[p] = 1;
    for (let c = 0; c < 3; c++) corr[p * 3 + c] = buf[p * 3 + c] - before[k * 3 + c];
  }
  const smooth = blurMasked(corr, inside, rw, rh, 6);
  for (let k = 0; k < n; k++) {
    const p = order[k];
    for (let c = 0; c < 3; c++) buf[p * 3 + c] = clamp(before[k * 3 + c] + smooth[p * 3 + c]);
  }
}

/** Box blur of a 3-channel field over `inside` pixels only (normalised by coverage). */
function blurMasked(field, inside, rw, rh, radius) {
  const tmp = new Float32Array(field.length);
  const tmpW = new Float32Array(rw * rh);
  const out = new Float32Array(field.length);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      let r = 0, g = 0, b = 0, w = 0;
      for (let k = Math.max(0, x - radius); k <= Math.min(rw - 1, x + radius); k++) {
        const j = y * rw + k;
        if (!inside[j]) continue;
        r += field[j * 3];
        g += field[j * 3 + 1];
        b += field[j * 3 + 2];
        w++;
      }
      const i = y * rw + x;
      tmp[i * 3] = r;
      tmp[i * 3 + 1] = g;
      tmp[i * 3 + 2] = b;
      tmpW[i] = w;
    }
  }
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = y * rw + x;
      if (!inside[i]) continue;
      let r = 0, g = 0, b = 0, w = 0;
      for (let k = Math.max(0, y - radius); k <= Math.min(rh - 1, y + radius); k++) {
        const j = k * rw + x;
        r += tmp[j * 3];
        g += tmp[j * 3 + 1];
        b += tmp[j * 3 + 2];
        w += tmpW[j];
      }
      if (w) {
        out[i * 3] = r / w;
        out[i * 3 + 1] = g / w;
        out[i * 3 + 2] = b / w;
      }
    }
  }
  return out;
}

/** Fallback: outer-to-inner averaging for pixels no patch could reach. */
function fillByDiffusion(buf, filled, dist, rw, rh) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < rw * rh; i++) {
      if (dist[i] <= 0 || filled[i]) continue;
      const x = i % rw, y = (i - x) / rw;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
        const j = ny * rw + nx;
        if (!filled[j] || dist[j] < 0) continue;
        r += buf[j * 3];
        g += buf[j * 3 + 1];
        b += buf[j * 3 + 2];
        n++;
      }
      if (n) {
        buf[i * 3] = r / n;
        buf[i * 3 + 1] = g / n;
        buf[i * 3 + 2] = b / n;
        filled[i] = 1;
        changed = true;
      }
    }
  }
}

function smoothRim(buf, dist, layerOrder, rw, rh) {
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
}

/** Per-channel median of visible pixels on a ring (radius r0..r1) around (cx, cy). */
function ringMedian(data, width, height, cx, cy, r0, r1) {
  const samples = [[], [], []];
  const count = Math.min(96, Math.max(24, Math.round(2 * Math.PI * r1 / 2)));
  for (const radius of [r0, (r0 + r1) / 2, r1]) {
    for (let k = 0; k < count; k++) {
      const a = (k * 2 * Math.PI) / count;
      const x = Math.round(cx + Math.cos(a) * radius);
      const y = Math.round(cy + Math.sin(a) * radius);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      for (let c = 0; c < 3; c++) samples[c].push(data[i + c]);
    }
  }
  if (samples[0].length < 8) return null;
  return samples.map((values) => {
    values.sort((a, b) => a - b);
    return values[values.length >> 1];
  });
}

/**
 * Clone Stamp brush: copies pixels from (x + offsetX, y + offsetY) to (x, y).
 * With `toneMatch`, the copy is shifted by the brightness/colour difference
 * between the surroundings of the source and of the destination (healing
 * clone), so a lighter or darker source does not leave a visible patch.
 */
export function applyCloneStampStroke(imageData, cx, cy, offsetX, offsetY, radius, strength, toneMatch = false) {
  const { width, height, data } = imageData;
  const r = Math.max(4, Math.round(radius));
  let tone = null;
  if (toneMatch) {
    const dst = ringMedian(data, width, height, cx, cy, r * 1.05, r * 1.4);
    const src = ringMedian(data, width, height, cx + offsetX, cy + offsetY, r * 1.05, r * 1.4);
    if (dst && src) tone = [dst[0] - src[0], dst[1] - src[1], dst[2] - src[2]];
  }
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
        const sourceValue = tone ? clamp(source[si + c] + tone[c]) : source[si + c];
        data[ti + c] = alpha ? (sourceValue * srcWeight + data[ti + c] * dstWeight) / alpha : 0;
      }
      data[ti + 3] = alpha;
    }
  }
}

/**
 * Grows a brush mask by `radius` pixels so the soft, anti-aliased rim of the
 * object being removed is included and does not leave a faint outline.
 */
export function dilateMask(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const r2 = radius * radius;
  const out = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      // Only pixels on the mask edge can grow it.
      const interior = x > 0 && y > 0 && x < width - 1 && y < height - 1
        && mask[y * width + x - 1] && mask[y * width + x + 1] && mask[(y - 1) * width + x] && mask[(y + 1) * width + x];
      if (interior) continue;
      for (let oy = -radius; oy <= radius; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= height) continue;
        for (let ox = -radius; ox <= radius; ox++) {
          const nx = x + ox;
          if (nx < 0 || nx >= width || ox * ox + oy * oy > r2) continue;
          out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
}
