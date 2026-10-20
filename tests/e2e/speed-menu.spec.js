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
});
