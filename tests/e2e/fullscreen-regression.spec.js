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

  test('pausing right after entering fullscreen keeps the takeover alive', async ({ page }) => {
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
      // 关键：暂停**不改变 readyState** —— 真实 Chromium 就是这样
      // （实测：用户 pause 只派发一个 pause 事件，readyState 仍然是 4）。
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

    // 用户在进全屏后 180ms 内点了画面暂停 —— 这是最常见的操作之一。
    const box = await video.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.evaluate(() => window.__pauseCalls)).resolves.toBe(1);

    // 跨过 180ms 健康探测：暂停**不是**媒体丢失，绝不能因此降级。
    // 曾经的判据是「快照在播、现在不在播」→ 用户一暂停就命中，
    // 视频在满屏画面刚出来时被悄悄拽回页面原位、控制条消失。
    await page.waitForTimeout(500);
    await expect(video).toHaveClass(/vsc-page-fullscreen-video--reparent/);
    await expect(video).not.toHaveClass(/vsc-page-fullscreen-video--css-cover/);

    // 再点一次必须还能恢复播放 —— 降级后视频表面交还给了站点，这一下就没了。
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.evaluate(() => window.__playCalls)).resolves.toBe(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0);
  });

  test('still falls back to css-cover when the site really drops the media', async ({ page }) => {
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
      // 进全屏前「有媒体」（readyState 4）。
      window.__readyState = 4;
      Object.defineProperty(target, 'readyState', {
        get: () => window.__readyState,
        configurable: true,
      });
      Object.defineProperty(target, 'currentTime', {
        value: 30,
        writable: true,
        configurable: true,
      });
    });

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    // 站点在探测窗口内把媒体卸载掉（真实的 MSE 站点换源就是这个形状：
    // abort → emptied → loadstart，readyState 掉到 0）。
    // 这才是「媒体丢了」，必须降级 —— 否则我们守着一个没有画面的黑框。
    await page.evaluate(() => {
      window.__readyState = 0;
    });

    await expect(video).toHaveClass(/vsc-page-fullscreen-video--css-cover/, { timeout: 3000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0);
  });
});
