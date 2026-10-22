import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 网页全屏浮层的**样式隔离**。
 *
 * ⚠️ 这套用例守的是 6.2.0 的回归（挂载点换了，隔离策略没跟着换）：
 *
 * 6.2.0 把浮层从 `<body>` 挂到了 `<html>`（src/content/viewportRoot.ts）——
 * 那个改动是对的（body 带 transform 时 fixed 后代会被关在 body 的盒子里），
 * 但背板与控制条宿主因此成了 `<html>` 的**直接子节点**，而它们的样式仍留在
 * 注入的那份 `<style>` 里 —— 那是**普通作者声明**。
 *
 * 于是站点一条 `html > div { display: none !important }`
 * （「只认我自己的顶层节点」是站点做框架布局时的常见写法）就能打掉它们。
 * 实测症状（修复前）：
 *
 *   overlayDisplay = none      → 背板没了
 *   controlsDisplay = none     → 控制条与退出按钮整个没了
 *   videoInStage = false       → 视频退回 css-cover
 *   bodyScrollLocked = hidden  → 页面滚动被锁死
 *
 * 用户看到的是一片黑，**没有控制条、没有退出按钮**，只剩 Esc 能退出。
 *
 * ⚠️ 为什么这里量的是 **computed style** 而不是「元素上有没有某个 class」：
 * 站点打穿样式时 class 照样在（`.vsc-active` 一直挂着），
 * 只有浏览器**真正算出来**的那一份才算数。
 */

/** 真实的 10 秒视频（隔离世界看不见页面里的 mock，媒体状态必须是真的）。 */
const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 一个「只认我自己的顶层节点」的站点。
 *
 * ⚠️ 规则命中的是 `<html>` 的**直接子节点** —— 我们的背板与控制条宿主
 * 正好就是（6.2.0 之后）。
 */
const hostilePage = (hostileCss) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc fullscreen isolation</title>
<style>
  html,body{margin:0;height:100%;background:#000}
  #player{position:relative;width:100vw;height:100vh}
  video{width:100%;height:100%;background:#000}
  ${hostileCss}
</style>
</head><body>
<div id="player">
  <video id="v1" muted playsinline preload="auto" src="${CLIP}"></video>
</div>
</body></html>`;

/**
 * 接管页面的路由。
 *
 * ⚠️ `chrome-extension://` 的请求必须放行（route.continue()）：
 * 中断它 = 内容脚本加载不上 = 测试在空转（而且看起来还挺绿）。
 */
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

/** 进网页全屏并等浮层挂好。 */
const enterFullscreen = async (page) => {
  await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
  // ⚠️ 这里的超时都放宽到 30 秒：机器上有别的负载时，
  // 默认的 5 秒轮询会随机翻车（那不是回归，是抢不到 CPU）。
  await page.locator('#v1').click({ timeout: 30_000 });
  await page.keyboard.press('f');
  await expect
    .poll(
      () =>
        page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
      { timeout: 30_000 },
    )
    .toBe(true);
  // 控制条淡入 180ms，等它稳下来。
  await page.waitForTimeout(400);
};

/**
 * 背板与控制条宿主的**渲染出来**的那一份样式。
 *
 * ⚠️ 取的是 getComputedStyle —— 站点打穿样式时，class 与内联声明都还在，
 * 只有 computed style 才反映浏览器真正算出来的结果。
 */
const surfaceStyles = (page) =>
  page.evaluate(() => {
    const overlay = document.getElementById('vsc-page-fullscreen-overlay');
    const stage = document.getElementById('vsc-page-fullscreen-stage');
    const host = document.getElementById('vsc-controls');
    const video = document.getElementById('v1');
    const videoRect = video?.getBoundingClientRect();
    return {
      overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
      overlayVisibility: overlay ? getComputedStyle(overlay).visibility : null,
      stageDisplay: stage ? getComputedStyle(stage).display : null,
      controlsDisplay: host ? getComputedStyle(host).display : null,
      videoInStage: Boolean(stage && video && stage.contains(video)),
      // visibility 是**继承**属性：背板被站点设成 hidden 时，
      // 里面的视频会一起看不见（而 display:none 不会改视频自己的 visibility）。
      videoVisibility: video ? getComputedStyle(video).visibility : null,
      videoRect: videoRect
        ? { width: Math.round(videoRect.width), height: Math.round(videoRect.height) }
        : null,
    };
  });

/**
 * 收起态那枚独立退出钮的状态（它在 shadow root 里，不在 .bar 子树里）。
 *
 * ⚠️ 宽高必须**真的** > 0：宿主一旦被站点打穿（display:none），
 * 里面所有元素的 getBoundingClientRect() 都是 0×0 ——
 * 「元素还在」不等于「用户看得见」。
 */
const collapsedExitState = (page) =>
  page.evaluate(() => {
    const el = document
      .getElementById('vsc-controls')
      ?.shadowRoot?.querySelector('[data-role="exit-collapsed"]');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      visible: style.visibility !== 'hidden' && style.display !== 'none',
      opacity: Number(style.opacity),
    };
  });

/** 控制条当前是不是「可见」状态（class 是唯一的真相）。 */
const barVisible = (page) =>
  page.evaluate(() =>
    Boolean(
      document
        .getElementById('vsc-controls')
        ?.shadowRoot?.querySelector('.bar')
        ?.classList.contains('bar--visible'),
    ),
  );

/**
 * 把焦点从控制条里放掉。
 *
 * 键盘进全屏时运行时会把焦点送进控制条（focusFirst），
 * 控制条于是**永远不会自动隐藏** —— 那是给键盘用户的保护。
 * 这里要测的是「鼠标用户」看到的样子，所以先把焦点放掉。
 */
const blurControlBar = (page) =>
  page.evaluate(() => {
    const shadow = document.getElementById('vsc-controls')?.shadowRoot;
    const active = shadow?.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });

test.describe('网页全屏浮层的样式隔离（站点的 !important 打不穿）', () => {
  test('站点一条 html > div { display:none !important } 不能打掉背板与控制条', async () => {
    test.setTimeout(120_000);

    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(hostilePage('html > div { display: none !important; }'));
      await page.goto('https://vsc-fullscreen-isolation.example/');
      await enterFullscreen(page);

      const surfaces = await surfaceStyles(page);
      expect(surfaces.overlayDisplay, '背板不能被站点的 !important 隐藏').not.toBe('none');
      expect(surfaces.stageDisplay, '舞台不能被站点的 !important 隐藏').not.toBe('none');
      expect(surfaces.controlsDisplay, '控制条不能被站点的 !important 隐藏').not.toBe('none');

      // 画面必须真的在：视频搬进了舞台，而且有尺寸（不是 0×0）。
      expect(surfaces.videoInStage, '视频必须搬进全屏舞台').toBe(true);
      expect(surfaces.videoRect?.width ?? 0, '全屏视频必须有宽度').toBeGreaterThan(0);
      expect(surfaces.videoRect?.height ?? 0, '全屏视频必须有高度').toBeGreaterThan(0);
    } finally {
      await ext.close();
    }
  });

  test('收起态的退出按钮必须真的看得见（宿主被打穿时它会是 0×0）', async () => {
    test.setTimeout(120_000);

    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(hostilePage('html > div { display: none !important; }'));
      await page.goto('https://vsc-fullscreen-isolation-exit.example/');
      await enterFullscreen(page);

      // 键盘进全屏 → 焦点在控制条里 → 它不会自动隐藏。先放掉焦点。
      await blurControlBar(page);
      // 光标不动地等控制条自己收起（3 秒）。
      await page.waitForTimeout(4000);
      expect(await barVisible(page), '控制条应该已经收起').toBe(false);

      const collapsed = await collapsedExitState(page);
      expect(collapsed, '控制条收起后必须还有一枚独立退出钮').not.toBeNull();
      // ⚠️ 宽高必须 > 0：宿主被 display:none 时，里面的元素全是 0×0，
      // 用户看到的就是「什么都没有」。
      expect(collapsed.width, '收起态退出钮必须有宽度').toBeGreaterThan(0);
      expect(collapsed.height, '收起态退出钮必须有高度').toBeGreaterThan(0);
      expect(collapsed.visible, '收起态退出钮必须可见（永远在的退出入口）').toBe(true);
    } finally {
      await ext.close();
    }
  });

  test('站点用 visibility / transform 打过来时同样打不穿', async () => {
    test.setTimeout(120_000);

    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      // ⚠️ 站点给顶层节点加 transform 是 GPU 加速的常见写法 ——
      // 它会让那个节点变成 fixed 后代的**包含块**（控制条与全屏视频会飘走），
      // 而 visibility: hidden 则让浮层彻底看不见。
      // 两条都必须被隔离底座挡下（靠的是 all: initial 把它们重置掉）。
      setBody(
        hostilePage(
          'html > div { visibility: hidden !important; transform: translateZ(0) !important; }',
        ),
      );
      await page.goto('https://vsc-fullscreen-isolation-visibility.example/');
      await enterFullscreen(page);

      const surfaces = await surfaceStyles(page);
      expect(surfaces.overlayDisplay, '背板不能被站点的 !important 隐藏').not.toBe('none');
      expect(surfaces.overlayVisibility, '背板不能被站点的 !important 藏起来').not.toBe('hidden');
      expect(surfaces.controlsDisplay, '控制条不能被站点的 !important 隐藏').not.toBe('none');
      expect(surfaces.videoInStage, '视频必须搬进全屏舞台').toBe(true);
      // ⚠️ visibility 是继承属性：背板被藏起来时，里面的视频一起看不见 ——
      // 而它的盒子**还在**（宽高不为 0），所以只看宽高会漏掉这一半。
      expect(surfaces.videoVisibility, '全屏视频不能被藏起来').not.toBe('hidden');
      expect(surfaces.videoRect?.width ?? 0, '全屏视频必须有宽度').toBeGreaterThan(0);
      expect(surfaces.videoRect?.height ?? 0, '全屏视频必须有高度').toBeGreaterThan(0);
    } finally {
      await ext.close();
    }
  });
});
