import { useEffect, useRef, useState } from 'react';
import { detectFaces } from '../engine/faces';

/**
 * Faces (normalised boxes) for the current photo and crop. Detection runs
 * once per photo / size / geometry while `wanted` is true.
 *
 * status: 'idle' | 'detecting' | 'found' | 'none' | 'error'
 * facesRef always holds the latest known faces (for sessions and exports).
 */
export function useFaceDetection({ imageId, imageSize, geometryLength, wanted, workDataRef }) {
  const [state, setState] = useState({ key: null, faces: null, error: false });
  const facesRef = useRef(null);
  const key = imageSize ? `${imageId}:${imageSize.width}x${imageSize.height}:${geometryLength}` : null;
  const known = key !== null && state.key === key;
  const faces = known ? state.faces : null;
  const want = key !== null && wanted;
  const status = !key
    ? 'idle'
    : known
      ? state.error ? 'error' : faces?.length ? 'found' : 'none'
      : want ? 'detecting' : 'idle';

  useEffect(() => {
    const workData = workDataRef.current;
    if (!want || known || !workData) return;
    let cancelled = false;
    detectFaces(workData)
      .then((found) => !cancelled && setState({ key, faces: found, error: false }))
      .catch(() => !cancelled && setState({ key, faces: [], error: true }));
    return () => {
      cancelled = true;
    };
  }, [key, known, want, workDataRef]);

  useEffect(() => {
    facesRef.current = faces;
  }, [faces]);

  return { faces, status, facesRef };
}
