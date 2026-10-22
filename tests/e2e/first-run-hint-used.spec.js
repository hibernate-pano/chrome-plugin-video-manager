import { test, expect } from '@playwright/test';
import { SD_4X3_MP4_BASE64 } from './fixtures/sd-4x3.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 首次引导的落盘判据：「会用」，不是「读过」。
 *
 * ⚠️ 实测（真实 Chromium + 真实扩展）的故障形状：
 * 用户**已经会用**了（按 `=` 成功改了倍速），
 * storage 里**没有** `vsc-first-run-hint-shown`（只有 claim 锁），
 * 2.5 秒后引导照弹（`{"visible":true}`，四行完整文案）——
 * 教一个已经会的人，比不教更糟：那唯一一次教学机会占掉了他的屏幕。
 *
 * 旧判据是「用户**读过**引导」：于是「先按了键、引导后弹出」的顺序下，
 * 落盘的那一步永远等不到 —— 引导就这样冒了出来。
 *
 * 新判据是「用户**会用**这个扩展」：按下扩展自己的键就算。
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

/** 一个正经的播放器：带原生 controls —— 引导会为它排队（2.5 秒后出现）。 */
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
        // 去重：同一条内容只记一次 —— 失败时把同一段字打印 50 遍没人看得下去。
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

test.describe('首次引导：判据是「会用」', () => {
  test.setTimeout(60_000);

  test('用户先按了快捷键（已经会用了）→ 引导不该再弹出来', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, playerHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(1200);

      // 前置条件：视频在播（引导才会为它排队）。
      const paused = await page.evaluate(() => document.getElementById('main').paused);
      expect(paused, '前置条件：视频应该在播').toBe(false);

      await startSampler(page);

      // ⚠️ 必须在引导的 2.5 秒等待期**之内**按：
      // 「先按了键、引导后弹出」正是那个故障的顺序。
      await page.keyboard.press('=');
      await page.waitForTimeout(200);

      // 倍速确实变了 —— 用户确实「会用」了。
      const rate = await page.evaluate(() => document.getElementById('main').playbackRate);
      expect(rate, '前置条件：按 = 确实改了倍速').toBeCloseTo(1.1, 2);

      // 熬过引导的等待期（2.5 秒）+ 一点余量。
      await page.waitForTimeout(3800);

      const probe = await stopSampler(page);

      // ⚠️ 先证明采样真的跑过。
      expect(probe.samples, '采样器必须真的采到过').toBeGreaterThan(0);
      expect(
        probe.sawVisible,
        `用户已经会用了，引导不该再弹出来（弹出来的内容：${JSON.stringify(probe.texts)}）`,
      ).toBe(false);

      // 落盘：判据从「读过」改成「会用」之后，这个标记必须已经写上。
      const stored = await ext.serviceWorker.evaluate(
        (key) => chrome.storage.local.get(key),
        SHOWN_KEY,
      );
      expect(
        stored[SHOWN_KEY],
        '「会用」是比「读过」更强的信号：按下扩展的键就该落盘',
      ).toBe(true);
    } finally {
      await ext.close();
    }
  });
});
