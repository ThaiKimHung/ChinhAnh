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

/** Mean brightness of the cheek band in each third of the stage canvas (one person per third). */
const thirdsBrightness = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('main canvas');
    const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    return [0, 1, 2].map((t) => {
      let sum = 0, n = 0;
      for (let y = Math.round(height * 0.35); y < height * 0.6; y += 2) {
        for (let x = Math.round(width * (t / 3 + 0.12)); x < width * (t / 3 + 0.22); x += 2) {
          const i = (y * width + x) * 4;
          sum += data[i] + data[i + 1] + data[i + 2];
          n++;
        }
      }
      return sum / n / 3;
    });
  });

test('in a group photo one person can get their own skin level', async ({ page }) => {
  test.setTimeout(120_000);
  await openSample(page);
  // A three-person photo made from the sample portrait, dropped onto the stage.
  await page.evaluate(async () => {
    const src = document.querySelector('main canvas');
    const cell = 500, h = Math.round((cell * src.height) / src.width);
    const c = document.createElement('canvas');
    c.width = cell * 3;
    c.height = h;
    for (let i = 0; i < 3; i++) c.getContext('2d').drawImage(src, i * cell, 0, cell, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'nhom.jpg', { type: 'image/jpeg' }));
    const main = document.querySelector('main');
    main.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    main.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect.poll(() => page.evaluate(() => document.querySelector('main canvas')?.width ?? 0)).toBe(1500);
  await page.getByRole('button', { name: 'Chân dung', exact: true }).click();
  const picker = page.getByRole('group', { name: 'Chọn người để chỉnh' });
  await expect(picker.getByRole('button')).toHaveCount(4, { timeout: 90_000 });
  await settle(page);
  const before = await thirdsBrightness(page);

  // Pick person 2 on the photo, then raise "Làm sáng da" for them only.
  await page.getByRole('button', { name: 'Chọn Người 2' }).click();
  await expect(picker).toContainText('Chỉnh cho: Người 2');
  await page.getByRole('slider').nth(1).focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press('PageUp');
  await settle(page);
  const after = await thirdsBrightness(page);

  expect(after[1] - before[1]).toBeGreaterThan(5);
  expect(Math.abs(after[0] - before[0])).toBeLessThan(0.5);
  expect(Math.abs(after[2] - before[2])).toBeLessThan(0.5);
});
