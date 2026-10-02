import { test, expect } from '@playwright/test';

test.describe('Page Fullscreen Regression', () => {
  test('steps speed, seeks and toggles play/pause with default keys', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();

    await page.evaluate(() => {
      const target = document.querySelector('#test-video');
      if (!(target instanceof HTMLVideoElement)) {
        throw new Error('Expected test video to exist');
      }

      target.playbackRate = 1;
      Object.defineProperty(target, 'duration', { value: 120, configurable: true });
      target.currentTime = 30;
      window.__pauseCalls = 0;
      Object.defineProperty(target, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(target, 'pause', {
        value: () => {
          window.__pauseCalls += 1;
        },
        configurable: true,
      });
    });

    // Speed step up / down / reset.
    await page.keyboard.press('=');
    await expect(video.evaluate((node) => node.playbackRate)).resolves.toBeCloseTo(1.1, 2);
    await page.keyboard.press('-');
    await expect(video.evaluate((node) => node.playbackRate)).resolves.toBeCloseTo(1, 2);

    await page.keyboard.press('=');
    await page.keyboard.press('0');
    await expect(video.evaluate((node) => node.playbackRate)).resolves.toBe(1);

    // Seek forward / backward by 5s.
    await page.keyboard.press('ArrowRight');
    await expect(video.evaluate((node) => node.currentTime)).resolves.toBe(35);
    await page.keyboard.press('ArrowLeft');
    await expect(video.evaluate((node) => node.currentTime)).resolves.toBe(30);

    // Space toggles play/pause.
    await page.keyboard.press(' ');
    await expect(page.evaluate(() => window.__pauseCalls)).resolves.toBe(1);
  });

  test('preserves playback progress after exiting page fullscreen', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();

    await page.evaluate(() => {
      const target = document.querySelector('#test-video');
      if (!(target instanceof HTMLVideoElement)) {
        throw new Error('Expected test video to exist');
      }

      Object.defineProperty(target, 'duration', {
        value: 120,
        configurable: true,
      });
      Object.defineProperty(target, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(target, 'readyState', {
        value: 4,
        configurable: true,
      });

      target.currentTime = 12;
    });

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    await page.evaluate(() => {
      const target = document.querySelector('#test-video');
      if (!(target instanceof HTMLVideoElement)) {
        throw new Error('Expected test video to exist');
      }

      target.currentTime = 18;
    });

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0);
    await expect(video.evaluate((node) => node.currentTime)).resolves.toBe(18);
  });
});
