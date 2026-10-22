import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 站点把整个 <body> 换掉之后，快捷键必须**立刻**恢复。
 *
 * ## 要守的故障
 *
 * 注册表的 DOM 观察者绑在 `document.body` 这个**元素**上。
 * 站点 `document.body.replaceWith(newBody)`（SPA 重建页面）之后，
 * 观察者就成了孤儿：它还挂在**已经脱离文档的旧 body** 上，
 * 而旧 body 再也不会变化 —— 新 body 里的任何增删它都看不见。
 *
 * 后果链（实测，真实 Chromium）：
 *   「DOM 变更代次」不再前进
 *     → 快捷键路径缓存里的 `null` 永不过期（null 结果没有 TTL）
 *     → 快捷键拿到的永远是 `null` → **所有快捷键静默失灵**。
 *
 * 而工具栏图标那条路是**按帧重算**的（getCurrentVideo → resolveCurrentVideo），
 * 不吃这份缓存 —— 于是症状自相矛盾：
 * 「图标能点、快捷键没反应」。
 *
 * 唯一能自愈的动作是「用户碰一下视频」：用户手势会顺带触发一次作废，
 * 于是缓存里的 `null` 被丢掉，快捷键又醒了 —— 症状是「点一下就好了」，
 * 极难让人联想到「body 被换掉了」。
 *
 * ## 为什么必须用真实浏览器
 *
 * 这条链路牵涉布局判定（rect、视口面积）与真实播放状态：
 * 替换进来的视频必须**真的**被判定成「用户此刻在看的那个」
 * （占满视口 → 页面主角 → 不是装饰性预览），快捷键才会打在它身上。
 * jsdom 里这些判据全读成 0，测出来的只是「早退分支」的行为。
 */

const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 页面里记录「用户碰过页面」。
 *
 * ⚠️ 这条用例的前提是「用户没有碰过视频」——
 * 用户手势会顺带把缓存作废，于是「点一下就好了」的自愈路径
 * 会把这条用例变成**恒真的假守卫**。
 */
const PAGE_WATCHES = `<script>
window.__gesture = false;
window.addEventListener('pointerdown', () => { window.__gesture = true; }, true);
<\/script>`;

/** 视频铺满视口 → 它是「页面主角」，不会被当成装饰性预览。 */
const FULL_VIEWPORT_VIDEO = `<video id="swapped" autoplay muted loop playsinline src="${CLIP}"></video>`;

const serveHtml = async (page, html) => {
  await page.route('**/*', (route) => {
    // ⚠️ 必须放行扩展自己的请求：拦下来内容脚本就加载不了，
    //    用例会「什么也没发生」地空转。
    if (route.request().url().startsWith('chrome-extension://')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
};

/** 当前视频的倍速。 */
const readRate = (page, id) =>
  page.evaluate((videoId) => {
    const video = document.getElementById(videoId);
    return video ? video.playbackRate : null;
  }, id);

test.describe('站点换掉整个 body', () => {
  test.setTimeout(60_000);

  test('body 被换掉之后：快捷键必须立刻恢复（不靠用户手势）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await serveHtml(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:1280px;height:720px;background:#000;display:block}</style>
${PAGE_WATCHES}</head><body>
<p id="intro">这个页面上还没有视频。</p>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      // 前置条件：页面上确实没有视频。
      expect(
        await page.evaluate(() => document.querySelectorAll('video').length),
        '前置条件：页面上没有视频',
      ).toBe(0);

      // 按一次 `=`：快捷键路径把「没有目标」缓存下来（null 结果没有 TTL）。
      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      // 站点换掉整个 body（SPA 重建页面），新 body 里带着一个自动播放的视频。
      await page.evaluate((html) => {
        const next = document.createElement('body');
        next.innerHTML = html;
        document.body.replaceWith(next);
      }, FULL_VIEWPORT_VIDEO);
      await page.waitForTimeout(800);

      // 前置条件：新 body 已经到位，且用户全程没碰过页面。
      const before = await page.evaluate(() => ({
        videos: document.querySelectorAll('video').length,
        gesture: window.__gesture,
        inNewBody: document.body.contains(document.getElementById('swapped')),
      }));
      expect(before.videos, '前置条件：新 body 里已经有视频').toBe(1);
      expect(before.inNewBody, '前置条件：视频确实在新 body 里').toBe(true);
      expect(
        before.gesture,
        '前置条件：用户没有碰过视频（否则手势会顺带作废缓存，这条用例就成了假守卫）',
      ).toBe(false);

      // 不点视频，直接按 `=`。
      await page.keyboard.press('=');
      await page.waitForTimeout(500);

      expect(
        await readRate(page, 'swapped'),
        'body 被换掉之后，快捷键必须立刻恢复（不能等用户点一下才醒）',
      ).toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('body 只是被清空（元素没换人）：快捷键一直好用', async () => {
    // 对照组：上面那条坏的是「body 这个**元素**被换掉了」。
    // 这里 body 还是同一个元素，只是内容被清空 ——
    // 观察者始终有效，缓存照常作废，快捷键不该有任何异常。
    //
    // 这条用例的作用是「别把对照组也修坏了」：
    // 若有人图省事把观察目标换成 documentElement 的**子树**，
    // 我们自己挂/摘浮层就会变成「DOM 变化」，
    // 每次浮层显隐都推进变更代次 —— 6.2.0 那套缓存优化就没了。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await serveHtml(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:1280px;height:720px;background:#000;display:block}</style>
${PAGE_WATCHES}</head><body>
<p id="intro">这个页面上还没有视频。</p>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      // 内容清空 + 塞进新视频（body 元素本身没换人）。
      await page.evaluate((html) => {
        document.body.innerHTML = html;
      }, FULL_VIEWPORT_VIDEO);
      await page.waitForTimeout(800);

      await page.keyboard.press('=');
      await page.waitForTimeout(500);

      expect(
        await readRate(page, 'swapped'),
        'body 元素没换人时，快捷键必须照常工作',
      ).toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });
});
