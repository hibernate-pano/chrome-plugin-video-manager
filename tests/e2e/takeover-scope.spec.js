import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { SD_4X3_MP4_BASE64 } from './fixtures/sd-4x3.ts';
import { launchExtension } from './helpers/launch.js';

/**
 * 「接管范围」：扩展到底对哪个视频生效。
 *
 * 这条规则是 6.0.9 最重要的一次行为变更。以前只要页面上存在任何 <video>，
 * 空格/方向键/0/=/- 就在**整页**生效 —— 用户在读长文（页面里嵌了个静音的
 * 自动播放预览视频），按空格翻页结果视频跳了。这是唯一会让人直接卸载的问题。
 *
 * 判定规则（见 src/content/videoRegistry.ts 的 isWatchedVideo）：
 *   可见 + 在视口里 + 不是「装饰性自动播放视频」+ 够大
 *   —— 或：用户 10 秒内亲手选过它 / 站点点名的主播放器
 *
 * 为什么必须用**真实浏览器**测：这套规则的每一档判据都依赖布局引擎
 * （rect、clientWidth、视口尺寸）。jsdom 里这些全是 0，测出来的只是
 * 「早退分支」的行为 —— 恰恰是最容易骗过人的那种。
 * 尤其讽刺的是：曾经用「元素的 computed display 是否为空」来判断「有没有布局」，
 * 而我们自己注入的 runtimeStyles 里有 `.vsc-page-fullscreen-video { display: block }`
 * —— 一进全屏判定就翻转，快捷键在全屏里彻底失灵。这个 bug 只有真浏览器能测出来。
 */

const serve = (page, body, contentType = 'text/html') =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    // 视频必须**有源**才能真的播起来（没有源时 paused 恒为 true）。
    // 用真实的 mp4 素材，不 mock —— mock 只在页面世界生效，
    // 而内容脚本跑在隔离世界，读到的是真实的 media 状态。
    if (url.endsWith('.mp4')) {
      return route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: Buffer.from(SD_4X3_MP4_BASE64, 'base64'),
      });
    }
    return route.fulfill({ status: 200, contentType, body });
  });

/** 页面里记录自己收到的按键 —— 用来判断扩展到底吞没吞。 */
const PAGE_WATCHES_KEYS = `<script>
window.__seen = [];
window.addEventListener('keydown', (e) => window.__seen.push(e.key));
<\/script>`;

test.describe('接管范围：只对「用户正在看的」视频生效', () => {
  test('文章页里嵌的静音自动播放预览：快捷键必须穿透给页面', async () => {
    // 这就是那个「用户按空格翻页结果视频跳了」的场景。
    // 预览视频的形状：autoplay + 静音 + 没有原生 controls。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:480px;height:270px;background:#222}</style>
${PAGE_WATCHES_KEYS}</head><body>
<p>这是一篇很长的文章，用户正在读字。</p>
<video id="preview" autoplay muted playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      // 前置条件：这个视频确实**自动播起来过** —— 否则这条用例是空转。
      //
      // 用的素材只有 0.52 秒长，播完就 ended 了，所以不能断言「此刻在播」
      // （那要求在几百毫秒内采样，脆得很）。断言的是「自动播放确实发生了」：
      // currentTime 前进过，且 ended 为真。
      const autoplayed = await page.evaluate(() => {
        const v = document.getElementById('preview');
        return { currentTime: v.currentTime, ended: v.ended, hasAutoplay: v.hasAttribute('autoplay') };
      });
      expect(autoplayed.hasAutoplay, '前置条件：视频应带 autoplay 属性').toBe(true);
      expect(
        autoplayed.currentTime,
        '前置条件：视频应已自动播放过（currentTime 前进过）',
      ).toBeGreaterThan(0);
      expect(autoplayed.ended, '前置条件：0.52 秒的素材应已播完').toBe(true);

      await page.keyboard.press('Space');
      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('preview').playbackRate,
        seen: window.__seen,
      }));

      expect(state.rate, '装饰性自动播放视频不该被调速').toBe(1);
      expect(state.seen, '按键必须完整穿透给页面').toEqual([' ', '=']);
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('用户亲手点过的预览视频：仍然接管（用户的手势高于一切推断）', async () => {
    // 用户点了它 —— 那它就是用户的目标，此刻按 f 应该进全屏。
    // 哪怕它仍然是「装饰性自动播放视频」的形状。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:480px;height:270px;background:#222}</style>
</head><body>
<video id="preview" autoplay muted playsinline></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await page.locator('#preview').click();
      await page.waitForTimeout(200);

      await page.keyboard.press('f');
      await page.waitForTimeout(500);

      const overlay = await page.evaluate(
        () => Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
      );
      expect(overlay, '用户点过的视频应能被接管（进全屏）').toBe(true);
    } finally {
      await ext.close();
    }
  });

  test('页面上的正经播放器（有原生控件、够大）：必须接管', async () => {
    // 对照组：确保上一条不是「扩展在所有页面上都不管用了」。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:960px;height:540px;background:#000}</style>
</head><body>
<video id="player" controls playsinline></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const rate = await page.evaluate(() => document.getElementById('player').playbackRate);
      expect(rate, '够大的正经播放器必须被接管').toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('进入全屏后快捷键依然生效（布局判据不能被自己的样式翻转）', async () => {
    // 回归守卫：曾经用「元素的 computed display 是否为空」判断「有没有布局引擎」，
    // 而扩展自己注入的 runtimeStyles 里有
    // `.vsc-page-fullscreen-video { display: block }` ——
    // 一进全屏，判定从「无布局」翻成「有布局」，接着所有 rect 判定（此时为 0）
    // 开始生效，视频被判成「看不见」→ **全屏里快捷键彻底失灵**。
    // 这个 bug 只有真实浏览器能测出来（jsdom 里 display 本来就是空的）。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:960px;height:540px;background:#000}</style>
</head><body>
<video id="player" controls playsinline></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await page.keyboard.press('f');
      await expect
        .poll(() => page.evaluate(
          () => Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
        ))
        .toBe(true);
      await page.waitForTimeout(300);

      // 全屏里按 = 必须仍然改得到速度。
      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const rate = await page.evaluate(() => document.getElementById('player').playbackRate);
      expect(rate, '全屏里快捷键必须仍然生效').toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('带 controls 的自动播放视频进全屏后：快捷键依然生效', async () => {
    // 回归守卫（真实浏览器才测得出来）。
    //
    // 「装饰性自动播放视频」的判据之一是「没有原生 controls」。而进网页全屏时
    // 我们会 `video.controls = false`（用自制控制条取代原生控件）——
    // 这会**反射性地移除 controls 属性**。于是：
    //   进全屏前：有 controls → 不是装饰视频 → 接管
    //   进全屏后：controls 属性没了 → 变成「装饰视频」→ **快捷键彻底失灵**
    //
    // 实测：进全屏后按 `=` 速度纹丝不动，退出全屏后又好了。
    // 症状极像「全屏里快捷键坏了」，但根因在接管范围的判定上。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:960px;height:540px;background:#000}</style>
</head><body>
<video id="player" controls autoplay muted playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      // 前置条件：进全屏前快捷键是好的（否则这条用例测不到那个 bug）。
      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const before = await page.evaluate(() => document.getElementById('player').playbackRate);
      expect(before, '前置条件：进全屏前快捷键应生效').toBeCloseTo(1.1, 2);

      await page.keyboard.press('f');
      await expect
        .poll(() => page.evaluate(
          () => Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
        ))
        .toBe(true);
      await page.waitForTimeout(300);

      // 前置条件：我们确实把 controls 弄掉了（这是 bug 的触发条件）。
      const inFullscreen = await page.evaluate(() => {
        const v = document.getElementById('player');
        return { hasControls: v.hasAttribute('controls'), inStage: Boolean(v.closest('#vsc-page-fullscreen-stage')) };
      });
      expect(inFullscreen.hasControls, '前置条件：进全屏后 controls 属性应已被移除').toBe(false);
      expect(inFullscreen.inStage, '前置条件：视频应已搬进 stage').toBe(true);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const after = await page.evaluate(() => document.getElementById('player').playbackRate);
      expect(after, '全屏里快捷键必须仍然生效（controls 被我们自己弄掉了）').toBeCloseTo(1.2, 2);
    } finally {
      await ext.close();
    }
  });

  test('页面调用 video.focus() 不能把预览视频伪装成「用户选过」', async () => {
    // 实测（真实 Chrome）：页面脚本调 `video.focus()` 会让浏览器派发一个
    // `focusin`，而它的 **isTrusted 是 true** —— 这个事件是**浏览器自己**生成的，
    // 不是页面 dispatch 的。所以 isTrusted 那道防线挡不住它。
    //
    // 后果：文章页里那个小小的预览视频，页面加载后 focus 一下自己，
    // 就被当成了「用户亲手选过的」→ 快捷键照旧被接管 —— 本轮要修的问题原样回来。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:240px;height:135px;background:#222}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="preview" autoplay muted playsinline tabindex="0" src="/sd-4x3.mp4"></video>
<script>
  // 页面在加载后把自己的预览视频 focus 一下 —— 模拟「用户选中」
  setTimeout(() => document.getElementById('preview').focus(), 300);
<\/script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(900);

      // 前置条件：页面真的 focus 成功了。
      const focused = await page.evaluate(
        () => document.activeElement === document.getElementById('preview'),
      );
      expect(focused, '前置条件：页面应已把焦点移到预览视频上').toBe(true);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('preview').playbackRate,
        seen: window.__seen,
      }));
      expect(state.rate, '页面 focus 不该让预览视频被接管').toBe(1);
      expect(state.seen, '按键必须穿透给页面').toEqual(['=']);
    } finally {
      await ext.close();
    }
  });

  test('几乎完全在视口外的视频：不该被接管', async () => {
    // 「在视口里」不能只看「有一像素重叠」。旧实现是
    // `rect.bottom > 0 && rect.top < height` —— 视频只要露出 1 像素就算在视口里。
    // 实测：视频顶部在视口底边内 2px（98% 在视口外）时，它照样被接管 ——
    // 而用户根本看不到它。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#spacer{height:718px}video{width:960px;height:540px;background:#000}</style>
${PAGE_WATCHES_KEYS}</head><body>
<div id="spacer"></div>
<video id="below" controls playsinline></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      // 前置条件：视频只有约 0.4% 露在视口里。
      const geo = await page.evaluate(() => {
        const r = document.getElementById('below').getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        return { top: r.top, height: r.height, visibleFraction: (visible * r.width) / (r.width * r.height) };
      });
      expect(
        geo.visibleFraction,
        '前置条件：视频露出视口的比例应极小（不到 1%）',
      ).toBeLessThan(0.01);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('below').playbackRate,
        seen: window.__seen,
      }));
      expect(state.rate, '几乎看不见的视频不该被接管').toBe(1);
      expect(state.seen, '按键必须穿透给页面').toEqual(['=']);
    } finally {
      await ext.close();
    }
  });

  test('视口里只有一个小预览时：按键穿透，不接管', async () => {
    // 尺寸也是一道排除线：240×135 在 1280×720 的视口里占 3.5%。
    // 这个视频没有 autoplay 属性（不是「装饰性自动播放」的形状），
    // 靠的是尺寸把它挡下来。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:240px;height:135px;background:#222}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="tiny" controls playsinline></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('tiny').playbackRate,
        seen: window.__seen,
      }));
      expect(state.rate, '太小的视频不该被接管').toBe(1);
      expect(state.seen, '按键必须穿透给页面').toEqual(['=']);
    } finally {
      await ext.close();
    }
  });
});

/**
 * 「显式操作」路径（点工具栏图标）。
 *
 * ⚠️ 这条路径此前**完全没有** E2E 覆盖，而本轮查出的三个真实缺陷里有
 * 两个就发生在这条路径上 —— 单元测试守不住它们（jsdom 里没有布局引擎，
 * 而这两个缺陷都依赖真实的布局与事件语义）。
 *
 * 两条契约（「图标=显式」「快捷键=隐式」）必须**共用同一套候选过滤与打分**，
 * 否则用户会看到「按 = 改的是 A、点图标进的是 B」—— 那比「两者都错」更让人困惑。
 */
test.describe('接管范围：工具栏图标路径', () => {
  // 每条用例都要**真的**启动一个带扩展的浏览器（内容脚本在隔离世界里，
  // page.evaluate 改不到它）。整机跑完整套 E2E 时机器负载高，
  // 30 秒的默认超时不够 —— 与 subtitle-visibility.spec.js 同样处理。
  test.setTimeout(60_000);

  /** 找当前标签页的 id（launchPersistentContext 会自带一个空白页）。 */
  const currentTabId = (ext) => ext.serviceWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url?.startsWith('http://127.0.0.1'))?.id ?? null;
  });

  /** 点工具栏图标（经 background 转发成内容脚本消息）。 */
  const clickToolbarIcon = async (ext, tabId) => {
    await ext.serviceWorker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, { type: 'vsc-toggle-fullscreen' });
    }, tabId);
    await new Promise((resolve) => setTimeout(resolve, 900));
  };

  /** 当前被搬进全屏 stage 的是哪个视频。 */
  const fullscreenTarget = (page) => page.evaluate(() => {
    const stage = document.getElementById('vsc-page-fullscreen-stage');
    return stage?.querySelector('video')?.id ?? null;
  });

  test('图标路径与快捷键路径必须指向同一个视频', async () => {
    // 实测（修复前）：1600×900 暂停的主播放器 + 1920×1080 正在播的
    // 装饰性自动播放预览 —— 按 `=` 改的是主视频（对），
    // 点工具栏图标进全屏进的却是那个预览（错）。
    //
    // ⚠️ 预览必须**比主视频得分更高**（靠「正在播」+ 更大的面积），
    // 否则即使图标路径完全不筛装饰性视频，它也会选主视频 ——
    // 那这条用例就成了恒真的假守卫。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#main{width:1600px;height:900px;background:#000}#prev{width:1920px;height:1080px;background:#222}</style>
</head><body>
<video id="main" controls playsinline></video>
<video id="prev" autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(900);

      // 前置条件：预览确实在播、主视频确实暂停着。
      const state = await page.evaluate(() => ({
        prevPaused: document.getElementById('prev').paused,
        mainPaused: document.getElementById('main').paused,
      }));
      expect(state.prevPaused, '前置条件：预览应该在播').toBe(false);
      expect(state.mainPaused, '前置条件：主视频应该暂停着').toBe(true);

      // 快捷键路径。
      await page.keyboard.press('=');
      await page.waitForTimeout(400);
      const rates = await page.evaluate(() => ({
        main: document.getElementById('main').playbackRate,
        prev: document.getElementById('prev').playbackRate,
      }));
      expect(rates.main, '快捷键路径应该改主视频').toBeCloseTo(1.1, 2);
      expect(rates.prev, '快捷键路径不该碰装饰性预览').toBe(1);

      // 工具栏图标路径。
      const tabId = await currentTabId(ext);
      expect(tabId).not.toBeNull();
      await clickToolbarIcon(ext, tabId);

      expect(
        await fullscreenTarget(page),
        '图标路径必须与快捷键路径指向同一个视频',
      ).toBe('main');
    } finally {
      await ext.close();
    }
  });

  test('被站点藏起来的视频：图标路径不该接管它', async () => {
    // 实测（修复前）：用户点过视频 → 站点随后把它 display:none →
    // 图标路径仍然接管它 → overlay 起来了，里面却是空的
    // （视频甚至没被搬进 stage，因为它 display:none，搬不动）。
    //
    // 根因：豁免可见性过滤用的字段**永不过期**，而且会被自动播放改写。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:960px;height:540px;background:#000}.hide{display:none !important}</style>
</head><body>
<video id="v" controls playsinline></video>
<script>setTimeout(() => document.getElementById('v').classList.add('hide'), 2000);<\/script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      // 用户点了它。
      await page.locator('#v').click();
      await page.waitForTimeout(2600);

      const hidden = await page.evaluate(
        () => getComputedStyle(document.getElementById('v')).display,
      );
      expect(hidden, '前置条件：视频应已被站点隐藏').toBe('none');

      const tabId = await currentTabId(ext);
      await clickToolbarIcon(ext, tabId);

      expect(
        await fullscreenTarget(page),
        '被藏起来的视频不该被接管（overlay 会是空的）',
      ).toBeNull();
    } finally {
      await ext.close();
    }
  });

  test('页面自己 focus 视频：图标路径不该被它抢走', async () => {
    // 实测：页面脚本调 `video.focus()` 会让浏览器派发一个 focusin，
    // 而它的 **isTrusted 是 true**（这个事件是**浏览器**生成的）——
    // isTrusted 那道防线挡不住它。
    //
    // 后果：页面 focus 一下自己的视频，就把「用户刚碰过的视频」抢走了，
    // 而那个字段带全场最高的权重（+10000）→ 图标路径接管了错误的视频。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#main{width:1000px;height:600px;background:#000}#other{width:240px;height:135px;background:#222}</style>
</head><body>
<video id="main" controls playsinline></video>
<video id="other" controls playsinline tabindex="0"></video>
<script>setTimeout(() => document.getElementById('other').focus(), 300);<\/script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(1000);

      const focused = await page.evaluate(
        () => document.activeElement?.id ?? null,
      );
      expect(focused, '前置条件：页面应已把焦点移到另一个视频上').toBe('other');

      const tabId = await currentTabId(ext);
      await clickToolbarIcon(ext, tabId);

      expect(
        await fullscreenTarget(page),
        '页面自己 focus 的视频不该抢走最高优先级',
      ).toBe('main');
    } finally {
      await ext.close();
    }
  });

  test('用户点开的小卡片视频：10 秒窗口过了仍然接管', async () => {
    // 短视频信息流里的卡片视频只有 320×180 —— 过不了绝对尺寸线（480×270），
    // 也过不了比例线（320×180 在 1280×720 里只占 6.25%）。
    // 用户点开它、它开始播，10 秒窗口一过就彻底失灵。
    //
    // 实测（修复前）：点开后 11 秒按 `=`，速度纹丝不动 ——
    // 而视频明明还在播、用户明明在看它。用户只会得出「扩展坏了」。
    //
    // 修法：加一档「用户选过它 **且** 它还在播」，窗口放宽到 60 秒。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:320px;height:180px;background:#000}</style>
</head><body>
<video id="grid" controls loop playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      // 用户点开它。
      await page.locator('#grid').click();
      await page.waitForTimeout(600);

      // 前置条件：它确实在播（否则测的不是「还在播」这一档）。
      const playing = await page.evaluate(
        () => !document.getElementById('grid').paused,
      );
      expect(playing, '前置条件：卡片视频应该在播').toBe(true);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const early = await page.evaluate(
        () => document.getElementById('grid').playbackRate,
      );
      expect(early, '刚点过时必须能调速').toBeCloseTo(1.1, 2);

      // 等 10 秒窗口过去。
      await page.waitForTimeout(11_000);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const later = await page.evaluate(
        () => document.getElementById('grid').playbackRate,
      );
      expect(
        later,
        '用户点开且还在播的小卡片视频，10 秒后仍必须能调速',
      ).toBeCloseTo(1.2, 2);
    } finally {
      await ext.close();
    }
  });
});
