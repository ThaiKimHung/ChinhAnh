export function inpaintInWorker(imageData, eraseMask, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = new Worker(new URL('./inpaint.worker.js', import.meta.url), { type: 'module' });

    const finish = (callback, value) => {
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
      callback(value);
    };
    const onAbort = () => finish(reject, signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = ({ data }) => finish(resolve, data);
    worker.onerror = (event) => finish(reject, event.error ?? new Error(event.message));
    worker.onmessageerror = () => finish(reject, new Error('Không đọc được kết quả xóa.'));

    try {
      const { width, height } = imageData;
      const pixels = imageData.data.slice();
      const mask = eraseMask.slice();
      worker.postMessage({ width, height, pixels, mask }, [pixels.buffer, mask.buffer]);
    } catch (err) {
      finish(reject, err);
    }
  });
}
