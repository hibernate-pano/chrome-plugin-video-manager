import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { readPixel } from './helpers/png.js';
import { launchExtension } from './helpers/launch.js';

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

/* ------------------------------------------------------------------ *
 * 页面级提示的样式隔离
 *
 * 控制条能靠 shadow root 挡住站点 CSS，**页面级提示不能**：
 * 调速胶囊、常驻角标、接管提示、首次引导、扩展已更新提示这五个提示
 * 必须留在 light DOM 里（读屏要读它们的文本、既有单测与 E2E 按 id 找它们），
 * 所以只能靠**样式本身**扛住站点的 !important。
 *
 * 这套用例量的就是「扛住了没有」：同一个页面跑两遍，一遍正常、
 * 一遍带站点的 !important，把提示的 computed 样式**逐项**比。
 *
 * ⚠️ 这里量的是**四个**提示（胶囊 / 角标 / 引导 / 接管提示）——
 * 第五个（扩展已更新的状态通知）在这套用例里**测不到**：
 * 它只在扩展上下文失效时才出现，而上下文失效没法从页面里造出来。
 * 它的排版由 src/content/noticeTokens.test.ts 守着。
 *
 * ⚠️ 这套用例**不写死任何本地化文案**：断言里唯一的文字是 '1.1x'
 * —— 那是**倍速本身**（formatRate 的输出），不经过 chrome.i18n，
 * 所以与机器语言无关。写死中文必挂：chrome.i18n 跟的是**系统 locale**，
 * CI runner 是英文环境（要写文案断言就用 tests/e2e/helpers/i18n.js 的
 * anyLocale / anyLocaleFragment）。
 * ------------------------------------------------------------------ */

/**
 * 站点的 hostile CSS —— 与任务书给的那段**逐字相同**。
 *
 * ⚠️ 与控制条那套「恶意站点」样式故意不同：那里的规则命中的是 shadow root
 * 里的元素（打不穿），这里的规则命中的是**我们要用的节点本身**。
 */
const HOSTILE_NOTICE_CSS = `div {
  color:#f00 !important;
  background-color:#0f0 !important;
  font-size:40px !important;
  font-family:"Comic Sans MS" !important;
  border-radius:0 !important;
  padding:20px !important;
}`;

/** 真实的 10 秒视频：角标只在视频**正在播**时才会出现。 */
const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 必须逐项相同的 computed 属性。
 *
 * 这几项正是站点的 hostile CSS 会改的那几项（颜色 / 底色 / 字号 / 字体 /
 * 圆角 / 内边距），再加上定位与层级（fixed + z-index）——
 * 「样式没被打穿」不等于「提示还贴在视频旁边」。
 */
const NOTICE_STYLE_PROPERTIES = [
  'color',
  'background-color',
  'font-size',
  'font-family',
  'border-radius',
  'padding',
  'width',
  'height',
  'position',
  'z-index',
  'opacity',
];

/* ------------------------------------------------------------------ *
 * 设计值的真源：token
 *
 * ⚠️ 为什么期望值**从 token 推**，而不是把字面量抄在断言里：
 * 那些字面量（13px / 12px / 999px / 6px 12px / 1px 5px /
 * 10px 26px 10px 16px / 2147483646 …）全都由别处的 token 决定
 * （NOTICE_PILL_TOKENS / NOTICE_CARD_TOKENS / BADGE_STYLES / NOTICE_Z_INDEX）。
 * token 整体调一档时它们会集体变红 —— 而下一个人很可能去「修」本来没坏的
 * token（把字号改回 13px），把一次有意的调档变成一次无声的回滚。
 *
 * 改成从 token 推之后：
 * - token 调档 → 断言跟着走（它问的是「浮层的排版**符合 token 吗**」）；
 * - 某个模块自己写了一份排版 / 站点的 !important 打穿了它 → 照样红。
 *
 * ⚠️ 这条用例的**不变式**（同字号 / 同字重 / 同行高 / 同字体族、角标更小一档）
 * 必须原样留着：那些才是「一套视觉语言」本身，token 怎么调档都该绿。
 *
 * ⚠️ 为什么在 Node 里 import 这些模块不会炸：
 * runtimeStyles.ts 与 speedToast.ts 在**模块顶层**不碰 DOM、不碰 chrome
 * （只有函数体内才用），所以 Playwright 的 TS loader 能把它们安全地
 * 引进测试进程（与 fullscreen-controls.spec.js 里 import
 * controlBarLayout.ts 是同一个手法）。
 * ------------------------------------------------------------------ */

/** 页面级提示的设计值真源（token）。 */
const loadDesignTokens = async () => {
  const runtimeStyles = await import('../../src/content/runtimeStyles.ts');
  const speedToast = await import('../../src/content/speedToast.ts');
  return { ...runtimeStyles, BADGE_STYLES: speedToast.BADGE_STYLES };
};

/**
 * token 里的颜色 → computed style 的写法。
 *
 * ⚠️ computed style 永远不返回 '#rrggbb'，它给的是 'rgb(r, g, b)'。
 * 所以期望值必须**换算**，不能直接拿 token 里的字面量去比。
 */
const computedColor = (value) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '');
  if (!hex) {
    // rgba(...)：浏览器原样返回，直接用。
    return value;
  }
  const int = Number.parseInt(hex[1], 16);
  return `rgb(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255})`;
};

/**
 * token 里的内边距 → computed style 的写法。
 *
 * ⚠️ Chrome 的实测行为（真实 Chromium）：
 *   padding: 6px 12px                      → "6px 12px"（**保留**原来的简写）
 *   padding: 10px 16px; padding-right:26px  → "10px 26px 10px 16px"（展开成四边）
 *
 * 也就是说：只要有一边的长写被单独改过，简写就退化成四边写法。
 * 期望值必须照着这条规则推 —— 推错了错的是**断言**，不是产品。
 */
const computedPadding = (tokens) => {
  const shorthand = String(tokens.padding ?? '0px').trim();
  const overridden = ['top', 'right', 'bottom', 'left'].filter((side) =>
    `padding-${side}` in tokens,
  );
  if (overridden.length === 0) {
    return shorthand;
  }

  const parts = shorthand.split(/\s+/);
  const [top, right = top, bottom = top, left = right] = parts;
  const sides = { top, right, bottom, left };
  overridden.forEach((side) => {
    sides[side] = tokens[`padding-${side}`];
  });
  return [sides.top, sides.right, sides.bottom, sides.left].join(' ');
};

/**
 * 某个提示节点的 computed 样式快照。
 *
 * 取的是 **getComputedStyle**（浏览器真正算出来的那一份），
 * 不是 element.style（那只是我们自己写进去的意图）。
 */
const noticeSnapshot = (page, id) =>
  page.evaluate(([selector, properties]) => {
    const element = document.getElementById(selector);
    if (!element) {
      return null;
    }
    const style = getComputedStyle(element);
    const snapshot = {};
    properties.forEach((property) => {
      snapshot[property] = style.getPropertyValue(property);
    });
    return snapshot;
  }, [id, NOTICE_STYLE_PROPERTIES]);

/**
 * 顶层页面：一个真在播的视频。
 *
 * 胶囊 / 角标 / 首次引导都锚在它身上。
 */
const topLevelNoticePage = (hostile) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc notice isolation</title>
<style>
  html,body{margin:0;background:#fff}
  #player{position:relative;width:640px;height:360px;margin:40px}
  video{width:640px;height:360px;background:#000}
  /* 白底垫片：把角标将要出现的那块画面**涂成白色**。
     角标的底板是半透明的（rgba(0,0,0,0.78)），它最终有多黑取决于
     背后是什么 —— 「白色画面上的对比度」是这条产品承诺里最严的那个场景，
     所以必须真的有一块白底，不能拿视频画面的颜色凑。 */
  #whitepatch{position:absolute;left:16px;top:16px;width:200px;height:48px;background:#fff !important}
  ${hostile ? HOSTILE_NOTICE_CSS : ''}
</style>
</head><body>
<div id="player">
  <video id="v1" controls muted playsinline preload="auto" src="${CLIP}"></video>
  <div id="whitepatch"></div>
</div>
<script>
  // ⚠️ 两个刻意的选择，缺一个这条用例就跑不起来：
  //
  // 1. **不能**用 autoplay 属性：有 autoplay 且没有 controls 的视频会被判成
  //    「站点摆在那儿的装饰性自动播放」，首次引导就永远不会出现。
  //    这里用 controls 表明「站点把它当成一个正经播放器给人用」。
  // 2. play() 必须**延后**：扩展注入在 document_start，但它要等设置加载完
  //    才挂上 play 监听器 —— 页面脚本在解析期就 play() 的话，那次事件我们
  //    根本没听见（首次引导靠的就是 play 事件）。
  setTimeout(function () {
    document.getElementById('v1').play().catch(function () {});
  }, 600);
</script>
</body></html>`;

/** iframe 里的页面（接管提示的触发场景）。 */
const takeoverInnerPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc takeover inner</title>
<style>html,body{margin:0;background:#fff} video{width:600px;height:338px;background:#000}</style>
</head><body><video id="inner" muted playsinline preload="auto" src="${CLIP}"></video>
<script>
  // ⚠️ **必须有 src，而且必须真的播起来**（2026-10-22 加）。
  //
  // 原来这里是一个**没有源**的 <video>：readyState 恒为 0、永远暂停。
  // 于是「接管不了」这件事有两种完全不同的含义，而内容脚本分得很清楚：
  //   - 这一层**没有能播的视频** → 它什么都不说；
  //   - 这一层**有视频，但接管不了** → 它说「视频在嵌入框里」。
  // 这条用例要的是**后者**。
  //
  // 实测（真实 Chromium）：没有源的版本里，『f』落到哪个 frame 取决于
  // 点击有没有把焦点送进嵌入框。焦点在顶层 → 有提示；
  // 焦点在嵌入框里 → 顶层根本收不到这个键，提示不出现。两次跑结果不同，
  // 而**产品两侧的行为都是对的** —— 那是**用例**的缺陷，不是产品的。
  setTimeout(function () {
    document.getElementById('inner').play().catch(function () {});
  }, 300);
</script>
</body></html>`;

/**
 * 顶层页面：视频**只**在 iframe 里 → 按 f 必然接管不了 → 给出一次性提示。
 *
 * 提示本身住在**顶层文档**里（position:fixed），所以站点的 hostile CSS
 * 命中的就是它。
 */
const takeoverOuterPage = (hostile) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc takeover isolation</title>
<style>
  html,body{margin:0;background:#fff}
  #spacer{height:200px;background:#eee}
  iframe{display:block;width:640px;height:360px;border:0;margin-left:40px}
  ${hostile ? HOSTILE_NOTICE_CSS : ''}
</style>
</head><body>
<div id="spacer">top</div>
<iframe id="f1" src="/inner.html"></iframe>
</body></html>`;

/** 两个页面各给一份 body（iframe 的内外页不同）。 */
const servePages = (page, outer, inner) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: url.includes('inner.html') ? inner : outer,
    });
  });

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

/** 把 rgba 底板合成到不透明的背景上。 */
const compositeOver = ([r, g, b], alpha, backdrop) =>
  backdrop.map((channel, index) => Math.round(channel * (1 - alpha) + [r, g, b][index] * alpha));

/** 'rgb(r, g, b)' / 'rgba(r, g, b, a)' → [r, g, b, a]。 */
const parseColor = (value) => {
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (!match) {
    return null;
  }
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
};

/**
 * 把顶层页面上四个提示都唤出来并量好。
 *
 * 时间线（由产品自己的时长决定，不是测试在猜）：
 * - 播放满 2.5 秒 → 首次引导出现
 * - 按 = → 胶囊出现（900ms 后淡出）
 * - 胶囊淡出后 3 秒 → 常驻角标出现
 *
 * @param page Playwright 页面
 * @param tokens 设计值真源（token）—— 用来认出「角标形态」
 */
const captureTopLevelNotices = async (page, tokens) => {
  // 首次引导。
  await expect
    .poll(
      () => page.evaluate(() => Boolean(document.getElementById('vsc-first-run-hint'))),
      {
        timeout: 20_000,
        message:
          '等首次引导出现（视频播满 2.5 秒后）。等不到说明 play 事件没被接住 —— ' +
          '页面脚本 play() 的时机太早的话，扩展那时还没挂上监听器。',
      },
    )
    .toBe(true);
  // 等淡入结束（220ms），否则量到的是过渡的中间值。
  await page.waitForTimeout(500);
  const hint = await noticeSnapshot(page, 'vsc-first-run-hint');

  // 胶囊：按 = 调速。
  await page.keyboard.press('=');
  await expect
    .poll(
      () =>
        page.evaluate(() => document.getElementById('vsc-speed-toast')?.textContent ?? ''),
      { timeout: 10_000 },
    )
    .toBe('1.1x');
  await page.waitForTimeout(400);
  const pill = await noticeSnapshot(page, 'vsc-speed-toast');
  // 读屏用的「当前倍速」镜像（视觉隐藏、AT 可读）。
  const state = await noticeSnapshot(page, 'vsc-speed-state');

  // 常驻角标：胶囊淡出之后 3 秒。
  // 认它的办法是**形态变了**（胶囊 13px / 角标 12px）——
  // 这里用的是「怎么认出它」，不是「它应该是什么值」：
  // 期望的字号从角标自己的样式里取（BADGE_STYLES），不写死。
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const toast = document.getElementById('vsc-speed-toast');
          return toast ? getComputedStyle(toast).fontSize : '';
        }),
      {
        timeout: 20_000,
        message:
          '等常驻角标出现（形态从胶囊变成角标：字号由胶囊那档变成角标那档）。' +
          '等不到说明角标没出来 —— 或者它的字号被站点的 !important 打穿了。',
      },
    )
    .toBe(tokens.BADGE_STYLES['font-size']);
  const badge = await noticeSnapshot(page, 'vsc-speed-toast');

  return { hint, pill, state, badge };
};

/** 接管提示：iframe 里的视频按 f → 提示出现在顶层文档。 */
const captureTakeoverNotice = async (page) => {
  // ⚠️ 焦点必须**确实**留在顶层文档，否则这个键进不了顶层的内容脚本 ——
  // 而「点一下 (200,100) 焦点就在顶层」是**假定**，不是事实（实测踩过）：
  // 那一下的落点旁边就是嵌入框，浏览器有时会把焦点送进框里。
  // 于是同一份页面跑两遍，一遍有提示、一遍没有，而产品两侧都对。
  // 现在点完**核对**一次，不对就点回来。
  await page.mouse.click(200, 100);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.activeElement ? document.activeElement.tagName : '',
        ),
      { timeout: 5000, message: '点击之后焦点必须落在顶层文档里（不能落进嵌入框）' },
    )
    .not.toBe('IFRAME');

  await page.keyboard.press('f');
  await expect
    .poll(
      () => page.evaluate(() => Boolean(document.getElementById('vsc-takeover-notice'))),
      { timeout: 10_000 },
    )
    .toBe(true);
  await page.waitForTimeout(400);
  return noticeSnapshot(page, 'vsc-takeover-notice');
};

/**
 * 跑一遍「正常页面」或「恶意页面」，把四个提示的样式都量回来。
 *
 * ⚠️ 两种页面**各开一个浏览器**：首次引导是「一辈子只提示一次」的一次性开关
 * （落盘在 storage.local），同一个 profile 里跑第二遍它就不会出现了 ——
 * 那样比出来的「两边一样」是因为两边都没有，不是因为隔离有效。
 * 新的 profile = 新的存储 = 两边都真的出现过。
 *
 * @param hostile 页面是否带站点的 !important
 * @param tokens 设计值真源（token）
 */
const measureFlavor = async (hostile, tokens) => {
  const ext = await launchExtension();
  try {
    const topPage = await ext.context.newPage();
    await serve(topPage, topLevelNoticePage(hostile));
    await topPage.goto('https://vsc-notice.example/');
    await topPage.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
    const top = await captureTopLevelNotices(topPage, tokens);
    const priorities = {
      pill: await noticeInlinePriorities(topPage, 'vsc-speed-toast'),
      state: await noticeInlinePriorities(topPage, 'vsc-speed-state'),
      hint: await noticeInlinePriorities(topPage, 'vsc-first-run-hint'),
    };
    await topPage.close();

    const takeoverPage = await ext.context.newPage();
    await servePages(takeoverPage, takeoverOuterPage(hostile), takeoverInnerPage);
    await takeoverPage.goto('https://vsc-takeover.example/');
    await takeoverPage.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
    const takeover = await captureTakeoverNotice(takeoverPage);
    priorities.takeover = await noticeInlinePriorities(takeoverPage, 'vsc-takeover-notice');
    await takeoverPage.close();

    return { ...top, takeover, priorities };
  } finally {
    await ext.close();
  }
};

/** 两份快照必须逐项相同。 */
const expectSameStyles = (baseline, actual, label) => {
  expect(actual, `${label}：提示节点必须存在`).not.toBeNull();
  NOTICE_STYLE_PROPERTIES.forEach((property) => {
    expect(
      actual[property],
      `${label}：${property} 被站点的 !important 改了（正常=${baseline[property]}，恶意=${actual[property]}）`,
    ).toBe(baseline[property]);
  });
};

/**
 * 提示节点上**每一条**内联声明的优先级。
 *
 * ⚠️ 这里量的不是 computed style（那是「渲染出来的样子」），
 * 而是**我们写下去的声明**带不带 !important —— 隔离底座里的
 * `all: initial !important` 会把**普通的**内联声明整个抹掉，
 * 所以凡是写在这五个提示上的内联样式都必须带 !important，
 * 否则连「位置」都会一起没掉（left/bottom 会被打回 auto）。
 */
const noticeInlinePriorities = (page, id) =>
  page.evaluate((selector) => {
    const element = document.getElementById(selector);
    if (!element) {
      return null;
    }
    const style = element.style;
    const priorities = {};
    for (let index = 0; index < style.length; index += 1) {
      const property = style.item(index);
      priorities[property] = style.getPropertyPriority(property);
    }
    return priorities;
  }, id);

/** 每一条内联声明都得带 !important —— 自定义属性除外。 */
const expectAllImportant = (priorities, label) => {
  expect(priorities, `${label}：提示节点必须存在`).not.toBeNull();

  Object.entries(priorities).forEach(([property, priority]) => {
    if (property.startsWith('--')) {
      // 自定义属性必须**不带** !important，否则媒体查询压不住它
      // （减少动效就再也关不掉淡入淡出）。
      expect(priority, `${label}：${property} 不能带 !important`).toBe('');
      return;
    }
    expect(priority, `${label}：${property} 必须带 !important`).toBe('important');
  });
};

test.describe('页面级提示的样式隔离（站点的 !important 打不穿）', () => {
  test('站点的 !important 不改变四个提示的任何一项 computed 样式', async () => {
    test.setTimeout(180_000);

    const tokens = await loadDesignTokens();
    const normal = await measureFlavor(false, tokens);
    const hostile = await measureFlavor(true, tokens);

    // 四个提示逐一比。
    expectSameStyles(normal.pill, hostile.pill, '调速胶囊');
    expectSameStyles(normal.badge, hostile.badge, '常驻角标');
    expectSameStyles(normal.hint, hostile.hint, '首次引导');
    expectSameStyles(normal.takeover, hostile.takeover, '接管提示');
    // 读屏用的「当前倍速」镜像也一起（它同样是挂在 body 上的 div）。
    expectSameStyles(normal.state, hostile.state, '当前倍速镜像');

    // ⚠️ 光比「两边一样」不够 —— 两边一起坏掉也是「一样」。
    // 所以这里再钉住**设计值**：期望值全部**从 token 推**
    //（NOTICE_PILL_TOKENS / NOTICE_CARD_TOKENS / BADGE_STYLES / NOTICE_Z_INDEX /
    //  NOTICE_SHELL_STYLES）—— 页面级提示的排版只有那几套 token 说了算。
    //
    // ⚠️ 为什么不再是写死的字面量：token 整体调一档时，写死的字面量会集体变红，
    // 而下一个人很可能去「修」本来没坏的 token，把一次有意的调档变成无声的回滚。
    // 从 token 推之后，这条断言问的仍是同一件事 ——
    // 「**渲染出来**的排版**符合 token**吗」——
    // 只是期望值不再抄第二遍。
    const pill = tokens.NOTICE_PILL_TOKENS;
    const card = tokens.NOTICE_CARD_TOKENS;
    const badge = tokens.BADGE_STYLES;

    expect(normal.pill.color, '胶囊文字色').toBe(computedColor(pill.color));
    expect(normal.pill['background-color'], '胶囊底板').toBe(computedColor(pill['background-color']));
    expect(normal.pill['font-size'], '胶囊字号').toBe(pill['font-size']);
    expect(normal.pill['border-radius'], '胶囊圆角').toBe(pill['border-radius']);
    expect(normal.pill.padding, '胶囊内边距').toBe(computedPadding(pill));
    expect(normal.pill.position, '胶囊必须固定定位').toBe(tokens.NOTICE_SHELL_STYLES.position);
    // 层级：页面级提示排在 live region **之下**（以前两者挤在同一个值上，
    // 五个浮层全部同层，彼此可能互相盖住）。见 runtimeStyles.ts 的 z-index 阶梯。
    expect(normal.pill['z-index'], '胶囊层级').toBe(String(tokens.NOTICE_Z_INDEX));
    // ⚠️ 这条**不是** token 值：显形时的不透明度由 showNotice 写死为 1
    // （外壳里的初始值是 0）。它守的是「淡入之后它真的可见」。
    expect(normal.pill.opacity, '胶囊显形时必须完全不透明').toBe('1');

    expect(normal.badge['font-size'], '角标字号').toBe(badge['font-size']);
    expect(normal.badge['background-color'], '角标底板').toBe(computedColor(badge['background-color']));
    expect(normal.badge['border-radius'], '角标圆角').toBe(badge['border-radius']);
    expect(normal.badge.padding, '角标内边距').toBe(computedPadding(badge));
    expect(normal.badge.opacity, '角标必须完全不透明').toBe(badge.opacity);

    expect(normal.hint['font-size'], '引导字号').toBe(card['font-size']);
    expect(normal.hint['background-color'], '引导底板').toBe(computedColor(card['background-color']));
    expect(normal.hint['border-radius'], '引导圆角').toBe(card['border-radius']);
    // ⚠️ 引导的**右边**比卡片 token 宽：右上角有个关闭按钮（×），
    // 要给它腾位置（见 NOTICE_CARD_TOKENS 的 `padding-right: 26px`）。
    // 左右不对称是**故意的**，不是手滑 —— 断言把它写清楚，
    // 下次谁看到「padding 不对称」才不会以为是个 bug 而"顺手修平"。
    expect(normal.hint.padding, '引导内边距（右边给关闭按钮腾位）').toBe(computedPadding(card));

    expect(normal.takeover['font-size'], '接管提示字号').toBe(pill['font-size']);
    expect(normal.takeover['background-color'], '接管提示底板').toBe(computedColor(pill['background-color']));
    expect(normal.takeover['border-radius'], '接管提示圆角').toBe(pill['border-radius']);
    expect(normal.takeover.padding, '接管提示内边距').toBe(computedPadding(pill));
    expect(normal.takeover.position, '接管提示必须固定定位').toBe(tokens.NOTICE_SHELL_STYLES.position);

    // ⚠️ 三个页面级提示必须共用**同一副嗓子**（字号 / 字重 / 行高 / 字体族）——
    // 这是「一套视觉语言」这条不变式在**真实浏览器**里的守卫。
    //
    // 为什么要有这一组**关系式**断言：上面那些是「设计值」断言（期望值从 token 推），
    // 它们会随 token 有意变动而一起动；这一组是「不变式」断言，它问的是
    // 「胶囊 / 引导 / 接管提示还是不是同一副嗓子」——
    // token 整体调一档字号时它照样绿，而任何一处**单独**跑偏它就红。
    //
    // 单元测试（src/content/noticeTokens.test.ts）守的是 token 本身；
    // 这里守的是「真的渲染出来是这样」—— token 对了但某个模块没接上，
    // 只有这一层能发现。
    expect(normal.pill['font-size'], '胶囊与引导必须同字号').toBe(normal.hint['font-size']);
    expect(normal.takeover['font-size'], '接管提示与胶囊必须同字号').toBe(
      normal.pill['font-size'],
    );
    expect(normal.pill['font-weight'], '胶囊与引导必须同字重').toBe(normal.hint['font-weight']);
    expect(normal.pill['line-height'], '胶囊与引导必须同行高').toBe(normal.hint['line-height']);
    expect(normal.pill['font-family'], '胶囊与引导必须同字体族').toBe(
      normal.hint['font-family'],
    );
    expect(normal.takeover['font-family'], '接管提示与胶囊必须同字体族').toBe(
      normal.pill['font-family'],
    );
    // 但角标是**更小的一档**（它是「钉在视频上的读数」，不是通知）。
    expect(
      parseFloat(normal.badge['font-size']),
      '角标必须比胶囊小一档 —— 字号阶梯只有两档',
    ).toBeLessThan(parseFloat(normal.pill['font-size']));

    // 字体：站点的 hostile CSS 会把它换成 Comic Sans。
    expect(normal.pill['font-family'].toLowerCase(), '字体不能被站点换掉').not.toContain('comic');
    expect(normal.hint['font-family'].toLowerCase(), '字体不能被站点换掉').not.toContain('comic');
    expect(normal.takeover['font-family'].toLowerCase(), '字体不能被站点换掉').not.toContain('comic');
    expect(normal.badge['font-family'].toLowerCase(), '字体不能被站点换掉').not.toContain('comic');

    // ⚠️ 另一条铁律：**写在这五个提示上的内联样式都必须带 !important**。
    // 隔离底座里的 `all: initial !important` 会把普通的内联声明整个抹掉 ——
    // 少了 !important，连位置都会一起没掉（left/bottom 被打回 auto）。
    ['pill', 'state', 'hint', 'takeover'].forEach((key) => {
      expectAllImportant(normal.priorities[key], `正常页面 / ${key}`);
      expectAllImportant(hostile.priorities[key], `恶意页面 / ${key}`);
    });
  });

  test('常驻角标在白色画面上仍然过 WCAG AA（实测像素）', async () => {
    test.setTimeout(120_000);

    const tokens = await loadDesignTokens();
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, topLevelNoticePage(false));
      await page.goto('https://vsc-badge-contrast.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

      await page.keyboard.press('=');
      await expect
        .poll(
          () =>
            page.evaluate(() => document.getElementById('vsc-speed-toast')?.textContent ?? ''),
          { timeout: 10_000 },
        )
        .toBe('1.1x');

      // 等常驻角标（胶囊淡出后 3 秒）。
      // 期望的字号取自角标自己的样式（BADGE_STYLES），不写死。
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const toast = document.getElementById('vsc-speed-toast');
              return toast ? getComputedStyle(toast).fontSize : '';
            }),
          { timeout: 20_000 },
        )
        .toBe(tokens.BADGE_STYLES['font-size']);

      const badge = await page.evaluate(() => {
        const toast = document.getElementById('vsc-speed-toast');
        const rect = toast.getBoundingClientRect();
        const style = getComputedStyle(toast);
        return {
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      });

      // 1) 底板与文字：把浏览器算出来的 rgba 底板合成到**白底**上。
      //    这是「白色视频上」最严的那个场景（底板越亮，文字越难读）。
      const plate = parseColor(badge.backgroundColor);
      const text = parseColor(badge.color);
      expect(plate, '角标底板必须是可解析的颜色').not.toBeNull();
      expect(text, '角标文字色必须是可解析的颜色').not.toBeNull();

      const overWhite = compositeOver(plate, plate[3], [255, 255, 255]);
      const overBlack = compositeOver(plate, plate[3], [0, 0, 0]);
      const worstCase = contrastRatio(overWhite.slice(0, 3), text.slice(0, 3));

      // WCAG AA 正文：4.5:1。
      expect(
        worstCase,
        `角标文字与底板在白底上的对比度只有 ${worstCase.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
      // 顺手把两个极端都记下来（报告里要引这两个数）。
      expect(contrastRatio(overBlack.slice(0, 3), text.slice(0, 3))).toBeGreaterThanOrEqual(4.5);

      // 2) 实测像素：角标**真的**画在了那块白底上。
      //    取左侧内边距里的一个点（那里没有字，只有底板）。
      const shot = await page.screenshot({ type: 'png' });
      const pixel = readPixel(
        shot,
        Math.round(badge.rect.left) + 2,
        Math.round(badge.rect.top + badge.rect.height / 2),
      );
      expect(pixel, '必须能取到角标底板的像素').not.toBeNull();

      const measured = contrastRatio(pixel, text.slice(0, 3));
      expect(
        measured,
        `角标底板实测颜色 rgb(${pixel.join(',')}) 与文字的对比度只有 ${measured.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
      // 底板必须真的是「很深的灰」而不是站点打进来的别的颜色。
      expect(Math.max(...pixel), '角标底板必须是深色').toBeLessThan(100);
    } finally {
      await ext.close();
    }
  });

  test('prefers-reduced-motion 仍然关得掉提示的淡入淡出', async () => {
    test.setTimeout(120_000);

    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await serve(page, topLevelNoticePage(false));
      await page.goto('https://vsc-reduced-motion.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

      const transitionDuration = (id) =>
        page.evaluate((selector) => {
          const element = document.getElementById(selector);
          return element ? getComputedStyle(element).transitionDuration : '';
        }, id);

      // 首次引导：它自己带一个自定义的淡入时长（220ms）。
      await expect
        .poll(
          () => page.evaluate(() => Boolean(document.getElementById('vsc-first-run-hint'))),
          { timeout: 20_000 },
        )
        .toBe(true);
      expect(
        await transitionDuration('vsc-first-run-hint'),
        '减少动效时首次引导的过渡必须被整个关掉',
      ).toBe('0s');

      // 调速胶囊：共用外壳那份时长（160ms）。
      await page.keyboard.press('=');
      await expect
        .poll(
          () =>
            page.evaluate(() => document.getElementById('vsc-speed-toast')?.textContent ?? ''),
          { timeout: 10_000 },
        )
        .toBe('1.1x');

      // 提示的 transition 写在**带 !important 的内联样式**里，媒体查询直接改它
      // 是改不动的 —— 时长必须走自定义属性才关得掉。
      expect(
        await transitionDuration('vsc-speed-toast'),
        '减少动效时调速胶囊的过渡必须被整个关掉',
      ).toBe('0s');
    } finally {
      await ext.close();
    }
  });
});
