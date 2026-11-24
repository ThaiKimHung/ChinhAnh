import { expect, test } from '@playwright/test';
import { DEV_URL } from './helpers.js';

// The WebGL pipeline must give the same picture as the CPU pipeline.
test('GPU and CPU pipelines agree', async ({ page }) => {
  await page.goto(DEV_URL);
  const result = await page.evaluate(async () => {
    const { processImageGpu } = await import('/src/engine/gpuPipeline.js');
    const { processImagePipeline, PRESETS, DEFAULT_ADJUSTMENTS } = await import('/src/engine/imagePipeline.js');
    const { default: sampleUrl } = await import('/src/assets/studio-portrait-sample.jpg?url');
    const img = new Image();
    img.src = sampleUrl;
    await img.decode();
    const scale = 480 / Math.max(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const src = ctx.getImageData(0, 0, c.width, c.height);
    const adjustments = { ...DEFAULT_ADJUSTMENTS, ...PRESETS[1].values };
    const compare = (beauty, faces) => {
      const gpu = processImageGpu(src, adjustments, beauty, null, faces);
      if (!gpu) return null;
      const cpu = processImagePipeline(src, adjustments, beauty, null, faces);
      let max = 0, sum = 0;
      for (let i = 0; i < cpu.data.length; i++) {
        if ((i & 3) === 3) continue;
        const d = Math.abs(cpu.data[i] - gpu.data[i]);
        sum += d;
        if (d > max) max = d;
      }
      return { max, mean: sum / ((cpu.data.length / 4) * 3) };
    };
    const shared = compare({ skinSmooth: 60, skinBrighten: 30, skinRosy: 20 }, null);
    if (!shared) return { gpu: false };
    // Two "people" (the real face and a made-up one on the right) with their own levels.
    const faces = [
      { x: 0.3, y: 0.25, w: 0.4, h: 0.33 },
      { x: 0.75, y: 0.1, w: 0.2, h: 0.2 },
    ];
    const perPerson = compare(
      { skinSmooth: 20, skinBrighten: 40, skinRosy: 0, perFace: { 0: { skinSmooth: 80, skinBrighten: 0, skinRosy: 30 } } },
      faces,
    );
    return { gpu: true, shared, perPerson };
  });
  test.skip(!result.gpu, 'WebGL2 is not available in this browser');
  for (const r of [result.shared, result.perPerson]) {
    expect(r.mean).toBeLessThan(0.5);
    expect(r.max).toBeLessThanOrEqual(4);
  }
});
