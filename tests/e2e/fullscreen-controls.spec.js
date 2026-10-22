import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { readPixel } from './helpers/png.js';
import { launchExtension } from './helpers/launch.js';

/**
 * 全屏控制条的回归守卫。
 *
 * 这套用例守的是「控制条自己」的一组问题 —— 它们全都只能在**真实浏览器**里测：
 * jsdom 没有布局引擎（getBoundingClientRect 恒为 0、Range.getClientRects()
 * 恒为空），而这里要验的恰恰是布局：按钮有没有出屏、字幕有没有被压住、
 * 像素对比度够不够。
 *
 * 每条用例都对着一个**具体症状**写，症状都能在改动前复现。
 *
 * ⚠️ 关于「伪造视频状态」：内容脚本跑在**隔离世界**，页面主世界对
 * video.duration / videoWidth / paused 的改写它**一概看不见**
 * （见 real-extension.spec.js 里同样的说明）。所以：
 *   - 需要真实时长的用例 → 用真实的 webm 夹具（clip-10s，10 秒 / 480×270）
 *   - 不需要媒体的用例   → 干脆不给 src（画面是纯色，像素可预期）
 * 页面里 `Object.defineProperty(video, 'duration', …)` 那种写法在这里一律无效。
 */

/* ------------------------------------------------------------------ *
 * 浏览器与扩展
 * ------------------------------------------------------------------ */

/** WCAG 相对亮度。 */
const relativeLuminance = ([r, g, b]) => {
  const channel = (value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG 对比度。 */
const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/* ------------------------------------------------------------------ *
 * 页面与工具
 * ------------------------------------------------------------------ */

/** 真实的 10 秒视频（480×270 / VP8 webm）。 */
const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 测试页面。
 *
 * src     给视频一个**真实**媒体源（隔离世界看不见页面里的 mock）。
 * caption 字幕容器的内容 —— 双语字幕的真实结构就靠它复现。
 */
const pageHtml = ({ src = '', caption = '', captionCss = '', autoplay = false, extraCss = '', extraBody = '' } = {}) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc controls</title>
<style>
  html,body{margin:0;height:100%;background:#000}
  #player{position:relative;width:100vw;height:100vh}
  video{width:100%;height:100%;background:#000}
  #cap{
    position:absolute;left:0;right:0;bottom:0;text-align:center;
    background:rgba(0,0,0,.55);color:#fff;font:20px/1.4 sans-serif;
    ${captionCss}
  }
  #cap span{display:block}
  ${extraCss}
</style>
</head><body>
<div id="player">
  <video id="v1" muted playsinline preload="auto"${src ? ` src="${src}"` : ''}${autoplay ? ' autoplay' : ''}></video>
  ${caption ? `<div id="cap">${caption}</div>` : ''}
</div>
${extraBody}
</body></html>`;

/**
 * 接管页面的路由。
 *
 * 返回一个 setter：同一个 page 可以反复换页面内容（换 URL 重新 goto 即可），
 * 不用反复注册路由（Playwright 的路由是**后注册先执行**的，叠多了会乱）。
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

/** 进全屏并等控制条浮出来。 */
const enterFullscreen = async (page) => {
  await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
  await page.locator('#v1').click();
  await page.keyboard.press('f');
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
    )
    .toBe(true);
  // 控制条淡入 180ms，等它稳下来。
  await page.waitForTimeout(400);
};

/**
 * 把焦点从控制条里放掉。
 *
 * 用键盘 f 进全屏时，运行时会主动把焦点送进控制条（focusFirst），
 * 控制条于是**永远不会自动隐藏**（那是对键盘用户的保护）。
 * 下面几条用例测的是「鼠标用户」的行为，所以先把焦点放掉。
 */
const blurControlBar = (page) =>
  page.evaluate(() => {
    const shadow = document.getElementById('vsc-controls')?.shadowRoot;
    const active = shadow?.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });

/**
 * 把视频按回 0 秒并暂停。
 *
 * 进全屏时那一下点击会把视频点起来，播放位置自己往前跑；
 * 量「步长」之前必须先把它归零，否则量到的不是步长。
 */
const resetVideo = (page) =>
  page.evaluate(() => {
    const v = document.getElementById('v1');
    v.pause();
    v.currentTime = 0;
    v.dispatchEvent(new Event('timeupdate'));
  });

/** 控制条的矩形（它在 shadow root 里，坐标是视口坐标）。 */
const barRect = (page) =>
  page.evaluate(() => {
    const root = document.getElementById('vsc-controls')?.shadowRoot?.querySelector('.bar');
    if (!root) return null;
    const r = root.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right };
  });

/** 控制条里的某个控件的矩形。 */
const controlRect = (page, role) =>
  page.evaluate((controlRole) => {
    const el = document.getElementById('vsc-controls')?.shadowRoot?.querySelector(`[data-role="${controlRole}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  }, role);

/** 控制条当前是不是「可见」状态（class 是唯一的真相）。 */
const barVisible = (page) =>
  page.evaluate(() =>
    Boolean(document.getElementById('vsc-controls')?.shadowRoot?.querySelector('.bar')?.classList.contains('bar--visible')),
  );

/* ------------------------------------------------------------------ *
 * 用例
 * ------------------------------------------------------------------ */

test.describe('全屏控制条', () => {
  test('点过播放/静音按钮后，光标不动时控制条照样自动隐藏', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      // 真实视频 + 自动播放：点播放按钮时状态真的会变，图标才会换。
      setBody(pageHtml({ src: CLIP, autoplay: true }));
      await page.goto('https://vsc-controls-hide.example/');
      await enterFullscreen(page);

      expect(await barVisible(page)).toBe(true);

      // 光标停在控制条上（真实用户点按钮前就是这样）。
      await page.mouse.move(300, 690);

      await page.locator('[data-role="play"]').click();

      // 换图标不能重写按钮的 DOM：两个图标必须一直都在，靠 class 切换显示哪一个。
      // （用 innerHTML 换会让 Chromium 在光标下重派发 mouseenter。）
      const iconCount = await page.evaluate(() => {
        const button = document
          .getElementById('vsc-controls')
          ?.shadowRoot?.querySelector('[data-role="play"]');
        return button?.querySelectorAll('svg').length ?? 0;
      });
      expect(iconCount, '播放按钮必须同时保留播放与暂停两个图标（换图标不重写 DOM）').toBe(2);

      // ⚠️ Chromium 在「光标下的元素被替换」时会重新派发 mouseover/mouseenter ——
      // 这正是「点一次播放按钮，控制条从此再也不自动隐藏」的机制。
      // 这里手动补一次，让守卫同时覆盖「隐藏计时器被 mouseenter 吃掉」那一半。
      await page.evaluate(() => {
        const bar = document.getElementById('vsc-controls')?.shadowRoot?.querySelector('.bar');
        bar?.dispatchEvent(new MouseEvent('mouseenter'));
      });

      // 光标**不动**地等 3.5 秒 —— 计时器必须自己走完。
      await page.waitForTimeout(3500);
      expect(
        await barVisible(page),
        '点过播放按钮后控制条必须仍然自动隐藏（图标替换不能把隐藏计时器吃掉）',
      ).toBe(false);
    } finally {
      await ext.close();
    }
  });

  test('双语字幕的三种真实结构都要被认成字幕并搬进全屏', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);

      const structures = [
        { name: '每行一个 span', caption: '<span>第一行</span><span>第二行</span>' },
        { name: 'span 内含 br', caption: '<span>第一行<br>第二行</span>' },
        { name: '单行带强调 span', caption: '普通文字<em style="font-style:normal">强调</em>' },
      ];

      for (const [index, structure] of structures.entries()) {
        setBody(pageHtml({ caption: structure.caption }));
        await page.goto(`https://vsc-caption-${index}.example/`);
        await enterFullscreen(page);

        const moved = await page.evaluate(() => {
          const host = document
            .getElementById('vsc-page-fullscreen-stage')
            ?.querySelector('[data-vsc-caption-host]');
          return Boolean(host?.contains(document.getElementById('cap')));
        });

        expect(moved, `「${structure.name}」这种字幕结构必须被认成字幕并搬进全屏`).toBe(true);
      }
    } finally {
      await ext.close();
    }
  });

  test('贴在画面最底边的字幕被抬到控制条上方，控制条藏了又落回去', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      // bottom: 0 的两行字幕：它一直顶着画面最底边。
      setBody(pageHtml({ caption: '<span>第一行</span><span>第二行</span>' }));
      await page.goto('https://vsc-caption-clearance.example/');
      await enterFullscreen(page);

      const geometry = await page.evaluate(() => {
        const caption = document.getElementById('cap');
        const bar = document.getElementById('vsc-controls')?.shadowRoot?.querySelector('.bar');
        const c = caption.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        return { captionBottom: c.bottom, captionTop: c.top, barTop: b.top };
      });

      expect(
        geometry.captionBottom,
        `字幕底边 ${Math.round(geometry.captionBottom)} 必须落在控制条顶边 ${Math.round(geometry.barTop)} 之上`,
      ).toBeLessThanOrEqual(geometry.barTop + 1);

      // 控制条藏了之后，字幕回到它原本的位置（贴着画面底边）。
      await blurControlBar(page);
      await page.waitForTimeout(4000);
      const restored = await page.evaluate(() => {
        const caption = document.getElementById('cap');
        const c = caption.getBoundingClientRect();
        return { captionBottom: c.bottom, viewport: window.innerHeight };
      });
      expect(
        Math.abs(restored.captionBottom - restored.viewport),
        '控制条隐藏后字幕必须回到原本的位置',
      ).toBeLessThanOrEqual(2);
    } finally {
      await ext.close();
    }
  });

  test('窄屏下倍速与退出按钮都在屏幕内，鼠标能退出全屏', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const setBody = serveBody(page);

      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        setBody(pageHtml());
        await page.goto(`https://vsc-narrow-${width}.example/`);
        await enterFullscreen(page);

        for (const role of ['play', 'mute', 'speed', 'exit']) {
          const rect = await controlRect(page, role);
          expect(rect, `${role} 控件必须存在`).not.toBeNull();
          expect(
            rect.left,
            `窗口宽 ${width}px 时「${role}」按钮的左边缘 (${Math.round(rect.left)}) 必须在屏幕内`,
          ).toBeGreaterThanOrEqual(-0.5);
          expect(
            rect.right,
            `窗口宽 ${width}px 时「${role}」按钮的右边缘 (${Math.round(rect.right)}) 必须在屏幕内`,
          ).toBeLessThanOrEqual(width + 0.5);
        }

        // 真的点得到：点最右边的退出按钮应当退出全屏。
        const exit = await controlRect(page, 'exit');
        await page.mouse.click(exit.left + exit.width / 2, exit.top + exit.height / 2);
        await expect
          .poll(() =>
            page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
          )
          .toBe(false);
      }
    } finally {
      await ext.close();
    }
  });

  /**
   * **宽度扫描**：任何视口宽度下，退出按钮都必须在屏幕内。
   *
   * ⚠️ 这条用例存在的理由是历史：
   * 断点原先是**估**出来的（500 / 380），而实测需求是 553 / 401 / 321 ——
   * 于是 501–546px 与 381–400px 这两段宽度里，退出按钮被推出屏幕，
   * 手机上（390px）鼠标点不到，用户被关在全屏里，只能靠 Esc。
   *
   * 之前那条用例只量了 390 与 320 两个点 —— 390 恰好落在出屏区里，
   * 于是它红了；但它**不知道为什么**红，红完之后也只是把断点数字挪一下，
   * 没有任何机制阻止下次再挪错。
   *
   * 所以这里扫**一整条宽度轴**，而且用**最坏情况**的时长字符串
   * （"1:00:00 / 2:00:00"）—— 短时长会窄 13.5px，
   * 用短时长量出来的「装得下」是假的（长视频一播出来就出屏，
   * 而那正是最常见的场景）。
   *
   * 断点契约（src/content/controlBarLayout.ts）是这里与 CSS 的共同真源。
   */
  test('任何视口宽度下退出按钮都在屏幕内（宽度扫描）', async () => {
    test.setTimeout(180_000);
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const setBody = serveBody(page);

      const { CONTROL_BAR_BREAKPOINTS, CONTROL_BAR_REQUIRED_WIDTHS } = await import(
        '../../src/content/controlBarLayout.ts'
      );

      // 扫的宽度 = 各断点与各实测需求的**两侧**，加上常见设备宽度。
      const widths = [
        CONTROL_BAR_REQUIRED_WIDTHS.narrowest,
        CONTROL_BAR_BREAKPOINTS.narrowest - 1,
        CONTROL_BAR_BREAKPOINTS.narrowest,
        CONTROL_BAR_BREAKPOINTS.narrowest + 1,
        160, 240, 241,
        CONTROL_BAR_REQUIRED_WIDTHS.minimal - 1,
        CONTROL_BAR_REQUIRED_WIDTHS.minimal,
        CONTROL_BAR_BREAKPOINTS.minimal - 1,
        CONTROL_BAR_BREAKPOINTS.minimal,
        320, 331,
        CONTROL_BAR_REQUIRED_WIDTHS.medium - 1,
        CONTROL_BAR_REQUIRED_WIDTHS.medium,
        380, 400,
        CONTROL_BAR_BREAKPOINTS.compact - 1,
        CONTROL_BAR_BREAKPOINTS.compact,
        CONTROL_BAR_BREAKPOINTS.compact + 1,
        500, 546,
        CONTROL_BAR_REQUIRED_WIDTHS.full - 1,
        CONTROL_BAR_REQUIRED_WIDTHS.full,
        CONTROL_BAR_BREAKPOINTS.medium,
        CONTROL_BAR_BREAKPOINTS.medium + 1,
        640, 853, 1280,
      ]
        .filter((width) => width > 0)
        .sort((a, b) => a - b)
        .filter((width, index, all) => all.indexOf(width) === index);

      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        setBody(pageHtml());
        await page.goto(`https://vsc-sweep-${width}.example/`);
        await enterFullscreen(page);

        // 换成最坏情况的时长：长视频。
        //
        // ⚠️ **改文字与读矩形必须在同一个同步任务里**（2026-10-21 复审发现）：
        // 控制条在 `timeupdate` 事件里会重写这两个文本，而 10 秒的测试片段
        // 在测量窗口内会派发 timeupdate，把「1:00:00 / 2:00:00」打回
        // 「0:03 / 0:10」—— 那样量出来的宽度**偏乐观 13.5px**。
        // 方向是「测得比实际宽松」：不会误报失败，但会**漏报** ——
        // 而这条用例的全部价值就在于不漏报。
        // 先暂停视频、再改文字、立刻读矩形：JS 是单线程的，
        // 事件不可能在任务中间插进来。
        const rect = await page.evaluate(() => {
          const shadow = document.getElementById('vsc-controls')?.shadowRoot;
          const now = shadow?.querySelector('[data-role="time-now"]');
          const total = shadow?.querySelector('[data-role="time-total"]');
          const video = document.getElementById('v1');
          if (video) video.pause();
          if (now) now.textContent = '1:00:00';
          if (total) total.textContent = '2:00:00';

          const el = shadow?.querySelector('[data-role="exit"]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
        });

        expect(rect, `窗口宽 ${width}px 时退出按钮必须存在`).not.toBeNull();
        expect(
          rect.right,
          `窗口宽 ${width}px 时退出按钮的右边缘 (${Math.round(rect.right)}) 必须在屏幕内 —— ` +
            '它出屏 = 用户被关在全屏里，只能靠 Esc（而「按 Esc 能退」从没在界面上告诉过他）',
        ).toBeLessThanOrEqual(width + 0.5);
        expect(
          rect.left,
          `窗口宽 ${width}px 时退出按钮的左边缘 (${Math.round(rect.left)}) 必须在屏幕内`,
        ).toBeGreaterThanOrEqual(-0.5);
      }
    } finally {
      await ext.close();
    }
  });

  test('键盘调滑块时焦点不丢（长按方向键才有效）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('https://vsc-slider-focus.example/');
      await enterFullscreen(page);

      const volume = page.locator('[data-role="volume"]');
      await volume.focus();

      const focusedBefore = await page.evaluate(() => {
        const shadow = document.getElementById('vsc-controls')?.shadowRoot;
        return shadow?.activeElement?.getAttribute('data-role') ?? null;
      });
      expect(focusedBefore, '焦点必须落在音量滑块上').toBe('volume');

      // 音量从 0.5 起：按 5 次方向键 = 5 个步长（5%）。
      await page.evaluate(() => {
        document.getElementById('v1').volume = 0.5;
      });
      await page.waitForTimeout(200);

      const before = await volume.evaluate((node) => Number(node.value));
      expect(before).toBeCloseTo(0.5, 2);

      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('ArrowDown');
      }

      const after = await volume.evaluate((node) => Number(node.value));
      expect(
        after,
        '键盘调滑块后按键必须继续生效（焦点一丢，按键重复就断了，长按方向键只动一下）',
      ).toBeLessThan(before - 0.1);

      const focusedAfter = await page.evaluate(() => {
        const shadow = document.getElementById('vsc-controls')?.shadowRoot;
        return shadow?.activeElement?.getAttribute('data-role') ?? null;
      });
      expect(
        focusedAfter,
        '键盘调滑块后焦点必须还在滑块上（焦点一丢，按键重复就断了，焦点环也会消失）',
      ).toBe('volume');
    } finally {
      await ext.close();
    }
  });

  test('进度条步长与全局快进一致，PageUp/PageDown 是固定秒数', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      // 真实的 10 秒视频：隔离世界里只有真视频才有真时长。
      setBody(pageHtml({ src: CLIP }));
      await page.goto('https://vsc-slider-step.example/');
      await enterFullscreen(page);
      // 进全屏时那一下点击把视频点起来了，播放位置会自己往前跑 ——
      // 量步长之前先把它按回 0。
      await resetVideo(page);

      const progress = page.locator('[data-role="progress"]');
      await progress.focus();

      const step = await progress.evaluate((node) => node.getAttribute('step'));
      expect(step, '进度条的步长必须与全局快进一致（5 秒）').toBe('5');

      const readValue = () => progress.evaluate((node) => Number(node.value));

      const before = await readValue();
      await page.keyboard.press('ArrowRight');
      const afterArrow = await readValue();
      expect(
        Math.round((afterArrow - before) * 100) / 100,
        '方向键的步长必须与全局快进一致（5 秒），早先是 0.1 秒',
      ).toBe(5);

      // 原生 range 的 PageUp/PageDown 是按**范围的百分比**跳的（10%）。
      // 10 秒的片子按 10% 只跳 1 秒；固定 30 秒的步长则一步到片尾。
      await page.keyboard.press('PageDown');
      const afterPageDown = await readValue();
      expect(
        Math.round(afterPageDown - afterArrow),
        'PageDown 必须按固定秒数跳（30 秒），不是范围的 10%',
      ).toBeLessThanOrEqual(-4);

      const beforePage = await readValue();
      await page.keyboard.press('PageUp');
      const afterPage = await readValue();
      expect(
        afterPage - beforePage,
        'PageUp 必须是固定秒数（30 秒），不是范围的 10%',
      ).toBeGreaterThanOrEqual(9);
    } finally {
      await ext.close();
    }
  });

  test('时间标签与倍速徽标宽度固定，控制条不横向抖动', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('https://vsc-jitter.example/');
      await enterFullscreen(page);

      const measure = () =>
        page.evaluate(() => {
          const shadow = document.getElementById('vsc-controls')?.shadowRoot;
          const rect = (role) =>
            shadow?.querySelector(`[data-role="${role}"]`)?.getBoundingClientRect();
          return {
            timeNow: rect('time-now')?.width ?? null,
            progress: rect('progress')?.width ?? null,
            speed: rect('speed')?.width ?? null,
            muteLeft: rect('mute')?.left ?? null,
          };
        });

      const before = await measure();

      // 把「当前时间」换成最长的那种（"1:00:00"）：宽度必须不变，
      // 否则进度条会被挤得忽宽忽窄，整个控制条跟着横抖。
      await page.evaluate(() => {
        const now = document
          .getElementById('vsc-controls')
          ?.shadowRoot?.querySelector('[data-role="time-now"]');
        if (now) now.textContent = '1:00:00';
      });
      const after = await measure();

      expect(after.timeNow, '「当前时间」的宽度不能随时间文本变化').toBeCloseTo(before.timeNow, 1);
      expect(after.progress, '进度条的宽度不能被时间标签挤得忽宽忽窄').toBeCloseTo(before.progress, 1);

      // 倍速徽标：1x 与 1.25x 的宽度必须一样（早先是 40px 与 50.7px）。
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        v.playbackRate = 1.25;
        v.dispatchEvent(new Event('ratechange'));
      });
      const at125 = await measure();

      expect(at125.speed, '倍速徽标的宽度不能随倍率变化').toBeCloseTo(before.speed, 1);
      expect(at125.muteLeft, '静音按钮的位置不能被倍速徽标挤动').toBeCloseTo(before.muteLeft, 1);
    } finally {
      await ext.close();
    }
  });

  test('明亮画面上未填充的轨道依然看得见', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      // 没有媒体源：画面是纯色，像素可预期。
      setBody(pageHtml());
      await page.goto('https://vsc-track-contrast.example/');
      await enterFullscreen(page);

      // 把视频底色改成纯白：模拟白底视频（录屏、PPT）。
      await page.evaluate(() => {
        document.getElementById('v1').style.setProperty('background', '#ffffff', 'important');
      });
      await page.waitForTimeout(300);

      const shot = await page.screenshot({ type: 'png' });
      const track = await controlRect(page, 'progress');
      const bar = await barRect(page);

      // 轨道的中线（避开两端的滑块）。
      const trackY = Math.round((track.top + track.bottom) / 2);
      // 轨道**紧挨着**的那层遮罩：可见轨道只有 4px 高，居中在 24px 高的
      // 滑块盒子里，所以取盒子底部那一行 —— 那里是轨道背后的遮罩本身。
      const scrimY = Math.round(track.bottom) - 1;
      // 控制条上方的画面（白底视频）。
      const videoY = Math.round(bar.top) - 5;

      const samples = [];
      for (let x = Math.round(track.left) + 40; x < Math.round(track.right) - 40; x += 17) {
        const trackPixel = readPixel(shot, x, trackY);
        const scrimPixel = readPixel(shot, x, scrimY);
        const videoPixel = readPixel(shot, x, videoY);
        if (!trackPixel || !scrimPixel || !videoPixel) continue;
        samples.push({
          vsScrim: contrastRatio(trackPixel, scrimPixel),
          vsVideo: contrastRatio(trackPixel, videoPixel),
        });
      }

      expect(samples.length, '必须能取到轨道的像素').toBeGreaterThan(4);

      const worstScrim = Math.min(...samples.map((s) => s.vsScrim));
      const worstVideo = Math.min(...samples.map((s) => s.vsVideo));

      // WCAG 1.4.11 对 UI 组件的底线是 3:1，这里要 3.5:1 留余量。
      expect(
        worstScrim,
        `轨道与它背后那层遮罩的对比度只有 ${worstScrim.toFixed(2)}:1（实测 ${samples.length} 列）`,
      ).toBeGreaterThanOrEqual(3.5);
      expect(
        worstVideo,
        `轨道与明亮画面的对比度只有 ${worstVideo.toFixed(2)}:1（实测 ${samples.length} 列）`,
      ).toBeGreaterThanOrEqual(3.5);
    } finally {
      await ext.close();
    }
  });

  test('白色画面上控制条的上沿是一条明确的边，不是一片灰雾', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('https://vsc-bar-edge.example/');
      await enterFullscreen(page);

      await page.evaluate(() => {
        document.getElementById('v1').style.setProperty('background', '#ffffff', 'important');
      });
      await page.waitForTimeout(300);

      const shot = await page.screenshot({ type: 'png' });
      const bar = await barRect(page);
      const topY = Math.round(bar.top);

      const barTopPixel = readPixel(shot, Math.round(bar.left) + 200, topY);
      const videoPixel = readPixel(shot, Math.round(bar.left) + 200, topY - 5);

      expect(barTopPixel, '必须能取到控制条上沿的像素').not.toBeNull();
      expect(videoPixel, '必须能取到画面上方的像素').not.toBeNull();

      // 上沿至少要比画面暗 3%（否则就是一条「说不清是渐变还是脏印」的灰带）。
      const drop = videoPixel[0] - barTopPixel[0];
      expect(
        drop,
        `控制条上沿 (${barTopPixel.join(',')}) 与画面 (${videoPixel.join(',')}) 只差 ${drop} —— 上沿必须是明确的边`,
      ).toBeGreaterThanOrEqual(8);
    } finally {
      await ext.close();
    }
  });

  /**
   * 控制条收起之后，退出入口必须**还在**。
   *
   * 症状（审查原文）：控制条 3 秒 idle 后整个消失，屏幕上只剩一个铺满的
   * <video> —— 用户既不知道「这是扩展的全屏」，也不知道怎么退
   * （退出按钮在控制条里，条一藏就没了；「按 Esc 能退」只写在设置页，
   * 从没在进入全屏时告诉过用户）。
   *
   * 形态：控制条收起时塌缩成一枚独立的小退出钮（同一个 shadow root、
   * 与控制条里的退出按钮同一个位置）。
   */
  test('控制条收起后退出钮还在，点它能退出全屏', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('https://vsc-collapsed-exit.example/');
      await enterFullscreen(page);

      /** 收起态退出钮的当前状态（它在 shadow root 里，不在 .bar 子树里）。 */
      const collapsedState = () =>
        page.evaluate(() => {
          const el = document
            .getElementById('vsc-controls')
            ?.shadowRoot?.querySelector('[data-role="exit-collapsed"]');
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            visible: style.visibility !== 'hidden' && style.display !== 'none',
            opacity: Number(style.opacity),
            label: el.getAttribute('aria-label'),
            tabIndex: el.getAttribute('tabindex'),
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height,
          };
        });

      // 控制条在的时候，收起态的退出钮必须藏着（两个退出钮不能同时在）。
      const whileVisible = await collapsedState();
      expect(whileVisible, 'shadow root 里必须有一枚独立退出钮').not.toBeNull();
      expect(whileVisible.visible, '控制条可见时收起态的退出钮必须不可见').toBe(false);

      // 键盘进全屏时焦点被送进控制条（focusFirst）→ 控制条永远不会自动隐藏。
      // 先把焦点放掉，模拟鼠标用户。
      await blurControlBar(page);

      // 退出钮的位置此刻已经定了（它还藏着，但布局已经算好）。
      const box = await collapsedState();
      await page.mouse.move(box.centerX, box.centerY);

      // 这一动会把控制条唤回来（既有行为）。等它淡入稳定，量一下
      // 控制条里退出按钮的位置 —— 收起态的按钮必须落在同一个地方。
      await page.waitForTimeout(400);
      const exitRect = await controlRect(page, 'exit');
      expect(exitRect, '控制条里必须有退出按钮').not.toBeNull();

      // 光标**不动**地等：控制条 3 秒后自动收起，退出钮顶上来。
      await page.waitForTimeout(4000);
      expect(await barVisible(page), '控制条应该已经收起').toBe(false);

      const collapsed = await collapsedState();
      expect(collapsed, '控制条收起后必须还有一枚独立退出钮').not.toBeNull();
      expect(collapsed.visible, '控制条收起后退出钮必须可见（永远在的退出入口）').toBe(true);
      expect(collapsed.label, '退出钮必须有可访问名').toBeTruthy();
      expect(collapsed.width, '退出钮不能比控制条里的退出按钮大').toBeLessThanOrEqual(34);
      expect(
        Math.abs(collapsed.centerX - (exitRect.left + exitRect.width / 2)),
        '收起态的退出钮必须与控制条里的退出按钮在同一个位置（肌肉记忆接得上）',
      ).toBeLessThanOrEqual(8);
      expect(
        Math.abs(collapsed.centerY - (exitRect.top + exitRect.height / 2)),
        '收起态的退出钮必须与控制条里的退出按钮在同一个位置（肌肉记忆接得上）',
      ).toBeLessThanOrEqual(8);

      // 点它 → 退出全屏。
      //
      // ⚠️ 不能用 page.mouse.click()：它会先 move 一次，那一动就把控制条
      // 唤回来了（既有行为），点到的将是控制条里的退出按钮 —— 测的就不是
      // 收起态的退出钮了。这里只 down/up，鼠标不动：
      // 真实用户「手停在原地直接点」走的就是这条路径。
      await page.mouse.down();
      await page.mouse.up();

      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(false);
    } finally {
      await ext.close();
    }
  });

  /**
   * **窄屏档**（≤430px）里，收起态的退出钮也必须与控制条退出按钮在同一个角。
   *
   * ⚠️ 这一档之前**完全没有测试**（2026-10-21 复审发现）：
   * 上一条用例在 1280px 量，而 1280px 走的是**宽屏内边距**（18/12）。
   * 窄屏档换的是另一套内边距（10/8），而那一套只被 e2e 间接碰到过 ——
   * 变异验证（M10）把窄屏内边距的 right 从 10 改成 40（错位 30px），
   * **全部测试仍然绿**。
   *
   * 为什么这条要紧：收起态那枚退出钮是全屏里**唯一的常驻出口**。
   * 它飘在控制条退出钮旁边 30px 处，用户看到的是「两个东西」，
   * 而真正点得准的那个不确定是哪个。
   */
  test('窄屏下收起态的退出钮仍与控制条退出按钮在同一个角（390px）', async () => {
    test.setTimeout(60_000);
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      // 390px = iPhone 12/13/14 的宽度，落在 compact 档（≤430px）。
      await page.setViewportSize({ width: 390, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('https://vsc-collapsed-exit-narrow.example/');
      await enterFullscreen(page);

      const collapsedState = () =>
        page.evaluate(() => {
          const el = document
            .getElementById('vsc-controls')
            ?.shadowRoot?.querySelector('[data-role="exit-collapsed"]');
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            visible: style.visibility !== 'hidden' && style.display !== 'none',
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            right: rect.right,
          };
        });

      // 键盘进全屏时焦点被送进控制条 → 控制条永不自动隐藏。先放掉焦点。
      await blurControlBar(page);

      // 控制条可见时量一次它里面退出按钮的位置（窄屏档）。
      const exitRect = await controlRect(page, 'exit');
      expect(exitRect, '控制条里必须有退出按钮').not.toBeNull();

      // 光标不动地等控制条自己收起。
      await page.waitForTimeout(4000);
      expect(await barVisible(page), '控制条应该已经收起').toBe(false);

      const collapsed = await collapsedState();
      expect(collapsed, '控制条收起后必须还有一枚独立退出钮').not.toBeNull();
      expect(collapsed.visible, '控制条收起后退出钮必须可见（永远在的退出入口）').toBe(true);
      expect(
        Math.abs(collapsed.centerX - (exitRect.left + exitRect.width / 2)),
        '窄屏下收起态的退出钮必须与控制条里的退出按钮在同一个位置 —— ' +
          '两套内边距各写一份时，这里会错开 30px，而用户看到的是「两个东西」',
      ).toBeLessThanOrEqual(8);
      expect(
        Math.abs(collapsed.centerY - (exitRect.top + exitRect.height / 2)),
        '窄屏下收起态的退出钮必须与控制条里的退出按钮在同一个位置',
      ).toBeLessThanOrEqual(8);
      expect(
        collapsed.right,
        '窄屏下收起态的退出钮也不能出屏（出屏 = 全屏里没有出口）',
      ).toBeLessThanOrEqual(390 + 0.5);
    } finally {
      await ext.close();
    }
  });

  /**
   * 键盘路径：焦点落到收起态的退出钮上 → 完整控制条回来，退出钮让位。
   *
   * ⚠️ 这条只能在**真实浏览器**里验：jsdom 没有布局与焦点语义，
   * 「刚解除隐藏的元素能不能立刻拿到焦点」这种问题只有真浏览器会回答。
   */
  test('键盘聚焦收起态的退出钮 → 控制条回来、退出钮让位、焦点不丢', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('https://vsc-collapsed-exit-focus.example/');
      await enterFullscreen(page);

      // 键盘进全屏时焦点被送进控制条 → 控制条永远不会自动隐藏。
      await blurControlBar(page);
      await page.waitForTimeout(4000);
      expect(await barVisible(page), '控制条应该已经收起').toBe(false);

      // 键盘用户 Tab 到收起态的退出钮（这里用真实浏览器的 focus() 走同一条路径）。
      const focusedRole = await page.evaluate(() => {
        const shadow = document.getElementById('vsc-controls')?.shadowRoot;
        shadow?.querySelector('[data-role="exit-collapsed"]')?.focus();
        return shadow?.activeElement?.getAttribute('data-role') ?? null;
      });

      // 焦点必须**交接**给控制条里同一个动作的按钮（退出）——
      // 收起态的退出钮马上要藏起来，焦点若掉到 body 上，
      // 键盘用户就凭空丢失了位置（Tab 要从头再来一遍）。
      expect(focusedRole, '焦点必须落在控制条里的退出按钮上，不能凭空消失').toBe('exit');
      expect(await barVisible(page), '焦点进来时完整控制条必须回来').toBe(true);

      // 退出钮要**让位**：两个退出钮不能同时在。
      //
      // ⚠️ 它与控制条是交叉淡入淡出的（160ms），所以断言前要等它落定；
      //    但它**立刻**就退出了焦点序列（键盘用户 Tab 不到它）。
      const collapsedTabIndex = await page.evaluate(() => {
        const el = document
          .getElementById('vsc-controls')
          ?.shadowRoot?.querySelector('[data-role="exit-collapsed"]');
        return el?.getAttribute('tabindex') ?? null;
      });
      expect(collapsedTabIndex, '退出钮必须立刻退出焦点序列').toBe('-1');

      await page.waitForTimeout(300);
      const collapsedStillVisible = await page.evaluate(() => {
        const el = document
          .getElementById('vsc-controls')
          ?.shadowRoot?.querySelector('[data-role="exit-collapsed"]');
        if (!el) return null;
        const style = getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none';
      });
      expect(collapsedStillVisible, '两个退出钮不能同时在').toBe(false);
    } finally {
      await ext.close();
    }
  });

  /**
   * 键盘进全屏之后，**控制条必须自己收得起来**，而且键盘用户必须能走到退出入口。
   *
   * ⚠️ 为什么这两件事要绑在一条用例里：它们是**同一个缺陷的两层**。
   *
   * 旧实现：键盘进全屏时焦点被送进**控制条**（播放键）。
   * 于是「焦点在控制条里就别藏」那条守卫**恒真** → 控制条**永远**霸占屏幕
   * （挡住画面与字幕）→ 收起态那枚「永远在的退出入口」**从不出现** →
   * 键盘用户既出不来、也看不见画面。
   *
   * 现在：焦点落在**播放器表面**（`#vsc-page-fullscreen-stage`），
   * 控制条照常按承诺自动隐藏；闲置到期时先把焦点交出去再藏。
   *
   * ⚠️ 这里**不能**手动 `blurControlBar()` —— 那会把缺陷盖住：
   * 手动 blur 之后「焦点在控制条里就别藏」那条守卫不再恒真，
   * 控制条就收得起来了，**变异的代码照样绿**。
   * 键盘用户的真实路径是「按 `f` 进全屏然后什么都不做」，
   * 守卫必须走那条路。
   *
   * ⚠️ 第二层：Tab 导航。浏览器计算「下一个 Tab 停靠点」发生在 keydown 的
   * **默认动作**阶段，而我们的「唤醒控制条」处理器跑在 **window 的捕获阶段**
   * （更早）—— 它若顺手把收起态退出钮踢出焦点序列，
   * 浏览器算停靠点时就看不到它 → **永远 Tab 不到**。
   * 所以 Tab **不**唤醒控制条（Tab 是导航键，不是操作键）。
   *
   * ⚠️ 判据是「**能走到一个退出入口**」，不是「能走到收起态那一枚」：
   * 按 Tab 会唤醒控制条，而控制条里也有退出按钮 —— 走它同样能退出全屏，
   * 用户不会觉得被卡住。真正要守的是：**焦点必须落在某个能退出全屏的按钮上**，
   * 而不是落在 body 上（那就等于键盘用户彻底出不来）。
   *
   * ⚠️ 这些判据**只能在真实浏览器里验** —— jsdom 没有焦点导航算法，
   * 单测守不了「浏览器真的会停在那里」。所以它必须是 e2e。
   */
  test('键盘进全屏后控制条会自己收起，且 Tab 能走到一个退出入口', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      const setBody = serveBody(page);
      setBody(pageHtml());
      await page.goto('https://vsc-collapsed-exit-tab.example/');
      await enterFullscreen(page);

      // ⚠️ 故意**不**手动 blur：这就是键盘用户的路径。
      // 焦点若被关在控制条里，控制条永远不会收起来。
      await page.waitForTimeout(4500);
      expect(
        await barVisible(page),
        '键盘进全屏后控制条必须自己收起（焦点被关在控制条里的话它永远不会藏）',
      ).toBe(false);

      // 焦点必须落在**看得见**的地方（收起态那枚退出钮，或播放器表面）。
      const focusIsVisible = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) {
          return false;
        }
        // 焦点在控制条宿主之外（舞台）→ 看得见；
        // 在控制条的 shadow 里 → 必须是收起态那枚（控制条已藏，它也看得见）。
        if (active.id === 'vsc-page-fullscreen-stage') {
          return true;
        }
        const shadow = document.getElementById('vsc-controls')?.shadowRoot;
        const role = shadow?.activeElement?.getAttribute('data-role') ?? null;
        if (role === 'exit-collapsed') {
          return true;
        }
        if (role !== null) {
          // 焦点在控制条里，而控制条已经藏了 → 焦点落在看不见的元素上。
          return false;
        }
        // 焦点在 body 上 → 键盘用户既没有落点，也看不到自己在哪。
        return active !== document.body;
      });
      expect(focusIsVisible, '焦点必须落在看得见的地方（播放器表面或收起态退出钮）').toBe(true);

      // 真实按 Tab：焦点必须**真的落到**某个退出按钮上。
      // ⚠️ 用真实的键盘事件（page.keyboard.press('Tab')），
      //    不能用 element.focus() —— 后者绕过了浏览器的停靠点计算，
      //    正是这个缺陷藏身的地方。
      const landedOnExit = await (async () => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          await page.keyboard.press('Tab');
          const role = await page.evaluate(() => {
            const shadow = document.getElementById('vsc-controls')?.shadowRoot;
            return shadow?.activeElement?.getAttribute('data-role') ?? null;
          });
          // 两枚退出入口都算：收起态那一枚，或控制条里的退出按钮。
          if (role === 'exit-collapsed' || role === 'exit') {
            return true;
          }
        }
        return false;
      })();
      expect(
        landedOnExit,
        '键盘按 Tab 必须能走到某个退出入口（焦点落在 body 上就等于键盘用户出不来）',
      ).toBe(true);

      // 走到之后按 Enter 必须真的能退出全屏 ——
      // 「能 Tab 到」和「按下去有用」是两回事。
      await page.keyboard.press('Enter');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(false);
    } finally {
      await ext.close();
    }
  });
  /**
   * 站点给 <body> 加 transform 时，网页全屏必须**照常可用**。
   *
   * ⚠️ 这是 2026-10-21 复审挖出来的**最严重**的一个洞（探针实测）：
   *
   *   CSS 规定：祖先只要带 transform / filter / perspective /
   *   contain / will-change，它就成了 `position: fixed` 后代的**包含块**。
   *   于是 fixed 不再相对视口，而是相对那个祖先的盒子。
   *
   *   而 `body { transform: translateZ(0) }` 是站点做 GPU 加速的**常见写法**。
   *   实测（1000×700 视口，body 高 2400px）：
   *
   *     视频      top=850  bottom=1550  → 完全在视口外
   *     控制条    top=2334              → 在视口外
   *     退出钮    top=2360              → 在视口外
   *
   *   用户看到的是**一片黑**：没有画面、没有控制条、没有退出按钮。
   *   网页全屏这个核心功能，在这样的站点上整个报废。
   *
   * 根因不是「忘了加 z-index」，而是**浮层挂在了 body 上**：
   * transform 只会让自己成为后代的包含块，不会传染给父元素 ——
   * 挂到 <html> 上就免疫了（实测已验证）。
   *
   * ⚠️ 这条用例守的是「挂载点」，不是「某个坐标」：
   * 有人把浮层改回 `document.body.appendChild(...)`，
   * 它会立刻红 —— 而这正是它该红的原因。
   */
  test('站点给 body 加 transform 时，网页全屏的浮层仍然落在视口里', async () => {
    test.setTimeout(60_000);
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1000, height: 700 });
      const setBody = serveBody(page);
      // body 高 2400px（远高于视口）+ transform —— 正是最常见的 GPU 加速写法。
      setBody(
        pageHtml({
          extraCss: 'body{height:2400px;transform:translateZ(0)}',
          extraBody: '<div style="height:2400px">tall</div>',
        }),
      );
      await page.goto('https://vsc-transformed-body.example/');
      await enterFullscreen(page);

      const geometry = () =>
        page.evaluate(() => {
          const pick = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
          };
          const shadow = document.getElementById('vsc-controls')?.shadowRoot;
          return {
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            video: pick(document.querySelector('.vsc-page-fullscreen-video')),
            bar: pick(shadow?.querySelector('.bar')),
            collapsed: pick(shadow?.querySelector('[data-role="exit-collapsed"]')),
          };
        });

      const g = await geometry();

      // 画面必须**完整落在视口里** —— 出屏就是黑屏。
      expect(g.video, '网页全屏必须有一个被搬到画面上的视频').not.toBeNull();
      expect(g.video.top, '视频的上边缘必须落在视口内').toBeGreaterThanOrEqual(-0.5);
      expect(g.video.bottom, '视频的下边缘必须落在视口内').toBeLessThanOrEqual(g.viewportHeight + 0.5);

      // 控制条也必须在视口里（它是操作面板，飘到屏外就等于没有）。
      expect(g.bar, '控制条必须在').not.toBeNull();
      expect(g.bar.bottom, '控制条必须落在视口内').toBeLessThanOrEqual(g.viewportHeight + 0.5);

      // 收起态那枚唯一常驻退出钮同样必须在视口里。
      expect(g.collapsed, '必须有一枚独立退出钮').not.toBeNull();
      expect(g.collapsed.top, '退出钮必须在视口内').toBeGreaterThanOrEqual(-0.5);
      expect(g.collapsed.bottom, '退出钮必须在视口内').toBeLessThanOrEqual(g.viewportHeight + 0.5);
      expect(g.collapsed.right, '退出钮必须在视口内').toBeLessThanOrEqual(g.viewportWidth + 0.5);
    } finally {
      await ext.close();
    }
  });
});
