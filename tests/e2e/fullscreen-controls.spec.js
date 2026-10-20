import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import zlib from 'node:zlib';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';

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

const DIST = process.env.VSC_EXTENSION_DIR
  ? resolve(process.env.VSC_EXTENSION_DIR)
  : resolve(process.cwd(), 'dist');

const findChromium = () => {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  const relativeCandidates = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-linux/chrome',
  ];
  const versions = readdirSync(cache)
    .filter((name) => name.startsWith('chromium-'))
    .map((name) => name.slice('chromium-'.length))
    .filter((version) => /^\d+$/.test(version))
    .sort((a, b) => Number(b) - Number(a));
  for (const version of versions) {
    for (const relative of relativeCandidates) {
      const candidate = join(cache, `chromium-${version}`, relative);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
};

const launchArgs = () => [
  `--disable-extensions-except=${DIST}`,
  `--load-extension=${DIST}`,
  '--autoplay-policy=no-user-gesture-required',
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

/** 启动一个带扩展的浏览器（内容脚本只在扩展里跑，普通 page 没有它）。 */
const launchExtension = async () => {
  const profile = mkdtempSync(join(tmpdir(), 'vsc-controls-'));
  const executablePath = findChromium();
  const candidates = [
    { options: { channel: 'chromium', headless: true, args: launchArgs() } },
    { options: { executablePath, headless: true, args: launchArgs() } },
  ];

  for (const candidate of candidates) {
    if ('executablePath' in candidate.options && candidate.options.executablePath === undefined) {
      continue;
    }
    try {
      const context = await chromium.launchPersistentContext(profile, candidate.options);
      const sw =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));
      if (!sw) {
        await context.close();
        continue;
      }
      return {
        context,
        async close() {
          await context.close();
          rmSync(profile, { recursive: true, force: true });
        },
      };
    } catch {
      /* 试下一个 */
    }
  }

  rmSync(profile, { recursive: true, force: true });
  throw new Error('无法启动带扩展的浏览器');
};

/* ------------------------------------------------------------------ *
 * 像素工具（不引第三方依赖：读 PNG 只需要 zlib + PNG 的 unfilter）
 * ------------------------------------------------------------------ */

const readPixel = (png, x, y) => {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;

    if (type === 'IHDR') {
      width = png.readUInt32BE(dataStart);
      height = png.readUInt32BE(dataStart + 4);
      // ⚠️ 位深与颜色类型是**单字节**，用 readUInt32BE 读会把后面的字节也吃进来。
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(png.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataStart + length + 4;
  }

  if (bitDepth !== 8) {
    return null;
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) {
    return null;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  let src = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[src];
    src += 1;
    for (let i = 0; i < stride; i += 1) {
      const raw = inflated[src + i];
      const left = i >= channels ? pixels[row * stride + i - channels] : 0;
      const up = row > 0 ? pixels[(row - 1) * stride + i] : 0;
      const upLeft = row > 0 && i >= channels ? pixels[(row - 1) * stride + i - channels] : 0;

      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upLeft);
      else return null;

      pixels[row * stride + i] = value & 0xff;
    }
    src += stride;
  }

  const index = (y * width + x) * channels;
  return [pixels[index], pixels[index + 1], pixels[index + 2]];
};

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
const pageHtml = ({ src = '', caption = '', captionCss = '', autoplay = false } = {}) => `<!DOCTYPE html>
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
</style>
</head><body>
<div id="player">
  <video id="v1" muted playsinline preload="auto"${src ? ` src="${src}"` : ''}${autoplay ? ' autoplay' : ''}></video>
  ${caption ? `<div id="cap">${caption}</div>` : ''}
</div>
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
});
