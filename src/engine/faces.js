// Face detection (MediaPipe BlazeFace, loaded only when a face feature is used)
// and the geometry built on it: one-tap eye enlarging / face slimming dabs and
// an ID-photo crop sized from the head.
//
// Faces are stored normalised (0..1) so they stay valid for the working copy
// and the full-resolution export alike:
//   { x, y, w, h, score, leftEye, rightEye, nose, mouth }  (points are { x, y })

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

/** Converts a MediaPipe FaceDetector result for a width × height image. */
export function normalizeDetections(result, width, height) {
  const faces = [];
  for (const d of result?.detections ?? []) {
    const b = d.boundingBox;
    if (!b || b.width <= 0 || b.height <= 0) continue;
    const kp = d.keypoints ?? [];
    // BlazeFace keypoints: right eye, left eye, nose tip, mouth, right ear, left ear
    // (the subject's right/left, i.e. right eye is on the image's left).
    const point = (k) => (kp[k] ? { x: kp[k].x, y: kp[k].y } : null);
    faces.push({
      x: b.originX / width,
      y: b.originY / height,
      w: b.width / width,
      h: b.height / height,
      score: d.categories?.[0]?.score ?? 0,
      rightEye: point(0),
      leftEye: point(1),
      nose: point(2),
      mouth: point(3),
    });
  }
  return faces.sort((a, b) => b.w * b.h - a.w * a.h);
}

let detectorPromise;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const [{ FaceDetector }, { default: wasmLoaderPath }, { default: wasmBinaryPath }] = await Promise.all([
        import('@mediapipe/tasks-vision'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
        import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
      ]);
      return FaceDetector.createFromOptions(
        { wasmLoaderPath, wasmBinaryPath },
        { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 },
      );
    })().catch((error) => {
      detectorPromise = undefined;
      throw error;
    });
  }
  return detectorPromise;
}

/**
 * Detects faces in ImageData (or a canvas). BlazeFace works on a small input,
 * so large photos are scaled down first. Returns normalised faces, biggest first.
 */
export async function detectFaces(source) {
  const detector = await getDetector();
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  let input = source;
  if (scale < 1 || source instanceof ImageData) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(source.width * scale));
    c.height = Math.max(1, Math.round(source.height * scale));
    const ctx = c.getContext('2d');
    if (source instanceof ImageData) {
      const full = document.createElement('canvas');
      full.width = source.width;
      full.height = source.height;
      full.getContext('2d').putImageData(source, 0, 0);
      ctx.drawImage(full, 0, 0, c.width, c.height);
    } else {
      ctx.drawImage(source, 0, 0, c.width, c.height);
    }
    input = c;
  }
  return normalizeDetections(detector.detect(input), input.width, input.height);
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
