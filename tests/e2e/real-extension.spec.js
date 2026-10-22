import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';
import { anyLocaleFragment } from './helpers/i18n.js';

// VSC_EXTENSION_DIR 可以指向别的构建目录（例如故意改坏的副本），
// 默认测 dist/。走环境变量而不是硬编码，是为了让「变异验证」能在不碰源码的前提下跑。
/**
 * 服务测试页：内容脚本跑在隔离世界，用 evaluate 改不到它，只能从页面可见结果断言。
 *
 * 辅助函数全部放 <head> 且惰性取节点：内容脚本在 document_start 就注入样式，
 * waitForSelector 会在 <body> 内联脚本执行之前返回，辅助函数若定义在 body 就会
 * 和这个等待形成竞态（曾经真的偶发失败过一次）。
 */
const testHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc real ext</title>
<style>body{margin:0}video{width:480px;height:270px;background:#000}</style>
<script>
  window.__rate = () => document.getElementById('v1').playbackRate;
  window.__dirty = false;
  // 页面自己抢一个冒泡阶段的 keydown 监听器。内容脚本的拦截跑在捕获阶段，
  // 若它真的抢到了 window 捕获的最前位，这条永远不该被看到。
  window.addEventListener('keydown', (e) => { if (e.key === '7') window.__dirty = true; });
<\/script>
</head><body>
<video id="v1" width="480" height="270" muted playsinline></video>
</body></html>`;

/**
 * 只劫持页面请求。扩展的内容脚本是靠动态 import 拉 chrome-extension://.../content.js
 * 的，那个请求一旦也被 fulfill 成 text/html，MIME 严格检查会直接让 import 失败。
 */
const serveHtml = async (page, html) => {
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith('chrome-extension://')) {
      return route.continue();
    }

    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
};

/**
 * 一段**真的**能播、真的能 seek 的 10 秒视频（内联成 data URI）。
 *
 * 为什么必须要真的媒体：`paused` / `currentTime` 是**原生 DOM 属性**，
 * 内容脚本在隔离世界里改它们，页面主世界读得到 —— 这正是跨世界可观测的量。
 * 反过来，`Object.defineProperty(video, 'play', ...)` 这类改写**只在定义它的
 * 那个世界里可见**（隔离世界有自己的一层 wrapper），所以主世界挂的假 play/pause
 * 钩子根本观测不到扩展干了什么。真的媒体没有这个问题。
 *
 * 为什么内联而不是走 http://127.0.0.1:4173：测试页是 https://example.com/，
 * 去 http 取资源会被浏览器按「混合内容」拦掉。
 */
const clipDataUri = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

/**
 * 派发一个**带自动重复标记**的按键。
 *
 * Playwright 的 keyboard.press() 造不出 `repeat: true` 的事件 ——
 * 而浏览器按住不放时派发的正是那种（`event.repeat === true`）。
 * CDP 的 `Input.dispatchKeyEvent` 带 `autoRepeat: true` 是唯一能造出来的路子，
 * 而且它是**浏览器自己派发**的事件（isTrusted 为 true），扩展会真的当它处理。
 *
 * ⚠️⚠️ **绝对不要传 `nativeVirtualKeyCode`** ——
 * 那是这个 helper 里最贵的一个参数，代价不是「慢」，是「塌」。
 *
 * 实测（真实 Chromium + CDP，A/B 对照）：
 *   带 `nativeVirtualKeyCode` → 1.5 秒里灌进页面 **1.8 万个 keydown**
 *   不带                    → 1.5 秒里 **1 个** keydown
 *
 * 机制：带上它，浏览器就把这个按键当成「用户真的按住了」——
 * 自己的按键重复生成器随即开工，而它**不是**按操作系统的节奏（30 次/秒），
 * 而是**按渲染器能确认多快就多快**（实测上万次/秒）。
 * 补一个 `keyUp` 也停不下来（实测补了之后照样每秒 5000+）。
 *
 * 后果是整条链路一起塌：
 * - 扩展的每个 keydown 都要重扫整页视频列表 → 渲染器主线程被占满；
 * - 于是 seek / 全屏这些动作全部排队，CDP 往返实测到 **37 秒**；
 * - 这条用例会跑到 100 秒以上，而扩展「用户选过它」的证据只保留 60 秒 ——
 *   视频不再被认作接管目标，seek 静默失效，断言超时。
 *   **失败原因与产品无关**，但症状看起来像产品坏了。
 *
 * 只传 `windowsVirtualKeyCode` 就够：它只影响 DOM 里那个已废弃的
 * `event.keyCode`，而扩展匹配快捷键用的是 `event.key`（见 keyboardController）。
 */
const dispatchKey = async (client, key, { autoRepeat = false } = {}) => {
  const info = {
    ' ': { code: 'Space', keyCode: 32, text: ' ' },
    ArrowRight: { code: 'ArrowRight', keyCode: 39, text: '' },
    f: { code: 'KeyF', keyCode: 70, text: 'f' },
  }[key];

  await client.send('Input.dispatchKeyEvent', {
    type: autoRepeat ? 'rawKeyDown' : 'keyDown',
    key,
    code: info.code,
    windowsVirtualKeyCode: info.keyCode,
    text: autoRepeat ? '' : info.text,
    autoRepeat,
  });

  if (!autoRepeat) {
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
    });
  }
};

test.describe('真实扩展运行时', () => {
  test('内容脚本在隔离世界注入样式，并能响应速度快捷键', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, testHtml);
      await page.goto('https://example.com/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

      await page.locator('#v1').click();
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
      });

      // 步进调速：= 加速、- 减速
      await page.keyboard.press('=');
      await expect.poll(() => page.evaluate(() => window.__rate())).toBeCloseTo(1.1, 2);
      await page.keyboard.press('=');
      await expect.poll(() => page.evaluate(() => window.__rate())).toBeCloseTo(1.2, 2);
      await page.keyboard.press('-');
      await expect.poll(() => page.evaluate(() => window.__rate())).toBeCloseTo(1.1, 2);

      // 0 键重置
      await page.keyboard.press('0');
      await expect.poll(() => page.evaluate(() => window.__rate())).toBe(1);

      // 页面主世界的自定义键 7 不该被内容脚本动到
      await page.keyboard.press('7');
      await expect.poll(() => page.evaluate(() => window.__dirty)).toBe(true);
    } finally {
      await ext.close();
    }
  });

  test('内容脚本不会打断页面自身的输入框打字', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const html = testHtml.replace(
        '</body>',
        '<input id="txt" /></body>',
      );
      await serveHtml(page, html);
      await page.goto('https://example.com/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

      await page.locator('#txt').fill('');
      await page.locator('#txt').pressSequentially('0123456789');
      await expect.poll(() => page.locator('#txt').inputValue()).toBe('0123456789');
      // 打字期间数字键属于输入框，速度必须还是 1
      await expect.poll(() => page.evaluate(() => window.__rate())).toBe(1);
    } finally {
      await ext.close();
    }
  });

  /**
   * v5.2.1 那个提交修的就是这件事：页面脚本抢在前面 stopImmediatePropagation 把按键吞掉。
   * 这里让页面在 document_start 就注册一个捕获阶段的吞键监听器 —— 它一定注册得比
   * content-loader 晚，所以内容脚本必须仍然先拿到事件。
   */
  test('页面脚本用 stopImmediatePropagation 抢键也抢不过内容脚本', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>
        window.__rate = () => document.getElementById('v1').playbackRate;
        window.__swallowed = 0;
        window.addEventListener('keydown', (e) => {
          window.__swallowed += 1;
          e.preventDefault();
          e.stopImmediatePropagation();
        }, true);
      <\/script></head><body>
        <video id="v1" width="480" height="270" muted></video>
      </body></html>`;

      await serveHtml(page, html);
      await page.goto('https://example.com/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
      });

      await page.keyboard.press('=');
      // 无论页面吞不吞键，内容脚本都必须已经改掉速度
      await expect.poll(() => page.evaluate(() => window.__rate())).toBeCloseTo(1.1, 2);
      // 页面那个捕获监听器一次都不该被触发：内容脚本的 intercept 用了 stopImmediatePropagation
      await expect.poll(() => page.evaluate(() => window.__swallowed)).toBe(0);
    } finally {
      await ext.close();
    }
  });

  /**
   * 6.0.7 起不再记忆站点速度：任何视频进入时都从 1.0x 开始，
   * 调过的速度不该跨刷新变成隐形默认值。同时验证老用户残留的历史表被清掉。
   */
  test('调速不跨刷新继承，且残留的站点速度表被清除', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, testHtml);
      await page.goto('https://vsc-memory-test.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

      // 预置一份 6.0.6 时代留下的站点速度表，模拟老用户升级。
      const sw = ext.context.serviceWorkers()[0];
      if (sw) {
        await sw.evaluate(async () => {
          await chrome.storage.local.set({
            'vsc-site-speeds': { 'vsc-memory-test.example': 2 },
          });
        });
      }

      await page.locator('#v1').click();
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
      });

      // 从 1x 连按 5 次 = 步进到 1.5。
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('=');
      }
      await expect.poll(() => page.evaluate(() => window.__rate())).toBeCloseTo(1.5, 2);

      await page.reload();
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
        v.dispatchEvent(new Event('play'));
      });

      // 刷新后回到标准速度：用户的每一次调速都该由用户自己重新做主。
      await expect.poll(() => page.evaluate(() => window.__rate())).toBeCloseTo(1, 2);

      // 老用户机器上残留的访问记录不该继续留着。
      await expect
        .poll(async () => {
          const worker = ext.context.serviceWorkers()[0];
          if (!worker) return null;
          return worker.evaluate(async () => {
            const got = await chrome.storage.local.get('vsc-site-speeds');
            return got['vsc-site-speeds'] === undefined ? 'removed' : 'still-there';
          });
        }, { timeout: 10_000 })
        .toBe('removed');
    } finally {
      await ext.close();
    }
  });
});

/**
 * 反馈套件：扩展「什么都没发生」的时候，用户必须知道为什么。
 *
 * 这两条守的都是静默失败——按键被放行、页面毫无变化，用户眼里就是扩展坏了。
 * 注意：内容脚本跑在隔离世界，**页面主世界对 video 的改写（paused / duration /
 * play）它一概看不到**（实测：页面把 paused 覆盖成 false，扩展仍走 play 分支）。
 * 所以这里只断言「DOM 上出现了什么」，不去伪造媒体状态。
 */
test.describe('反馈：不让用户面对静默失败', () => {
  test('首次使用引导：播放一会儿后出现一次，之后不再打扰', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, testHtml);
      await page.goto('https://vsc-hint-test.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();

      // 提示必须晚于播放出现：自动播放的广告位、悬停预览都会派发 play，
      // 只按 play 就弹提示等于打扰。
      await page.evaluate(() => document.getElementById('v1').dispatchEvent(new Event('play')));
      await page.waitForTimeout(1000);
      await expect(page.locator('#vsc-first-run-hint.vsc-visible')).toHaveCount(0);

      await expect(page.locator('#vsc-first-run-hint.vsc-visible')).toHaveCount(1, { timeout: 6000 });
      // 文案必须用用户当前真实的绑定（默认 f 与 = / -），并且不教播放/暂停——
      // 用户刚刚才按过播放，那个键不需要被教。
      //
      // ⚠️ 这里断言的是**小写 f**，不是 F。
      //
      // 匹配是区分 Shift 的（event.shiftKey === modifiers.has('shift')），
      // 绑定 `f` 时按 Shift+F 根本不会触发。旧实现把单字符一律大写，
      // 界面上写着 `F` 而用户照着按大写**按了没反应**。6.0.9 起
      // 字母保持原样（见 src/shared/shortcuts.ts 的 formatShortcut）。
      //
      // 这条断言此前一直写着 'F'，与新行为不符 —— 是**断言过时**，
      // 不是实现回归。
      const text = await page.locator('#vsc-first-run-hint').textContent();
      expect(text).toContain('f');
      expect(text).not.toContain('F');

      // 调速这一行必须**说得清哪个键是哪个**。
      //
      // ⚠️ 这条断言此前写的是 `toContain('= / -')` —— 那是**旧文案**
      // 「调速 · = / -」的形状。文案后来改成了「调速 · = 加快 / - 减慢」：
      // 原来那两个键长得一模一样，用户分不清哪个是加速、哪个是减速，
      // 而按错了的代价是「速度反了」。所以断言要跟着新语义走，
      // 不能继续守着那个已经废弃的半句话。
      //
      // ⚠️ 而且**不能写死中文**：`chrome.i18n` 挑 _locales 目录跟的是**系统
      // locale**（不是 --lang，也不是浏览器界面语言），本机中文、CI runner 英文。
      // 写死中文的断言在 CI 上必红 —— 这坑本仓库踩过两次
      // （见 tests/e2e/helpers/i18n.js 的说明）。
      const speedHint = anyLocaleFragment('hintSpeed');
      expect(text).toMatch(speedHint);

      // 键**本身**也要在那一行里（默认是 = 与 -），不只是「有个方向词就算对」：
      // 方向对了但键写错了，同样是错的。
      const speedLine = text.split('\n').find((line) => speedHint.test(line));
      expect(speedLine, '引导里必须有一行同时写着两个调速键').toBeTruthy();
      expect(speedLine).toContain('=');
      expect(speedLine).toContain('-');

      // 播放/暂停不能被教：用户刚刚才按过播放，那个键他不需要被教。
      expect(text).not.toContain('Space');

      // 已经展示过 -> 落盘；重新加载后不该再出现。
      //
      // ⚠️ 6.1.0 起 flag 的落盘判据是「**用户读过了**」，不是「弹出来了」：
      // 提示出现之后还要再等一段阅读窗口（中途没被打断）才写 flag。
      // 这是 P0 修的那件事 —— 原来「弹出来就写」，于是用户在长文页面上
      // 被一个**看不见**的视频烧掉了这辈子唯一的一次提示。
      //
      // 所以这里必须**等它真的落盘**再刷新：刷新会打断阅读窗口，
      // 用户还没来得及读，那唯一一次机会就不该被消耗掉（这正是新行为）。
      const worker = ext.context.serviceWorkers()[0];
      await expect
        .poll(
          () => worker.evaluate(() => new Promise((resolve) => {
            chrome.storage.local.get(
              'vsc-first-run-hint-shown',
              (result) => resolve(result['vsc-first-run-hint-shown'] === true),
            );
          })),
          { timeout: 15_000 },
        )
        .toBe(true);

      await page.reload();
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.evaluate(() => document.getElementById('v1').dispatchEvent(new Event('play')));
      await page.waitForTimeout(3500);
      await expect(page.locator('#vsc-first-run-hint.vsc-visible')).toHaveCount(0);
    } finally {
      await ext.close();
    }
  });

  test('焦点在顶层、视频在 iframe 里：说出「视频在嵌入框里」，而不是静默', async () => {
    // ⚠️ 6.1.0 之后「同源 iframe 里的视频接管不了」是**过去式**：
    // 每个 frame 都有一份内容脚本，iframe 里的视频由**那个 frame** 接管。
    //
    // 于是 6.0.x 的那条契约（「按 f 给出接管不了的提示」）**不再成立**，
    // 而且它守的失败模式也变了：现在真正的失败是
    // 「焦点在顶层、视频在嵌入框里 → 按 f 什么都不会发生」。
    //
    // 那正是「说出真相」这条提示存在的理由。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      // 夹具见 iframe-outer.html：iframe 里的 video 属于另一个 document。
      await page.goto('/tests/e2e/iframe-outer.html');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.waitForTimeout(500);

      // 点击必须落在顶层文档：点进 iframe 会把焦点移进去，
      // 那样就变成「iframe 里的 frame 接管自己的视频」了（那条路是通的）。
      // 夹具顶部那 400px 留白就是为这一下留的。
      await page.mouse.click(200, 100);
      await page.waitForTimeout(200);

      await page.keyboard.press('f');
      await page.waitForTimeout(800);

      // 顶层 frame 看不见 iframe 里的视频 → 快捷键路径不接管 →
      // 但**必须**告诉用户视频在哪儿（否则「按了没反应」= 扩展坏了）。
      await expect(page.locator('#vsc-takeover-notice.vsc-visible')).toHaveCount(1);
      await expect(page.locator('#vsc-takeover-notice')).toHaveText(
        new RegExp('嵌入框|embedded|iframe'),
      );

      // 且**没有**真的进全屏 —— 顶层没有视频可接管。
      await expect(page.locator('#vsc-page-fullscreen-overlay.vsc-active')).toHaveCount(0);
    } finally {
      await ext.close();
    }
  });
});

/**
 * 模拟沉浸式翻译等插件注入的字幕层：它是 video 的**兄弟节点**，
 * 绝对定位、贴在视频底部（与 GitHub 上报的 imt-caption-container 形态一致）。
 *
 * 这是真实浏览器才测得出来的行为：jsdom 没有布局引擎，
 * getBoundingClientRect 全是 0，字幕的搬运与还原无法验证。
 */
const playerWithSubtitleHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc subtitle compat</title>
<style>
  body{margin:0;background:#111}
  #player{position:relative;width:640px;height:360px}
  video{width:640px;height:360px;background:#000}
  #imt-caption-container{
    position:absolute;left:15%;right:15%;bottom:8%;height:60px;
    background:rgba(0,0,0,.6);color:#fff;font:16px/1.4 sans-serif;
  }
</style>
</head><body>
<div id="player">
  <video id="v1" muted playsinline></video>
  <div id="imt-caption-container">这是双语字幕</div>
</div>
</body></html>`;

test.describe('字幕等浮层兼容性', () => {
  test('网页全屏时字幕跟着视频一起满屏，退出后回到原位', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, playerWithSubtitleHtml);
      await page.goto('https://vsc-subtitle-test.example/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.locator('#v1').click();

      await page.keyboard.press('f');
      await expect
        .poll(() => page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))), {
          timeout: 10_000,
        })
        .toBe(true);
      // 字幕必须跟着视频进入 overlay —— 留在站点播放器里就等于留在原地看不见了。
      //
      // ⚠️ 判据是 **z-index**，不是 DOM 顺序。
      //
      // 早先这里断言「字幕排在视频之后」，理由是"后画的盖住先画的"。那是错的：
      // z-index 只在**同一层叠上下文**内比较，一个 z-index:auto 的定位元素
      // 依然会输给显式高层级的视频。视频在 reparent 后带 z-index 2147483643
      // （inline !important），字幕原本是 auto —— 哪怕 DOM 顺序排在视频之后，
      // 实测字幕被 100% 盖住，一个像素都看不见。
      //
      // 字幕现在住在一个专门的定位参照物里（[data-vsc-caption-host]），
      // 那个容器与画面等大，让站点的 `bottom: %` 相对画面而不是视口算。
      const inFullscreen = await page.evaluate(() => {
        const stage = document.getElementById('vsc-page-fullscreen-stage');
        const caption = document.getElementById('imt-caption-container');
        const video = document.getElementById('v1');
        if (!stage || !caption || !video) return null;
        const host = stage.querySelector('[data-vsc-caption-host]');
        const rect = caption.getBoundingClientRect();
        return {
          captionInStage: stage.contains(caption),
          inCaptionHost: Boolean(host && host.contains(caption)),
          captionZ: Number(getComputedStyle(caption).zIndex),
          videoZ: Number(getComputedStyle(video).zIndex),
          captionVisible: rect.height > 0 && rect.width > 0,
        };
      });
      expect(inFullscreen).not.toBeNull();
      expect(inFullscreen.captionInStage, '字幕应被搬进 stage 跟随视频').toBe(true);
      expect(inFullscreen.inCaptionHost, '字幕应住在与画面等大的定位参照物里').toBe(true);
      expect(
        inFullscreen.captionZ,
        '字幕的 z-index 必须高于视频，否则被视频整个盖住（DOM 顺序不够）',
      ).toBeGreaterThan(inFullscreen.videoZ);
      // 宽度为 0 的字幕等于没字幕：字幕容器是 stage 的 flex item，
      // 尺寸塌成 0 时站点字幕的 `left:0;right:0` 相对 0 宽包含块 → 自己也变 0 宽。
      expect(inFullscreen.captionVisible, '字幕必须有真实的尺寸').toBe(true);

      await page.keyboard.press('f');
      await expect
        .poll(() => page.evaluate(() => Boolean(document.getElementById('vsc-page-fullscreen-overlay'))), {
          timeout: 10_000,
        })
        .toBe(false);

      // 退出后字幕必须回到播放器容器里、且仍在视频之后。
      const afterExit = await page.evaluate(() => {
        const player = document.getElementById('player');
        const caption = document.getElementById('imt-caption-container');
        const video = document.getElementById('v1');
        if (!player || !caption || !video) return null;
        const kids = Array.from(player.children);
        return {
          captionBackInPlayer: player.contains(caption),
          captionAfterVideo: kids.indexOf(caption) > kids.indexOf(video),
        };
      });
      expect(afterExit).not.toBeNull();
      expect(afterExit.captionBackInPlayer, '退出后字幕必须回到站点播放器').toBe(true);
      expect(afterExit.captionAfterVideo, '退出后字幕顺序必须完全恢复').toBe(true);
    } finally {
      await ext.close();
    }
  });
});

/**
 * 按住不放（浏览器自动重复的 keydown）不能重复执行动作。
 *
 * 修复前实测（真实 Chromium + 真实扩展 + CDP autoRepeat）：
 *   空格：按 1 次 + 自动重复 3 次 → 播放状态被切了 4 次（视频在闪）
 *   →  ：按 1 次 + 自动重复 3 次 → 进度多跳了 15 秒（按住一秒 ≈ 跳 150 秒）
 *   f  ：按 1 次 + 自动重复 3 次 → 全屏被退出了（进进出出地闪）
 *
 * 这三条都是「用户按住一个键」就会遇到的最常见场景，所以必须是回归守卫。
 */
test('按住不放不会重复执行动作（播放/快进/全屏）', async () => {
  // ⚠️ 这条用例曾经需要 120 秒的预算，现在不需要了 ——
  // 但原因值得写下来，因为它**看起来**像产品的性能问题。
  //
  // 曾经的症状：CDP 派发 autoRepeat 按键时，每次往返要 1~20 秒，
  // 整条用例跑 100 秒以上，最后 seek 断言超时。
  //
  // 根因不是产品，是 **CDP 的 `nativeVirtualKeyCode` 参数**：
  // 带上它，浏览器会启动自己的按键重复生成器，按「渲染器确认多快就多快」
  // 的节奏往页面里灌 keydown（实测 1.5 秒 1.8 万个）→ 渲染器主线程被占满
  // → 扩展每个 keydown 都要重扫整页视频列表，于是全链路排队。
  // 详见 dispatchKey 上面的注释。
  //
  // 去掉那个参数之后：单个按键的往返回到 **1~5 毫秒**，整条用例 3 秒跑完。
  //
  // 预算仍然放宽到 60 秒：CI（4 核）上拉起一个完整 Chromium 本来就慢，
  // 而这条用例的失败症状（超时）极具误导性 —— 宁可慢，不可假。
  test.setTimeout(60_000);
  const ext = await launchExtension();
  try {
    const page = await ext.context.newPage();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vsc repeat</title>
      <style>body{margin:0}video{width:480px;height:270px;background:#000}</style></head>
      <body><video id="v1" width="480" height="270" muted playsinline src="${clipDataUri}"></video></body></html>`;
    await serveHtml(page, html);
    await page.goto('https://example.com/');
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    await page.locator('#v1').click();
    await page.evaluate(async () => {
      const v = document.getElementById('v1');
      if (v.readyState < 1) {
        await new Promise((resolve) => {
          v.addEventListener('loadedmetadata', resolve, { once: true });
          setTimeout(resolve, 3000);
        });
      }
      await v.play().catch(() => {});
    });
    await expect.poll(() => page.evaluate(() => document.getElementById('v1').paused)).toBe(false);

    const client = await ext.context.newCDPSession(page);

    // —— 空格：切换播放/暂停 ——
    await dispatchKey(client, ' ');
    await expect.poll(() => page.evaluate(() => document.getElementById('v1').paused)).toBe(true);

    for (let i = 0; i < 3; i += 1) {
      await dispatchKey(client, ' ', { autoRepeat: true });
    }
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => document.getElementById('v1').paused),
      '按住空格时视频不能反复切换播放/暂停',
    ).toBe(true);

    // —— 方向键：快进 5 秒 ——
    await page.evaluate(async () => {
      const v = document.getElementById('v1');
      v.currentTime = 0;
      await v.play().catch(() => {});
    });
    await page.waitForTimeout(200);

    await dispatchKey(client, 'ArrowRight');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('v1').currentTime))
      .toBeGreaterThan(4);

    const afterSeek = await page.evaluate(() => document.getElementById('v1').currentTime);
    for (let i = 0; i < 3; i += 1) {
      await dispatchKey(client, 'ArrowRight', { autoRepeat: true });
    }
    await page.waitForTimeout(200);
    const afterRepeat = await page.evaluate(() => document.getElementById('v1').currentTime);
    // 允许自然播放推进，但绝不能再跳 5 秒 × 3。
    expect(
      afterRepeat - afterSeek,
      '按住方向键时不能反复快进',
    ).toBeLessThan(2);

    // —— f：进出全屏 ——
    await dispatchKey(client, 'f');
    await expect(page.locator('#vsc-page-fullscreen-overlay')).toBeVisible();

    for (let i = 0; i < 3; i += 1) {
      await dispatchKey(client, 'f', { autoRepeat: true });
    }
    await page.waitForTimeout(300);
    await expect(
      page.locator('#vsc-page-fullscreen-overlay'),
      '按住 f 时不能反复进出全屏',
    ).toBeVisible();
  } finally {
    await ext.close();
  }
});

/**
 * 焦点所在控件的键归它自己。
 *
 * 实测（真实 Chromium，修复前）：焦点落在站点自己的 range 滑块上按 →，
 * 滑块 value 纹丝不动、input 事件 0 次，而视频 currentTime 从 0 跳到 5；
 * 焦点落在站点按钮上按空格，按钮 click 次数 0，视频反而开始播放。
 */
test('焦点在站点自己的控件上时，那个控件的键不被视频抢走', async () => {
  const ext = await launchExtension();
  try {
    const page = await ext.context.newPage();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vsc focus</title>
      <style>body{margin:0}video{width:480px;height:270px;background:#000}</style></head>
      <body>
        <video id="v1" width="480" height="270" muted playsinline src="${clipDataUri}"></video>
        <input id="slider" type="range" min="0" max="100" step="1" value="40" />
        <button id="btn" type="button">站点按钮</button>
        <script>
          window.__clicks = 0;
          window.__inputs = 0;
          document.getElementById('btn').addEventListener('click', () => { window.__clicks += 1; });
          document.getElementById('slider').addEventListener('input', () => { window.__inputs += 1; });
        <\/script>
      </body></html>`;
    await serveHtml(page, html);
    await page.goto('https://example.com/');
    await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

    await page.locator('#v1').click();
    await page.evaluate(async () => {
      const v = document.getElementById('v1');
      if (v.readyState < 1) {
        await new Promise((resolve) => {
          v.addEventListener('loadedmetadata', resolve, { once: true });
          setTimeout(resolve, 3000);
        });
      }
      v.currentTime = 0;
      await v.play().catch(() => {});
    });
    await page.waitForTimeout(200);

    const client = await ext.context.newCDPSession(page);

    // —— 站点的 range 滑块 ——
    await page.locator('#slider').focus();
    await dispatchKey(client, 'ArrowRight');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('slider').value))
      .toBe('41');
    expect(
      await page.evaluate(() => window.__inputs),
      '滑块必须真的收到按键',
    ).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.getElementById('v1').currentTime),
      '视频不能同时被 seek（键被抢走的症状）',
    ).toBeLessThan(2);

    // —— 站点的按钮 ——
    await page.locator('#btn').focus();
    const pausedBefore = await page.evaluate(() => document.getElementById('v1').paused);
    await dispatchKey(client, ' ');
    await expect.poll(() => page.evaluate(() => window.__clicks)).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.getElementById('v1').paused),
      '空格不该被视频拿去切换播放（按钮没触发就是被抢走的症状）',
    ).toBe(pausedBefore);
  } finally {
    await ext.close();
  }
});
