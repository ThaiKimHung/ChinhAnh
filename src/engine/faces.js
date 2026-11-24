// Face detection (MediaPipe BlazeFace, loaded only when a face feature is used)
// and the geometry built on it: one-tap eye enlarging / face slimming dabs and
// an ID-photo crop sized from the head.
//
// Faces are stored normalised (0..1) so they stay valid for the working copy
// and the full-resolution export alike:
//   { x, y, w, h, score, leftEye, rightEye, nose, mouth }  (points are { x, y })

const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models/face_detector';
// Short range: faces close to the camera (portraits). Full range: faces up to
// ~5 m away (group photos), also run on overlapping tiles for small faces.
const MODELS = {
  short: `${MODEL_BASE}/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
  full: `${MODEL_BASE}/blaze_face_full_range/float16/1/blaze_face_full_range.tflite`,
};
const MAX_INPUT = 960;

/**
 * Converts a MediaPipe FaceDetector result for an input canvas that shows
 * `rect` (source pixels) of a width × height source. Keypoints from MediaPipe
 * are normalised to the input.
 */
export function normalizeDetections(result, inputW, inputH, rect = null, width = inputW, height = inputH) {
  const r = rect ?? { x: 0, y: 0, w: width, h: height };
  const sx = r.w / inputW, sy = r.h / inputH;
  const faces = [];
  for (const d of result?.detections ?? []) {
    const b = d.boundingBox;
    if (!b || b.width <= 0 || b.height <= 0) continue;
    const kp = d.keypoints ?? [];
    // BlazeFace keypoints: right eye, left eye, nose tip, mouth, right ear, left ear
    // (the subject's right/left, i.e. right eye is on the image's left).
    const point = (k) => (kp[k] ? { x: (r.x + kp[k].x * r.w) / width, y: (r.y + kp[k].y * r.h) / height } : null);
    faces.push({
      x: (r.x + b.originX * sx) / width,
      y: (r.y + b.originY * sy) / height,
      w: (b.width * sx) / width,
      h: (b.height * sy) / height,
      score: d.categories?.[0]?.score ?? 0,
      rightEye: point(0),
      leftEye: point(1),
      nose: point(2),
      mouth: point(3),
    });
  }
  return faces;
}

/**
 * Overlapping square-ish tiles (source pixels) for finding small faces in a
 * large photo; empty when the whole photo is small enough on its own.
 */
export function tileRects(width, height) {
  const long = Math.max(width, height);
  if (long < 800) return [];
  const side = Math.max(480, Math.round(long / 3));
  const stride = Math.round(side * 0.75);
  const starts = (size) => {
    if (size <= side) return [0];
    const out = [];
    for (let v = 0; v + side < size; v += stride) out.push(v);
    out.push(size - side);
    return out;
  };
  const rects = [];
  for (const y of starts(height)) {
    for (const x of starts(width)) rects.push({ x, y, w: Math.min(side, width), h: Math.min(side, height) });
  }
  return rects;
}

/**
 * Drops duplicate detections of one face (overlapping boxes, or a partial box
 * from a tile edge inside a bigger one), keeping the most confident. Faces are
 * returned in reading order, so "Người 1" is the leftmost person of the top row.
 */
export function mergeFaces(faces) {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const f of sorted) {
    const dup = kept.some((k) => {
      const ix = Math.max(0, Math.min(f.x + f.w, k.x + k.w) - Math.max(f.x, k.x));
      const iy = Math.max(0, Math.min(f.y + f.h, k.y + k.h) - Math.max(f.y, k.y));
      const inter = ix * iy;
      const minArea = Math.min(f.w * f.h, k.w * k.h);
      return inter / (f.w * f.h + k.w * k.h - inter) > 0.3 || inter / minArea > 0.6;
    });
    if (!dup) kept.push(f);
  }
  return readingOrder(kept);
}

/** Faces row by row (top row first), each row left to right. */
export function readingOrder(faces) {
  const cy = (f) => f.y + f.h / 2;
  const rows = [];
  for (const f of [...faces].sort((a, b) => cy(a) - cy(b))) {
    const row = rows.at(-1);
    // Same row when the centre is within ~half a face height of the row's first face.
    if (row && cy(f) - cy(row[0]) < Math.max(row[0].h, f.h) * 0.6) row.push(f);
    else rows.push([f]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2)));
}

/** Index of the biggest face (the main subject), or -1. */
export function biggestFace(faces) {
  let best = -1;
  faces?.forEach((f, i) => {
    if (best < 0 || f.w * f.h > faces[best].w * faces[best].h) best = i;
  });
  return best;
}

const detectorPromises = {};

async function getDetector(kind) {
  if (!detectorPromises[kind]) {
    detectorPromises[kind] = (async () => {
      const [{ FaceDetector }, { default: wasmLoaderPath }, { default: wasmBinaryPath }] = await Promise.all([
        import('@mediapipe/tasks-vision'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
      ]);
      return FaceDetector.createFromOptions(
        { wasmLoaderPath, wasmBinaryPath },
        { baseOptions: { modelAssetPath: MODELS[kind], delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 },
      );
    })().catch((error) => {
      detectorPromises[kind] = undefined;
      throw error;
    });
  }
  return detectorPromises[kind];
}

function toCanvas(source) {
  if (!(source instanceof ImageData)) return source;
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  c.getContext('2d').putImageData(source, 0, 0);
  return c;
}

/** `rect` of `source` scaled to fit MAX_INPUT. */
function regionCanvas(source, rect) {
  const scale = Math.min(1, MAX_INPUT / Math.max(rect.w, rect.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(rect.w * scale));
  c.height = Math.max(1, Math.round(rect.h * scale));
  c.getContext('2d').drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
  return c;
}

/**
 * Detects faces in ImageData (or a canvas): close-up faces with the short
 * range model, distant ones with the full range model on the whole photo and
 * on overlapping tiles. Returns normalised faces, left to right.
 */
export async function detectFaces(source) {
  const [short, full] = await Promise.all([getDetector('short'), getDetector('full').catch(() => null)]);
  const src = toCanvas(source);
  const { width, height } = src;
  const whole = { x: 0, y: 0, w: width, h: height };
  const run = (detector, rect) => {
    const input = regionCanvas(src, rect);
    return normalizeDetections(detector.detect(input), input.width, input.height, rect, width, height);
  };
  const found = run(short, whole);
  if (full) {
    for (const rect of [whole, ...tileRects(width, height)]) found.push(...run(full, rect));
  }
  return mergeFaces(found);
}

// --- One-tap retouching --------------------------------------------------------

/**
 * Liquify dabs that enlarge both eyes. `amount` 0..1. Coordinates are image
 * pixels for an image of width × height.
 */
export function eyeEnlargeDabs(face, width, height, amount = 0.5) {
  const faceW = face.w * width;
  const radius = Math.max(8, faceW * 0.16);
  const dabs = [];
  for (const eye of [face.leftEye, face.rightEye]) {
    if (!eye) continue;
    const x = eye.x * width, y = eye.y * height;
    const count = Math.max(1, Math.round(2 + amount * 6));
    for (let k = 0; k < count; k++) dabs.push({ mode: 'bloat', x0: x, y0: y, x1: x, y1: y, radius, strength: 0.55 });
  }
  return dabs;
}

/**
 * Liquify push strokes that move both sides of the lower face toward the
 * middle (cheeks and jaw). `amount` 0..1.
 */
export function faceSlimDabs(face, width, height, amount = 0.5) {
  const fx = face.x * width, fy = face.y * height, fw = face.w * width, fh = face.h * height;
  const cx = fx + fw / 2;
  const radius = Math.max(10, fw * 0.28);
  const travel = fw * 0.06 * (0.4 + amount);
  const steps = 6;
  const dabs = [];
  for (const level of [0.62, 0.8, 0.95]) {
    const y = fy + fh * level;
    // Jaw narrows toward the chin, so start the lower strokes further in.
    const inset = fw * (0.02 + (level - 0.62) * 0.25);
    for (const side of [-1, 1]) {
      const startX = cx + side * (fw / 2 - inset);
      for (let s = 0; s < steps; s++) {
        const x0 = startX - side * (travel * s) / steps;
        const x1 = startX - side * (travel * (s + 1)) / steps;
        dabs.push({ mode: 'push', x0, y0: y, x1, y1: y, radius, strength: 0.7 });
      }
    }
  }
  return dabs;
}

// --- ID photo crop ---------------------------------------------------------------

/**
 * Crop (image pixels) of aspect w/h for an ID photo around `face`: the head
 * (BlazeFace's box covers brows to chin; hair adds about 45%) fills ~70% of
 * the photo height with a small margin above the hair, centred horizontally.
 * Returns null when the photo is too small around the face for that framing.
 */
export function idCropFromFace(width, height, aspect, face) {
  const boxH = face.h * height;
  const headTop = face.y * height - boxH * 0.45;
  const headH = boxH * 1.45;
  let ch = headH / 0.7;
  let cw = ch * aspect;
  if (cw > width || ch > height) {
    const shrink = Math.min(width / cw, height / ch);
    if (shrink < 0.8) return null; // the head would be far too large in the photo
    cw *= shrink;
    ch *= shrink;
  }
  const cx = (face.x + face.w / 2) * width;
  const x = Math.min(width - cw, Math.max(0, cx - cw / 2));
  const y = Math.min(height - ch, Math.max(0, headTop - ch * 0.1));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(cw), h: Math.round(ch) };
}
