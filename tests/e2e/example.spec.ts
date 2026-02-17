import { test, expect } from './helpers/fixtures';
import {
  waitForVideo,
  getVideoPlaybackRate,
  pressShortcut,
  waitForHUD,
  getHUDText,
} from './helpers/extension';

/**
 * 示例 E2E 测试
 *
 * 这个测试演示了如何测试扩展的基本功能
 *
 * 注意：这些测试需要构建扩展后才能运行
 * 运行前请确保执行：pnpm build
 */

test.describe('视频速度控制器扩展', () => {
  test.beforeEach(async ({ context }) => {
    // 每个测试前的设置
    // 可以在这里设置扩展的初始状态
  });

  test('应该能够加载扩展', async ({ context, extensionId }) => {
    // 验证扩展 ID 存在
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test.skip('应该能够在 YouTube 上控制视频速度', async ({ context }) => {
    // 创建新页面
    const page = await context.newPage();

    // 访问 YouTube 测试视频
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    // 等待视频加载
    await waitForVideo(page);

    // 获取初始播放速率
    const initialRate = await getVideoPlaybackRate(page);
    expect(initialRate).toBe(1.0);

    // 按下增加速度快捷键
    await pressShortcut(page, '=');

    // 等待 HUD 显示
    await waitForHUD(page);

    // 验证播放速率改变
    const newRate = await getVideoPlaybackRate(page);
    expect(newRate).toBeGreaterThan(initialRate);

    // 验证 HUD 显示正确的速度
    const hudText = await getHUDText(page);
    expect(hudText).toContain(newRate.toFixed(2));

    await page.close();
  });

  test.skip('应该能够在 Bilibili 上控制视频速度', async ({ context }) => {
    const page = await context.newPage();

    // 访问 Bilibili 测试视频
    await page.goto('https://www.bilibili.com/video/BV1xx411c7mD');

    // 等待视频加载
    await waitForVideo(page);

    // 获取初始播放速率
    const initialRate = await getVideoPlaybackRate(page);

    // 按下增加速度快捷键
    await pressShortcut(page, '=');

    // 验证播放速率改变
    const newRate = await getVideoPlaybackRate(page);
    expect(newRate).toBeGreaterThan(initialRate);

    await page.close();
  });
});
