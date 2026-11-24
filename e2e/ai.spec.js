import { expect, test } from '@playwright/test';
import { changedShare, openSample, settle, stagePixels } from './helpers.js';

// These download AI models from public CDNs. Set E2E_OFFLINE=1 to skip them.
test.skip(!!process.env.E2E_OFFLINE, 'needs network for AI models');

test('AI background removal makes the background transparent', async ({ page }) => {
  test.setTimeout(180_000);
  await openSample(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.getByRole('button', { name: 'Tách nền', exact: true }).click();
  await page.getByRole('button', { name: 'Tách nền AI tự động' }).click();
  await expect(page.getByRole('button', { name: /Đang tách nền AI/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chạy lại Tách nền AI' })).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/Không thể tách nền/)).toHaveCount(0);
  const corner = await page.evaluate(() => {
    const c = document.querySelector('main canvas');
    return c.getContext('2d').getImageData(4, 4, 1, 1).data[3];
  });
  expect(corner).toBe(0);
});

test('faces are detected and "Mắt to" retouches them', async ({ page }) => {
  test.setTimeout(120_000);
  await openSample(page);
  await page.getByRole('button', { name: 'Nắn bóp' }).click();
  await expect(page.getByText('Đã nhận diện khuôn mặt.')).toBeVisible({ timeout: 90_000 });
  const before = await settle(page);
  await page.getByRole('button', { name: 'Mắt to' }).click();
  await expect.poll(async () => changedShare(before, await stagePixels(page))).toBeGreaterThan(0.002);
});
