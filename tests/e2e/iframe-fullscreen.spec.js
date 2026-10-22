import { test, expect } from '@playwright/test';
import { readPixel } from './helpers/png.js';
import { launchExtension } from './helpers/launch.js';

/**
 * 「iframe 里的网页全屏」回归守卫。
 *
 * ## 要守住的承诺
 *
 * 用户在**嵌在页面里的播放器**里点了「网页全屏」，画面必须铺满**整个页面**，
 * 而不是只铺满那个播放器自己那块小框。
 *
 * 修法是：父文档把「装着这个视频的那个 <iframe> 元素」撑满自己的视口 ——
 * iframe 内部的覆盖层是 fixed + inset: 0（相对 iframe 自己的视口），
 * 视频是 100vw/100vh（vw/vh 也相对 iframe 自己的视口），于是 iframe 元素
 * 一旦铺满顶层视口，里头的画面自然就铺满整个页面。
 *
 * ## 这套用例守的是什么
 *
 * - 撑大的是**发出请求的那一个** iframe（认领靠 event.source 与 contentWindow
 *   的同一性，不是靠消息里自报家门）；
 * - 撑大之后画面真的**铺满顶层视口**（量浏览器的实际布局 + 像素，不看类名）；
 * - 退出全屏 / 页面被卸载时 iframe 元素的**原始内联样式原样回来**
 *   （撑大与还原必须成对，否则用户页面被永久改成「一个巨大的 iframe」）；
 * - 跨源 iframe 同样成立（contentWindow 跨源可读，.document 不可读）；
 * - 顶层文档自己进全屏时，页面里的 iframe **一个都不许动**。
 */

const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
};

/**
 * 顶层文档：两个 iframe（同源 + 跨源）、一个顶层视频、一段留白。
 *
 * ⚠️ iframe 的内联样式是**故意**写死的：退出全屏之后必须一字不差地回来，
 * 而「站点自己的内联样式被抹掉」这种回归，用样式表写就测不出来
 * （见 TESTING.md「两种写法同时存在会互相掩盖 bug」）。
 */
const OUTER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
#spacer{height:300px;background:#eee}
#top-video{display:block;width:480px;height:270px;background:#111}
iframe{display:block;width:320px;height:220px;border:0;margin-left:50px}
</style></head><body>
<div id="spacer">spacer</div>
<video id="top-video" muted playsinline></video>
<p id="grab">grab</p>
<iframe id="f1" src="/inner.html" style="border: 2px solid #333"></iframe>
<iframe id="f2" src="http://localhost:4173/inner.html"></iframe>
<iframe id="f3" src="/inner.html"></iframe>
</body></html>`;

const INNER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
video{display:block;width:320px;height:180px;background:#000}
#grab{margin:8px}
</style></head><body><video id="inner" muted playsinline></video><p id="grab">grab</p></body></html>`;

const routePages = (page) => page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('chrome-extension://')) return route.continue();
  return route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: url.includes('inner.html') ? INNER : OUTER,
  });
});

const openPage = async (ext) => {
  const page = await ext.context.newPage();
  const errors = watchErrors(page);
  await routePages(page);
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForTimeout(800);
  return { page, errors };
};

/** 把焦点送进 iframe 内部（点一个非输入元素 —— 输入框里的键扩展是不抢的）。 */
const focusInsideFrame = async (page, selector) => {
  const frame = page.frameLocator(selector);
  await frame.locator('#grab').click();
  await page.waitForTimeout(200);
};

/** 顶层文档里量一次「各层视口与矩形」。 */
const measureTop = (page) => page.evaluate(() => {
  const read = (id) => {
    const frame = document.getElementById(id);
    if (!frame) {
      // 元素已经被页面摘掉了：没有布局盒，但样式属性还在（可以断言它被还原了）。
      return { missing: true, w: 0, h: 0, top: 0, left: 0, style: null };
    }
    const rect = frame.getBoundingClientRect();
    return {
      missing: false,
      w: rect.width,
      h: rect.height,
      top: rect.top,
      left: rect.left,
      style: frame.getAttribute('style'),
    };
  };
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    bodyOverflow: document.body.style.overflow,
    f1: read('f1'),
    f2: read('f2'),
    f3: read('f3'),
  };
});

/** iframe 内部量一次（坐标是 iframe 自己的视口坐标系）。 */
const measureInner = (page, selector) => page.evaluate((sel) => {
  const frame = document.querySelector(sel);
  const doc = frame.contentDocument;
  const overlay = doc.getElementById('vsc-page-fullscreen-overlay');
  const video = doc.getElementById('inner');
  const rect = overlay ? overlay.getBoundingClientRect() : null;
  return {
    innerViewport: { w: doc.defaultView.innerWidth, h: doc.defaultView.innerHeight },
    overlay: rect ? { w: rect.width, h: rect.height } : null,
    videoInOverlay: !!overlay && !!video && overlay.contains(video),
  };
}, selector);

test.describe('iframe 里的网页全屏：画面要铺满整个页面', () => {
  test('进全屏后，装着视频的那个 iframe 元素被撑满顶层视口', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      const before = await measureTop(page);
      expect(before.f1.w, '前置条件：iframe 起初只有播放器那么大').toBeLessThan(before.viewport.w);
      expect(before.f1.h).toBeLessThan(before.viewport.h);

      await focusInsideFrame(page, '#f1');
      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const after = await measureTop(page);

      // 撑大的是那个 iframe 元素本身 —— 不是「视频变大了」。
      expect(after.f1.w, 'iframe 元素必须铺满顶层视口宽度').toBe(after.viewport.w);
      expect(after.f1.h, 'iframe 元素必须铺满顶层视口高度').toBe(after.viewport.h);
      expect(after.f1.top).toBe(0);
      expect(after.f1.left).toBe(0);

      // 样式必须带 !important：站点一条全局 CSS 就能压住普通的内联样式。
      expect(after.f1.style).toContain('position: fixed');
      expect(after.f1.style).toContain('!important');
      expect(after.f1.style).toContain('width: 100vw');
      expect(after.f1.style).toContain('height: 100vh');

      // 只认领发出请求的那一个 iframe —— 另一个必须原样不动。
      expect(after.f2.w, '别的 iframe 不该被牵连').toBe(before.f2.w);
      expect(after.f2.h).toBe(before.f2.h);
      expect(after.f2.style).toBeNull();

      // 撑大期间顶层不该出现滚动条（否则画面会宽出一个滚动条）。
      expect(after.bodyOverflow).toBe('hidden');

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('iframe 内部的覆盖层与画面真的铺满顶层视口', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      await focusInsideFrame(page, '#f1');
      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const inner = await measureInner(page, '#f1');
      const top = await measureTop(page);

      // iframe 自己的视口已经等于顶层视口。
      expect(inner.innerViewport.w).toBe(top.viewport.w);
      expect(inner.innerViewport.h).toBe(top.viewport.h);
      // 覆盖层（position: fixed; inset: 0）铺满 iframe 自己的视口。
      expect(inner.overlay?.w).toBe(top.viewport.w);
      expect(inner.overlay?.h).toBe(top.viewport.h);
      // 视频确实被搬进了覆盖层 —— 也就是说 iframe 里的网页全屏真的生效了。
      expect(inner.videoInOverlay, '视频必须被搬进 iframe 自己的覆盖层').toBe(true);

      // 用 Playwright 的坐标（相对**顶层**视口）再量一遍：
      // 这一条不依赖「iframe 内部坐标系」的任何换算。
      const box = await page.frameLocator('#f1').locator('#vsc-page-fullscreen-overlay').boundingBox();
      expect(box, 'iframe 里的覆盖层必须有布局盒').not.toBeNull();
      expect(Math.round(box.width)).toBe(top.viewport.w);
      expect(Math.round(box.height)).toBe(top.viewport.h);
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.y)).toBe(0);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('像素级：顶层视口左上角从页面背景变成全屏黑', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      // ⚠️ 取样点必须躲开两样东西：
      // - 留白里的文字「spacer」（实测它就在左上角，(10,10) 正好压在字母 p 上）；
      // - 鼠标指针（headless 截图会画出来，默认停在 (0,0)）。
      // 所以取 (400,150) 这个「空白留白处」，并先把鼠标挪到右下角。
      await page.mouse.move(1100, 650);

      // 量浏览器**真的画成了什么样**，而不是 DOM 上有没有某个类。
      const before = readPixel(await page.screenshot(), 400, 150);
      expect(before, '前置条件：取样点起初是页面留白的浅灰').not.toBeNull();
      expect(before[0]).toBeGreaterThan(200);

      await focusInsideFrame(page, '#f1');
      await page.keyboard.press('f');
      await page.waitForTimeout(700);
      await page.mouse.move(1100, 650);

      const after = readPixel(await page.screenshot(), 400, 150);
      expect(after, '取样点应当被全屏画面盖住').not.toBeNull();
      expect(after[0]).toBeLessThan(20);
      expect(after[1]).toBeLessThan(20);
      expect(after[2]).toBeLessThan(20);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('退出全屏：iframe 元素恢复原来的内联样式，一个字都不差', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      const original = await page.evaluate(() => document.getElementById('f1').getAttribute('style'));
      expect(original, '前置条件：夹具给 iframe 写了内联样式').toBe('border: 2px solid #333');

      const before = await measureTop(page);

      await focusInsideFrame(page, '#f1');
      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const expanded = await page.evaluate(() => document.getElementById('f1').getAttribute('style'));
      expect(expanded).not.toBe(original);

      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const after = await measureTop(page);
      // ⚠️ 撑大与还原必须成对：还原的不是「我们写的那份」，
      // 而是**站点自己原来那一份**。
      expect(after.f1.style, '退出后必须原样恢复站点自己的内联样式').toBe(original);
      expect(after.f1.w, '退出后 iframe 元素回到原来的尺寸').toBe(before.f1.w);
      expect(after.f1.h, '退出后 iframe 元素回到原来的尺寸').toBe(before.f1.h);
      expect(after.bodyOverflow, '顶层页面的滚动锁必须解除').toBe('');

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('iframe 被页面摘掉时，父文档的撑大必须被撤销', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      await focusInsideFrame(page, '#f1');
      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const expanded = await measureTop(page);
      expect(expanded.f1.w, '前置条件：iframe 已被撑大').toBe(expanded.viewport.w);

      // 站点把整个 iframe 从 DOM 里摘掉（换播放器、销毁广告位……）。
      // 子文档会收到 pagehide —— 它必须趁机请父文档还原，
      // 否则那个 iframe 元素会永远停在「满屏」状态。
      await page.evaluate(() => {
        const frame = document.getElementById('f1');
        window.__detached = frame;
        frame.remove();
      });
      await page.waitForTimeout(800);

      const after = await page.evaluate(() => {
        const frame = window.__detached;
        return {
          missing: !document.getElementById('f1'),
          // 元素被摘掉了，但它身上的内联样式必须已经被还原 ——
          // 站点随时可能把它插回去，它不该带着「满屏」样式回来。
          style: frame.getAttribute('style'),
          bodyOverflow: document.body.style.overflow,
          f2Style: document.getElementById('f2').getAttribute('style'),
          f3Style: document.getElementById('f3').getAttribute('style'),
        };
      });

      expect(after.missing, '前置条件：f1 已被页面摘掉').toBe(true);
      expect(after.style, 'iframe 被摘掉后，撑大的样式必须被撤销').toBe('border: 2px solid #333');
      expect(after.bodyOverflow, '顶层页面的滚动锁必须解除').toBe('');
      expect(after.f2Style, '别的 iframe 不该被牵连').toBeNull();
      expect(after.f3Style, '别的 iframe 不该被牵连').toBeNull();

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('跨源 iframe 同样能被撑大（contentWindow 跨源可读）', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      // 前置条件：f2 真的跨源（顶层读不到它的 document，但读得到 contentWindow）。
      const crossOrigin = await page.evaluate(() => {
        const frame = document.getElementById('f2');
        return {
          contentDocumentIsNull: frame.contentDocument === null,
          hasContentWindow: !!frame.contentWindow,
        };
      });
      expect(crossOrigin.contentDocumentIsNull, '前置条件：f2 必须真的跨源').toBe(true);
      expect(crossOrigin.hasContentWindow).toBe(true);

      const before = await measureTop(page);

      await focusInsideFrame(page, '#f2');
      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const after = await measureTop(page);
      expect(after.f2.w, '跨源 iframe 元素也必须被撑满顶层视口').toBe(after.viewport.w);
      expect(after.f2.h).toBe(after.viewport.h);
      expect(after.f2.style).toContain('!important');

      // 同源的 f1 这次不该被牵连（它没发过请求）。
      expect(after.f1.w).toBe(before.f1.w);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('顶层文档自己进全屏时，页面里的 iframe 一个都不许动', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      const before = await measureTop(page);

      // 焦点在顶层文档 → 顶层自己的视频进全屏（老路径）。
      await page.locator('#grab').click();
      await page.waitForTimeout(200);
      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const after = await measureTop(page);

      // 顶层自己的网页全屏照旧工作。
      const topOverlay = await page.evaluate(() => {
        const overlay = document.getElementById('vsc-page-fullscreen-overlay');
        if (!overlay) return null;
        const rect = overlay.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      });
      expect(topOverlay, '顶层自己进全屏必须照旧工作').not.toBeNull();
      expect(topOverlay.w).toBe(after.viewport.w);

      // ⚠️ 页面里的 iframe 一个都不许被撑大 —— 顶层的老路径不能被新机制波及。
      expect(after.f1.style, '顶层进全屏不该动 f1 的内联样式').toBe(before.f1.style);
      expect(after.f2.style, '顶层进全屏不该动 f2 的内联样式').toBe(before.f2.style);
      expect(after.f3.style, '顶层进全屏不该动 f3 的内联样式').toBe(before.f3.style);
      expect(after.f1.w).toBe(before.f1.w);
      expect(after.f2.w).toBe(before.f2.w);
      expect(after.f3.w).toBe(before.f3.w);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('只撑大发出请求的那一个 iframe', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      const before = await measureTop(page);

      // 故意选**第三个** iframe：若父文档认帧时不比对 event.source
      // （一律认第一个），撑大的就会是 f1 而不是 f3 —— 那条断言立刻变红。
      await focusInsideFrame(page, '#f3');
      await page.keyboard.press('f');
      await page.waitForTimeout(700);

      const after = await measureTop(page);

      expect(after.f3.w, '发出请求的 iframe 必须被撑大').toBe(after.viewport.w);
      expect(after.f3.h).toBe(after.viewport.h);
      expect(after.f1.w, '别的 iframe 不该被牵连').toBe(before.f1.w);
      expect(after.f2.w, '别的 iframe 不该被牵连').toBe(before.f2.w);
      expect(after.f1.style).toBe(before.f1.style);
      expect(after.f2.style).toBe(before.f2.style);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('页面伪造的撑大请求（顶层窗口自己发消息）被忽略', async () => {
    const ext = await launchExtension();
    try {
      const { page, errors } = await openPage(ext);

      const before = await measureTop(page);

      // 页面自己 postMessage 一条「请把我撑大」的消息。
      // 父文档必须靠 event.source 与 contentWindow 的同一性挡住它：
      // 顶层窗口的 source 不是任何一个 iframe 的 contentWindow。
      await page.evaluate(() => {
        window.postMessage({ type: 'vsc-expand-frame' }, '*');
      });
      await page.waitForTimeout(400);

      const after = await measureTop(page);
      expect(after.f1.style, '伪造的请求不该动任何 iframe').toBe(before.f1.style);
      expect(after.f2.style, '伪造的请求不该动任何 iframe').toBe(before.f2.style);
      expect(after.f3.style, '伪造的请求不该动任何 iframe').toBe(before.f3.style);
      expect(after.f1.w).toBe(before.f1.w);
      expect(after.f3.w).toBe(before.f3.w);

      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });
});
