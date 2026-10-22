import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 两个**窗口**同时起播 → 首次引导只能出现**一条**。
 *
 * ⚠️ 守的是实测 bug（2026-10-22）：
 * 两个浏览器窗口里各有一个视频，用户在两个窗口里几乎同时开始播放 ——
 * **两条引导同时弹出来**（两边都可见），而 storage.local 里只有
 * **一个**「已展示」标记。
 *
 * 引导是**设备级的一次性**提示（「已展示」标记在 storage.local，全设备共用），
 * 也是这个扩展**全部**的可见入口 —— 用户第一次见到它，就是两条一模一样的
 * 提示同时出现在两个窗口里。第一印象直接变成「这扩展真粗」。
 *
 * ─────────────────────────────────────────────────────────────
 * ⚠️ 为什么必须是**两个窗口**，不能是两个标签页：
 * 认领的前提是「文档可见」（document.visibilityState !== 'hidden'）。
 * 后台标签页在那个判据上就退出了 —— 两个标签页里只有一个可见，
 * 于是**根本撞不上**这个竞态，测出来永远是「一条引导」。
 * 两个窗口（chrome.windows.create）才都可见。
 *
 * ⚠️ 为什么必须用 `context.route` 而不是 `page.route`：
 * 由 chrome.windows.create 开出来的页面**不经过** page 级别的路由 ——
 * 用 page.route 的话那些请求会直接落到 chrome-error://（实测），
 * 页面里根本没有视频，也就没有引导可言。上下文级别的路由才管得到它们。
 *
 * ⚠️ 而且窗口得**先开成 about:blank，再由测试侧 goto**：
 * chrome.windows.create({url}) 的那次导航是**浏览器进程**发起的，
 * 它赶在 Playwright 来得及挂上路由之前就发出去了（实测：那一次请求
 * 直接落到本机 http server，拿到 404 页；路由处理器根本没被调用）。
 * 改成「开空白窗口 → page.goto」之后，导航由渲染进程发起，
 * 上下文路由就拦得到（实测：拿到的是我们fulfill的页面）。
 *
 * ⚠️ `chrome-extension://` 的请求必须放行（route.continue()）：
 * 拦掉它们的话，扩展自己的页面（options.html）加载不出来，
 * 连 `chrome.windows.create` 都发不出去。
 */

const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

const pageHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
video{display:block;width:320px;height:180px;background:#000}
</style></head><body><video id="v" muted playsinline preload="auto" src="${CLIP}"></video></body></html>`;

/**
 * 在**页面里**持续记录「引导可见的时间区间」。
 *
 * ⚠️ 为什么不在测试侧轮询：
 * 轮询有**采样盲区** —— 每 200ms 采一次，两条引导若错开出现
 * （一条 2.5s 后、一条 2.7s 后），采样点可能永远落在「只有一条可见」的
 * 时刻上，于是这条用例**恒绿**，而 bug 还在。
 *
 * 页面内的 MutationObserver 是**事件驱动**的：class 一变就记一笔，
 * 于是拿到的是**精确的可见区间**，而不是「若干个采样点的猜测」。
 * 最后用两条时间线求**交集** —— 有交集 = 两条引导**同时**出现过。
 *
 * ⚠️ 引导节点此刻**还不存在**：它是延迟挂上去的（要等视频起播满 2.5 秒
 * 才会 prepare/present）。所以这里先盯着 document，等它冒出来再开始记 ——
 * 早装（等节点出现再装）会漏掉它第一次出现的那一段。
 */
const installVisibilityTimeline = async (page) =>
  page.evaluate(() => {
    /** 可见区间的列表：{ from, to }（to 为 null 表示「还在可见」）。 */
    const spans = [];
    let openFrom = null;
    let element = document.getElementById('vsc-first-run-hint');

    const isVisible = () => {
      const el = element;
      if (!el || !el.isConnected) {
        return false;
      }

      return el.classList.contains('vsc-visible') && getComputedStyle(el).opacity !== '0';
    };

    const sample = () => {
      const visible = isVisible();
      if (visible && openFrom === null) {
        openFrom = performance.now();
      } else if (!visible && openFrom !== null) {
        spans.push({ from: openFrom, to: performance.now() });
        openFrom = null;
      }
    };

    // 节点出现的那一刻起，开始观察它的 class 变化（可见性的开关就是它），
    // 加上动画帧轮询兜底（opacity 是 CSS 过渡，class 变了 opacity 还要一会儿才到 0）。
    const watch = (el) => {
      new MutationObserver(sample).observe(el, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    };

    if (element) {
      watch(element);
    } else {
      // ⚠️ 节点还没挂上：盯着整棵文档，等它冒出来。
      new MutationObserver(() => {
        const el = document.getElementById('vsc-first-run-hint');
        if (el && el !== element) {
          element = el;
          watch(el);
          sample();
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }

    const raf = () => {
      sample();
      window.__vscTimelineRaf = requestAnimationFrame(raf);
    };
    raf();

    window.__vscTimeline = () => {
      sample();
      const result = [...spans];
      if (openFrom !== null) {
        result.push({ from: openFrom, to: null });
      }
      return result;
    };
  });

/** 读回页面里记录的可见区间。 */
const readVisibilityTimeline = (page) => page.evaluate(() => window.__vscTimeline?.() ?? []);

/**
 * 两条时间线有没有**同时可见**的交集。
 *
 * ⚠️ 判据是「区间相交」，不是「采样点相同」——
 * 前者是区间代数，后者是采样，采样有盲区。
 */
const hasOverlap = (a, b) => {
  const spansB = b.map((s) => ({
    from: s.from,
    // 「还在可见」= 无限长
    to: s.to === null ? Number.POSITIVE_INFINITY : s.to,
  }));

  return a.some((left) => {
    const from = left.from;
    const to = left.to === null ? Number.POSITIVE_INFINITY : left.to;
    return spansB.some((right) => from < right.to && right.from < to);
  });
};

test.describe('首次引导：跨窗口的认领', () => {
  // ⚠️ 这条用例天生就慢：开两个真窗口 + 等 8 秒盯着两边的提示。
  // 默认的 30 秒在机器有别的负载时不够用（实测会超时）。
  test.setTimeout(90_000);

  test('两个窗口同时起播 → 只有一条引导', async () => {
    const ext = await launchExtension();
    try {
      // ⚠️ 上下文级别的路由：chrome.windows.create 开出来的页面走的是它。
      await ext.context.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) {
          // 扩展自己的资源不能拦（options.html 就在里面）。
          return route.continue();
        }

        return route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml() });
      });

      // 内容脚本拿不到 chrome.windows（没有 chrome.tabs，也就没有 tabId），
      // 所以开窗口这件事得由**扩展自己的页面**来做。
      const options = await ext.context.newPage();
      await options.goto(`chrome-extension://${ext.extensionId}/options.html`);

      const known = new Set(ext.context.pages());
      const opened = await options.evaluate(async () => {
        const created = await Promise.all([
          chrome.windows.create({ url: 'about:blank', type: 'normal', width: 800, height: 600 }),
          chrome.windows.create({ url: 'about:blank', type: 'normal', width: 800, height: 600 }),
        ]);
        return created.map((w) => w.id);
      });
      expect(opened.length, '两个窗口都开出来了').toBe(2);

      // 等两个窗口的页面进来（它们是同一个 BrowserContext 里的新 page）。
      await expect
        .poll(() => ext.context.pages().filter((p) => !known.has(p)).length, { timeout: 15_000 })
        .toBe(2);

      const windows = ext.context.pages().filter((p) => !known.has(p));

      // ⚠️ 窗口开成 about:blank 之后再由测试侧 goto ——
      // chrome.windows.create 的那次导航赶在路由挂上之前就发出去了（见文件头）。
      await Promise.all(
        windows.map((p, i) => p.goto(`http://127.0.0.1:4173/vsc-hint-win-${i}.html`)),
      );
      await Promise.all(windows.map((p) => p.waitForLoadState('domcontentloaded')));

      // ⚠️ 前置条件：两个窗口都必须**看得见**。
      // 看不见的窗口在认领的第一道判据上就退出了（那是设计如此：
      // 后台标签页不许抢锁），那样根本撞不上这个竞态。
      const visibility = await Promise.all(
        windows.map((p) => p.evaluate(() => document.visibilityState)),
      );
      expect(visibility, '两个窗口都要是可见的，否则测的不是这个竞态').toEqual([
        'visible',
        'visible',
      ]);

      // ⚠️ 必须有用户手势：站点自己播起来的视频会被判成「装饰性自动播放」
      // （ambientPreview 的共享判定），引导根本不会为它出现。
      await Promise.all(windows.map((p) => p.locator('#v').click({ force: true })));

      // ⚠️ 时间线必须在**起播之前**装好：装晚了就会漏掉引导第一次出现的那一段。
      // （引导节点此刻还不存在 —— 它要等视频起播才挂上 ——
      //   所以 installVisibilityTimeline 会盯着 document 等它冒出来。）
      await Promise.all(windows.map(installVisibilityTimeline));

      // 两个窗口在**同一个时刻**开始播放 —— 竞态窗口只有几毫秒宽。
      const startAt = Date.now() + 300;
      await Promise.all(
        windows.map((p) =>
          p.evaluate((at) => {
            const wait = Math.max(0, at - Date.now());
            setTimeout(() => {
              document.getElementById('v').play().catch(() => {});
            }, wait);
          }, startAt),
        ),
      );

      // 引导在播放满 2.5 秒之后出现（认领还要等一段稳定窗口）。
      // 页面里的时间线会**持续记录**可见区间（事件驱动，无采样盲区）。
      await new Promise((resolve) => setTimeout(resolve, 8000));

      const timelines = await Promise.all(windows.map(readVisibilityTimeline));
      const [first, second] = timelines;

      // ⚠️ 前置条件：至少一条引导必须**真的出现过**。
      // 一条都没有 = 引导根本没出现（那也是事故 —— 它是唯一的可见入口），
      // 而此时「没有交集」这个断言会**恒真**，变成假守卫。
      expect(
        first.length + second.length,
        '两个窗口里一条引导都没出现过 —— 这条用例测的不是竞态',
      ).toBeGreaterThan(0);

      expect(
        hasOverlap(first, second),
        `两个窗口的引导可见区间有交集 = 两条引导同时出现过。\n` +
          `窗口 A: ${JSON.stringify(first)}\n` +
          `窗口 B: ${JSON.stringify(second)}`,
      ).toBe(false);
    } finally {
      await ext.close();
    }
  });
});
