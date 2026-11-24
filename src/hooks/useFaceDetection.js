import { useCallback, useEffect, useRef, useState } from 'react';
import { detectFaces } from '../engine/faces';

const THUMB = 64;

/** Square thumbnails (data URLs) of each face with a little margin, for the person picker. */
function faceThumbnails(imageData, faces) {
  const full = document.createElement('canvas');
  full.width = imageData.width;
  full.height = imageData.height;
  full.getContext('2d').putImageData(imageData, 0, 0);
  const thumb = document.createElement('canvas');
  thumb.width = THUMB;
  thumb.height = THUMB;
  const ctx = thumb.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  return faces.map((f) => {
    const side = Math.max(f.w * imageData.width, f.h * imageData.height) * 1.4;
    const cx = (f.x + f.w / 2) * imageData.width;
    const cy = (f.y + f.h / 2) * imageData.height;
    ctx.fillStyle = '#1b1f29';
    ctx.fillRect(0, 0, THUMB, THUMB);
    ctx.drawImage(full, cx - side / 2, cy - side / 2, side, side, 0, 0, THUMB, THUMB);
    return thumb.toDataURL('image/jpeg', 0.8);
  });
}

/**
 * Faces (normalised boxes, left to right) for the current photo and crop.
 * Detection runs once per photo / size / geometry while `wanted` is true.
 *
 * status: 'idle' | 'detecting' | 'found' | 'none' | 'error'
 * selected: index of the person picked for one-person edits, or null (everyone).
 * facesRef always holds the latest known faces (for sessions and exports).
 */
export function useFaceDetection({ imageId, imageSize, geometryLength, wanted, workDataRef }) {
  const [state, setState] = useState({ key: null, faces: null, thumbs: null, error: false });
  const [selection, setSelection] = useState({ key: null, index: null });
  const facesRef = useRef(null);
  const key = imageSize ? `${imageId}:${imageSize.width}x${imageSize.height}:${geometryLength}` : null;
  const known = key !== null && state.key === key;
  const faces = known ? state.faces : null;
  const thumbs = known ? state.thumbs : null;
  const want = key !== null && wanted;
  const status = !key
    ? 'idle'
    : known
      ? state.error ? 'error' : faces?.length ? 'found' : 'none'
      : want ? 'detecting' : 'idle';
  const selected = selection.key === key && faces && selection.index < faces.length ? selection.index : null;

  useEffect(() => {
    const workData = workDataRef.current;
    if (!want || known || !workData) return;
    let cancelled = false;
    detectFaces(workData)
      .then((found) => {
        if (cancelled) return;
        let pictures = null;
        try {
          pictures = faceThumbnails(workData, found);
        } catch {
          pictures = null;
        }
        setState({ key, faces: found, thumbs: pictures, error: false });
      })
      .catch(() => !cancelled && setState({ key, faces: [], thumbs: null, error: true }));
    return () => {
      cancelled = true;
    };
  }, [key, known, want, workDataRef]);

  useEffect(() => {
    facesRef.current = faces;
  }, [faces]);

  const select = useCallback((index) => setSelection({ key, index }), [key]);

  return { faces, status, facesRef, thumbs, selected, select };
}
