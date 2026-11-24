import assert from 'node:assert/strict';
import test from 'node:test';
import { eyeEnlargeDabs, faceSlimDabs, idCropFromFace, normalizeDetections } from '../src/engine/faces.js';

const face = {
  x: 0.35, y: 0.25, w: 0.3, h: 0.3, score: 0.95,
  rightEye: { x: 0.44, y: 0.35 }, leftEye: { x: 0.56, y: 0.35 }, nose: { x: 0.5, y: 0.42 }, mouth: { x: 0.5, y: 0.48 },
};

test('detections are normalised and the biggest face comes first', () => {
  const result = {
    detections: [
      { boundingBox: { originX: 10, originY: 10, width: 20, height: 20 }, keypoints: [], categories: [{ score: 0.7 }] },
      { boundingBox: { originX: 100, originY: 50, width: 80, height: 90 }, keypoints: [{ x: 0.3, y: 0.2 }, { x: 0.4, y: 0.2 }], categories: [{ score: 0.9 }] },
    ],
  };
  const faces = normalizeDetections(result, 400, 300);
  assert.equal(faces.length, 2);
  assert.deepEqual([faces[0].x, faces[0].y, faces[0].w, faces[0].h], [0.25, 50 / 300, 0.2, 0.3]);
  assert.deepEqual(faces[0].rightEye, { x: 0.3, y: 0.2 });
  assert.equal(faces[0].mouth, null);
});

test('eye enlarging places bloat dabs on both eyes, more for a stronger setting', () => {
  const light = eyeEnlargeDabs(face, 1000, 1000, 0.1);
  const strong = eyeEnlargeDabs(face, 1000, 1000, 1);
  assert.ok(strong.length > light.length);
  assert.ok(light.every((d) => d.mode === 'bloat'));
  const xs = new Set(light.map((d) => Math.round(d.x1)));
  assert.deepEqual([...xs].sort(), [440, 560]);
});

test('face slimming pushes both sides of the lower face toward the middle', () => {
  const dabs = faceSlimDabs(face, 1000, 1000, 0.5);
  const centre = 500;
  for (const d of dabs) {
    assert.equal(d.mode, 'push');
    assert.ok(Math.abs(d.x1 - centre) < Math.abs(d.x0 - centre), 'moves inward');
    assert.ok(d.y0 > 250 + 300 * 0.5, 'below the eyes');
  }
  assert.ok(dabs.some((d) => d.x0 < centre) && dabs.some((d) => d.x0 > centre));
});

test('ID crop frames the head at about 70% of the photo height with room above', () => {
  const crop = idCropFromFace(1000, 1400, 0.75, face);
  const headTop = 0.25 * 1400 - 0.3 * 1400 * 0.45;
  const headH = 0.3 * 1400 * 1.45;
  assert.ok(Math.abs(headH / crop.h - 0.7) < 0.02, `head share ${headH / crop.h}`);
  assert.ok(crop.y < headTop && headTop - crop.y < crop.h * 0.15, 'small margin above the hair');
  assert.ok(Math.abs(crop.w / crop.h - 0.75) < 0.01);
  assert.ok(Math.abs(crop.x + crop.w / 2 - 500) <= 1, 'centred on the face');
  // A face filling the whole photo cannot be framed like that.
  assert.equal(idCropFromFace(1000, 1000, 0.75, { ...face, y: 0, h: 0.95, w: 0.9, x: 0.05 }), null);
});
