import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';
import { readPixel } from './helpers/png.js';

/**
 * 进全屏**之后**才出现的字幕，必须跟着进全屏 —— 而且必须真的**画出来**。
 *
 * 缺陷：字幕层只在 enter() 里取**一次**快照（collectLayersToAttach），
 * 于是后来才加载的字幕永远留在站点的播放器容器里，而那个容器此刻
 * 已经被我们的不透明背板整个盖住 —— 用户看到的是「一按 f 字幕就没了」，
 * 而且退出全屏后它才又冒出来（因为它从没被搬走过）。
 *
 * ⚠️ 为什么断言的是**像素**而不是 DOM：
 * 「字幕节点在 stage 里」不等于「用户看得见它」——
 * 字幕可能仍然被视频（z-index 2147483643）或控制条整个盖住，
 * 一个像素都没画出来。判据必须是浏览器**最后画出来的那层颜色**。
 *
 * ⚠️ 内容脚本跑在隔离世界：页面里对 paused / readyState / videoWidth 的
 * `Object.defineProperty` 它**看不见**。所以这里一律用真实媒体、真实播放。
 */

/** 真实 webm（10 秒 / 480×270）。 */
const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 站点播放器：进全屏那一刻**还没有**字幕。
 *
 * 字幕容器的形状照抄真实站点：`position:absolute; left:0; right:0;`
 * （容器铺满播放器宽度，文字居中）。
 */
const pageHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#111}
  /* 尺寸写死：视频被搬进 stage 之后，容器不能塌掉 */
  #player{position:relative;width:800px;height:450px;background:#000}
  video{width:100%;height:100%;background:#000}
  #cap{
    position:absolute;left:0;right:0;bottom:6%;text-align:center;
    background:rgba(255,0,0,.9);color:#fff;font:20px/1.4 sans-serif;
  }
</style></head><body>
<div id="player">
  <video id="v1" muted playsinline loop src="${CLIP}"></video>
</div>
</body></html>`;

const serveBody = (page) => {
  const state = { body: '' };
  page.route('**/*', (route) => {
    if (route.request().url().startsWith('chrome-extension://')) {
      return route.continue();
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: state.body });
  });
  return (html) => {
    state.body = html;
  };
};

/** 站点这时才把字幕层放进来（模拟字幕插件异步加载）。 */
const injectLateCaption = (page) =>
  page.evaluate(() => {
    const caption = document.createElement('div');
    caption.id = 'cap';
    caption.textContent = '这是后来才出现的字幕';
    document.getElementById('player').appendChild(caption);
    return true;
  });

/** 字幕现在的几何（它可能被控制条避让逻辑整体推上去了）。 */
const captionRect = (page) =>
  page.evaluate(() => {
    const caption = document.getElementById('cap');
    if (!caption) {
      return null;
    }
    const stage = document.getElementById('vsc-page-fullscreen-stage');
    const r = caption.getBoundingClientRect();
    return {
      inStage: stage?.contains(caption) ?? false,
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    };
  });

/**
 * 采样字幕**背景**那一行的像素，返回「红」的采样点数量。
 *
 * ⚠️ 采样位置刻意选在字幕矩形的**左边缘**：
 * 字幕是 `left:0;right:0` + 文字居中，所以左边那一段只有红底、没有字。
 * 采样文字中心会读到白字（251,219,219 那样），那恰恰说明字幕**画出来了**，
 * 却被误判成「被盖住」。
 */
const countRedSamples = (png, rect) => {
  const y = Math.round(rect.top + rect.height / 2);
  const from = Math.round(rect.left) + 6;
  const to = Math.min(Math.round(rect.left + rect.width / 2), from + 60);
  let red = 0;
  let total = 0;
  for (let x = from; x < to; x += 2) {
    const pixel = readPixel(png, x, y);
    if (!pixel) {
      continue;
    }
    total += 1;
    if (pixel[0] > 150 && pixel[1] < 100 && pixel[2] < 100) {
      red += 1;
    }
  }
  return { red, total };
};

test.describe('进全屏之后才出现的字幕也要跟进来', () => {
  test.setTimeout(90_000);

  test('后来才加载的字幕必须跟进全屏，而且要真的画出来（像素判据）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.waitForTimeout(500);

      await page.locator('#v1').click();
      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);

      // 前置条件：进全屏那一刻还没有字幕。
      expect(await captionRect(page), '前置条件：字幕还不存在').toBeNull();

      // 站点这时才把字幕层放进来。
      await injectLateCaption(page);

      // 它必须被搬进 stage。
      await expect
        .poll(async () => (await captionRect(page))?.inStage ?? false, { timeout: 8_000 })
        .toBe(true);

      // 等控制条的避让逻辑（它会把字幕整体推上去）稳定下来。
      await page.waitForTimeout(600);

      const rect = await captionRect(page);
      expect(rect, '字幕必须还在文档里').not.toBeNull();
      expect(rect.width, '字幕必须有真实宽度').toBeGreaterThan(0);
      expect(rect.height, '字幕必须有真实高度').toBeGreaterThan(0);

      // ⚠️ 真正的判据：**截图取像素**。
      const shot = await page.screenshot({ type: 'png' });
      const { red, total } = countRedSamples(shot, rect);
      expect(total, '截图必须能采到像素（采样区落在视口内）').toBeGreaterThan(5);
      expect(
        red / total,
        `字幕背景那一行只有 ${red}/${total} 个采样点是红的 —— ` +
          '字幕虽然进了 stage，却一个像素都没画出来（被视频或控制条盖住了）',
      ).toBeGreaterThan(0.6);
    } finally {
      await ext.close();
    }
  });

  test('退出全屏后，后来才出现的字幕必须回到站点的播放器里', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.waitForTimeout(500);

      await page.locator('#v1').click();
      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);

      await injectLateCaption(page);
      await expect
        .poll(async () => (await captionRect(page))?.inStage ?? false, { timeout: 8_000 })
        .toBe(true);

      // 从控制条的退出钮退出。
      await page.evaluate(() => {
        const button = document
          .getElementById('vsc-controls')
          ?.shadowRoot?.querySelector('[data-role="exit"]');
        if (button instanceof HTMLElement) {
          button.click();
        }
      });
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(false);

      const home = await page.evaluate(() => {
        const caption = document.getElementById('cap');
        return {
          parentId: caption?.parentElement?.id ?? null,
          connected: caption?.isConnected ?? false,
        };
      });
      expect(
        home.parentId,
        '字幕是站点自己的节点，退出时必须回到站点播放器里' +
          '（留在马上要删掉的 overlay 里 = 字幕从此消失）',
      ).toBe('player');
      expect(home.connected, '字幕不能凭空消失').toBe(true);
    } finally {
      await ext.close();
    }
  });
});
