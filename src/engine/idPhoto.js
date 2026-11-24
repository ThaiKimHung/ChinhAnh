// ID photo print sheets with real-world sizes.
//
// Sheets are 10 × 15 cm (4 × 6 in) at 300 dpi. Each photo cell has the exact
// size of a Vietnamese ID photo (3 × 4 cm or 4 × 6 cm), the crop keeps the
// face (found with the skin mask) in the upper part of the frame, and the
// exported file carries 300 dpi so print dialogs use the right size.

import { getSkinMask, sampleSkinMask } from './skinMask.js';
import { idCropFromFace } from './faces.js';

export const ID_DPI = 300;

export const ID_SHEETS = {
  '3x4': { label: '8 ảnh 3 × 4 cm', photoMm: [30, 40], cols: 4, rows: 2, landscape: true },
  '4x6': { label: '4 ảnh 4 × 6 cm', photoMm: [40, 60], cols: 2, rows: 2, landscape: false },
};

const SHEET_IN = [6, 4];
const GAP_MM = 2;

export function mmToPx(mm, dpi = ID_DPI) {
  return Math.round((mm / 25.4) * dpi);
}

/** Pixel layout of a sheet: sheet size, photo size and the top-left of every cell. */
export function idSheetLayout(sheetId) {
  const spec = ID_SHEETS[sheetId];
  if (!spec) throw new Error('Khổ ảnh thẻ không hợp lệ.');
  const [longIn, shortIn] = SHEET_IN;
  const sheetW = Math.round((spec.landscape ? longIn : shortIn) * ID_DPI);
  const sheetH = Math.round((spec.landscape ? shortIn : longIn) * ID_DPI);
  const photoW = mmToPx(spec.photoMm[0]);
  const photoH = mmToPx(spec.photoMm[1]);
  const gap = mmToPx(GAP_MM);
  const gridW = spec.cols * photoW + (spec.cols - 1) * gap;
  const gridH = spec.rows * photoH + (spec.rows - 1) * gap;
  const left = Math.round((sheetW - gridW) / 2);
  const top = Math.round((sheetH - gridH) / 2);
  const cells = [];
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) cells.push({ x: left + c * (photoW + gap), y: top + r * (photoH + gap) });
  }
  return { sheetW, sheetH, photoW, photoH, cells };
}

/**
 * Crop rectangle of aspect `aspect` (w/h) inside a w×h source. `focus` (0..1,
 * the face centre) is placed in the horizontal middle and at ~42% from the top
 * so there is a little space above the head; without it the crop favours the
 * top of the picture rather than its middle.
 */
export function idCropRect(w, h, aspect, focus = null) {
  let cw = w, ch = h;
  if (w / h > aspect) cw = Math.round(h * aspect);
  else ch = Math.round(w / aspect);
  const fx = focus ? focus.x * w : w / 2;
  const fy = focus ? focus.y * h : null;
  const x = Math.min(w - cw, Math.max(0, Math.round(fx - cw / 2)));
  const y = fy === null
    ? Math.round((h - ch) * 0.2)
    : Math.min(h - ch, Math.max(0, Math.round(fy - ch * 0.42)));
  return { x, y, w: cw, h: ch };
}

/** Face centre (0..1) from the skin mask: the weighted centroid of skin in the upper part of the picture. */
export function findFaceFocus(imageData) {
  const skin = getSkinMask(imageData);
  const { width, height } = imageData;
  let sx = 0, sy = 0, sw = 0;
  const step = Math.max(2, Math.round(Math.max(width, height) / 300));
  // Faces sit in the upper part of a portrait; necks, arms and hands lower down.
  const limit = Math.round(height * 0.7);
  for (let y = 0; y < limit; y += step) {
    for (let x = 0; x < width; x += step) {
      const v = sampleSkinMask(skin, x, y);
      if (v < 0.5) continue;
      sx += x * v;
      sy += y * v;
      sw += v;
    }
  }
  const area = (sw * step * step) / (width * height);
  if (area < 0.01) return null;
  return { x: sx / sw / width, y: sy / sw / height };
}

/** Renders the print sheet for `sheetId` ('3x4' | '4x6') from the finished photo. */
export function generateIdSheet(sourceCanvas, sheetId, faces = null) {
  const { sheetW, sheetH, photoW, photoH, cells } = idSheetLayout(sheetId);
  // With a detected face the head is framed to ID-photo proportions.
  const faceCrop = faces?.length
    ? idCropFromFace(sourceCanvas.width, sourceCanvas.height, photoW / photoH, faces[0])
    : null;
  let focus = null;
  if (!faceCrop) {
    try {
      const probe = document.createElement('canvas');
      const scale = Math.min(1, 480 / Math.max(sourceCanvas.width, sourceCanvas.height));
      probe.width = Math.max(1, Math.round(sourceCanvas.width * scale));
      probe.height = Math.max(1, Math.round(sourceCanvas.height * scale));
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(sourceCanvas, 0, 0, probe.width, probe.height);
      focus = findFaceFocus(pctx.getImageData(0, 0, probe.width, probe.height));
    } catch {
      focus = null;
    }
  }
  const crop = faceCrop ?? idCropRect(sourceCanvas.width, sourceCanvas.height, photoW / photoH, focus);

  const out = document.createElement('canvas');
  out.width = sheetW;
  out.height = sheetH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheetW, sheetH);
  ctx.imageSmoothingQuality = 'high';
  for (const { x, y } of cells) {
    ctx.drawImage(sourceCanvas, crop.x, crop.y, crop.w, crop.h, x, y, photoW, photoH);
    // Hairline cut guide just outside the photo.
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, photoW + 1, photoH + 1);
  }
  return out;
}

// --- Print resolution metadata -------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function jpegPrintParts(bytes, dpi) {
  const view = new DataView(bytes.buffer);
  let offset = 2;
  while (bytes[offset++] === 0xff) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
    if (marker === 0x01) continue;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 0xe0 && length >= 16 && view.getUint32(offset + 2) === 0x4a464946 && bytes[offset + 6] === 0) {
      bytes[offset + 9] = 1; // dots per inch
      view.setUint16(offset + 10, dpi);
      view.setUint16(offset + 12, dpi);
      return [bytes];
    }
    offset += length;
  }

  const jfif = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
  const density = new DataView(jfif.buffer);
  density.setUint16(12, dpi);
  density.setUint16(14, dpi);
  return [bytes.subarray(0, 2), jfif, bytes.subarray(2)];
}

function pngPrintParts(bytes, dpi) {
  const view = new DataView(bytes.buffer);
  const ihdrEnd = 8 + 25;
  if (bytes.length < ihdrEnd || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;

  const ppm = Math.round(dpi / 0.0254);
  const density = new Uint8Array(21);
  const densityView = new DataView(density.buffer);
  densityView.setUint32(0, 9);
  densityView.setUint32(4, 0x70485973); // pHYs
  densityView.setUint32(8, ppm);
  densityView.setUint32(12, ppm);
  density[16] = 1; // metre
  densityView.setUint32(17, crc32(density.subarray(4, 17)));

  const parts = [bytes.subarray(0, ihdrEnd), density];
  let preservedStart = ihdrEnd;
  for (let offset = ihdrEnd; offset < bytes.length;) {
    if (offset + 12 > bytes.length) return null;
    const end = offset + 12 + view.getUint32(offset);
    if (end > bytes.length) return null;
    if (view.getUint32(offset + 4) === 0x70485973) {
      parts.push(bytes.subarray(preservedStart, offset));
      preservedStart = end;
    }
    offset = end;
  }
  parts.push(bytes.subarray(preservedStart));
  return parts;
}

/** Writes one print resolution into JPEG (JFIF density) or PNG (pHYs) metadata. */
export async function withPrintDpi(blob, dpi = ID_DPI) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const isJpeg = bytes.length >= 4 && view.getUint16(0) === 0xffd8;
  const isPng = bytes.length >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a;
  const parts = isJpeg ? jpegPrintParts(bytes, dpi) : isPng ? pngPrintParts(bytes, dpi) : null;
  return parts ? new Blob(parts, { type: blob.type }) : blob;
}
