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

  /**
   * 造一个「进全屏前」的现场，并把现场的引用留在 window 上。
   *
   * ⚠️ 为什么必须把引用留在 window 上：进全屏后视频被搬进我们的背板，
   * 而背板被站点摘掉之后 **`document.querySelector('#test-video')` 就查不到它了**
   * —— 它跟着一块脱离文档的树走了。断言「视频回到原位」必须握着那个
   * 节点本身的引用，否则测的其实是「文档里还有没有同名节点」。
   */
  const prepareVideo = async (page) => {
    await page.evaluate(() => {
      const target = document.querySelector('#test-video');
      if (!(target instanceof HTMLVideoElement)) {
        throw new Error('Expected test video to exist');
      }

      Object.defineProperty(target, 'duration', { value: 120, configurable: true });
      Object.defineProperty(target, 'readyState', { value: 4, configurable: true });
      Object.defineProperty(target, 'paused', { value: false, writable: true, configurable: true });
      target.currentTime = 12;

      // 给父节点一个 id，并在视频**后面**插一个标记节点：
      // 这样「回到原来的位置」可以被精确断言（不只是「在同一个父节点里」，
      // 而是「还在标记节点前面」—— 顺序错了用户一样看得出来）。
      target.parentElement.id = 'vsc-original-player';
      const marker = document.createElement('div');
      marker.id = 'vsc-position-marker';
      target.after(marker);

      window.__vscVideo = target;
      window.__vscParent = target.parentElement;
      window.__vscMarker = marker;
    });
  };

  test('returns the video to the page when the site removes our fullscreen backdrop', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();
    await prepareVideo(page);

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    // 站点把我们的背板从文档里摘掉（真实站点在换播放器容器 / 重渲染时会这么干）。
    await page.evaluate(() => {
      document.getElementById('vsc-page-fullscreen-overlay')?.remove();
    });

    // ⚠️ 核心回归契约：用户的视频必须回到页面上原来的位置。
    //
    // 以前这里是 release()（只清理、不搬运）：视频跟着背板一起从文档里消失，
    // **从此再也回不来** —— 用户的视频人间蒸发，而且页面再也找不到它。
    await expect.poll(
      () => page.evaluate(() => window.__vscVideo.parentElement === window.__vscParent),
      { timeout: 3000 },
    ).toBe(true);
    // 位置也要对：还在标记节点前面（不是被塞到父节点末尾）。
    await expect.poll(
      () => page.evaluate(() => window.__vscVideo.nextElementSibling === window.__vscMarker),
      { timeout: 3000 },
    ).toBe(true);
    // 重新连着文档。
    await expect.poll(
      () => page.evaluate(() => window.__vscVideo.isConnected),
      { timeout: 3000 },
    ).toBe(true);

    // 用户看得见：#test-video 又能页面上定位到，而且不是全屏尺寸。
    await expect(page.locator('#test-video')).toBeVisible();
    const box = await page.evaluate(() => {
      const rect = window.__vscVideo.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(box.width).toBeLessThan(700);
    expect(box.height).toBeLessThan(400);

    // 播放状态没丢：还在播、进度还在。
    await expect.poll(() => page.evaluate(() => window.__vscVideo.paused)).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__vscVideo.currentTime)).toBe(12);

    // 界面退出全屏态：背板与控制条都撤了，滚动锁也解了。
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0);
    await expect(page.locator('#vsc-controls')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect.poll(
      () => page.evaluate(() => window.__vscVideo.classList.contains('vsc-page-fullscreen-video')),
    ).toBe(false);
  });

  test('returns the video to the page when the site removes our backdrop after the layout probe', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();
    await prepareVideo(page);

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    // ⚠️ 必须等过 180ms 的布局探测窗口：过了那个窗口，全屏才真的「稳住了」，
    // 这之后站点再动 DOM 才是真场景（真实站点不会在用户点全屏后 100ms 内
    // 就重渲染播放器）。
    await page.waitForTimeout(300);
    // 确认没有降级成 css-cover（降级后视频已经在页面自己的树里了，
    // 那不是本用例要验的场景）。
    await expect(video).toHaveClass(/vsc-page-fullscreen-video--reparent/);

    // 站点在全屏期间把我们的背板整个摘掉。
    //
    // ⚠️ 恢复必须**在同一个微任务检查点里**发生，不能等 500ms 一次的轮询：
    // 摘掉背板的那一刻用户眼前是一个黑屏（视频跟着背板走了），
    // 让他等半秒是能感觉到的卡顿。所以这里断言的是「**微任务**里就已经回来了」。
    //
    // 这也是「宿主观察器真的活着」的证据：MutationObserver 的回调是**微任务**，
    // 它在 remove() 之后的一个微任务里就跑完了；500ms 的健康检查是**宏任务**，
    // 在这个断言里根本不可能插进来。摘掉宿主观察器 → 这里必然是 false。
    const recoveredInMicrotask = await page.evaluate(async () => {
      document.getElementById('vsc-page-fullscreen-overlay')?.remove();
      // 让出一个微任务：MutationObserver 的回调（微任务）会先于我们这一行跑完。
      await Promise.resolve();
      return window.__vscVideo.parentElement === window.__vscParent;
    });
    expect(recoveredInMicrotask).toBe(true);

    // 完整的后果：重新连着文档、界面退出全屏态。
    await expect.poll(() => page.evaluate(() => window.__vscVideo.isConnected)).toBe(true);
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0);
    await expect(page.locator('#vsc-controls')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('does not resurrect a video the site discarded while our backdrop is still mounted', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();
    await prepareVideo(page);

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    // 站点把**视频本身**从我们的背板里摘掉（背板还在）。
    await page.evaluate(() => {
      window.__vscVideo.remove();
    });

    // 收摊：我们的 UI 要撤干净。
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('#vsc-controls')).toHaveCount(0);

    // ⚠️ 但那个节点**不能被复活**：站点不要它了，我们把它插回原父节点
    // 只会让页面上多一个没人要的幽灵视频（还会对着游离节点调 play()）。
    const state = await page.evaluate(() => ({
      connected: window.__vscVideo.isConnected,
      inPage: document.body.contains(window.__vscVideo),
      overflow: document.body.style.overflow,
    }));
    expect(state.connected).toBe(false);
    expect(state.inPage).toBe(false);
    expect(state.overflow).toBe('');
  });

  test('does not resurrect a video the site discarded after the layout probe window', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();
    await prepareVideo(page);

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    // ⚠️ 必须等过 180ms 的布局探测窗口：那个窗口走的是「降级成 css-cover」
    // 的路径，与本用例要验的**健康检查**路径是两条不同的路。
    // 这里要验的是后者：全屏已经稳住之后，站点才把视频丢了。
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      window.__vscVideo.remove();
    });

    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('#vsc-controls')).toHaveCount(0);

    const state = await page.evaluate(() => ({
      connected: window.__vscVideo.isConnected,
      inPage: document.body.contains(window.__vscVideo),
      overflow: document.body.style.overflow,
    }));
    expect(state.connected).toBe(false);
    expect(state.inPage).toBe(false);
    expect(state.overflow).toBe('');
  });

  test('does not resurrect the video when the site discards both it and our backdrop', async ({ page }) => {
    await page.goto('/tests/e2e/test-page.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    const video = page.locator('#test-video');
    await video.click();
    await prepareVideo(page);

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    // 站点一口气把视频和背板都摘掉。
    await page.evaluate(() => {
      window.__vscVideo.remove();
      document.getElementById('vsc-page-fullscreen-overlay')?.remove();
    });

    await expect(page.locator('#vsc-page-fullscreen-overlay')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('#vsc-controls')).toHaveCount(0);

    // 视频确实没了 —— 但那是站点干的，不是我们。
    // 我们只负责把界面收干净，绝不把站点丢弃的节点插回页面。
    const state = await page.evaluate(() => ({
      connected: window.__vscVideo.isConnected,
      inPage: document.body.contains(window.__vscVideo),
      overflow: document.body.style.overflow,
    }));
    expect(state.connected).toBe(false);
    expect(state.inPage).toBe(false);
    expect(state.overflow).toBe('');
  });
});
