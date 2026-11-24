import { useCallback, useRef, useState } from 'react';
import { canvasToBlob, imageDataToCanvas, rasterize, readImage } from '../engine/canvasUtils';

/**
 * AI background removal (@imgly/background-removal) on the current pixels, so
 * liquify and erase edits stay aligned with the cutout. `onMask(alpha)` gets
 * the per-pixel alpha (Uint8ClampedArray, width × height) when it finishes for
 * the photo that is still open.
 */
export function useBackgroundRemoval({ workDataRef, imageJobs, onMask, onError }) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const jobRef = useRef(null);

  const run = useCallback(async () => {
    if (!workDataRef.current || jobRef.current) return;
    const job = imageJobs.start();
    jobRef.current = job;
    setProcessing(true);
    setProgress('Đang tải AI...');
    onError('');
    let resultUrl;
    try {
      const source = imageDataToCanvas(workDataRef.current);
      const blob = await canvasToBlob(source, 'image/png');
      const { removeBackground } = await import('@imgly/background-removal');
      if (!imageJobs.isCurrent(job)) return;
      const resultBlob = await removeBackground(blob, {
        progress: (_key, current, total) => {
          if (imageJobs.isCurrent(job) && total > 0) setProgress(`${Math.min(100, Math.round((current / total) * 100))}%`);
        },
      });

      if (!imageJobs.isCurrent(job)) return;
      resultUrl = URL.createObjectURL(resultBlob);
      const img = await readImage(resultUrl);
      if (!imageJobs.isCurrent(job)) return;
      const { width, height } = source;
      const maskData = rasterize(img, width, height).data.data;
      const alpha = new Uint8ClampedArray(width * height);
      for (let i = 0, p = 0; i < maskData.length; i += 4, p++) alpha[p] = maskData[i + 3];
      onMask(alpha);
    } catch (err) {
      if (imageJobs.isCurrent(job)) {
        console.error('AI BG Removal failed:', err);
        onError('Không thể tách nền. Hãy kiểm tra kết nối mạng để tải mô hình AI rồi thử lại.');
      }
    } finally {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      if (jobRef.current === job) {
        jobRef.current = null;
        setProcessing(false);
        setProgress('');
      }
    }
  }, [imageJobs, onError, onMask, workDataRef]);

  /** Call when another photo is shown: a running job keeps going for the previous one. */
  const noteImageSwitch = useCallback(() => {
    setProgress(jobRef.current ? 'Đang hoàn tất ảnh trước…' : '');
  }, []);

  return { processing, progress, run, noteImageSwitch };
}
