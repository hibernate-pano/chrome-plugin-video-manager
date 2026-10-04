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

  test('left-clicking the video toggles playback inside page fullscreen', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();

    await page.evaluate(() => {
      const target = document.querySelector('#test-video');
      if (!(target instanceof HTMLVideoElement)) {
        throw new Error('Expected test video to exist');
      }

      Object.defineProperty(target, 'duration', { value: 120, configurable: true });
      Object.defineProperty(target, 'readyState', { value: 4, configurable: true });
      Object.defineProperty(target, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      });
      window.__playCalls = 0;
      window.__pauseCalls = 0;
      Object.defineProperty(target, 'play', {
        value: () => {
          window.__playCalls += 1;
          target.paused = false;
          return Promise.resolve();
        },
        configurable: true,
      });
      Object.defineProperty(target, 'pause', {
        value: () => {
          window.__pauseCalls += 1;
          target.paused = true;
        },
        configurable: true,
      });
    });

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    // 回归契约：reparent 后视频脱离了站点播放器的祖先链，站点自己挂在那些祖先上的
    // 「点击切换播放」监听器再也收不到事件（YouTube 上表现为左键点击毫无反应、
    // 而空格正常）。既然我们接管了视频表面，点击语义必须由我们补上。
    const box = await video.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.evaluate(() => window.__pauseCalls)).resolves.toBe(1);
    await expect(page.evaluate(() => window.__playCalls)).resolves.toBe(0);

    // 再点一次恢复播放：一次点击 = 恰好一次切换，不多不少。
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.evaluate(() => window.__playCalls)).resolves.toBe(1);
    await expect(page.evaluate(() => window.__pauseCalls)).resolves.toBe(1);

    // 右键不属于播放控制（它是站点上下文菜单的入口）。
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await expect(page.evaluate(() => window.__pauseCalls)).resolves.toBe(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0);
  });
});
