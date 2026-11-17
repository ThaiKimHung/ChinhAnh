/**
 * Client-side Object Removal (Exemplar Patch Inpainting + Clone Stamp)
 */

function clamp(v, min = 0, max = 255) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Inpaint masked region (mask[p] > 0) using onion-peel structure init
 * followed by local exemplar patch synthesis so textures (grass, wall, sky) stay natural.
 */
export function inpaintMaskedRegion(imageData, mask) {
  const { width, height, data } = imageData;

  // 1. Find bounding box of mask
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let maskCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        maskCount++;
      }
    }
  }
  if (maskCount === 0) return false;

  const pad = Math.min(96, Math.max(48, Math.round(Math.max(maxX - minX, maxY - minY) * 0.45)));
  const rx0 = Math.max(0, minX - pad);
  const ry0 = Math.max(0, minY - pad);
  const rx1 = Math.min(width - 1, maxX + pad);
  const ry1 = Math.min(height - 1, maxY + pad);
  const rw = rx1 - rx0 + 1;
  const rh = ry1 - ry0 + 1;

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
    const maxLocalCand = 140;
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
            offsets.push([ox, oy, buf[nli * 3], buf[nli * 3 + 1], buf[nli * 3 + 2]]);
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

        let err = 0;
        for (let k = 0; k < offsets.length; k++) {
          const [ox, oy, tr, tg, tb] = offsets[k];
          const qIdx = ((cand.y + oy) * rw + (cand.x + ox)) * 3;
          const dr = buf[qIdx] - tr;
          const dg = buf[qIdx + 1] - tg;
          const db = buf[qIdx + 2] - tb;
          err += dr * dr + dg * dg + db * db;
          if (err >= bestErr) break;
        }
        if (err < bestErr) {
          bestErr = err;
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
          if (origKnown[tli]) continue;
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

  // 6. Gentle seam smoothing on the outer mask rim (dist <= 2)
  const copy = new Float32Array(buf);
  for (let idx = 0; idx < layerOrder.length; idx++) {
    const li = layerOrder[idx];
    if (dist[li] > 2) break;
    const x = li % rw;
    const y = (li - x) / rw;
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
        const nIdx = (ny * rw + nx) * 3;
        sr += copy[nIdx];
        sg += copy[nIdx + 1];
        sb += copy[nIdx + 2];
        cnt++;
      }
    }
    if (cnt > 0) {
      buf[li * 3] = buf[li * 3] * 0.45 + (sr / cnt) * 0.55;
      buf[li * 3 + 1] = buf[li * 3 + 1] * 0.45 + (sg / cnt) * 0.55;
      buf[li * 3 + 2] = buf[li * 3 + 2] * 0.45 + (sb / cnt) * 0.55;
    }
  }

  // 7. Write back to ImageData
  for (let y = 0; y < rh; y++) {
    const gy = ry0 + y;
    for (let x = 0; x < rw; x++) {
      const gx = rx0 + x;
      const li = y * rw + x;
      if (origKnown[li]) continue;
      const gi4 = (gy * width + gx) * 4;
      data[gi4] = clamp(Math.round(buf[li * 3]));
      data[gi4 + 1] = clamp(Math.round(buf[li * 3 + 1]));
      data[gi4 + 2] = clamp(Math.round(buf[li * 3 + 2]));
    }
  }
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

  const snapshot = new Uint8ClampedArray(data);
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
      const si = (sy * width + sx) * 4;
      data[ti] = data[ti] + (snapshot[si] - data[ti]) * falloff;
      data[ti + 1] = data[ti + 1] + (snapshot[si + 1] - data[ti + 1]) * falloff;
      data[ti + 2] = data[ti + 2] + (snapshot[si + 2] - data[ti + 2]) * falloff;
    }
  }
}
