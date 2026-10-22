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

/**
 * 「退出全屏后角标回来」那两条用例专用的页面。
 *
 * ⚠️ 与 PAGE_HTML 的唯一区别是 `loop`：夹具只有 10 秒，
 * 而这两条用例要跑十几秒 —— 视频播完会变成 paused，
 * 角标会按设计收起来（意图还在，播放时回来），
 * 那样测到的就不是「退出全屏」这件事了。
 */
const LOOP_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vsc badge</title>
<style>body{margin:0;min-height:2000px;background:#222}
video{display:block;margin-top:200px;width:480px;height:270px;background:#000}</style>
</head><body>
<video id="v1" muted playsinline loop preload="auto" src="${CLIP}"></video>
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

/**
 * 读角标的**计算样式**（用户真正看到的那份）。
 *
 * ⚠️ 与 readToast 的 visible 不同：这里 display / visibility / opacity
 * **三样都要看**。少看一样，这条守卫就会在「角标其实看不见」的时候放行 ——
 * 站点一条 `div { display: none !important }` 就能打穿 opacity。
 */
const readBadge = (page) => page.evaluate(() => {
  const el = document.getElementById('vsc-speed-toast');
  if (!el) return { exists: false, visible: false };
  const cs = getComputedStyle(el);
  return {
    exists: true,
    text: el.textContent ?? '',
    display: cs.display,
    visibility: cs.visibility,
    opacity: Number(cs.opacity),
    fontSize: cs.fontSize,
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05,
  };
});

/**
 * 开始采样：每 50ms 记一次角标的计算样式。
 *
 * ⚠️ 采样是为了回答「**有没有出现过**可见」，
 * 而不是「最后一刻是什么样」—— 角标是常驻的，只判最后一刻的话，
 * 「回来得比预期晚」会被漏判。
 */
const startSampling = (page) => page.evaluate(() => {
  window.__vscBadgeSamples = [];
  window.__vscBadgeTimer = setInterval(() => {
    const el = document.getElementById('vsc-speed-toast');
    if (!el) {
      window.__vscBadgeSamples.push({ exists: false, visible: false });
      return;
    }
    const cs = getComputedStyle(el);
    window.__vscBadgeSamples.push({
      exists: true,
      display: cs.display,
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      fontSize: cs.fontSize,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05,
    });
  }, 50);
});

const stopSampling = (page) => page.evaluate(() => {
  clearInterval(window.__vscBadgeTimer);
  return window.__vscBadgeSamples ?? [];
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

  test('退出全屏 → 角标回到画面上，而且不用再等 3 秒', async () => {
    // 症状：退出网页全屏后，**画面上没有任何倍速读数**。
    //
    // 根因有两层：
    // 1. 退出后走的是「重新排一个 3 秒的计时」—— 而全屏控制条此刻正被撤掉，
    //    画面上关于「我现在是几倍速」的读数**同时**消失。
    //    让用户盯着一个什么读数都没有的画面等 3 秒，
    //    等于把「退出全屏后角标没有回来」这个 bug 换了个形式
    //    （与「暂停之后恢复播放立刻回来」是同一条判据）。
    // 2. 「是不是在全屏里」的判据必须落在**控制器的账本**上
    //    （视频身上的 class），不能落在「背板在不在 DOM 里」这种形状代理上 ——
    //    见下一条用例。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, LOOP_HTML);
      await page.goto('https://example.com/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await takeOver(page);
      await speedUp(page);

      // 等常驻角标（12px）长出来。
      await expect.poll(async () => (await readBadge(page)).visible, { timeout: 9000 }).toBe(true);
      await expect.poll(async () => (await readBadge(page)).fontSize, { timeout: 9000 }).toBe('12px');

      await startSampling(page);

      // 进全屏：角标必须收起（控制条上就写着倍速，重复信息）。
      await page.keyboard.press('f');
      await page.waitForSelector('#vsc-page-fullscreen-overlay', { state: 'attached' });
      await expect.poll(async () => (await readBadge(page)).visible, { timeout: 3000 }).toBe(false);

      // 退出全屏。
      await page.keyboard.press('f');
      await page.waitForSelector('#vsc-page-fullscreen-overlay', { state: 'detached' });

      // ⚠️ 必须**很快**回来（1.5 秒内）：旧实现退出后要重新排 3 秒的计时。
      await expect
        .poll(async () => (await readBadge(page)).visible, { timeout: 1500, intervals: [50] })
        .toBe(true);

      // 采样口径：至少采到过一次可见（堵住采样盲区 ——
      // 信号彻底丢失时，一条可见样本都采不到，这条断言会红）。
      const samples = await stopSampling(page);
      expect(
        samples.some((s) => s.visible),
        '采样里必须至少出现过一次可见的角标',
      ).toBe(true);

      // 用户真正看到的那份：三样计算样式 + 常驻形态。
      const badge = await readBadge(page);
      expect(badge.display, '角标不能是 display:none').not.toBe('none');
      expect(badge.visibility, '角标不能是 visibility:hidden').not.toBe('hidden');
      expect(badge.opacity, '角标必须是不透明的').toBeGreaterThan(0.9);
      expect(badge.fontSize, '回来的是常驻角标（12px），不是 13px 的胶囊').toBe('12px');
      expect(badge.text).toContain('1.1');
    } finally {
      await ext.close();
    }
  });

  test('背板赖在 DOM 里没被摘掉时，角标照样回来', async () => {
    // 症状：退出全屏后角标**永远**不回来 —— 用户退出全屏，画面上
    // 什么倍速读数都没有了。
    //
    // 根因：判据是「全屏背板在不在 DOM 里」。而背板是我们自己的浮层，
    // 它的存续期**不一定**等于会话的存续期
    // （fullscreenController.release() 在 state.video 为空时会提前返回：
    // 那一轮会话已经结束了，背板却还赖在 DOM 里）。
    // 判据与事实对不上 → 状态永远停在「还在全屏里」→ 角标再也回不来。
    //
    // 这里用「同 id 的替身」把这条路径逼出来：退出时控制器摘掉的是
    // 真正的背板，而替身留在 DOM 里 —— 于是「背板在不在」这个判据
    // 会永远判成「还在全屏里」。
    //
    // 正确的判据是**控制器的账本**：控制器在进全屏时给视频挂一个 class、
    // 退出时摘掉，它的存续期与会话完全重合。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, LOOP_HTML);
      await page.goto('https://example.com/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await takeOver(page);
      await speedUp(page);

      await expect.poll(async () => (await readBadge(page)).visible, { timeout: 9000 }).toBe(true);

      await startSampling(page);

      await page.keyboard.press('f');
      await page.waitForSelector('#vsc-page-fullscreen-overlay', { state: 'attached' });
      await expect.poll(async () => (await readBadge(page)).visible, { timeout: 3000 }).toBe(false);

      // 放一个同 id 的替身到 <html> 上（排在真背板后面）：
      // 真背板被摘掉之后，getElementById 还能找到替身。
      await page.evaluate(() => {
        const decoy = document.createElement('div');
        decoy.id = 'vsc-page-fullscreen-overlay';
        document.documentElement.appendChild(decoy);
      });

      await page.keyboard.press('f');
      await expect
        .poll(
          () => page.evaluate(() => document.querySelectorAll('#vsc-page-fullscreen-overlay').length),
          { timeout: 3000 },
        )
        .toBe(1);

      await expect
        .poll(async () => (await readBadge(page)).visible, { timeout: 1500, intervals: [50] })
        .toBe(true);

      const samples = await stopSampling(page);
      expect(
        samples.some((s) => s.visible),
        '采样里必须至少出现过一次可见的角标',
      ).toBe(true);

      const badge = await readBadge(page);
      expect(badge.display).not.toBe('none');
      expect(badge.visibility).not.toBe('hidden');
      expect(badge.opacity).toBeGreaterThan(0.9);
      expect(badge.fontSize).toBe('12px');
    } finally {
      await ext.close();
    }
  });
});
