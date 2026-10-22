import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 空格「暂停之后按不回来」的回归守卫。
 *
 * 症状（真实 Chromium，用户可复现）：
 *   一个用**自制播放器**（没有原生 controls、不在适配器名单里）的页面，
 *   视频正在播：
 *     第 1 次空格 → paused false→true ✓，scrollY 0→0
 *     第 2 次空格 → paused true→**true** ✗，scrollY 0→**860**（页面往下翻页了）
 *     第 3 次空格 → 同上
 *
 * 用户看到的是「空格把视频暂停了，再按一次什么都没发生，页面却往下滚」——
 * 结论必然是「这个扩展的空格键是坏的」。而同一时刻 `=` 仍然有效
 * （倍速 1 → 1.1），所以这不是「键绑定坏了」，**只有 togglePlay 这一条坏了**。
 *
 * 根因（两处条件叠加）：
 *   1. `videoRegistry.resolvePermission()` 把 `isRunning`（`!paused && !ended
 *      && readyState > 2`）当成 `'full'` 的条件之一。**扩展自己**按空格把视频
 *      暂停之后，`isRunning` 立刻变 false → 权限从 `'full'` 掉到 `'no-space'`。
 *   2. `keyboardController` 对 `no-space` + `togglePlay` **放行**：
 *      `if (target.permission === 'no-space' && action === 'togglePlay') return false;`
 *      → 空格回到页面 → 页面翻页，视频一动不动。
 *
 * 为什么第 1 次按有效、第 2 次就坏：第一次解析时视频还在播（'full'），
 * 按完才变暂停。第二次解析（缓存 5 秒过期后）才读到 `isRunning === false`。
 * 所以**必须跨过缓存有效期**才能复现 —— 这条用例里等 6 秒就是这个原因。
 *
 * ⚠️ 修复边界（判据 11 不能被这条修法破坏）：
 * 「暂停着、没人开过、没有 controls 的视频不许抢空格」这条**必须保留** ——
 * 文章页里那个滚动预览视频抢走空格是 6.0.9 修掉的头号问题。
 * 所以豁免只能覆盖「**我们自己的快捷键把它按停的**」这一种，
 * 不能放宽成「键盘碰过的视频」。
 *
 * ⚠️ 必须用真实媒体、真实按键：内容脚本跑在隔离世界，
 * 页面世界对 `paused` / `readyState` 的 `Object.defineProperty` 它看不见。
 */

/**
 * 真实媒体（10 秒 / 480×270 VP8 webm）。
 *
 * ⚠️ 必须用**长**素材，不能用手上那个 0.5 秒的 mp4：
 * 这条用例要跨 6 秒等缓存过期，0.5 秒的视频早就 `ended` 了 ——
 * `ended` 之后 `paused` 恒为 true，第 1 次空格的前置条件就过不了，
 * 而且「暂停/恢复」根本无从观察。
 *
 * ⚠️ 同时必须 `loop`：6 秒的等待加上前面的操作可能超过 10 秒，
 * 不循环的话视频会在断言中途播完 —— 那会变成一条**随机**翻红的用例。
 */
const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 页面：一篇长文章 + 一个**没有原生 controls** 的自定义播放器。
 *
 * 尺寸取 1024×576（视口 1280×720 的 64%）—— 让它稳稳越过
 * 「页面主角」那条 60% 的线，从而**不是**装饰性预览。
 * 这一点是复现的前提：小尺寸预览会走另一条判定分支（判据 11），
 * 那条分支本来就不该被接管，测不出这个缺陷。
 */
const pageHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>space resume</title>
<style>
  html,body{margin:0;background:#fff}
  #player{width:1024px;height:576px;margin:0 auto;background:#000}
  video{width:100%;height:100%;display:block;background:#000}
  #tail{height:3000px}
</style>
</head><body>
<p>这是一篇很长的文章，用户正在读字。</p>
<div id="player"><video id="main" muted playsinline preload="auto" src="${CLIP}" loop></video></div>
<div id="tail"></div>
<script>
  // 页面自己记录收到了哪些键 —— 用来证明空格到底有没有穿透给页面。
  window.__seen = [];
  window.addEventListener('keydown', (e) => window.__seen.push(e.key));
</script>
</body></html>`;

const readState = (page) => page.evaluate(() => {
  const video = document.getElementById('main');
  return {
    paused: video.paused,
    rate: video.playbackRate,
    scrollY: window.scrollY,
    seen: window.__seen.slice(),
    // 前置条件用：这个页面确实**没有**被扩展接管（没有全屏浮层）。
    overlay: Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
  };
});

test.describe('空格：暂停之后必须还能按回来', () => {
  test.setTimeout(90_000);

  test('无 controls 的自定义播放器：空格暂停 → 再按空格恢复，页面不许翻页', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) return route.continue();
        return route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml });
      });
      await page.goto('http://127.0.0.1:4173/');

      // 页面用真实 play() 把视频播起来 —— 不 mock。
      await page.evaluate(async () => {
        const video = document.getElementById('main');
        video.muted = true;
        await video.play();
      });
      await page.waitForTimeout(600);

      const before = await readState(page);
      // 前置条件：视频真的在播，页面真的没被接管。
      expect(before.paused, '前置条件：视频必须真的在播').toBe(false);
      expect(before.overlay, '前置条件：这个页面不该进全屏').toBe(false);
      expect(before.scrollY, '前置条件：起始滚动位置为 0').toBe(0);

      // 第 1 次空格：暂停。
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      const first = await readState(page);
      expect(first.paused, '第 1 次空格必须把视频暂停').toBe(true);
      expect(first.scrollY, '第 1 次空格被我们接管，页面不许滚动').toBe(0);

      // ⚠️ 跨过快捷键缓存的有效期（WATCHED_CACHE_TTL_MS = 5 秒）。
      // 不跨过去的话，第 2 次按键直接命中缓存里的旧权限（'full'），
      // 缺陷不会出现 —— 这条用例就成了一条恒绿的假守卫。
      await page.waitForTimeout(6_000);

      // 第 2 次空格：必须恢复播放，而不是把空格还给页面。
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      const second = await readState(page);
      expect(
        second.paused,
        '第 2 次空格必须让视频重新播放（缺陷：它把空格还给了页面）',
      ).toBe(false);
      expect(
        second.scrollY,
        '第 2 次空格必须仍然由我们接管 —— 页面滚动了就说明空格被放行',
      ).toBe(0);
      expect(
        second.seen,
        '页面根本不该收到空格键（收到了 = 按键穿透了）',
      ).toEqual([]);

      // 第 3 次空格：再暂停一次，证明这是稳定行为而不是一次性。
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      const third = await readState(page);
      expect(third.paused, '第 3 次空格必须再次暂停').toBe(true);
      expect(third.scrollY, '第 3 次空格同样不许翻页').toBe(0);

      // 对照：`=` 一直有效（缺陷只在 togglePlay 这一条上）。
      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const afterSpeed = await readState(page);
      expect(afterSpeed.rate, '对照：调速一直有效').toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('文章页里暂停着、没人开过的预览视频：空格仍然必须翻页（判据 11 不许被破坏）', async () => {
    // 这条守的是**修复的边界**，不是缺陷本身。
    //
    // 修法如果放宽成「键盘碰过的视频都升级成 'full'」，这里就会翻红：
    // 用户按一次 `=`（调速本来就允许作用在 no-space 视频上）之后，
    // 这个预览就会被升级成能吃空格的视频 —— 文章再也翻不了页。
    //
    // 形状必须与 takeover-rules 的 P1-1 完全一致：900×506（视口 1280×720 的
    // 49%，**不到** 60% 的「页面主角」线）、站点用 JS 播起、没有 autoplay
    // 属性、没有原生 controls。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) return route.continue();
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:900px;height:506px;background:#222}#tail{height:3000px}</style>
</head><body>
<p>这是一篇很长的文章，用户正在读字。</p>
<video id="preview" playsinline src="${CLIP}" loop></video>
<div id="tail"></div>
<script>
  window.__seen = [];
  window.addEventListener('keydown', (e) => window.__seen.push(e.key));
  const preview = document.getElementById('preview');
  preview.muted = true;
  preview.play();
</script>
</body></html>`,
        });
      });
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      // 前置条件：站点确实用 JS 把它播起来了。
      const shape = await page.evaluate(() => {
        const v = document.getElementById('preview');
        return { autoplay: v.hasAttribute('autoplay'), controls: v.hasAttribute('controls') };
      });
      expect(shape.autoplay, '前置条件：没有 autoplay 属性').toBe(false);
      expect(shape.controls, '前置条件：没有原生 controls').toBe(false);

      // 用户先按一次 `=`（这条路径允许作用于 no-space 视频）。
      // 如果修复放宽成「键盘碰过就升级」，这一下就会把它变成 'full'。
      await page.keyboard.press('=');
      await page.waitForTimeout(200);
      await page.waitForTimeout(6_000); // 跨过缓存有效期

      const before = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({
        scrollY: window.scrollY,
        paused: document.getElementById('preview').paused,
      }));

      expect(
        after.scrollY,
        '文章页里的预览视频绝不许抢走空格 —— 页面必须翻页',
      ).toBeGreaterThan(before);
      expect(
        after.paused,
        '空格不该切换这个预览的播放状态（键本来就该穿透给页面）',
      ).toBe(false);
    } finally {
      await ext.close();
    }
  });
});
