import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 倍速胶囊与角标的回归守卫。
 *
 * 这两个元素是**唯一的常驻读数**（非全屏状态下没有别的出口），
 * 而它们的行为全是「时间相关」的：淡出、转角标、暂停收起、恢复长出来、
 * 进全屏重新贴位 —— 单测测不到（jsdom 没有布局引擎，算不出真实坐标）。
 *
 * 每条用例都对着一个**具体症状**写，症状都能在改动前复现。
 */

/* ------------------------------------------------------------------ *
 * 浏览器与扩展
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 页面与读数
 * ------------------------------------------------------------------ */

const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 视频放在页面上方 200px 处：这样「页内坐标」与「全屏坐标」明显不同 ——
 * 胶囊要是留在旧坐标上，top 会是 ~216 而不是 ~16，一眼就能看出来。
 */
const PAGE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vsc toast</title>
<style>body{margin:0;min-height:2000px;background:#222}
video{display:block;margin-top:200px;width:480px;height:270px;background:#000}</style>
</head><body>
<video id="v1" muted playsinline preload="auto" src="${CLIP}"></video>
</body></html>`;

const serveHtml = async (page, html) => {
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith('chrome-extension://')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
};

/** 读胶囊的可见状态与真实位置（内联样式是唯一可信来源）。 */
const readToast = (page) => page.evaluate(() => {
  const el = document.getElementById('vsc-speed-toast');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    text: el.textContent ?? '',
    fontSize: cs.fontSize,
    visible: el.classList.contains('vsc-visible') && Number(cs.opacity) > 0.05,
    left: r.left,
    top: r.top,
  };
});

/** 接管视频并让它真的播起来。 */
const takeOver = async (page) => {
  await page.locator('#v1').click();
  await page.evaluate(async () => {
    const v = document.getElementById('v1');
    try { await v.play(); } catch { /* 下面用 paused 兜底 */ }
  });
  await expect
    .poll(() => page.evaluate(() => document.getElementById('v1').paused), { timeout: 5000 })
    .toBe(false);
};

/** 调一次速：胶囊会亮起来。 */
const speedUp = async (page) => {
  await page.keyboard.press('=');
  await expect
    .poll(() => page.evaluate(() => document.getElementById('v1').playbackRate), { timeout: 3000 })
    .toBeCloseTo(1.1, 2);
};

/* ------------------------------------------------------------------ *
 * 用例
 * ------------------------------------------------------------------ */

test.describe('倍速胶囊与角标', () => {
  test('暂停之后恢复播放 → 角标自己回来，而且立刻就是常驻形态', async () => {
    // 症状：暂停时角标收起了，恢复播放后**再也不长出来** ——
    // 于是用户调好的倍速读数凭空消失，只能刷新页面才知道现在是几倍。
    //
    // 根因（6.2.0 之前）：「暂停」被当成了「用户不再需要这个读数」，
    // 于是把角标连同意图一起丢掉了。但暂停只是「暂时看不到」，
    // 不是「不需要」—— 恢复播放就该回来。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, PAGE_HTML);
      await page.goto('https://example.com/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await takeOver(page);

      await speedUp(page);

      // 胶囊 900ms 淡出 → 之后转成常驻角标（12px）
      await expect
        .poll(async () => (await readToast(page))?.fontSize, { timeout: 9000 })
        .toBe('12px');

      // 暂停 → 角标收起
      await page.evaluate(() => document.getElementById('v1').pause());
      await expect
        .poll(async () => (await readToast(page))?.visible, { timeout: 3000 })
        .toBe(false);

      // 恢复播放 → 角标必须**自己**回来，且立刻就是常驻形态（不许再等 3 秒）
      await page.evaluate(() => document.getElementById('v1').play());
      await expect
        .poll(async () => (await readToast(page))?.visible, { timeout: 1500 })
        .toBe(true);
      await expect
        .poll(async () => (await readToast(page))?.fontSize, { timeout: 1500 })
        .toBe('12px');
    } finally {
      await ext.close();
    }
  });

  test('进全屏 → 胶囊重新贴到画面上；全屏里调速仍有反馈；退出后不残留', async () => {
    // 症状：进全屏后胶囊**留在进全屏之前的页面坐标**上 ——
    // 视频被搬进覆盖层铺满视口，胶囊却飘在画面外，用户完全看不见。
    // 全屏里调速时它还成了唯一的反馈通道（控制条不一定醒），
    // 看不见就等于「全屏里键盘调速没有任何反应」。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, PAGE_HTML);
      await page.goto('https://example.com/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await takeOver(page);

      // 页面上先调一次速：胶囊出现在视频处（top ≈ 216）
      await speedUp(page);
      await expect
        .poll(async () => (await readToast(page))?.visible, { timeout: 3000 })
        .toBe(true);
      const onPage = await readToast(page);
      expect(onPage.top, '前置条件：胶囊此刻在页面的视频上方').toBeGreaterThan(150);

      // 趁胶囊还亮着进全屏
      await page.keyboard.press('f');
      await page.waitForSelector('#vsc-page-fullscreen-overlay', { state: 'attached' });

      const inFullscreen = await readToast(page);
      expect(inFullscreen.top, '全屏里胶囊必须跟着视频走，不能留在旧坐标').toBeLessThan(60);
      expect(inFullscreen.left).toBeLessThan(60);

      // 全屏里调速：胶囊必须出现在全屏画面上（它是唯一的反馈通道）
      await page.keyboard.press('=');
      const afterChange = await readToast(page);
      expect(afterChange.visible, '全屏里调速必须看得见反馈').toBe(true);
      expect(afterChange.top).toBeLessThan(60);
      expect(afterChange.left).toBeLessThan(60);

      // 退出全屏 → 胶囊回到页面的位置，不留残渣
      await page.keyboard.press('f');
      await page.waitForSelector('#vsc-page-fullscreen-overlay', { state: 'detached' });
      const afterExit = await readToast(page);
      expect(afterExit.top, '退出全屏后胶囊要回到页面位置').toBeGreaterThan(150);
    } finally {
      await ext.close();
    }
  });
});
