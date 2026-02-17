import { BrowserContext, chromium, Page } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES 模块中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 扩展路径配置
 */
export const EXTENSION_PATH = path.resolve(__dirname, '../../../dist');

/**
 * 启动带有扩展的浏览器上下文
 *
 * @returns 浏览器上下文和扩展 ID
 */
export async function launchBrowserWithExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  // 启动持久化上下文（Chrome 扩展需要）
  const context = await chromium.launchPersistentContext('', {
    headless: false, // Chrome 扩展在 headless 模式下可能有问题
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  // 等待扩展加载
  await context.waitForEvent('page', { timeout: 10000 });

  // 获取扩展 ID
  let extensionId = '';
  for (const page of context.pages()) {
    if (page.url().startsWith('chrome-extension://')) {
      const url = new URL(page.url());
      extensionId = url.hostname;
      await page.close();
      break;
    }
  }

  if (!extensionId) {
    throw new Error('无法获取扩展 ID');
  }

  return { context, extensionId };
}

/**
 * 在页面中注入扩展内容脚本
 *
 * @param page - Playwright 页面对象
 */
export async function waitForExtensionInjection(page: Page): Promise<void> {
  // 等待内容脚本注入
  await page.waitForFunction(
    () => {
      // 检查扩展是否已注入
      return document.querySelector('#vsc-root') !== null;
    },
    { timeout: 10000 }
  );
}

/**
 * 获取扩展的设置页面
 *
 * @param context - 浏览器上下文
 * @param extensionId - 扩展 ID
 * @returns 设置页面对象
 */
export async function getOptionsPage(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  const page = await context.newPage();
  await page.goto(optionsUrl);
  return page;
}

/**
 * 模拟键盘快捷键
 *
 * @param page - Playwright 页面对象
 * @param key - 按键
 */
export async function pressShortcut(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  // 等待一小段时间让扩展处理快捷键
  await page.waitForTimeout(100);
}

/**
 * 获取视频元素的播放速率
 *
 * @param page - Playwright 页面对象
 * @returns 播放速率
 */
export async function getVideoPlaybackRate(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const video = document.querySelector('video');
    return video ? video.playbackRate : 1.0;
  });
}

/**
 * 获取视频元素的音量
 *
 * @param page - Playwright 页面对象
 * @returns 音量（0-1）
 */
export async function getVideoVolume(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const video = document.querySelector('video');
    return video ? video.volume : 1.0;
  });
}

/**
 * 检查 HUD 是否可见
 *
 * @param page - Playwright 页面对象
 * @returns 是否可见
 */
export async function isHUDVisible(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const hud = document.querySelector('#vsc-hud');
    if (!hud) return false;

    const style = window.getComputedStyle(hud);
    return style.display !== 'none' && style.opacity !== '0';
  });
}

/**
 * 获取 HUD 显示的文本内容
 *
 * @param page - Playwright 页面对象
 * @returns HUD 文本内容
 */
export async function getHUDText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const hud = document.querySelector('#vsc-hud');
    return hud ? hud.textContent || '' : '';
  });
}

/**
 * 等待 HUD 显示
 *
 * @param page - Playwright 页面对象
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForHUD(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  await page.waitForSelector('#vsc-hud', {
    state: 'visible',
    timeout,
  });
}

/**
 * 等待 HUD 隐藏
 *
 * @param page - Playwright 页面对象
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForHUDHidden(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  await page.waitForSelector('#vsc-hud', {
    state: 'hidden',
    timeout,
  });
}

/**
 * 检查 Lightbox 是否激活
 *
 * @param page - Playwright 页面对象
 * @returns 是否激活
 */
export async function isLightboxActive(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const lightbox = document.querySelector('#vsc-lightbox');
    if (!lightbox) return false;

    const style = window.getComputedStyle(lightbox);
    return style.display !== 'none';
  });
}

/**
 * 等待视频加载完成
 *
 * @param page - Playwright 页面对象
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForVideo(
  page: Page,
  timeout: number = 10000
): Promise<void> {
  await page.waitForSelector('video', { timeout });

  // 等待视频元数据加载
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video');
      return video && video.readyState >= 2; // HAVE_CURRENT_DATA
    },
    { timeout }
  );
}

/**
 * 清理浏览器上下文
 *
 * @param context - 浏览器上下文
 */
export async function cleanupBrowser(context: BrowserContext): Promise<void> {
  await context.close();
}
