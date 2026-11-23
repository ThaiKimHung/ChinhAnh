// Accepting photo files, including iPhone HEIC/HEIF photos that most browsers
// other than Safari cannot decode. HEIC files are converted to JPEG once, when
// they are added, so drafts and exports only ever deal with web formats.

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXT = /\.(heic|heif)$/i;

/** `accept` attribute for file inputs. HEIC is listed explicitly because some OSes report no MIME type. */
export const IMAGE_FILE_ACCEPT = 'image/*,.heic,.heif';

export function isHeicFile(file) {
  return HEIC_TYPES.has((file.type || '').toLowerCase()) || HEIC_EXT.test(file.name || '');
}

export function isImageFile(file) {
  return (file.type || '').startsWith('image/') || isHeicFile(file);
}

export function heicOutputName(name) {
  return HEIC_EXT.test(name) ? name.replace(HEIC_EXT, '.jpg') : `${name}.jpg`;
}

async function browserCanDecode(blob) {
  if (typeof createImageBitmap !== 'function') return false;
  try {
    const bitmap = await createImageBitmap(blob);
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a file the editor can open: HEIC/HEIF is converted to JPEG unless the
 * browser decodes it natively (Safari). Other files are returned unchanged.
 */
export async function toEditableImageFile(file, { decodeCheck = browserCanDecode, convert } = {}) {
  if (!isHeicFile(file)) return file;
  if (await decodeCheck(file)) return file;
  const heicTo = convert ?? (await import('heic-to')).heicTo;
  const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.95 });
  return new File([jpeg], heicOutputName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
}
