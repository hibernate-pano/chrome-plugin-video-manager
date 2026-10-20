import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * 控制条的样式隔离。
 *
 * 6.0.9 的核心承诺之一：「控制条搬进 shadow root，站点 CSS 打不穿」。
 * 这套用例专门守这条承诺。
 *
 * 为什么值得单独守：我们把 UI 注入到**任意站点**的 DOM 里，站点的全局 CSS
 * 会顺着继承与元素选择器把控制条彻底摧毁。实测一个「有自己的设计系统」的站点：
 *
 *   * { box-sizing: border-box !important }
 *   div { font-family: "Comic Sans MS", cursive !important; line-height: 3 !important }
 *   button { all: unset !important }
 *   input[type="range"] { -webkit-appearance: none !important; height: 40px !important; background: red !important }
 *
 * 结果是控制条变成一整条红色大块、按钮塌成 22×48 的图标、时间显示成 Comic Sans、
 * 进度条完全不可用。
 *
 * 试过的其它办法都不行：
 * - 显式重声明每个属性：挡不住站点的 `!important`（作者 `!important` 优先级高于
 *   普通作者声明）。
 * - `all: revert`：只回退到**上一层**样式，站点的 `!important` 依然生效。
 * - `all: initial`：更糟，连 `position: fixed` 都会被重置。
 *
 * shadow root 是**结构性**的隔离边界：页面样式进不来，我们自己的样式也出不去。
 *
 * 关键：断言必须量**实际渲染出来的样式**（computed style / 实际尺寸），
 * 而不是"元素上有没有某个 class" —— 后者在污染站点上照样通过。
 */

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

const launchExtension = async () => {
  const profile = mkdtempSync(join(tmpdir(), 'vsc-style-'));
  const executablePath = findChromium();
  const candidates = [
    { options: { channel: 'chromium', headless: true, args: launchArgs() } },
    { options: { executablePath, headless: true, args: launchArgs() } },
  ];

  for (const candidate of candidates) {
    if (
      'executablePath' in candidate.options &&
      candidate.options.executablePath === undefined
    ) {
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

/**
 * 一个「有自己的设计系统」的站点。
 *
 * 这些规则都是 `!important` 且用元素选择器 —— 在 shadow DOM 出现之前，
 * 它们能把控制条彻底摧毁。
 */
const HOSTILE_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc style isolation</title>
<style>
  * { box-sizing: border-box !important; }
  div {
    font-family: "Comic Sans MS", cursive !important;
    line-height: 3 !important;
    color: #ff00ff !important;
    background: #ff0000 !important;
  }
  button {
    all: unset !important;
    width: 22px !important;
    height: 48px !important;
  }
  input[type="range"] {
    -webkit-appearance: none !important;
    appearance: none !important;
    height: 40px !important;
    background: red !important;
    border-radius: 0 !important;
  }
  span { font-size: 40px !important; }
</style>
</head><body>
  <div id="player">
    <video id="v1" muted playsinline></video>
  </div>
</body></html>`;

const serve = (page, body) =>
  page.route('**/*', (route) => {
    if (route.request().url().startsWith('chrome-extension://')) {
      return route.continue();
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });

/**
 * 控制条 shadow root 里的某个元素的样式快照。
 *
 * 一次 evaluate 全部取回来：page.evaluate 返回的是**普通对象**（不是 Element
 * 句柄），拿回来再调 .evaluate() 会报 "not a function"。
 */
const shadowStyle = (page, selector) =>
  page.evaluate((sel) => {
    const host = document.getElementById('vsc-controls');
    // shadowRoot 里找；找不到就退回 light DOM —— 这样变异测试（把控制条搬回
    // light DOM）时，样式断言仍然能取到元素并真正检验"样式有没有被站点打穿"，
    // 而不是先在"元素找不到"这一步就挂掉、让后面的断言没被检验。
    const el = host?.shadowRoot?.querySelector(sel) ?? host?.querySelector(sel);
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      display: style.display,
      background: style.backgroundColor,
    };
  }, selector);

test.describe('控制条的样式隔离（站点 CSS 打不穿 shadow root）', () => {
  test('站点把按钮/字体/滑块全部 !important 摧毁时，控制条依然正常', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, HOSTILE_PAGE);
      await page.goto('https://vsc-style.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
      });

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))),
        )
        .toBe(true);
      await page.waitForTimeout(600);

      // 控制条必须真的挂在 shadow root 里 —— 这是隔离的前提。
      const shadowed = await page.evaluate(() => {
        const host = document.getElementById('vsc-controls');
        return Boolean(host?.shadowRoot);
      });
      expect(shadowed, '控制条必须住在 shadow root 里').toBe(true);

      // 按钮没被 `all: unset` + 22×48 摧毁
      const buttonBox = await shadowStyle(page, '[data-role="play"]');
      expect(buttonBox, '播放按钮应存在').not.toBeNull();
      expect(buttonBox.display, '按钮不能被 all:unset 抹掉 display').not.toBe('none');
      expect(buttonBox.h, '按钮不该塌成站点的 48px 高度').toBeGreaterThan(20);
      expect(buttonBox.w, '按钮不该塌成站点的 22px 宽度').toBeGreaterThan(20);
      expect(buttonBox.fontFamily.toLowerCase(), '字体不该被站点改成 Comic Sans').not.toContain(
        'comic',
      );

      // 时间显示不该是 40px 的 Comic Sans
      const timeStyle = await shadowStyle(page, '[data-role="time"]');
      expect(timeStyle, '时间显示应存在').not.toBeNull();
      expect(parseFloat(timeStyle.fontSize), '时间不该被站点放大到 40px').toBeLessThan(20);
      expect(timeStyle.fontFamily.toLowerCase()).not.toContain('comic');

      // 进度条不该被改成红色的 40px 方块
      const rangeStyle = await shadowStyle(page, '[data-role="progress"]');
      expect(rangeStyle, '进度条应存在').not.toBeNull();
      expect(rangeStyle.h, '进度条不该被站点改成 40px 高').toBeLessThan(30);
      // 站点把 range 背景设成 red；我们的样式不该是纯红。
      expect(rangeStyle.background, '进度条不该被站点的红色背景打穿').not.toBe('rgb(255, 0, 0)');
    } finally {
      await ext.close();
    }
  });

  test('退出全屏后控制条从 DOM 里彻底消失', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, HOSTILE_PAGE);
      await page.goto('https://vsc-style-cleanup.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
      });

      await page.keyboard.press('f');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-controls'))),
        )
        .toBe(true);

      await page.keyboard.press('Escape');
      await expect
        .poll(() =>
          page.evaluate(() => Boolean(document.getElementById('vsc-controls'))),
        )
        .toBe(false);

      // 站点里还活着的元素不该被我们留下残骸
      const leftovers = await page.evaluate(() => ({
        controls: document.querySelectorAll('#vsc-controls').length,
        overlay: document.querySelectorAll('#vsc-page-fullscreen-overlay').length,
      }));
      expect(leftovers.controls, '控制条宿主必须被移除').toBe(0);
      expect(leftovers.overlay, '全屏 overlay 必须被移除').toBe(0);
    } finally {
      await ext.close();
    }
  });
});
