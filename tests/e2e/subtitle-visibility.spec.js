import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { SD_4X3_MP4_BASE64 } from './fixtures/sd-4x3.ts';
import { launchExtension } from './helpers/launch.js';
import { readPixel } from './helpers/png.js';

/**
 * 字幕可见性回归守卫。
 *
 * 这套用例守的是 6.0.8 号称修好、实测根本没生效的那件事：
 * 「网页全屏不再弄丢沉浸式翻译等插件的字幕」。
 *
 * 6.0.8 实际有两处判断是错的，两处都只靠"DOM 顺序"和"容器宽度"成立，
 * 在真实浏览器里都不成立：
 *
 * ① **字幕容器往往铺满整个播放器宽度**（`left:0; right:0; text-align:center`）。
 *    6.0.8 的判据是「容器宽度 ≤ 视频宽度 × 70%」，于是 100% 宽的字幕
 *    被判成「不是字幕」→ 不搬进 stage → 留在原地的字幕被 overlay 背板挡住
 *    → 用户眼里就是「一按 f 字幕就没了」。
 *
 * ② **DOM 顺序排在视频之后并不足以让字幕可见**。视频在 reparent 后带
 *    `z-index: 2147483646`（inline !important），而字幕原本是 `z-index: auto`。
 *    z-index 只在**同一层叠上下文**内比较，auto 的定位元素依然输给显式
 *    高层级的视频 —— 实测字幕被 100% 盖住，一个像素都看不见。
 *
 * ③ **控制条与字幕争夺画面底部同一块区域**。控制条贴着视口底部（还带
 *    向上渐变），字幕也贴着画面底部，两者必然重叠。
 *
 * 这三条都只能在真实浏览器里测出来：jsdom 没有布局引擎，
 * getBoundingClientRect 与 Range.getClientRects() 全是 0。
 */

const serve = (page, body) =>
  page.route('**/*', (route) => {
    if (route.request().url().startsWith('chrome-extension://')) {
      return route.continue();
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });

/**
 * 生成一个带字幕层的页面。
 *
 * captionCss 用来复刻各种真实字幕容器的形态 —— 尤其��
 * `left:0; right:0` 这种「容器铺满、文字居中」的写法，
 * 它是 6.0.8 判断失效的根源。
 */
const pageWithCaption = (captionCss, captionId = 'cap') => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc subtitle visibility</title>
<style>
  body{margin:0;background:#111}
  #player{position:relative;width:720px;height:405px}
  video{width:720px;height:405px;background:#000}
  #${captionId}{
    position:absolute;${captionCss}
    background:rgba(255,0,0,.9);color:#fff;font:20px/1.4 sans-serif;
  }
</style>
</head><body>
<div id="player">
  <video id="v1" muted playsinline></video>
  <div id="${captionId}">这是字幕文字 SUBTITLE</div>
</div>
</body></html>`;

/** 让页面里的 video 表现得像一个正在播放的视频。 */
const markVideoPlaying = (page) =>
  page.evaluate(() => {
    const v = document.getElementById('v1');
    Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
  });

/**
 * 一个用**真实 4:3 视频**（640×480）的页面。
 *
 * 为什么要真实视频：内容脚本在隔离世界，而 `video.videoWidth` 是原生属性，
 * 页面里 mock 不掉它（mock 只在页面世界生效）。于是此前所有用例里扩展读到的
 * 都是 videoWidth=0 —— `alignStageToVideo` 每次都提前 return，
 * **画面框对齐这条路径从未被测过**。
 */
const pageWithRealVideo = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc real video</title>
<style>
  body{margin:0;background:#111}
  #player{position:relative;width:640px;height:480px}
  video{width:640px;height:480px;background:#000}
  #cap{
    position:absolute;left:0;right:0;bottom:5%;text-align:center;
    background:rgba(255,0,0,.9);color:#fff;font:20px/1.4 sans-serif;
  }
</style>
</head><body>
<div id="player">
  <video id="v1" muted playsinline src="/sd-4x3.mp4"></video>
  <div id="cap">这是字幕文字 SUBTITLE</div>
</div>
</body></html>`;

/** 同时供 HTML 与 mp4 使用的路由。 */
const serveWithVideo = (page) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) {
      return route.continue();
    }
    if (url.endsWith('.mp4')) {
      return route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: Buffer.from(SD_4X3_MP4_BASE64, 'base64'),
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: pageWithRealVideo() });
  });

/** 字幕参照物（caption host）的几何信息。 */
const readCaptionHost = (page) =>
  page.evaluate(() => {
    const stage = document.getElementById('vsc-page-fullscreen-stage');
    const host = stage?.querySelector('[data-vsc-caption-host]');
    const caption = document.getElementById('cap');
    if (!host || !caption) {
      return null;
    }
    const h = host.getBoundingClientRect();
    const c = caption.getBoundingClientRect();
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      host: { t: Math.round(h.top), l: Math.round(h.left), w: Math.round(h.width), h: Math.round(h.height) },
      caption: { t: Math.round(c.top), l: Math.round(c.left), w: Math.round(c.width), h: Math.round(c.height) },
    };
  });

test.describe('字幕可见性（6.0.8 号称修好、实测未生效的回归守卫）', () => {
  /**
   * 字幕容器铺满播放器宽度时（真实站点的常态），必须照样被搬进 stage。
   */
  test('100% 宽的字幕容器也要被搬进全屏', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, pageWithCaption('left:0;right:0;bottom:6%;text-align:center;'));
      await page.goto('https://vsc-sub-wide.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await markVideoPlaying(page);

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);

      const state = await page.evaluate(() => {
        const stage = document.getElementById('vsc-page-fullscreen-stage');
        const caption = document.getElementById('cap');
        return {
          inStage: stage?.contains(caption) ?? false,
          // 字幕必须比视频高，否则被视频整个盖住。
          captionZ: Number(getComputedStyle(caption).zIndex),
          videoZ: Number(getComputedStyle(document.getElementById('v1')).zIndex),
        };
      });

      expect(state.inStage, '100% 宽的字幕容器也必须被搬进 stage').toBe(true);
      expect(
        state.captionZ,
        '字幕的 z-index 必须高于视频，否则被视频盖住（6.0.8 的原判断）',
      ).toBeGreaterThan(state.videoZ);
    } finally {
      await ext.close();
    }
  });

  /**
   * 真正的判据：字幕的**像素**是不是真的画出来了。
   *
   * 用 elementFromPoint 判定字幕中心点最上层是谁 —— 这比
   * `getBoundingClientRect().height > 0` 严格得多：后者对「被盖住的字幕」
   * 同样返回 true（6.0.8 的 E2E 正是这样漏掉了问题）。
   */
  test('字幕在像素上真的可见（不被视频与控制条盖住）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, pageWithCaption('left:0;right:0;bottom:6%;text-align:center;'));
      await page.goto('https://vsc-sub-visible.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await markVideoPlaying(page);

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      // 等控制条浮现完（它一出现就会把字幕往下压，避让逻辑要跟上）
      await page.waitForTimeout(600);

      // 判据：**截图取像素**。
      //
      // 早先这里用 elementFromPoint，但那是**命中测试**，不是绘制测试：
      // 字幕容器带 pointer-events:none（它不该挡住用户的鼠标），
      // 于是 elementFromPoint 永远返回视频 —— 哪怕字幕的像素真的画在屏幕上。
      // 早先这条断言在字幕被视频盖住时能过、在字幕真的可见时反而挂掉，
      // 说明它测的根本不是"可见"。
      //
      // 正确的判据是问浏览器"这个位置最后画出来的是什么颜色"：
      // 字幕底色是 rgba(255,0,0,.9)，画在纯黑的视频上必然是明显的红。
      const shot = await page.screenshot({ type: 'png' });
      const rect = await page.evaluate(() => {
        const r = document.getElementById('cap').getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });

      // 采样点选字幕**背景**而不是文字中心：
      // 字幕底色是 rgba(255,0,0,.9)（红），字是白色。
      // 采样正中心会落在白字上，读到的是 (251,219,219) 这样的浅色 ——
      // 那恰恰说明字幕**画出来了**，却会被误判成"被盖住"。
      // 取字幕左边缘往里一点的位置，那里只有红底、没有字。
      const probe = {
        x: Math.round(rect.left + 24),
        y: Math.round(rect.top + rect.height / 2),
      };

      const pixel = readPixel(shot, probe.x, probe.y);
      // 红底 (255,0,0) 叠 0.9 透明度 → 约 (255,0,0)；视频区是纯黑 (0,0,0)。
      const isCaptionRed = pixel && pixel[0] > 180 && pixel[1] < 90 && pixel[2] < 90;

      expect(
        isCaptionRed,
        `字幕背景点 (${probe.x}, ${probe.y}) 的像素是 ${pixel ? pixel.join(',') : 'null'} —— ` +
          '不是字幕的红，说明字幕被视频或控制条盖住了',
      ).toBe(true);
    } finally {
      await ext.close();
    }
  });

  /**
   * 字幕容器不能塌成 0 宽。
   *
   * 这是一条**本轮新发现的真 bug**，之前的用例全都漏掉了它。
   *
   * stage 是 flex 容器（display:flex; align-items:center; justify-content:center），
   * 字幕容器是它的 flex item —— 而 flex item 的宽度默认由**内容**决定。
   * 容器里只有绝对定位的字幕（不参与布局），于是容器自身宽度是 0。
   * 站点字幕写的是 `left:0; right:0`，相对一个 0 宽的包含块 →
   * **字幕自己的宽度也是 0** → 一个像素都看不见。
   *
   * 为什么之前的用例没抓到：它们只断言 `getBoundingClientRect().height > 0`，
   * 而 0 宽元素的 **height 仍然是 28**（高度由内容撑开，宽度由 left/right 决定）。
   * 只有量宽度才看得出问题。
   */
  test('字幕容器不塌成 0 宽（否则 left:0;right:0 的字幕自己也是 0 宽）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, pageWithCaption('left:0;right:0;bottom:6%;text-align:center;'));
      await page.goto('https://vsc-sub-width.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await markVideoPlaying(page);

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);

      const geometry = await page.evaluate(() => {
        const stage = document.getElementById('vsc-page-fullscreen-stage');
        const caption = document.getElementById('cap');
        const host = stage?.querySelector('[data-vsc-caption-host]');
        const capRect = caption.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        return {
          hostWidth: Math.round(hostRect.width),
          hostHeight: Math.round(hostRect.height),
          captionWidth: Math.round(capRect.width),
          captionHeight: Math.round(capRect.height),
          stageWidth: Math.round(stage.getBoundingClientRect().width),
        };
      });

      expect(geometry.hostWidth, '字幕容器不能塌成 0 宽').toBeGreaterThan(0);
      expect(geometry.captionWidth, '字幕自己的宽度也必须大于 0').toBeGreaterThan(0);
      expect(
        geometry.captionHeight,
        '字幕必须有真实高度（0 宽元素的 height 仍然 > 0，只量高度会漏掉这个 bug）',
      ).toBeGreaterThan(0);
    } finally {
      await ext.close();
    }
  });

  /**
   * 弹幕不能被搬进全屏：满屏弹幕比没有字幕吵得多。
   */
  test('弹幕层不该被搬进全屏', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{margin:0;background:#111}
        #player{position:relative;width:720px;height:405px}
        video{width:720px;height:405px;background:#000}
        #danmaku{position:absolute;inset:0}
        #danmaku span{position:absolute;color:#fca5a5;font-size:18px}
      </style></head><body>
      <div id="player">
        <video id="v1" muted playsinline></video>
        <div id="danmaku">
          <span style="left:2%;top:12%">弹幕一</span>
          <span style="left:38%;top:33%">弹幕二</span>
          <span style="left:70%;top:8%">弹幕三</span>
          <span style="left:15%;top:58%">弹幕四</span>
        </div>
      </div></body></html>`;
      await serve(page, html);
      await page.goto('https://vsc-danmaku.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      // 不能用 click()：弹幕层 `inset:0` 铺满整个播放器，会挡住 Playwright
      // 对 video 的点击（真实浏览器里也一样 —— 弹幕就该挡住视频表面）。
      // 这里只需要"用户碰过这个视频"，直接派发 pointerdown 即可。
      await page.locator('#v1').dispatchEvent('pointerdown');
      await markVideoPlaying(page);

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);

      const inStage = await page.evaluate(() => {
        const stage = document.getElementById('vsc-page-fullscreen-stage');
        return stage?.contains(document.getElementById('danmaku')) ?? false;
      });

      expect(inStage, '弹幕不该被搬进全屏').toBe(false);
    } finally {
      await ext.close();
    }
  });

  /**
   * 字幕参照物必须与**实际画面框**等大，而不是与视口等大。
   *
   * 视频是 `object-fit: contain`：4:3 的视频放进 16:9 的视口，左右会留黑边。
   * 字幕的 `bottom: 5%` 必须相对**画面**算，而不是相对视口 —— 否则字幕
   * 会掉进黑边里，看起来就是"字幕飘到画面外面去了"。
   */
  test('字幕参照物与实际画面框等大（不是与视口等大）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveWithVideo(page);
      await page.goto('https://vsc-sub-aspect.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      // 等真实元数据就绪 —— videoWidth 只有在有源时才是真值
      await page.waitForFunction(() => document.getElementById('v1')?.videoWidth > 0, null, {
        timeout: 15_000,
      });

      await page.locator('#v1').click();
      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      await page.waitForTimeout(400);

      const geo = await readCaptionHost(page);
      expect(geo, '字幕参照物应该存在').not.toBeNull();

      // 画面框 = contain 后的结果：min(1280/640, 720/480) = 1.5 → 960×720
      const expectWidth = 960;
      const expectHeight = 720;
      expect(geo.host.w, '参照物宽度应等于画面框宽度').toBe(expectWidth);
      expect(geo.host.h, '参照物高度应等于画面框高度').toBe(expectHeight);
      // 参照物居中：左右黑边各 (1280-960)/2 = 160
      expect(geo.host.l, '参照物应水平居中').toBe(160);
      // 字幕必须落在画面框之内
      expect(
        geo.caption.t + geo.caption.h,
        '字幕底边不能超出画面底边（超出 = 字幕掉进黑边/画面外）',
      ).toBeLessThanOrEqual(expectHeight);
    } finally {
      await ext.close();
    }
  });

  /**
   * 视口变了，参照物必须跟着重新算。
   *
   * 这条是本轮新发现的真 bug。之前 `alignStageToVideo` 只绑在 video 自己的
   * `loadedmetadata` / `resize`（那是**媒体**尺寸变化）上，视口变化两者都不
   * 触发 —— 参照物永远停在旧的 px 值上。
   *
   * 实测后果：1280×720 视口下参照物是 960×720；把视口缩到 900×600 后
   * 画面框变成 800×600，参照物却还停在 960×720 → 字幕的 bottom:5% 相对
   * 720px 算，底边落在 635px，**已经超出 600px 的视口**，字幕被推到画面之外。
   */
  test('视口变化后字幕参照物重新对齐（否则字幕会被推到画面外）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveWithVideo(page);
      await page.goto('https://vsc-sub-resize.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.waitForFunction(() => document.getElementById('v1')?.videoWidth > 0, null, {
        timeout: 15_000,
      });

      await page.locator('#v1').click();
      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      await page.waitForTimeout(400);

      const before = await readCaptionHost(page);
      expect(before.host.w, '初始参照物宽度').toBe(960);

      await page.setViewportSize({ width: 900, height: 600 });
      await expect
        .poll(
          async () => {
            const geo = await readCaptionHost(page);
            return geo ? `${geo.host.w}x${geo.host.h}` : 'none';
          },
          { timeout: 5000 },
        )
        .toBe('800x600');

      const after = await readCaptionHost(page);
      // 画面框 = min(900/640, 600/480) = 1.25 → 800×600
      expect(after.host.w, '视口变化后参照物宽度应为 800').toBe(800);
      expect(after.host.h, '视口变化后参照物高度应为 600').toBe(600);
      expect(
        after.caption.t + after.caption.h,
        '字幕底边不能超出新的画面底边',
      ).toBeLessThanOrEqual(600);
    } finally {
      await ext.close();
    }
  });

  /**
   * 退出全屏后字幕必须完整回到原位，且不能留下我们改过的 z-index。
   */
  test('退出全屏后字幕回到原位且样式原样还原', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, pageWithCaption('left:0;right:0;bottom:6%;text-align:center;'));
      await page.goto('https://vsc-sub-restore.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await markVideoPlaying(page);

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      await page.waitForTimeout(400);

      await page.keyboard.press('Escape');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(false);

      const restored = await page.evaluate(() => {
        const caption = document.getElementById('cap');
        const player = document.getElementById('player');
        const kids = Array.from(player.children);
        return {
          backInPlayer: player.contains(caption),
          afterVideo: kids.indexOf(caption) > kids.indexOf(document.getElementById('v1')),
          zIndex: caption.style.zIndex,
          transform: caption.style.transform,
        };
      });

      expect(restored.backInPlayer, '字幕必须回到站点播放器容器').toBe(true);
      expect(restored.afterVideo, '字幕顺序必须完全恢复').toBe(true);
      expect(restored.zIndex, '我们加的 z-index 必须还原').toBe('');
      expect(restored.transform, '我们加的位移必须还原').toBe('');
    } finally {
      await ext.close();
    }
  });

  /**
   * 站点自己写在字幕上的 transform 必须活下来。
   *
   * 字幕是**站点自己的节点**。站点常在它身上写 transform —— 垂直居中用
   * `translateY(-50%)`、入场动画用 `scale()`、弹幕更是满屏乱飞。
   *
   * 控制条避让时我们会给字幕加一个向上的位移；退出全屏时**只该撤掉我们加的
   * 那部分**。早先的实现是 `removeProperty('transform')` —— 站点的位移被一起
   * 抹掉，于是「进一次全屏再退出，站点里原本居中的字幕就歪了」。
   *
   * 这条只能靠真实浏览器测：它要穿过「控制条出现 → 加位移 → 退出 → 撤销」
   * 整条链路。
   */
  test('退出全屏后站点自己的 transform 不被抹掉', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      // ⚠️ 站点的 transform 只能有**一处**。
      // 内联与样式表同时存在时会互相掩盖：删掉我们写的内联，样式表那条会接管，
      // 计算值照样对 —— 于是「还原失败」这个 bug 被掩盖掉，用例变成假通过。
      // 所以两种写法必须分成两个独立场景各自验证。
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{margin:0;background:#111}
        #player{position:relative;width:720px;height:405px}
        video{width:720px;height:405px;background:#000}
        #cap{
          position:absolute;left:0;right:0;bottom:6%;text-align:center;
          background:rgba(255,0,0,.9);color:#fff;font:20px/1.4 sans-serif;
        }
      </style></head><body>
      <div id="player">
        <video id="v1" muted playsinline></video>
        <div id="cap" style="transform:translateY(-12px) scale(1.02)">这是字幕文字 SUBTITLE</div>
      </div></body></html>`;
      await serve(page, html);
      await page.goto('https://vsc-sub-transform.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await markVideoPlaying(page);

      // 读**计算值**：内联与样式表两种写法最终都体现在这里。
      // 计算值会被浏览器归一化成 matrix —— 这没关系，我们要的正是「完整语义」。
      const original = await page.evaluate(() => {
        const el = document.getElementById('cap');
        return {
          inline: el.style.transform,
          computed: getComputedStyle(el).transform,
        };
      });
      expect(original.computed, '前置条件：站点自己写了 transform').not.toBe('none');
      expect(original.computed, '前置条件：站点自己写了 transform').toContain('-12');

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      // 控制条浮现 → 字幕被抬起
      await page.waitForTimeout(700);
      const during = await page.evaluate(
        () => document.getElementById('cap').style.transform,
      );
      expect(during, '全屏中应当叠加了我们自己的位移').not.toBe('');

      await page.keyboard.press('Escape');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(false);

      const after = await page.evaluate(() => {
        const el = document.getElementById('cap');
        return {
          inline: el.style.transform,
          computed: getComputedStyle(el).transform,
        };
      });
      // 还原后：计算值必须回到站点原本的 transform。
      // 我们写回的是 !important 内联（值来自计算结果），所以它会出现在 inline 里，
      // 而 computed 会与站点原本的完全一致 —— 一字不差。
      expect(after.computed, '站点自己的 transform 必须原样恢复').toBe(original.computed);
      expect(after.computed, '我们的位移必须被撤掉').not.toContain('translateY(-4');
    } finally {
      await ext.close();
    }
  });

  /**
   * 站点的 transform 写在**样式表**里时，同样必须原样恢复。
   *
   * 与上一条分开测是有原因的：内联与样式表同时存在时会互相掩盖 ——
   * 删掉我们写的内联，样式表那条会接管，计算值照样对，于是用例变成假通过。
   * 两种写法必须各自独立验证。
   *
   * 这一条验的是另一件事：我们还原时写回的是 `!important` 内联（值取自计算
   * 结果），它必须与样式表那一条算出**完全相同**的结果。
   */
  test('站点把 transform 写在样式表里时，退出全屏后计算值不变', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{margin:0;background:#111}
        #player{position:relative;width:720px;height:405px}
        video{width:720px;height:405px;background:#000}
        #cap{
          position:absolute;left:0;right:0;bottom:6%;text-align:center;
          background:rgba(255,0,0,.9);color:#fff;font:20px/1.4 sans-serif;
          transform:translateY(-12px) scale(1.02);
        }
      </style></head><body>
      <div id="player">
        <video id="v1" muted playsinline></video>
        <div id="cap">这是字幕文字 SUBTITLE</div>
      </div></body></html>`;
      await serve(page, html);
      await page.goto('https://vsc-sub-css-transform.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await markVideoPlaying(page);

      const original = await page.evaluate(() => {
        const el = document.getElementById('cap');
        return {
          inline: el.style.transform,
          computed: getComputedStyle(el).transform,
        };
      });
      expect(original.inline, '前置条件：transform 来自样式表，内联为空').toBe('');
      expect(original.computed, '前置条件：站点自己写了 transform').not.toBe('none');

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      await page.waitForTimeout(700);

      await page.keyboard.press('Escape');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(false);

      const after = await page.evaluate(() => {
        const el = document.getElementById('cap');
        return {
          inline: el.style.transform,
          computed: getComputedStyle(el).transform,
        };
      });
      expect(after.computed, '计算值必须与站点原本的一致').toBe(original.computed);
    } finally {
      await ext.close();
    }
  });

  /**
   * ⚠️ 站点的 transform 带**百分比**时，退出全屏后必须还能跟着容器重算。
   *
   * 6.0.9 的第一版修法是「记计算值、还原时把计算值写回去」。
   * 那是**错的**：计算值里的百分比已经被解析成像素了
   * （`translateX(-50%)` → `matrix(1,0,0,1,-320,0)`），
   * 写回内联就等于把站点样式表里那条百分比规则**永久顶掉**。
   *
   * 后果（实测）：站点容器 640px → 进全屏（画面框 960px）→ 退出，
   * 字幕**向左偏 80px**。因为站点本该按新容器算出 -480，我们冻住的是 -320。
   *
   * 这条断言刻意**不**只看"退出后那一刻"：退出那一刻两种实现看起来一样
   * （都是 -320）。真正的差别要等容器宽度变了才显形 ——
   * 所以这里在退出后**改变容器宽度**，再看站点那条百分比有没有重新生效。
   */
  test('站点的百分比 transform 不会被永久冻成像素值', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      // ⚠️ 字幕必须**真的被搬进全屏**，否则这条用例是空转。
      //
      // 上一版夹具写的是 `left:0;right:0`（字幕容器铺满播放器宽度），
      // 墨水宽度只有 221px、容器宽度却是 640px —— 字幕**根本没被搬进**全屏，
      // 于是"退出后内联里有没有残留"永远与我们的实现无关。
      // 变异验证时才发现：用例全绿，bug 照旧。
      //
      // 真实站点的写法是 `left:50%` + `transform:translateX(-50%)`（shrink-to-fit），
      // 容器宽度 == 墨水宽度，才既像真的、又能通过字幕判据被搬进去。
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{margin:0;background:#111}
        #player{position:relative;width:640px;height:360px}
        video{width:640px;height:360px;background:#000}
        #cap{
          position:absolute;left:50%;bottom:6%;text-align:center;white-space:nowrap;
          transform:translateX(-50%);
          background:rgba(255,0,0,.9);color:#fff;font:20px/1.4 sans-serif;
        }
      </style></head><body>
      <div id="player">
        <video id="v1" muted playsinline></video>
        <div id="cap">这是字幕文字 SUBTITLE</div>
      </div></body></html>`;
      await serve(page, html);
      await page.goto('https://vsc-sub-percent.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await markVideoPlaying(page);

      // 前置条件：站点确实有一条带百分比的 transform。
      const before = await page.evaluate(() => {
        const el = document.getElementById('cap');
        return {
          inline: el.style.transform,
          computed: getComputedStyle(el).transform,
        };
      });
      expect(before.inline, '前置条件：transform 来自样式表，内联为空').toBe('');
      expect(before.computed, '前置条件：站点自己写了 transform').not.toBe('none');

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      await page.waitForTimeout(700);

      // ⚠️ 前置条件：字幕必须**已经进了全屏**（住在我们建的参照物里）。
      // 没有这一步，用例就退化成"什么都没发生"——那样它对任何实现都成立。
      const inFullscreen = await page.evaluate(() => {
        const el = document.getElementById('cap');
        return {
          inHost: Boolean(el.closest('[data-vsc-caption-host]')),
          inline: el.style.transform,
        };
      });
      expect(
        inFullscreen.inHost,
        '前置条件：字幕必须被搬进全屏，否则这条用例是空转',
      ).toBe(true);
      expect(inFullscreen.inline, '全屏中应当叠加了我们自己的位移').not.toBe('');

      await page.keyboard.press('Escape');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(false);

      // 退出后改字号：字幕**自身宽度**随之改变（441 → 883）。
      // `translateX(-50%)` 是相对**元素自身宽度**的 —— 宽度变了，它必须重算。
      //
      // ⚠️ 改**容器**宽度是无效的鉴别：translateX 的百分比参照的是元素自己的
      // 宽度（shrink-to-fit 的字幕宽度不随容器变），所以容器变宽时那个值
      // 本来就不该变。早期版本用容器宽度做鉴别，结论是错的。
      const after = await page.evaluate(() => {
        document.getElementById('cap').style.fontSize = '40px';
        const el = document.getElementById('cap');
        return {
          inline: el.style.transform,
          computed: getComputedStyle(el).transform,
          width: Math.round(el.getBoundingClientRect().width),
        };
      });

      // 关键断言 1：站点那条规则还在管事（没有被我们的内联顶掉）。
      expect(
        after.inline,
        '我们不能把计算值写回内联 —— 那会永久顶掉站点样式表里的百分比规则',
      ).toBe('');

      // 关键断言 2：百分比必须重算。元素变宽了一倍，-50% 的绝对值也必须变大一倍。
      const beforeOffset = Number((before.computed.match(/matrix\(([^)]*)\)/)?.[1] ?? '')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((_, index) => index === 4)[0]);
      const afterOffset = Number((after.computed.match(/matrix\(([^)]*)\)/)?.[1] ?? '')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((_, index) => index === 4)[0]);

      expect(after.width, '前置条件：字号变大后字幕自身宽度应变宽').toBeGreaterThan(0);
      expect(
        Math.abs(afterOffset),
        `站点的百分比必须跟着元素宽度重算（之前 ${beforeOffset}，之后 ${afterOffset}）`,
      ).toBeGreaterThan(Math.abs(beforeOffset));
    } finally {
      await ext.close();
    }
  });
});
