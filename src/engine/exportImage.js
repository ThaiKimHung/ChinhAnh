import { straightenCanvas } from './imagePipeline.js';

// A full-resolution render can hold several RGBA buffers at the same time.
const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 32_000_000;
const MAX_ZIP_OFFSET = 0xffffffff;
const MAX_ZIP_ENTRIES = 0xffff;
const ZIP_UTF8 = 0x0800;
const ZIP_EPOCH_DATE = 0x0021;
const encoder = new TextEncoder();

function cropBounds({ width, height }, rect) {
  const x = Math.min(width - 1, Math.max(0, Math.round((width * rect.x) / 100)));
  const y = Math.min(height - 1, Math.max(0, Math.round((height * rect.y) / 100)));
  return {
    x,
    y,
    width: Math.min(width - x, Math.max(1, Math.round((width * rect.w) / 100))),
    height: Math.min(height - y, Math.max(1, Math.round((height * rect.h) / 100))),
  };
}

function transformSize({ width, height }, operation) {
  switch (operation.type) {
    case 'rotate':
      return { width: height, height: width };
    case 'crop': {
      const bounds = cropBounds({ width, height }, operation.rect);
      return { width: bounds.width, height: bounds.height };
    }
    case 'straighten': {
      const radians = (operation.angle * Math.PI) / 180;
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));
      const scale = Math.max((width * cos + height * sin) / width, (width * sin + height * cos) / height);
      return {
        width: Math.max(20, Math.round(width / scale)),
        height: Math.max(20, Math.round(height / scale)),
      };
    }
    default:
      return { width, height };
  }
}

export function getTransformedSize(size, operations = []) {
  return size ? operations.reduce(transformSize, size) : null;
}

export function isSupportedCanvasSize({ width, height }) {
  return width > 0 && height > 0 && width <= MAX_CANVAS_SIDE
    && height <= MAX_CANVAS_SIDE && width * height <= MAX_CANVAS_PIXELS;
}

function checkCanvasSize(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('Kích thước ảnh không hợp lệ.');
  }
  if (!isSupportedCanvasSize({ width, height })) {
    throw new Error('Ảnh quá lớn để xử lý trên trình duyệt. Hãy dùng bản đang chỉnh hoặc tỷ lệ nhỏ hơn.');
  }
}

function createCanvas(width, height) {
  checkCanvasSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext(canvas, options) {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Trình duyệt không đủ bộ nhớ để xử lý kích thước ảnh này.');
  return context;
}

export function transformImageCanvas(source, operation) {
  const bounds = operation.type === 'crop' ? cropBounds(source, operation.rect) : transformSize(source, operation);
  const { width, height } = bounds;
  if (operation.type === 'straighten') {
    checkCanvasSize(width, height);
    return straightenCanvas(source, operation.angle);
  }

  const canvas = createCanvas(width, height);
  const context = getContext(canvas);
  switch (operation.type) {
    case 'rotate':
      context.translate(width / 2, height / 2);
      context.rotate((operation.degrees * Math.PI) / 180);
      context.drawImage(source, -source.width / 2, -source.height / 2);
      break;
    case 'flip': {
      const horizontal = operation.direction === 'h';
      context.translate(horizontal ? width : 0, horizontal ? 0 : height);
      context.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      context.drawImage(source, 0, 0);
      break;
    }
    case 'crop':
      context.drawImage(source, bounds.x, bounds.y, width, height, 0, 0, width, height);
      break;
    default:
      throw new Error('Không nhận diện được thao tác cắt hoặc xoay ảnh.');
  }
  return canvas;
}

function getSamplingAxis(sourceSize, outputSize) {
  const indices = new Int32Array(outputSize);
  const weights = new Float32Array(outputSize);
  for (let i = 0; i < outputSize; i++) {
    const position = Math.max(0, Math.min(sourceSize - 1, ((i + 0.5) * sourceSize) / outputSize - 0.5));
    indices[i] = Math.floor(position);
    weights[i] = position - indices[i];
  }
  return { indices, weights };
}

function interpolate(data, topLeft, topRight, bottomLeft, bottomRight, tx, ty) {
  const top = data[topLeft] + (data[topRight] - data[topLeft]) * tx;
  const bottom = data[bottomLeft] + (data[bottomRight] - data[bottomLeft]) * tx;
  return top + (bottom - top) * ty;
}

function buildCorrection(original, edited) {
  if (original === edited || original.every((value, index) => value === edited[index])) return null;
  const correction = new Int16Array(original.length);
  for (let i = 0; i < original.length; i += 4) {
    const baseAlpha = original[i + 3];
    const editAlpha = edited[i + 3];
    correction[i + 3] = editAlpha - baseAlpha;
    for (let channel = 0; channel < 3; channel++) {
      correction[i + channel] = Math.round((edited[i + channel] * editAlpha - original[i + channel] * baseAlpha) / 255);
    }
  }
  return correction;
}

function resampleEdits(output, original, edited, alphaMask) {
  const sameSize = output.width === edited.width && output.height === edited.height;
  const difference = buildCorrection(original.data, edited.data);
  const mask = alphaMask?.length === edited.width * edited.height ? alphaMask : null;
  if (!difference && (!mask || sameSize)) return { workData: output, cutoutAlpha: mask };

  const xAxis = getSamplingAxis(edited.width, output.width);
  const yAxis = getSamplingAxis(edited.height, output.height);
  const resizedMask = mask && !sameSize ? new Uint8ClampedArray(output.width * output.height) : null;
  const pixels = output.data;

  // Premultiplied channel deltas preserve alpha transitions without pulling in hidden RGB.
  for (let y = 0, pixel = 0; y < output.height; y++) {
    const ty = yAxis.weights[y];
    const row = yAxis.indices[y];
    const firstRow = row * edited.width;
    const secondRow = Math.min(row + 1, edited.height - 1) * edited.width;
    for (let x = 0; x < output.width; x++, pixel++) {
      const tx = xAxis.weights[x];
      const left = xAxis.indices[x];
      const right = Math.min(left + 1, edited.width - 1);
      const topLeft = firstRow + left;
      const topRight = firstRow + right;
      const bottomLeft = secondRow + left;
      const bottomRight = secondRow + right;

      if (resizedMask) {
        resizedMask[pixel] = interpolate(mask, topLeft, topRight, bottomLeft, bottomRight, tx, ty);
      }
      if (!difference) continue;

      const i = pixel * 4;
      const tl = topLeft * 4;
      const tr = topRight * 4;
      const bl = bottomLeft * 4;
      const br = bottomRight * 4;
      const sourceAlpha = pixels[i + 3];
      pixels[i + 3] = sourceAlpha + interpolate(difference, tl + 3, tr + 3, bl + 3, br + 3, tx, ty);
      const targetAlpha = pixels[i + 3];
      for (let channel = 0; channel < 3; channel++) {
        const delta = interpolate(difference, tl + channel, tr + channel, bl + channel, br + channel, tx, ty);
        pixels[i + channel] = targetAlpha > 0 ? (pixels[i + channel] * sourceAlpha + delta * 255) / targetAlpha : 0;
      }
    }
  }
  return { workData: output, cutoutAlpha: resizedMask || mask };
}

export function buildOriginalSource(image, session = {}) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!isSupportedCanvasSize({ width, height })) {
    throw new Error('Ảnh gốc vượt giới hạn 32 triệu điểm ảnh hoặc 16.384 px mỗi chiều. Hãy xuất bản đang chỉnh.');
  }
  let origCanvas = createCanvas(width, height);
  getContext(origCanvas).drawImage(image, 0, 0, origCanvas.width, origCanvas.height);
  for (const operation of session.geometry || []) {
    const transformed = transformImageCanvas(origCanvas, operation);
    origCanvas.width = 0;
    origCanvas.height = 0;
    origCanvas = transformed;
  }

  let pixels;
  try {
    pixels = getContext(origCanvas).getImageData(0, 0, origCanvas.width, origCanvas.height);
  } catch {
    throw new Error('Không thể đọc ảnh ở độ phân giải gốc. Hãy thử xuất bản đang chỉnh.');
  }
  if (!session.origData || !session.workData) {
    return { workData: pixels, origCanvas, cutoutAlpha: null, resolutionScale: 1 };
  }

  const { workData, cutoutAlpha } = resampleEdits(pixels, session.origData, session.workData, session.cutoutAlpha);
  const resolutionScale = Math.min(origCanvas.width, origCanvas.height)
    / Math.min(session.workData.width, session.workData.height);
  return { workData, origCanvas, cutoutAlpha, resolutionScale };
}

export function extensionForFormat(format) {
  if (format === 'image/png') return 'png';
  if (format === 'image/webp') return 'webp';
  return 'jpg';
}

export async function encodeCanvas(canvas, format, quality, scale = 1) {
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  if (scale <= 0 || canvas.width < 1 || canvas.height < 1) throw new Error('Kích thước ảnh không hợp lệ.');
  checkCanvasSize(width, height);
  const useSource = width === canvas.width && height === canvas.height && format !== 'image/jpeg';
  const output = useSource ? canvas : createCanvas(width, height);
  try {
    if (!useSource) {
      const context = getContext(output);
      if (format === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(canvas, 0, 0, width, height);
    }

    const blob = await new Promise((resolve) => output.toBlob(resolve, format, quality));
    if (blob?.type !== format && blob) throw new Error('Trình duyệt không hỗ trợ định dạng xuất ảnh này.');
    if (!blob?.size) throw new Error('Không thể tạo tệp ảnh. Hãy thử dùng kích thước nhỏ hơn.');
    return blob;
  } finally {
    if (!useSource) {
      output.width = 0;
      output.height = 0;
    }
  }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

export function sanitizeExportName(name, fallback = 'LKMagic-Export') {
  const sanitized = (name || '').normalize('NFC').trim()
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!sanitized) return fallback;
  const neutralized = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized)
    ? sanitized.replace(/^([^.]+)/, '$1-') : sanitized;
  let shortName = '';
  let size = 0;
  for (const character of neutralized) {
    size += encoder.encode(character).length;
    if (size > 180) break;
    shortName += character;
  }
  return shortName.replace(/[.\s]+$/g, '');
}

export function uniqueExportName(baseName, format, usedNames) {
  const name = sanitizeExportName(baseName);
  const extension = extensionForFormat(format);
  let fileName = `${name}.${extension}`;
  for (let number = 2; usedNames.has(fileName.toLowerCase()); number++) {
    fileName = `${name}-${number}.${extension}`;
  }
  usedNames.add(fileName.toLowerCase());
  return fileName;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFileHeader(name, size, checksum, localOffset) {
  const central = localOffset !== undefined;
  const headerSize = central ? 46 : 30;
  const header = new Uint8Array(headerSize + name.length);
  const view = new DataView(header.buffer);
  const fields = central ? 2 : 0;
  view.setUint32(0, central ? 0x02014b50 : 0x04034b50, true);
  if (central) view.setUint16(4, 20, true);
  view.setUint16(4 + fields, 20, true);
  view.setUint16(6 + fields, ZIP_UTF8, true);
  view.setUint16(12 + fields, ZIP_EPOCH_DATE, true);
  view.setUint32(14 + fields, checksum, true);
  view.setUint32(18 + fields, size, true);
  view.setUint32(22 + fields, size, true);
  view.setUint16(26 + fields, name.length, true);
  if (central) view.setUint32(42, localOffset, true);
  header.set(name, headerSize);
  return header;
}

export async function createZip(entries) {
  if (!entries.length) throw new Error('Không có ảnh để đóng gói.');
  if (entries.length >= MAX_ZIP_ENTRIES) throw new Error('Có quá nhiều ảnh cho một tệp ZIP.');

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let centralSize = 0;
  for (const { name, blob } of entries) {
    const encodedName = encoder.encode(name);
    if (!name || name === '.' || name === '..' || /[/\\:\p{Cc}]/u.test(name) || encodedName.length > 0xffff) {
      throw new Error('Không thể đóng gói ảnh có tên tệp không hợp lệ.');
    }
    const nextOffset = offset + 30 + encodedName.length + blob.size;
    centralSize += 46 + encodedName.length;
    if (nextOffset + centralSize + 22 >= MAX_ZIP_OFFSET) throw new Error('Tệp ZIP quá lớn. Hãy xuất theo từng nhóm ảnh nhỏ hơn.');

    // JPEG, PNG, and WebP are already compressed, so only store the original bytes.
    const checksum = crc32(new Uint8Array(await blob.arrayBuffer()));
    localParts.push(zipFileHeader(encodedName, blob.size, checksum), blob);
    centralParts.push(zipFileHeader(encodedName, blob.size, checksum, offset));
    offset = nextOffset;
  }

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end.buffer], { type: 'application/zip' });
}
