import { test, expect } from '@playwright/test';
import { launchExtension } from './helpers/launch.js';
import { anyLocale } from './helpers/i18n.js';

/**
 * 工具栏标题不许挂在**早已不存在**的倍速上。
 *
 * 故障（实测，真实 Chromium）：
 * 视频在 iframe 里、调到 1.2 倍 → 标题是「Video Speed Controller — 1.2x」；
 * SPA 把那个 iframe 整个换掉（`slot.innerHTML = ''`）→ 页面上一个视频都没有了，
 * 标题却还挂着 1.2 倍 —— 标题在说谎。
 *
 * 根因：background 记着「这个标签页的倍速是哪个 frame 报的」，
 * 而复位标题的唯一判据是「**报出这个倍速的那个 frame 自己**说它没有视频了」。
 * 那个 frame 没了之后**没有人**会再来说这件事 —— 于是判据永远等不到，
 * 读数永远挂着（storage.session 里那份记录也一直指着那个已经不存在的 frame）。
 *
 * 修法有两条独立的路径（哪条先到算哪条）：
 * 1. 那个 frame 主动告别（页面卸载 / iframe 被换掉 → pagehide）；
 * 2. background 复核：URL 变了（换页）→ 探针问「那个视频还在吗」，
 *    问不到就复位。
 *
 * ⚠️ 这套用例守的是**「标题不许说谎」**，不是某个具体实现：
 * 两条路径任何一条生效，断言就该过。
 */

const INNER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
video{display:block;width:320px;height:180px;background:#000}
#grab{margin:8px}
</style></head><body><video id="inner" muted playsinline></video><p id="grab">grab</p>
</body></html>`;

const OUTER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
#grab{margin:8px}
iframe{display:block;width:320px;height:220px;border:0}
</style></head><body><p id="grab">grab</p>
<div id="slot"><iframe id="f1" src="/inner.html"></iframe></div>
</body></html>`;

const routePages = (page) => page.route('**/*', (route) => {
  const url = route.request().url();
  // ⚠️ 内容脚本是靠动态 import 拉 chrome-extension://.../content.js 的：
  // 那个请求一旦被 fulfill 成 text/html，MIME 严格检查会让 import 直接失败，
  // 内容脚本根本没起来 —— 症状是「测试干等」。
  if (url.startsWith('chrome-extension://')) return route.continue();
  return route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: url.includes('inner.html') ? INNER : OUTER,
  });
});

/** 打开页面，把焦点送进 iframe，调到 1.2 倍，返回标题读取函数。 */
const setUp = async (ext) => {
  const page = await ext.context.newPage();
  await routePages(page);
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
  await page.waitForTimeout(500);

  // 必须按 URL 找标签页：launchPersistentContext 会自带一个空白页。
  const worker = ext.serviceWorker;
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url?.startsWith('http://127.0.0.1:4173/'))?.id ?? null;
  });
  expect(tabId, '前置条件：拿不到当前标签页').not.toBeNull();

  const title = () => worker.evaluate(
    (id) => chrome.action.getTitle({ tabId: id }),
    tabId,
  );

  // 焦点必须进 iframe：键只会被派发到焦点所在的那个文档。
  await page.frameLocator('#f1').locator('#grab').click();
  await page.waitForTimeout(200);
  await page.keyboard.press('=');
  await page.waitForTimeout(200);
  await page.keyboard.press('=');

  // 前置条件：iframe 里的视频真的调到了 1.2 倍。
  await expect
    .poll(
      () => page.evaluate(() =>
        document.getElementById('f1').contentDocument.getElementById('inner').playbackRate),
      { timeout: 10_000 },
    )
    .toBeCloseTo(1.2, 2);

  // 前置条件：标题上已经挂着 1.2 倍。
  await expect.poll(title, { timeout: 10_000 }).toContain('1.2x');

  return { page, title };
};

test.describe('标题不许挂在早已不存在的倍速上', () => {
  test('SPA 换页（URL 变了）并把 iframe 换掉 → 标题复位', async () => {
    const ext = await launchExtension();
    try {
      const { page, title } = await setUp(ext);

      // 真实 SPA 的形态：先换路由（URL 变了），再把内容换掉。
      await page.evaluate(() => {
        history.pushState({}, '', '/second');
        document.getElementById('slot').innerHTML = '';
      });

      // 关键断言：那个倍速已经不存在了，标题不许再挂着它。
      await expect.poll(title, { timeout: 10_000 }).not.toContain('1.2x');
      // 更强的一条：标题回到默认（页面上一个视频都没有，不该有倍速读数）。
      await expect.poll(title, { timeout: 10_000 }).toMatch(anyLocale('actionTitle'));
    } finally {
      await ext.close();
    }
  });

  test('SPA 只把 iframe 换掉（URL 没变）→ 标题复位', async () => {
    const ext = await launchExtension();
    try {
      const { page, title } = await setUp(ext);

      // 没有路由变化：这条只能靠「那个 frame 自己说它要走了」——
      // 换页信号（URL 变化）在这里根本不会出现。
      await page.evaluate(() => {
        document.getElementById('slot').innerHTML = '';
      });

      await expect.poll(title, { timeout: 10_000 }).not.toContain('1.2x');
      await expect.poll(title, { timeout: 10_000 }).toMatch(anyLocale('actionTitle'));
    } finally {
      await ext.close();
    }
  });

  test('整页导航到一个没有视频的页面 → 标题复位', async () => {
    // ⚠️ 这条守的是「内容脚本不再拿 1 冒充倍速」那个改动的**代价**。
    //
    // 以前内容脚本启动时上报的是 `rate: 1`（「没有视频就当 1 倍」），
    // 于是「整页导航后标题复位」是**顺带**发生的 —— 靠一条谎报撑着的。
    // 现在谎报没了（「这里没有视频」不是一个可以写进标题的倍速），
    // 复位必须由**明确的路径**负责。
    //
    // ⚠️ 实测（真实 Chromium）：**跨文档导航时 Chrome 自己会把这一标签页的
    // 标题恢复成默认值**（探针里全程没有一次 setTitle 调用，标题却已经回到
    // 默认态了）。所以这条用例守的不是「谁改的」，而是「这条契约仍然成立」——
    // 哪天那条「顺带」的路被彻底堵死（或者我们自己的逻辑把它覆盖回去），
    // 它会红。
    const ext = await launchExtension();
    try {
      const { page, title } = await setUp(ext);

      // 整页导航到一个**没有视频**的页面。
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) return route.continue();
        if (url.includes('inner.html')) {
          return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INNER });
        }
        return route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p id="grab">no video here</p></body></html>',
        });
      });
      await page.goto('http://127.0.0.1:4173/blank');

      await expect.poll(title, { timeout: 10_000 }).not.toContain('1.2x');
      await expect.poll(title, { timeout: 10_000 }).toMatch(anyLocale('actionTitle'));
    } finally {
      await ext.close();
    }
  });

  test('站点把页面里的视频换掉（页面还在）→ 标题复位', async () => {
    // 这一条走的是**另一条**路径：页面没换、frame 也没死，
    // 只是那个 <video> 被站点从 DOM 里拿走了。
    //
    // ⚠️ 这时**没有任何事件**会通知扩展：视频被摘掉时没有 ratechange
    // （它只是被删了），页面也没有 focus 事件。唯一能说这件事的，是内容脚本
    // 自己盯着「报出去过倍速的那个视频」——它不见了，就上报
    // 「这一层没有受控视频」（**不带 rate**），由 background 判断读数该不该作废。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) return route.continue();
        return route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!DOCTYPE html><html><head><meta charset="utf-8"><style>video{width:320px;height:180px;background:#000}</style></head><body><p id="grab">grab</p><div id="slot"><video id="v1"></video></div></body></html>',
        });
      });
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.waitForTimeout(500);

      const worker = ext.serviceWorker;
      const tabId = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.find((tab) => tab.url?.startsWith('http://127.0.0.1:4173/'))?.id ?? null;
      });
      expect(tabId).not.toBeNull();
      const title = () => worker.evaluate(
        (id) => chrome.action.getTitle({ tabId: id }),
        tabId,
      );

      // ⚠️ 必须点**视频本身**：那一下是「用户亲手选过」的手势证据 ——
      // 注册表只认有手势证据的那条候选（与 toolbar-title.spec.js 同一手法）。
      await page.locator('#v1').click();
      await page.waitForTimeout(200);
      // 没有真实媒体源的视频 readyState 恒为 0 —— 注册表会把它当成
      // 「还不能接管的视频」。这里把它摆成一个就绪的视频。
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
      });
      await page.keyboard.press('=');
      await page.waitForTimeout(200);
      await page.keyboard.press('=');

      await expect
        .poll(() => page.evaluate(() => document.getElementById('v1').playbackRate), { timeout: 10_000 })
        .toBeCloseTo(1.2, 2);
      await expect.poll(title, { timeout: 10_000 }).toContain('1.2x');

      // 站点把那个视频换掉了（换清晰度 / 重建播放器）。
      await page.evaluate(() => {
        document.getElementById('slot').innerHTML = '';
      });

      await expect.poll(title, { timeout: 10_000 }).not.toContain('1.2x');
      await expect.poll(title, { timeout: 10_000 }).toMatch(anyLocale('actionTitle'));
    } finally {
      await ext.close();
    }
  });
});
