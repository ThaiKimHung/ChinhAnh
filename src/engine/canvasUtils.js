import { isSupportedCanvasSize, transformImageCanvas } from './exportImage';

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
