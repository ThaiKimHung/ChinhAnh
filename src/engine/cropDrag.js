// Crop-box dragging on the canvas. All values are percentages of the photo.

const MIN_SIZE = 8;

/**
 * Percent-space height/width ratio of a crop with aspect `aspectId` ('w:h')
 * on a width × height photo, or null for a free crop.
 */
export function cropPercentRatio(aspectId, width, height) {
  if (!aspectId || aspectId === 'free' || !width || !height) return null;
  const [aw, ah] = aspectId.split(':').map(Number);
  return (width / height) / (aw / ah); // hPct = wPct * ratio
}

/**
 * New crop rect after dragging `handle` ('move' or a compass handle such as
 * 'nw', 'e', 's') by dx/dy percent from `orig`. With `pctRatio` the aspect stays locked.
 */
export function dragCropRect(orig, handle, dxPct, dyPct, pctRatio = null) {
  let { x, y, w, h } = orig;
  if (handle === 'move') {
    return {
      x: Math.min(100 - w, Math.max(0, orig.x + dxPct)),
      y: Math.min(100 - h, Math.max(0, orig.y + dyPct)),
      w,
      h,
    };
  }

  const right0 = orig.x + orig.w;
  const bot0 = orig.y + orig.h;
  if (!pctRatio) {
    if (handle.includes('e')) w = Math.min(100 - orig.x, Math.max(MIN_SIZE, orig.w + dxPct));
    if (handle.includes('s')) h = Math.min(100 - orig.y, Math.max(MIN_SIZE, orig.h + dyPct));
    if (handle.includes('w')) {
      x = Math.max(0, Math.min(right0 - MIN_SIZE, orig.x + dxPct));
      w = right0 - x;
    }
    if (handle.includes('n')) {
      y = Math.max(0, Math.min(bot0 - MIN_SIZE, orig.y + dyPct));
      h = bot0 - y;
    }
    return { x, y, w, h };
  }

  // Aspect-locked resizing from any corner or edge, anchored on the opposite side.
  const anchorX = handle.includes('w') ? right0 : orig.x;
  const anchorY = handle.includes('n') ? bot0 : orig.y;
  const maxW = handle.includes('w') ? anchorX : 100 - anchorX;
  const maxH = handle.includes('n') ? anchorY : 100 - anchorY;
  const effectiveMaxW = Math.min(maxW, maxH / pctRatio);

  let rawW = orig.w;
  if (handle.includes('e')) rawW = orig.w + dxPct;
  else if (handle.includes('w')) rawW = orig.w - dxPct;
  else if (handle.includes('s')) rawW = (orig.h + dyPct) / pctRatio;
  else if (handle.includes('n')) rawW = (orig.h - dyPct) / pctRatio;

  w = Math.min(effectiveMaxW, Math.max(MIN_SIZE, rawW));
  h = w * pctRatio;
  if (h < MIN_SIZE) {
    h = MIN_SIZE;
    w = h / pctRatio;
  }
  x = handle.includes('w') ? anchorX - w : anchorX;
  y = handle.includes('n') ? anchorY - h : anchorY;
  return { x, y, w, h };
}
