import { test as base, BrowserContext } from '@playwright/test';
import { launchBrowserWithExtension, cleanupBrowser } from './extension';

/**
 * 扩展测试 Fixture 类型
 */
export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

/**
 * 扩展测试 Fixture
 * 自动启动带有扩展的浏览器上下文
 */
export const test = base.extend<ExtensionFixtures>({
  // 浏览器上下文 fixture
  context: async ({}, use) => {
    const { context, extensionId } = await launchBrowserWithExtension();

    // 使用上下文
    await use(context);

    // 清理
    await cleanupBrowser(context);
  },

  // 扩展 ID fixture
  extensionId: async ({ context }, use) => {
    // 从上下文中获取扩展 ID
    let extensionId = '';

    // 等待扩展页面出现
    const pages = context.pages();
    for (const page of pages) {
      if (page.url().startsWith('chrome-extension://')) {
        const url = new URL(page.url());
        extensionId = url.hostname;
        break;
      }
    }

    if (!extensionId) {
      // 如果没有找到，尝试从 service worker 获取
      const serviceWorkers = context.serviceWorkers();
      for (const worker of serviceWorkers) {
        if (worker.url().startsWith('chrome-extension://')) {
          const url = new URL(worker.url());
          extensionId = url.hostname;
          break;
        }
      }
    }

    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
