import { useCallback, useEffect, useRef, useState } from 'react';
import { createBlankCanvas } from '../engine/canvasUtils';
import { dilateMask } from '../engine/inpaint';
import { inpaintInWorker } from '../engine/inpaintJob';

/**
 * Magic-eraser mask (what the user painted red) and the inpainting job that
 * fills it. The mask is a byte per pixel plus a canvas used for the overlay.
 *
 * `onInpainted(imageData)` receives the filled pixels; `onNotice(text)` shows
 * messages to the user.
 */
export function useEraseMask({ brushSize, workDataRef, imageJobs, markDraftDirty, onInpainted, onNotice }) {
  const maskRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const [maskCanvas, setMaskCanvas] = useState(null);
  const [version, setVersion] = useState(0);
  const [hasMask, setHasMask] = useState(false);
  const [processing, setProcessing] = useState(false);
  const jobRef = useRef(null);

  const cancelJob = useCallback(() => {
    if (!jobRef.current) return;
    const { controller } = jobRef.current;
    jobRef.current = null;
    controller.abort();
    setProcessing(false);
  }, []);

  useEffect(() => () => jobRef.current?.controller.abort(), []);

  const bump = () => setVersion((v) => v + 1);

  /** Replaces the mask with an empty one of the given size. */
  const reset = useCallback((width, height) => {
    const mc = createBlankCanvas(width, height);
    maskCanvasRef.current = mc;
    setMaskCanvas(mc);
    maskRef.current = new Uint8Array(width * height);
    setHasMask(false);
    bump();
  }, []);

  /** Forgets the mask (no photo open). */
  const drop = useCallback(() => {
    maskRef.current = null;
    maskCanvasRef.current = null;
    setHasMask(false);
  }, []);

  /** Session fields for the photo switcher and drafts. */
  const capture = useCallback(
    () => ({ eraseMask: maskRef.current, eraseMaskCanvas: maskCanvasRef.current, hasEraseMask: hasMask }),
    [hasMask]
  );

  /** Restores what `capture` returned for a width × height photo. */
  const restore = useCallback((saved, width, height) => {
    maskRef.current = new Uint8Array(saved.eraseMask);
    const mc = createBlankCanvas(width, height);
    if (saved.eraseMaskCanvas) mc.getContext('2d').drawImage(saved.eraseMaskCanvas, 0, 0);
    maskCanvasRef.current = mc;
    setMaskCanvas(mc);
    setHasMask(saved.hasEraseMask);
    bump();
  }, []);

  const paintSegment = useCallback(
    (x0, y0, x1, y1) => {
      const mask = maskRef.current;
      const mc = maskCanvasRef.current;
      if (!mask || !mc) return;
      markDraftDirty();
      const w = mc.width;
      const h = mc.height;
      const ctx = mc.getContext('2d');
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x1, y1, brushSize, 0, Math.PI * 2);
      ctx.fill();

      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(2, brushSize * 0.35)));
      const r = brushSize;
      const r2 = r * r;
      for (let s = 0; s <= steps; s++) {
        const cx = x0 + ((x1 - x0) * s) / steps;
        const cy = y0 + ((y1 - y0) * s) / steps;
        const minX = Math.max(0, Math.floor(cx - r));
        const maxX = Math.min(w - 1, Math.ceil(cx + r));
        const minY = Math.max(0, Math.floor(cy - r));
        const maxY = Math.min(h - 1, Math.ceil(cy + r));
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) mask[y * w + x] = 1;
          }
        }
      }
      setHasMask(true);
      bump();
    },
    [brushSize, markDraftDirty]
  );

  const clear = useCallback(() => {
    markDraftDirty();
    maskRef.current?.fill(0);
    const mc = maskCanvasRef.current;
    if (mc) mc.getContext('2d').clearRect(0, 0, mc.width, mc.height);
    setHasMask(false);
    bump();
  }, [markDraftDirty]);

  /** Fills the painted area from its surroundings (in a worker). */
  const apply = useCallback(async () => {
    const source = workDataRef.current;
    const mask = maskRef.current;
    if (!source || !mask || jobRef.current) return;
    const job = { token: imageJobs.start(), controller: new AbortController() };
    jobRef.current = job;
    setProcessing(true);
    onNotice('');
    try {
      const grow = Math.max(1, Math.round(Math.min(source.width, source.height) / 700));
      const pixels = await inpaintInWorker(source, dilateMask(mask, source.width, source.height, grow), job.controller.signal);
      if (jobRef.current !== job || !imageJobs.isCurrent(job.token)) return;
      if (!pixels) {
        onNotice('Chưa đủ vùng nền để lấp chỗ đã tô. Hãy chừa nền xung quanh và thử vùng nhỏ hơn.');
        return;
      }
      onInpainted(new ImageData(pixels, source.width, source.height));
      clear();
    } catch {
      if (jobRef.current === job && imageJobs.isCurrent(job.token) && !job.controller.signal.aborted) {
        onNotice('Không thể xử lý vùng đã tô. Hãy thử với vùng nhỏ hơn.');
      }
    } finally {
      if (jobRef.current === job) {
        jobRef.current = null;
        setProcessing(false);
      }
    }
  }, [clear, imageJobs, onInpainted, onNotice, workDataRef]);

  return { maskCanvas, version, hasMask, processing, cancelJob, reset, drop, capture, restore, paintSegment, clear, apply };
}
