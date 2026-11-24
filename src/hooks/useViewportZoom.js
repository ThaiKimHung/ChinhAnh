import { useCallback, useRef, useState } from 'react';

/**
 * Zoom and pan of the canvas stage. The photo stays fitted to the viewport
 * (also when the window resizes) until the user zooms by hand.
 * `workDataRef` holds the current pixels; their size is what gets fitted.
 */
export function useViewportZoom(workDataRef) {
  const [zoom, setZoom] = useState(0.65);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef(null);
  const fitActiveRef = useRef(true);

  const fitZoomToScreen = useCallback((w, h) => {
    fitActiveRef.current = true;
    const viewport = viewportRef.current;
    if (viewport?.width && viewport?.height) {
      const availW = Math.max(1, viewport.width - 32);
      const availH = Math.max(1, viewport.height - 32);
      setZoom(Math.min(availW / w, availH / h, 1));
    }
    setPan({ x: 0, y: 0 });
  }, []);

  const handleViewportResize = useCallback((viewport) => {
    viewportRef.current = viewport;
    const data = workDataRef.current;
    if (data && fitActiveRef.current) fitZoomToScreen(data.width, data.height);
  }, [fitZoomToScreen, workDataRef]);

  /** Manual zoom (a value or an updater); stops fitting to the viewport. */
  const changeZoom = useCallback((value) => {
    fitActiveRef.current = false;
    setZoom(value);
  }, []);

  /** Zooms to `level` around the viewport centre. */
  const zoomAroundCentre = useCallback((level) => {
    const ratio = level / zoom;
    setPan(({ x, y }) => ({ x: x * ratio, y: y * ratio }));
    changeZoom(level);
  }, [changeZoom, zoom]);

  return { zoom, pan, setPan, fitZoomToScreen, changeZoom, zoomAroundCentre, handleViewportResize };
}
