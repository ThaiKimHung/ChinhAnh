import { getTransformedSize, isSupportedCanvasSize, transformImageCanvas } from './exportImage.js';
import { SKIN_OVERRIDE_NEUTRAL, createSkinOverride } from './skinMask.js';

export function cloneImageData(imgData) {
  return new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
}

export function imageDataToCanvas(imgData) {
  const c = document.createElement('canvas');
  c.width = imgData.width;
  c.height = imgData.height;
  c.getContext('2d', { willReadFrequently: true }).putImageData(imgData, 0, 0);
  return c;
}

export function createBlankCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function readImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
    image.src = url;
  });
}

export function canvasToBlob(canvas, format) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể tạo tệp ảnh.'));
    }, format);
  });
}

export function imageSizeOf(image) {
  return { width: image.naturalWidth, height: image.naturalHeight };
}

export function workingSizeOf(size, maxDimension) {
  const limit = maxDimension || (isSupportedCanvasSize(size) ? 0 : 2400);
  const scale = limit ? Math.min(1, limit / Math.max(size.width, size.height)) : 1;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** Draws `image` scaled to `width`×`height` and returns both the canvas and its pixels. */
export function rasterize(image, width, height) {
  const canvas = createBlankCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không đủ bộ nhớ để mở ảnh.');
  ctx.drawImage(image, 0, 0, width, height);
  return { canvas, data: ctx.getImageData(0, 0, width, height) };
}

/** Applies a geometry operation (rotate/flip/straighten/crop) to a single-channel alpha mask. */
export function transformAlphaMask(alpha, width, height, operation) {
  const src = createBlankCanvas(width, height);
  const ctx = src.getContext('2d');
  const img = ctx.createImageData(width, height);
  const d = img.data;
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = alpha[p];
  }
  ctx.putImageData(img, 0, 0);
  const dst = transformImageCanvas(src, operation);
  const out = dst.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, dst.width, dst.height).data;
  const next = new Uint8ClampedArray(dst.width * dst.height);
  for (let p = 0, i = 0; p < next.length; p++, i += 4) next[p] = out[i + 3];
  return next;
}

/**
 * onScroll handler for layout frames that must never scroll. Browsers without
 * `overflow: clip` can still scroll an overflow:hidden box when a control gets
 * focus, which silently shifts the whole view; snap it back.
 */
export function resetFrameScroll(event) {
  const el = event.currentTarget;
  if (el.scrollTop || el.scrollLeft) {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }
}

/**
 * Applies a crop/rotate/flip/straighten to the skin-region override (kept on the
 * 1/4-resolution grid) and fits it to the new image size.
 */
export function transformSkinOverride(override, operation, newWidth, newHeight) {
  const moved = transformAlphaMask(override.data, override.width, override.height, operation);
  const { width: movedW, height: movedH } = getTransformedSize({ width: override.width, height: override.height }, [operation]);
  const next = createSkinOverride(newWidth, newHeight);
  for (let y = 0; y < next.height; y++) {
    for (let x = 0; x < next.width; x++) {
      const sx = Math.min(movedW - 1, Math.floor(((x + 0.5) * movedW) / next.width));
      const sy = Math.min(movedH - 1, Math.floor(((y + 0.5) * movedH) / next.height));
      next.data[y * next.width + x] = moved[sy * movedW + sx] ?? SKIN_OVERRIDE_NEUTRAL;
    }
  }
  return next;
}

/** Orange tint of the effective skin mask, drawn over the photo while painting the skin region. */
export function skinRegionOverlay(skin) {
  const canvas = createBlankCanvas(skin.width, skin.height);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(skin.width, skin.height);
  for (let p = 0; p < skin.mask.length; p++) img.data.set([255, 140, 40, Math.round(skin.mask[p] * 0.75)], p * 4);
  ctx.putImageData(img, 0, 0);
  return canvas;
}
