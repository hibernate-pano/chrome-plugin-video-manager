import { test, expect } from '@playwright/test';

/**
 * 倍速档位菜单。
 *
 * 为什么值得单独守：菜单是**唯一**一条「鼠标用户也能改倍速」的路径 ——
 * 键盘有 `=` / `-` / `0`，但鼠标用户此前只能看着只读文字发愁。
 * 而菜单是绝对定位 + shadow root 的组合，位置、层级、点击命中
 * 都在真实渲染下才说得清（单测里的 jsdom 没有布局）。
 *
 * 断言全部量**实际渲染结果**（可见性、真实播放速率），不看 class。
 */
test.describe('倍速档位菜单', () => {
  const enterFullscreen = async (page) => {
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
      Object.defineProperty(target, 'paused', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    await page.keyboard.press('f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();
    return video;
  };

  test('点开菜单、选中档位、菜单收起', async ({ page }) => {
    const video = await enterFullscreen(page);

    const speed = page.locator('[data-role="speed"]');
    const menu = page.locator('[data-role="speed-menu"]');
    await expect(speed).toHaveText('1x');
    await expect(menu).toBeHidden();

    // 控制条 3 秒无操作就自动隐藏；先动一下指针把它唤回来再点。
    await page.mouse.move(300, 200);
    await speed.click();

    await expect(menu).toBeVisible();
    // 0.5x 是「慢看」的真实下限，必须在菜单里。
    await expect(page.locator('[data-role="speed-menu"] [data-rate="0.5"]')).toBeVisible();
    await expect(speed).toHaveAttribute('aria-expanded', 'true');

    await page.locator('[data-role="speed-menu"] [data-rate="1.5"]').click();

    await expect(video.evaluate((node) => node.playbackRate)).resolves.toBeCloseTo(1.5, 2);
    await expect(menu).toBeHidden();
    await expect(speed).toHaveAttribute('aria-expanded', 'false');
  });

  test('菜单挂在按钮上方，不会跑出视口', async ({ page }) => {
    await enterFullscreen(page);

    await page.mouse.move(300, 200);
    await page.locator('[data-role="speed"]').click();

    const speed = await page.locator('[data-role="speed"]').boundingBox();
    const menu = await page.locator('[data-role="speed-menu"]').boundingBox();
    const viewport = page.viewportSize();

    expect(menu).not.toBeNull();
    expect(speed).not.toBeNull();
    // 控制条贴着视口底部，菜单往下开就会掉出屏幕。
    expect(menu.y + menu.height).toBeLessThanOrEqual(speed.y + 1);
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
  });

  test('Esc 关掉菜单，而不是退出全屏', async ({ page }) => {
    await enterFullscreen(page);

    await page.mouse.move(300, 200);
    await page.locator('[data-role="speed"]').click();

    const menu = page.locator('[data-role="speed-menu"]');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(menu).toBeHidden();
    // Esc 被菜单吃掉了：全屏还在。
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();
  });

  test('点菜单外面收起菜单', async ({ page }) => {
    await enterFullscreen(page);

    await page.mouse.move(300, 200);
    await page.locator('[data-role="speed"]').click();
    await expect(page.locator('[data-role="speed-menu"]')).toBeVisible();

    await page.mouse.click(120, 120);

    await expect(page.locator('[data-role="speed-menu"]')).toBeHidden();
  });

  /**
   * 矮窗口里，10 个档位必须**全都露得出来**。
   *
   * ⚠️ 这里曾经有个静默缺陷：菜单有 `max-height: 60vh`，
   * 窗口一矮（低于约 480px）就把 3x / 4x 这两档**截在容器外面** ——
   * 没有滚动条提示、没有省略号，看起来就像菜单只有 8 档。
   * 而 3x / 4x 恰恰是「看快点」时最想按的两档。
   *
   * 判据量的是**真实的盒子**：菜单容器不需要滚动（scrollHeight ≤ clientHeight），
   * 且每一档都落在菜单盒子与视口之内 ——
   * 光看「元素存在」或「opacity 是 1」都抓不到这件事。
   */
  test('矮窗口里 10 个档位全部露得出来（不会被 max-height 悄悄截掉）', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 400 });
    await enterFullscreen(page);

    await page.mouse.move(300, 200);
    await page.locator('[data-role="speed"]').click();

    const menu = page.locator('[data-role="speed-menu"]');
    await expect(menu).toBeVisible();
    await expect(page.locator('[data-role="speed-menu"] [role="menuitem"]')).toHaveCount(10);

    const metrics = await page.evaluate(() => {
      const host = document.getElementById('vsc-controls');
      const el = host?.shadowRoot?.querySelector('[data-role="speed-menu"]');
      if (!el) throw new Error('speed menu not found in shadow root');
      const rect = el.getBoundingClientRect();
      const itemRects = Array.from(el.querySelectorAll('[role="menuitem"]')).map((item) => {
        const box = item.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      return {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        menuTop: rect.top,
        menuBottom: rect.bottom,
        itemRects,
      };
    });

    // 容器装得下 = 不用滚动 = 每一档都在里面。
    expect(
      metrics.scrollHeight,
      '菜单被 max-height 截断了 —— 3x / 4x 露在容器外面，用户看不到',
    ).toBeLessThanOrEqual(metrics.clientHeight + 1);

    // 菜单整体在视口里（菜单是从按钮往上长的，顶部跑出去就够不着了）。
    expect(metrics.menuTop, '菜单顶部顶出视口了').toBeGreaterThanOrEqual(0);
    expect(metrics.menuBottom, '菜单底部跑出视口了').toBeLessThanOrEqual(400);

    metrics.itemRects.forEach((box, index) => {
      expect(box.top, `第 ${index + 1} 档在菜单盒子外面（被截掉了）`).toBeGreaterThanOrEqual(metrics.menuTop - 1);
      expect(box.bottom, `第 ${index + 1} 档在菜单盒子外面（被截掉了）`).toBeLessThanOrEqual(metrics.menuBottom + 1);
    });
  });
});
