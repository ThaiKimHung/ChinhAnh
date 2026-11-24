import { expect } from '@playwright/test';

export const DEV_URL = 'http://localhost:5174';

/** Opens the app and loads the bundled sample portrait. */
export async function openSample(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dùng ảnh mẫu' }).click();
  await expect(page.locator('main canvas')).toBeVisible();
  await settle(page);
}

/** Every 7th pixel of the stage canvas as [r, g, b, a, ...]. */
export function stagePixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('main canvas');
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const out = [];
    for (let i = 0; i < data.length; i += 28) out.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
    return { width: c.width, height: c.height, data: out };
  });
}

/** Share (0..1) of sampled pixels that differ noticeably. */
export function changedShare(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 12) changed++;
  }
  return changed / (a.data.length / 4);
}

/** Waits until the stage canvas stops changing (renders are scheduled with requestAnimationFrame). */
export async function settle(page) {
  let prev = await stagePixels(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const next = await stagePixels(page);
    if (changedShare(prev, next) === 0) return next;
    prev = next;
  }
  return prev;
}
