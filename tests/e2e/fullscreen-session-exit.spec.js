import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 全屏会话的**出口**必须唯一。
 *
 * 这一组守的是同一个根因的四个面：全屏会话有**若干条**结束路径
 * （控制条退出钮、Esc、站点把视频拿回去、站点摘掉我们的背板），
 * 而「我们还在接管这个视频」这件事在**注册表**那边也有一份状态。
 * 以前只有 Esc 那条路径会去清它 —— 于是从别的出口退出之后，
 * 注册表仍然以为「我们接管着这个视频」。
 *
 * 用户能看到的两个症状：
 *   A. 退出全屏后点工具栏图标 → 进全屏的是**那个早就滚出屏幕的视频**，
 *      而不是眼前那个（注册表把它当成「绝对优先」的目标）。
 *   B. 文章页里有个装饰性预览视频时，退出全屏后按空格**不再翻页**，
 *      而是把那条预览视频暂停了（它不再被判成「页面预览」，因为
 *      注册表以为「我们接管着它」）。
 *
 * 为什么必须在**真实浏览器**里测：
 *   - 症状 A 依赖「在视口里」这条判据（jsdom 没有布局引擎，rect 恒为 0）；
 *   - 症状 B 依赖装饰性预览的七条证据（面积、视口、真实播放状态）；
 *   - 缺陷 2 依赖真实的 style 属性语义；
 *   - 缺陷 4 依赖真实的健康检查定时器与滚动锁。
 *
 * ⚠️ 内容脚本跑在隔离世界：页面里对 paused / readyState 的
 * `Object.defineProperty` 它**看不见**。所以这里一律用真实媒体、真实播放。
 */

/** 真实 webm（10 秒 / 480×270）。 */
const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/** 接管页面的路由（同一个 page 可以反复换内容）。 */
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

/** 从控制条的退出钮退出全屏（**不是** Esc —— 那一条路径本来就会通知注册表）。 */
const exitViaControlBar = async (page) => {
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById('vsc-controls'))))
    .toBe(true);
  const clicked = await page.evaluate(() => {
    const button = document
      .getElementById('vsc-controls')
      ?.shadowRoot?.querySelector('[data-role="exit"]');
    if (!(button instanceof HTMLElement)) return false;
    button.click();
    return true;
  });
  expect(clicked, '控制条上必须有退出按钮').toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
    )
    .toBe(false);
};

/** 点工具栏图标（走 background 的真实消息路径）。 */
const clickToolbarIcon = async (ext, page) => {
  await ext.serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('找不到当前标签页');
    await chrome.tabs.sendMessage(tab.id, { type: 'vsc-toggle-fullscreen' });
  });
  await page.waitForTimeout(400);
};

/** 当前进全屏的是哪个视频。 */
const fullscreenTarget = (page) => page.evaluate(() => {
  const stage = document.getElementById('vsc-page-fullscreen-stage');
  return stage?.querySelector('video')?.id ?? null;
});

/**
 * 模拟站点重渲染：把 <video> 插回它自己的新容器。
 *
 * ⚠️ `immediate: true` 用 MutationObserver 守着 —— 视频一进 stage 就搬走，
 * 落在进全屏之后那 **180ms** 的探测窗口**之内**。
 * 那条路径以前会把会话**降级成 css-cover**（视频被搬回原位置、fixed 铺满视口、
 * body 照样锁死），而且 css-cover 模式里**没有任何机制**会发现「站点已经把
 * 视频拿回去了」—— 页面就一直卡到用户按 Esc。
 *
 * ⚠️ 为什么必须用 MutationObserver，而不是「等 300ms 再搬」：
 * 那个窗口只有 180ms，测试调度的抖动就能把它滑过去 ——
 * 于是这条用例会变成一条**永远绿**的假守卫（它测的是「晚于 180ms」那条路）。
 * MutationObserver 的回调是微任务：视频一进 stage 就搬走，稳定落在窗口内。
 */
const siteTakesVideoBack = async (page, { immediate = false } = {}) => {
  await page.evaluate((watch) => {
    window.__moved = false;
    const move = () => {
      if (window.__moved) return;
      const video = document.getElementById('v1');
      const stage = document.getElementById('vsc-page-fullscreen-stage');
      if (!video || !stage || !stage.contains(video)) return;
      window.__moved = true;
      const fresh = document.createElement('div');
      fresh.id = 'site-player';
      fresh.style.width = '320px';
      fresh.style.height = '180px';
      document.body.appendChild(fresh);
      fresh.appendChild(video);
    };
    if (watch) {
      const observer = new MutationObserver(() => move());
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    move();
  }, immediate);
};

/** 页面必须已经解锁：背板撤了、滚动没锁、视频回到站点自己的尺寸。 */
const expectPageUnlocked = async (page) => {
  const after = await page.evaluate(() => {
    const video = document.getElementById('v1');
    const rect = video.getBoundingClientRect();
    return {
      parentId: video.parentElement?.id ?? null,
      width: rect.width,
      height: rect.height,
      position: getComputedStyle(video).position,
      overflow: document.body.style.overflow,
      overlay: Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
      scrollable: document.documentElement.scrollHeight > window.innerHeight,
    };
  });

  expect(after.parentId, '视频必须留在站点的新容器里（不能被我们再搬走）').toBe('site-player');
  expect(after.position, '视频不能再被钉成 fixed（页面锁死的直接原因）').not.toBe('fixed');
  expect(after.width, '视频必须回到站点容器的大小，而不是视口大小').toBeLessThan(400);
  expect(after.overflow, 'body 的滚动锁必须解开').not.toBe('hidden');
  expect(after.overlay, '背板必须撤掉').toBe(false);
  expect(after.scrollable, '前置条件：页面本来是可以滚的').toBe(true);

  // 真的滚一下：页面必须能用。
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => window.scrollY),
    '页面必须真的能滚动（用户不再需要按 Esc 才能用页面）',
  ).toBeGreaterThan(0);
};

test.describe('全屏会话的出口唯一', () => {
  test.setTimeout(90_000);

  test('症状 A：从控制条退出后，点图标进的是眼前那个视频，不是已经滚走的那个', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#fff}
  video{display:block;width:800px;height:450px;background:#000}
  #gap{height:4000px}
</style></head><body>
<div id="player"><video id="gone" controls playsinline src="${CLIP}" loop></video></div>
<div id="gap"></div>
<div id="player2"><video id="visible" controls playsinline src="${CLIP}" loop></video></div>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      // 用户在页面顶部对 gone 进了全屏（点它 → f）。
      await page.locator('#gone').click();
      await page.keyboard.press('f');
      await expect.poll(() => fullscreenTarget(page)).toBe('gone');

      // 从**控制条的退出钮**退出。
      await exitViaControlBar(page);

      // 用户往下滚了：gone 滚出屏幕，眼前换成 visible。
      await page.evaluate(() => window.scrollTo(0, 4200));
      await page.waitForTimeout(300);

      const geometry = await page.evaluate(() => {
        const gone = document.getElementById('gone').getBoundingClientRect();
        const visible = document.getElementById('visible').getBoundingClientRect();
        return {
          goneTop: gone.top,
          visibleTop: visible.top,
          scrollY: window.scrollY,
        };
      });
      // 前置条件：gone 真的滚出视口了，visible 真的在眼前。
      expect(geometry.goneTop, '前置条件：gone 必须滚出视口').toBeLessThan(0);
      expect(geometry.visibleTop, '前置条件：visible 必须在视口里').toBeGreaterThan(0);
      expect(geometry.visibleTop, '前置条件：visible 必须完整可见').toBeLessThan(720);

      // 点工具栏图标。
      await clickToolbarIcon(ext, page);

      expect(
        await fullscreenTarget(page),
        '图标必须进眼前那个视频（缺陷：进的是那个已经退出全屏、还滚出屏幕的）',
      ).toBe('visible');
    } finally {
      await ext.close();
    }
  });

  test('症状 B：从控制条退出后，文章页的装饰性预览不再抢走空格', async () => {
    // 场景（真实用户）：文章页里嵌了一个站点自己播的预览视频。
    // 用户一时好奇点了工具栏图标把它拉进全屏（显式操作允许接管它），
    // 然后用**控制条的退出钮**退出，继续读文章。
    //
    // 缺陷：退出后注册表仍以为「我们接管着它」→ 它不再被判成
    // 「页面预览」→ 按空格时快捷键路径接管了它 → 页面翻不动了。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      // 900×506 = 视口 49%（**不到** 60% 的页面主角线），没有 controls、
      // 没有 autoplay 属性、由站点用 JS 播起 —— 装饰性预览的标准形状。
      setBody(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#fff}
  video{display:block;width:900px;height:506px;background:#222}
  #tail{height:4000px}
</style></head><body>
<p>这是一篇很长的文章，用户正在读字。</p>
<div id="player"><video id="preview" playsinline src="${CLIP}" loop></video></div>
<div id="tail"></div>
<script>
  window.__seen = [];
  window.addEventListener('keydown', (e) => window.__seen.push(e.key));
  const preview = document.getElementById('preview');
  preview.muted = true;
  preview.play();
</script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      const shape = await page.evaluate(() => {
        const v = document.getElementById('preview');
        const r = v.getBoundingClientRect();
        return {
          autoplay: v.hasAttribute('autoplay'),
          controls: v.hasAttribute('controls'),
          fraction: (r.width * r.height) / (window.innerWidth * window.innerHeight),
          playing: !v.paused,
        };
      });
      expect(shape.autoplay, '前置条件：没有 autoplay 属性').toBe(false);
      expect(shape.controls, '前置条件：没有原生 controls').toBe(false);
      expect(shape.playing, '前置条件：站点用 JS 把它播起来了').toBe(true);
      expect(shape.fraction, '前置条件：不到 60% 的页面主角线').toBeLessThan(0.6);

      // 用户点工具栏图标把它拉进全屏（显式操作允许接管页面预览）。
      await clickToolbarIcon(ext, page);
      expect(
        await fullscreenTarget(page),
        '前置条件：显式点击把它拉进了全屏',
      ).toBe('preview');

      // 从**控制条的退出钮**退出。
      await exitViaControlBar(page);

      // ⚠️ 跨过快捷键缓存的有效期（5 秒），逼注册表重新解析一次。
      await page.waitForTimeout(5_500);

      const before = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({
        scrollY: window.scrollY,
        paused: document.getElementById('preview').paused,
        seen: window.__seen,
      }));

      expect(
        after.scrollY,
        '退出全屏后空格必须翻页（缺陷：被那条预览视频吃掉了）',
      ).toBeGreaterThan(before);
      expect(
        after.paused,
        '空格不该切换那条预览的播放状态',
      ).toBe(false);
    } finally {
      await ext.close();
    }
  });

  test('缺陷 2：正常退出全屏不能抹掉站点自己写的内联样式', async () => {
    // 站点（Video.js / Plyr / 自研播放器）会在全屏期间给视频写自己的样式。
    // 以前正常退出走的是「整个 style 属性写回进全屏前的快照」——
    // 于是那段时间站点写的 filter / border-radius / width 全部蒸发。
    //
    // ⚠️ 同一个写操作在「站点把视频拿回自己的容器」那条出口上是**留着的** ——
    // 两条出口对同一件事给出相反的结果，这正是要修的不一致。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}
#player{width:800px;height:450px}
video{display:block;width:100%;height:100%;background:#000}</style>
</head><body>
<div id="player"><video id="v1" controls playsinline src="${CLIP}" loop
  style="border: 2px solid red"></video></div>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      await page.locator('#v1').click();
      await page.keyboard.press('f');
      await expect.poll(() => fullscreenTarget(page)).toBe('v1');

      // 站点在全屏期间写它自己的样式。
      await page.evaluate(() => {
        const video = document.getElementById('v1');
        video.style.setProperty('filter', 'brightness(0.8)');
        video.style.setProperty('border-radius', '8px');
        video.style.setProperty('width', '640px');
        video.style.setProperty('left', '12px');
      });
      await page.waitForTimeout(200);

      // 从控制条退出（正常退出路径）。
      await exitViaControlBar(page);

      const styles = await page.evaluate(() => {
        const video = document.getElementById('v1');
        return {
          filter: video.style.getPropertyValue('filter'),
          radius: video.style.getPropertyValue('border-radius'),
          width: video.style.getPropertyValue('width'),
          left: video.style.getPropertyValue('left'),
          border: video.style.getPropertyValue('border'),
          position: video.style.getPropertyValue('position'),
        };
      });

      expect(styles.filter, '站点自己写的滤镜不能被抹掉').toBe('brightness(0.8)');
      expect(styles.radius, '站点自己写的圆角不能被抹掉').toBe('8px');
      expect(styles.width, '站点自己写的宽度不能被抹掉').toBe('640px');
      expect(styles.left, '站点自己写的偏移不能被抹掉').toBe('12px');
      expect(styles.border, '进全屏前就有的样式必须原样留下').toBe('2px solid red');
      expect(styles.position, '我们写的全屏定位必须撤掉').not.toBe('fixed');
    } finally {
      await ext.close();
    }
  });

  test('缺陷 4a：站点在进全屏后**立刻**把视频拿回自己的容器，页面必须解锁', async () => {
    // 站点重渲染（切清晰度 / 换播放列表 / 插广告）把 <video> 插回它的新容器。
    // 此时视频仍然 connected —— 老的判据（只在「视频掉出文档」时才动手）
    // 完全看不到这件事，于是扩展卡在半脱离状态：
    //   - 视频不在 stage 里，却仍被钉成视口大小（1280×900 的 fixed 元素
    //     浮在站点 320×180 的容器里）；
    //   - 不透明背板盖着整页；
    //   - body 滚动锁死。
    // 页面在用户按 Esc 之前完全不可用，而且没有任何提示。
    //
    // 这一条覆盖的是**进全屏后 180ms 之内**被拿回去的情形：
    // 那条路以前把会话降级成 css-cover（而不是结束它），于是永远等不到收摊。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#fff}
#player{width:800px;height:450px}
video{display:block;width:100%;height:100%;background:#000}
#tail{height:4000px}</style>
</head><body>
<div id="player"><video id="v1" controls playsinline src="${CLIP}" loop></video></div>
<div id="tail"></div>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      // 先把「站点随时会重渲染」这件事挂上：视频一进 stage 就被搬走。
      await siteTakesVideoBack(page, { immediate: true });

      await page.locator('#v1').click();
      await page.keyboard.press('f');

      // 前置条件：全屏真的发生过（站点是在 stage 里把视频搬走的）。
      await expect.poll(() => page.evaluate(() => window.__moved === true)).toBe(true);

      // 会话必须收摊：健康检查（每 500ms）与 180ms 探测都该看到「站点把视频拿回去了」。
      await expect
        .poll(
          () => page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
          { timeout: 8_000 },
        )
        .toBe(false);

      await expectPageUnlocked(page);
    } finally {
      await ext.close();
    }
  });

  test('缺陷 4b：站点在进全屏**之后**把视频拿回自己的容器，页面必须解锁', async () => {
    // 同上，但站点是在会话稳定之后才重渲染的 —— 走的是健康检查那条路。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#fff}
#player{width:800px;height:450px}
video{display:block;width:100%;height:100%;background:#000}
#tail{height:4000px}</style>
</head><body>
<div id="player"><video id="v1" controls playsinline src="${CLIP}" loop></video></div>
<div id="tail"></div>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      await page.locator('#v1').click();
      await page.keyboard.press('f');
      await expect.poll(() => fullscreenTarget(page)).toBe('v1');

      const locked = await page.evaluate(() => ({
        overflow: document.body.style.overflow,
        overlay: Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
      }));
      expect(locked.overlay, '前置条件：全屏浮层在').toBe(true);
      expect(locked.overflow, '前置条件：body 的滚动锁在').toBe('hidden');

      // ⚠️ 必须**跨过进全屏后那 180ms 的探测窗口**，这一条才是在测健康检查。
      // 少了这一等，两次往返之间只有几十毫秒，搬运动作会落在探测窗口里 ——
      // 那 4a 与 4b 测的就是同一条码，变异验证时也分不出是谁在守。
      await page.waitForTimeout(400);
      expect(
        await fullscreenTarget(page),
        '前置条件：180ms 探测之后会话仍然是全屏（视频还在我们的 stage 里）',
      ).toBe('v1');

      // 站点重渲染：把视频插回一个新的、很小的容器。
      await siteTakesVideoBack(page);

      // 健康检查每 500ms 跑一次 —— 等它收摊。
      await expect
        .poll(
          () => page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
          { timeout: 8_000 },
        )
        .toBe(false);

      await expectPageUnlocked(page);
    } finally {
      await ext.close();
    }
  });
});
