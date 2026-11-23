import { inpaintMaskedRegion } from './inpaint.js';

self.onmessage = ({ data: { pixels, mask, width, height } }) => {
  const changed = inpaintMaskedRegion({ data: pixels, width, height }, mask);
  self.postMessage(changed ? pixels : null, changed ? [pixels.buffer] : []);
};
