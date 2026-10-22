import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { launchExtension } from './helpers/launch.js';
import { anyLocaleFragment } from './helpers/i18n.js';

/**
 * 「视频在别处」的回归守卫 —— 快捷键按下去不能毫无反应。
 *
 * 这套用例守的是 6.1.0 架构调整（每个 frame 只管自己文档里的视频）带出来的
 * 一条静默失败：
 *
 *   页面里唯一的视频在嵌入框里，而焦点在顶层 → 按 `=` / `f` **什么都不会发生**。
 *
 * 因为：顶层运行时看不见嵌入框里的视频 → 没有明确目标 → 键按原则要**放行**
 * 给页面 → 页面没绑定 → 静默无事发生。用户能得出的唯一结论是「扩展坏了」。
 *
 * 修法是让扩展**说出真相**：这一层没有视频时，去问一圈 background
 * 「别的 frame 有没有视频」，有就告诉用户视频在嵌入框里。
 *
 * ⚠️ 覆盖边界（别把没测到的当成测到了）：
 * - 这条守的是**快捷键路径**。
 * - 「点工具栏图标 → 发给视频所在的那个 frame」走的是 background 的
 *   路由代码，浏览器工具栏上的图标在 Playwright 里**点不到**（浏览器 UI
 *   不在页面的可及范围内），所以那条路由由单元测试守住
 *   （src/background/action.test.ts，带变异验证）。
 */

const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
};

/** 顶层页面**没有**视频，视频只在嵌入框里。 */
const INNER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
video{display:block;width:320px;height:180px;background:#000}
</style></head><body><video id="inner" muted playsinline></video></body></html>`;

const OUTER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
#grab{margin:8px}
iframe{display:block;width:320px;height:220px;border:0}
</style></head><body><p id="grab">grab</p>
<iframe id="f1" src="/inner.html"></iframe></body></html>`;

/** 整个页面都没有视频。 */
const EMPTY = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
#grab{margin:8px}
</style></head><body><p id="grab">grab</p></body></html>`;

const routePages = (page) => page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('chrome-extension://')) return route.continue();
  const body = url.includes('inner.html') ? INNER : (url.includes('empty.html') ? EMPTY : OUTER);
  return route.fulfill({ status: 200, contentType: 'text/html', body });
});

const openPage = async (ext, path = '/') => {
  const page = await ext.context.newPage();
  const errors = watchErrors(page);
  await routePages(page);
  await page.goto(`http://127.0.0.1:4173${path}`);
  await page.waitForTimeout(700);
  return { page, errors };
};

/** 顶层文档里的提示（视频在嵌入框里时，提示出现在用户正在看的那一层）。 */
const readTopNotice = (page) => page.evaluate(() => {
  const root = document.getElementById('vsc-takeover-notice');
  return root ? root.textContent : null;
});

test.describe('视频在别处时不能静默', () => {
  test('焦点在顶层、视频在嵌入框里 → 按快捷键会说明视频在嵌入框里', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      // 前置条件：顶层文档里确实没有视频，视频只在嵌入框里。
      const topVideos = await page.evaluate(() => document.querySelectorAll('video').length);
      expect(topVideos, '前置条件：顶层不该有 video').toBe(0);

      // 焦点留在顶层（不去点嵌入框）—— 这正是「自动播放的嵌入播放器」的常态。
      await page.locator('#grab').click();
      await page.waitForTimeout(200);

      await page.keyboard.press('=');

      // 用轮询而不是固定等待：跨 frame 的一问一答要走 background，
      // 起来的快慢取决于各 frame 的内容脚本什么时候就绪 —— 固定等待
      // 会把「慢」误判成「失败」（实测过一次）。
      await expect
        .poll(async () => readTopNotice(page), { timeout: 5_000 })
        .toMatch(anyLocaleFragment('noticeVideoElsewhere'));
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('整个页面都没有视频 → 不弹「视频在别处」', async () => {
    // 那句话只在「别的 frame 确实有视频」时成立。没有视频的页面上弹它
    // 是假消息，比不弹更糟。
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext, '/empty.html');

      await page.locator('#grab').click();
      await page.waitForTimeout(200);

      await page.keyboard.press('=');
      // 反向断言只能等够久：等得不够就会「还没弹出来」被误判成「没弹」。
      //
      // ⚠️ 这个「够久」由**产品自己的预算**决定，不是拍脑袋：background 问一圈
      // 会在 **1.8 秒**（VIDEO_OWNER_QUERY_BUDGET_MS）之内持续重问，
      // 只有到那时才会给出「真的没有视频」的结论。等 1.2 秒就断言，
      // 测到的只是「1.2 秒时还没弹」—— 恒真的守卫。
      await page.waitForTimeout(2_600);

      const notice = await readTopNotice(page);
      expect(notice, '没有视频的页面上不该说「视频在嵌入框里」').toBeNull();
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('「谁有视频」的广播 → 嵌入框里的那个 frame 真的会回答', async () => {
    // 这一条守的是协议本身：6.1.0 之后每个 frame 只管自己 document 里的视频，
    // 于是「视频在哪儿」只能靠各个 frame 回答。回答必须真的从别的 frame
    // 飞回 background —— 走的是 chrome.runtime.sendMessage（不是
    // tabs.sendMessage 的响应：一次广播只保留一个响应，其余会被丢掉）。
    const ext = await launchExtension();
    try {
      const { page } = await openPage(ext);

      const tabId = await ext.serviceWorker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0]?.id ?? null;
      });
      expect(tabId, '前置条件：拿不到当前标签页').not.toBeNull();

      const reports = await ext.serviceWorker.evaluate(async (id) => {
        const collected = [];
        const listener = (message, sender) => {
          if (message?.type === 'vsc-video-owner-report') {
            collected.push({
              frameId: sender.frameId,
              explicit: message.explicit,
              watched: message.watched,
            });
          }
        };
        chrome.runtime.onMessage.addListener(listener);

        // 广播「你们谁有视频？」—— 没有 frame 会调用 sendResponse，
        // 所以用回调形态（回调只负责消化「没有响应」这件事）。
        await new Promise((resolve) => {
          chrome.tabs.sendMessage(id, { type: 'vsc-video-owner-ask' }, () => resolve());
        });
        await new Promise((resolve) => setTimeout(resolve, 600));

        chrome.runtime.onMessage.removeListener(listener);
        return collected;
      }, tabId);

      expect(reports.length, '至少要有一个 frame 回答').toBeGreaterThan(0);
      expect(
        reports.some((report) => report.watched),
        `嵌入框里的那个 frame 应该回答「我能接管」：${JSON.stringify(reports)}`,
      ).toBe(true);
    } finally {
      await ext.close();
    }
  });
});
