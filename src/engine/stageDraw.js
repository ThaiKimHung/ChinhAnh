// Draws the stage canvas: the edited photo (or the original / a split view),
// then the overlays of the active tool.

/**
 * @param {HTMLCanvasElement} canvas  resized to the photo
 * @param {object} o
 *   display, original: canvases; compare: show the original only;
 *   splitAt: 0..100 or null; skinOverlay, eraseMask: overlay canvases;
 *   patch: { rect, offset, flip } or null; zoom: for screen-constant line widths
 */
export function drawStage(canvas, { display, original, compare, splitAt, skinOverlay, eraseMask, patch, zoom }) {
  canvas.width = display.width;
  canvas.height = display.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (compare && original) {
    ctx.drawImage(original, 0, 0);
    return;
  }

  ctx.drawImage(display, 0, 0);
  if (splitAt !== null && original) {
    const splitX = Math.round((canvas.width * splitAt) / 100);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, canvas.height);
    ctx.clip();
    ctx.clearRect(0, 0, splitX, canvas.height);
    ctx.drawImage(original, 0, 0);
    ctx.restore();
  }

  if (skinOverlay) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(skinOverlay, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  if (eraseMask) {
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.drawImage(eraseMask, 0, 0);
    ctx.restore();
  }

  // Cut & paste: preview the moved copy, then outline source (dashed) and target.
  if (patch?.rect) {
    const { x, y, w, h } = patch.rect;
    const tx = x + patch.offset.dx;
    const ty = y + patch.offset.dy;
    const moved = patch.offset.dx !== 0 || patch.offset.dy !== 0;
    if (moved) {
      ctx.save();
      if (patch.flip) {
        ctx.translate(tx * 2 + w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(display, x, y, w, h, tx, ty, w, h);
      ctx.restore();
    }
    const unit = 1 / Math.max(0.05, zoom);
    ctx.save();
    ctx.lineWidth = 1.5 * unit;
    ctx.setLineDash([6 * unit, 4 * unit]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(x, y, w, h);
    if (moved) {
      ctx.setLineDash([]);
      ctx.lineWidth = 2 * unit;
      ctx.strokeStyle = '#f59e0b';
      ctx.strokeRect(tx, ty, w, h);
    }
    ctx.restore();
  }
}
