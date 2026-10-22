import { test, expect } from '@playwright/test';
import { launchExtension } from './helpers/launch.js';

/**
 * 「帧的归属」回归守卫 —— 快捷键到底该作用在哪个视频上。
 *
 * 这套用例守的是扩展最容易被忽略、也最影响日常使用的一条边界：
 * **键盘事件只会被派发到焦点所在的那个文档**。
 *
 * 实测（真实 Chromium）：
 * - 焦点在顶层文档 → 只有顶层文档收到 keydown
 * - 焦点在 iframe 里 → **只有那个 iframe 收到 keydown**，顶层文档一个都收不到
 *
 * 而内容脚本默认只注入顶层文档 —— 于是「用户点了播放键、焦点进了播放器、
 * 然后按 =」这条最常见的路径**完全无效**（实测：iframe 里的视频倍率纹丝不动）。
 * 页面越依赖 iframe 嵌入播放器（视频站、网课、新闻站），扩展越像没装。
 *
 * 修法是内容脚本注入到所有 frame（all_frames），由**焦点所在的那个 frame** 执行。
 * 这套用例守的正是「别串台」：
 * - 焦点在 iframe 里 → 只有 iframe 里的视频变速，顶层的视频不许动
 * - 焦点在顶层 → 只有顶层的视频变速，iframe 里的视频不许动
 * - 点扩展图标（显式操作，没有焦点语境）→ 只有焦点所在的那个 frame 执行，
 *   不能所有 frame 一起进全屏、一起弹提示
 */

const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
};

const INNER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
video{display:block;width:320px;height:180px;background:#000}
#grab{margin:8px}
</style></head><body><video id="inner" muted playsinline></video><p id="grab">grab</p></body></html>`;

const OUTER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
video{display:block;width:480px;height:270px;background:#111}
#grab{margin:8px}
iframe{display:block;width:320px;height:220px;border:0}
</style></head><body><video id="top" muted playsinline></video><p id="grab">grab</p>
<iframe id="f1" src="/inner.html"></iframe></body></html>`;

const routePages = (page) => page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('chrome-extension://')) return route.continue();
  return route.fulfill({ status: 200, contentType: 'text/html', body: url.includes('inner.html') ? INNER : OUTER });
});

/** 读两个视频当前的倍率。 */
const readRates = (page) => page.evaluate(() => ({
  top: document.getElementById('top').playbackRate,
  inner: document.getElementById('f1').contentDocument.getElementById('inner').playbackRate,
}));

const openPage = async (ext) => {
  const page = await ext.context.newPage();
  const errors = watchErrors(page);
  await routePages(page);
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForTimeout(700);
  return { page, errors };
};

/** 把焦点送进 iframe 内部（点一个非输入元素 —— 输入框里的键扩展是不抢的）。 */
const focusInsideFrame = async (page) => {
  const frame = page.frameLocator('#f1');
  await frame.locator('#grab').click();
  await page.waitForTimeout(200);
};

test.describe('帧的归属：快捷键作用在哪个视频上', () => {
  test('焦点在 iframe 里：只有 iframe 里的视频变速', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);
      await focusInsideFrame(page);

      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      const rates = await readRates(page);

      expect(rates.inner, '焦点在 iframe 里时，iframe 里的视频应该能被调速').toBeCloseTo(1.1, 2);
      expect(rates.top, '顶层文档的视频不该被牵连').toBeCloseTo(1.0, 2);
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('焦点在顶层文档：只有顶层的视频变速', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);
      await page.locator('#grab').click();
      await page.waitForTimeout(200);

      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      const rates = await readRates(page);

      expect(rates.top, '焦点在顶层时，顶层视频应该能被调速').toBeCloseTo(1.1, 2);
      expect(rates.inner, 'iframe 里的视频不该被牵连').toBeCloseTo(1.0, 2);
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('点扩展图标：只有被点名的那个 frame 执行', async () => {
    // background 的做法是 chrome.tabs.sendMessage(tabId, msg, { frameId }) ——
    // 只发给**一个** frame。
    //
    // ⚠️ frameId 不能写死：Chrome 的 frameId **不是连号的**
    // （实测：顶层是 0，同源 iframe 是 2，1 号根本不存在），
    // 写死一个数等于把测试绑在一个跟实现无关的巧合上。
    // 真实 frameId 从 background 自己记下的「用户此刻在哪个 frame」里取 ——
    // 这条链路（焦点上报 → 记住 → 寻址）正好也是这次要验的东西。
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);
      await focusInsideFrame(page);

      const tabId = await ext.serviceWorker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0]?.id ?? null;
      });
      expect(tabId, '前置条件：拿不到当前标签页').not.toBeNull();

      // background 记下的那个 frame —— 用户刚才点过的地方。
      const focusedFrameId = await ext.serviceWorker.evaluate(async (id) => {
        const key = `vsc-tab-focus-frame:${id}`;
        const stored = await chrome.storage.session.get(key);
        return stored?.[key] ?? null;
      }, tabId);

      expect(focusedFrameId, '焦点在 iframe 里时，background 该记住的是 iframe 那个 frame').not.toBeNull();
      expect(focusedFrameId, '顶层 frame 的 frameId 恒为 0，记住它就说明焦点判断错了')
        .not.toBe(0);

      // 只发给 background 记住的那个 frame。
      await ext.serviceWorker.evaluate(async ({ id, frameId }) => {
        await chrome.tabs.sendMessage(
          id,
          { type: 'vsc-toggle-fullscreen' },
          { frameId },
        );
      }, { id: tabId, frameId: focusedFrameId });
      await page.waitForTimeout(500);

      const state = await page.evaluate(() => {
        const innerDocument = document.getElementById('f1').contentDocument;
        return {
          topOverlay: !!document.getElementById('vsc-page-fullscreen-overlay'),
          topNotice: !!document.getElementById('vsc-takeover-notice'),
          innerOverlay: !!innerDocument.getElementById('vsc-page-fullscreen-overlay'),
          innerNotice: !!innerDocument.getElementById('vsc-takeover-notice'),
        };
      });

      // 被点名的 frame 执行：iframe 里的视频能被搬进 overlay（它在 iframe 自己的
      // document 里，跨 document 是搬不动的 —— 这正是 all_frames 带来的好处）。
      expect(state.innerOverlay, '被点名的 iframe frame 该把视频接进全屏').toBe(true);
      // 没被点名的顶层 frame 必须袖手旁观：否则用户会同时看到一个全屏画面
      // 和一条「接管不了」的提示。
      expect(state.topOverlay, '没被点名的顶层 frame 不该进全屏').toBe(false);
      expect(state.topNotice, '没被点名的顶层 frame 不该弹「接管不了」的提示').toBe(false);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });
});
