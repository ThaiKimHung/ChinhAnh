import { stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { changedShare, openSample, settle, stagePixels } from './helpers.js';

test('a preset changes the photo and undo brings it back', async ({ page }) => {
  await openSample(page);
  const before = await stagePixels(page);
  await page.getByTitle('Studio Trong Trẻo').click();
  await expect.poll(async () => changedShare(before, await stagePixels(page))).toBeGreaterThan(0.2);
  await page.getByTitle('Hoàn tác (Ctrl+Z)').click();
  await expect.poll(async () => changedShare(before, await stagePixels(page))).toBe(0);
});

test('export downloads the edited photo', async ({ page }) => {
  await openSample(page);
  await page.getByTitle('Studio Trong Trẻo').click();
  await settle(page);
  await page.getByRole('button', { name: /Xuất ảnh/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Xuất ảnh' });
  await expect(dialog).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Tải ảnh về' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.(jpe?g|png|webp)$/);
  const { size } = await stat(await download.path());
  expect(size).toBeGreaterThan(20_000);
});

for (const width of [768, 1024]) {
  test(`header fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openSample(page);
    const layout = await page.evaluate(() => {
      const header = document.querySelector('header');
      const exportButton = [...header.querySelectorAll('button')].find((b) => /Xuất ảnh/.test(b.innerText + b.title + b.getAttribute('aria-label')));
      return {
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        headerOverflow: header.scrollWidth - header.clientWidth,
        exportRight: exportButton?.getBoundingClientRect().right ?? Infinity,
      };
    });
    expect(layout.pageOverflow).toBeLessThanOrEqual(0);
    expect(layout.headerOverflow).toBeLessThanOrEqual(0);
    expect(layout.exportRight).toBeLessThanOrEqual(width);
  });
}

test('inspection mode zooms without scrolling the page', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Soi ảnh' }).click();
  await page.getByRole('button', { name: '100%', exact: true }).click();
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  const scroll = await page.evaluate(() => ({
    page: window.scrollY + document.scrollingElement.scrollTop,
    main: document.querySelector('main').scrollTop + document.querySelector('main').scrollLeft,
    rootTop: document.getElementById('root').getBoundingClientRect().top,
  }));
  expect(scroll).toEqual({ page: 0, main: 0, rootTop: 0 });
});

test('cut & paste covers a spot and can be undone', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Xóa vật thể' }).click();
  await page.getByRole('button', { name: 'Cắt & dán' }).click();
  const before = await settle(page);
  const box = await page.locator('main canvas').boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  // Select a patch on the face, then drag it onto the background.
  await page.mouse.move(...at(0.4, 0.3));
  await page.mouse.down();
  await page.mouse.move(...at(0.48, 0.36), { steps: 4 });
  await page.mouse.move(...at(0.55, 0.42), { steps: 4 });
  await page.mouse.up();
  await page.mouse.move(...at(0.47, 0.36));
  await page.mouse.down();
  await page.mouse.move(...at(0.3, 0.36), { steps: 4 });
  await page.mouse.move(...at(0.12, 0.36), { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect.poll(async () => changedShare(before, await stagePixels(page))).toBeGreaterThan(0.005);
  await page.getByTitle('Hoàn tác (Ctrl+Z)').click();
  await expect.poll(async () => changedShare(before, await stagePixels(page))).toBe(0);
});
