import { test, expect } from '@playwright/test';
import { SD_4X3_MP4_BASE64 } from './fixtures/sd-4x3.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 首次引导：「重新显示使用引导」必须**真的**兑现。
 *
 * ⚠️ 实测（真实 Chromium + 真实扩展）的故障形状：
 *
 * 用户**没读完**就关掉了引导（点「×」）→ 「已展示」那个键**根本不存在**
 * → 设置页的「重新显示使用引导」执行 `removeValue` 时，
 * **删一个不存在的键不触发 `storage.onChanged`**（实测：`{ events: [] }`）
 * → 已经打开的标签页里的引导**不会回来**，
 * 而按钮当场显示「已重置」、状态栏也说「已重置」。
 * 承诺兑现不了 —— 而这个按钮是产品**唯一**的恢复出口。
 *
 * 根因：「已展示」的落盘时机是「**读完**」（`completeRead()`），
 * 而「读完」需要一段阅读窗口（按行数算：完整版 4 秒）。
 * 用户在那之前关掉它 → 键不存在。
 *
 * 修法：「已展示」在**显示的当下**就落盘。
 * 于是键**存在**（哪怕值是 `false`）→ 删除一定触发事件 → 引导能回来。
 *
 * ⚠️ 守卫量的是**用户真正看到的东西**：
 * - 视觉：提示节点的 **computed style**（display / visibility / opacity 三样都要过）
 * - 而且**采样必须被证明发生过**（提示只挂几秒，只读一次的话
 *   「没读到」与「没出现」在断言上长得一样 —— 那是一条恒真的守卫）
 */

const HINT_ID = 'vsc-first-run-hint';
const SHOWN_KEY = 'vsc-first-run-hint-shown';

const serve = (page, body) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    if (url.endsWith('.mp4')) {
      return route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: Buffer.from(SD_4X3_MP4_BASE64, 'base64'),
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });

/** 一个正经的播放器：带原生 controls，autoplay。 */
const playerHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#main{width:900px;height:600px;background:#000;display:block}</style>
</head><body>
<video id="main" controls autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
</body></html>`;

/**
 * 持续采样：引导有没有**真的**出现过。
 *
 * ⚠️ 必须采样而不是只读一次：引导只挂几秒，读一次的时刻不对就什么也读不到 ——
 * 而「没读到」与「没出现」在断言上长得一样，那是一条恒真的守卫。
 */
const startSampler = (page) =>
  page.evaluate((hintId) => {
    window.__vscProbe = { samples: 0, sawVisible: false, texts: [] };
    const timer = setInterval(() => {
      const probe = window.__vscProbe;
      probe.samples += 1;
      const hint = document.getElementById(hintId);
      if (!hint) return;
      const computed = getComputedStyle(hint);
      if (
        computed.display !== 'none'
        && computed.visibility !== 'hidden'
        && Number(computed.opacity) > 0
      ) {
        probe.sawVisible = true;
        const text = hint.textContent ?? '';
        if (!probe.texts.includes(text)) {
          probe.texts.push(text);
        }
      }
    }, 50);
    window.__vscStopProbe = () => clearInterval(timer);
  }, HINT_ID);

const stopSampler = (page) =>
  page.evaluate(() => {
    window.__vscStopProbe?.();
    return window.__vscProbe;
  });

test.describe('首次引导：「重新显示使用引导」必须兑现', () => {
  test.setTimeout(90_000);

  test('没读完就关掉引导 → 点「重新显示使用引导」→ 已打开的标签页里引导回来', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, playerHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(1200);

      // 前置条件：视频在播（引导会为它排队）。
      const paused = await page.evaluate(() => document.getElementById('main').paused);
      expect(paused, '前置条件：视频应该在播').toBe(false);

      // 第一轮：引导出现。
      await expect
        .poll(
          async () =>
            page.evaluate((id) => {
              const hint = document.getElementById(id);
              if (!hint) return false;
              const computed = getComputedStyle(hint);
              return computed.display !== 'none'
                && computed.visibility !== 'hidden'
                && Number(computed.opacity) > 0;
            }, HINT_ID),
          { timeout: 10_000 },
        )
        .toBe(true);

      // ⚠️ 用户**没读完**就关掉它（点「×」）：那是一次拒绝。
      // 这一步之后，「已展示」那个键必须**存在**（值可以是 false）——
      // 键不存在的话，设置页删它不会触发 storage.onChanged，
      // 引导就再也叫不回来（而按钮却在说「已重置」）。
      await page.click('#vsc-first-run-hint-close', { force: true });
      await page.waitForTimeout(300);

      const afterDismiss = await ext.serviceWorker.evaluate(
        (key) => chrome.storage.local.get(key),
        SHOWN_KEY,
      );
      expect(
        Object.prototype.hasOwnProperty.call(afterDismiss, SHOWN_KEY),
        '「已展示」这个键必须存在（值可以是 false）—— 删一个不存在的键不触发 storage.onChanged',
      ).toBe(true);

      // 设置页点「重新显示使用引导」。
      const options = await ext.context.newPage();
      await options.goto(`chrome-extension://${ext.extensionId}/options.html`);
      await options.waitForTimeout(500);
      await options.click('#reset-hint');
      await options.waitForTimeout(500);

      // 按钮当场说「已重置」——那是**承诺**。下面验的是这个承诺兑现。
      const buttonText = await options.textContent('#reset-hint');
      expect(buttonText, '按钮必须给出看得见的反馈').toBeTruthy();

      // 同一个标签页里（**不刷新**），引导应该再出现一次。
      // ⚠️ 采样窗口必须**明显长于**产品自己的等待时长（2026-10-22 改）。
      //
      // 重置之后的重来走的是 `scheduleReveal`，也就是**完整**的
      // `WATCH_DELAY`（2.5 秒）—— 产品有意这么做：刚关掉引导的人
      // 不该在 300 毫秒后被同一个东西再糊一次脸。
      //
      // 实测（真实 Chromium，3 次）：引导重新可见的时刻是 **2.15 秒**左右
      // （2.5 秒的等待 + 认领往返 + 220ms 淡入的一部分）。
      // 所以原来那个 **4000ms** 的窗口只剩 1.8 秒余量 ——
      // 认领那次跨进程往返稍慢就滑出去，用例红，而**产品是对的**。
      // 那属于「机器忙」不是「产品坏」，但这两种在症状上一样（见判据 13）。
      //
      // ⚠️ **别再用固定窗口**（2026-10-22 第二轮改）。
      //
      // 固定窗口的毛病：它把「机器快慢」与「产品对不对」绑在了一起。
      // 产品自己的 `WATCH_DELAY` 是 2.5 秒，但机器被压垮时 `setTimeout`
      // 会晚很多（实测：宿主负载 56 / 12 核时，全量跑里这条红过；
      // 单跑 6/6 全绿）。于是窗口给到 8 秒也仍然是在**赌**，
      // 赌输了报出来的却是「产品没把引导还回来」—— 一条**假**结论。
      //
      // 改成**条件驱动**：采样器每 50ms 记一次，这里只要它记到
      // `sawVisible` 就立刻通过；只有到截止时间还没记到才判失败。
      // 于是 ——
      // - 机器快：2.2 秒就绿（不再白等 8 秒）；
      // - 机器慢：等到截止时间，而不是等一个拍脑袋的数字；
      // - 产品真坏了：**照样红**，而且报的还是那句「引导没回来」。
      //
      // 判据：**成功条件与时间无关，失败条件才受时间限制。**
      await startSampler(page);
      const deadline = Date.now() + 20_000;
      let probe = await page.evaluate(() => window.__vscProbe);
      while (!probe?.sawVisible && Date.now() < deadline) {
        await page.waitForTimeout(100);
        probe = await page.evaluate(() => window.__vscProbe);
      }
      probe = await stopSampler(page);

      // ⚠️ 先证明采样真的跑过。
      expect(probe.samples, '采样器必须真的采到过').toBeGreaterThan(0);
      expect(
        probe.sawVisible,
        `点完「重新显示使用引导」之后，引导必须回到这个标签页里（弹出来的内容：${JSON.stringify(probe.texts)}）`,
      ).toBe(true);

      await options.close();
    } finally {
      await ext.close();
    }
  });
});
