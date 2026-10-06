import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

// VSC_EXTENSION_DIR 可以指向别的构建目录（例如故意改坏的副本），
// 默认测 dist/。走环境变量而不是硬编码，是为了让「变异验证」能在不碰源码的前提下跑。
const DIST = process.env.VSC_EXTENSION_DIR
  ? resolve(process.env.VSC_EXTENSION_DIR)
  : resolve(process.cwd(), 'dist');

/**
 * 从构建产物里读接管提示的全部语言文案。chrome.i18n 的 UI 语言跟随浏览器/
 * 系统（CI 容器是英文，本机是中文），断言如果写死一种语言就会「本地过、
 * CI 挂」——这个坑已实锤两次。Playwright 的 locale 选项在 macOS 上改变不了
 * 扩展的 i18n 语言，所以断言对"任意一种已翻译文案"匹配。
 */
const takeoverNoticeTexts = ['en', 'zh_CN'].flatMap((locale) => {
  const messages = JSON.parse(readFileSync(resolve(DIST, '_locales', locale, 'messages.json'), 'utf8'));
  return [messages.noticeCannotTakeOver.message];
});

/**
 * 找到本机已装的 Chrome for Testing。
 *
 * Playwright 缓存里的浏览器版本号未必和它自己期望的一致，硬编码版本路径会在别人
 * 机器上直接报 "Executable doesn't exist"。所以扫描缓存目录、按平台取对应的可执行
 * 路径；扫不到就返回 undefined，交给 Playwright 用它自己的解析（CI 上
 * `playwright install chromium` 之后走的就是这条）。
 */
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

/**
 * 真实加载 dist/ 的扩展跑一遍。
 *
 * 现有的 fullscreen-regression.spec.js 是把 dist/content.js 当普通 <script> 注入页面，
 * 那是页面主世界，不是扩展：content-loader 桥接、document_start 抢占注册、
 * 隔离世界里的 chrome.* 全部没被覆盖。v5.2.1 修的正是这些，所以必须真加载扩展。
 *
 * 关于 headless：Playwright 1.49 起把浏览器拆成了完整 chromium 和
 * chromium_headless_shell，只有前者支持 --load-extension。直接给 executablePath
 * 时 Playwright 未必走新 headless，在 ubuntu-latest 上会安静地加载不了扩展，
 * 表现为每条用例 30 秒超时。所以优先用 channel: 'chromium'（Playwright 明确
 * 对应完整构建），失败再回落到显式 executablePath。
 */
const launchArgs = () => [
  `--disable-extensions-except=${DIST}`,
  `--load-extension=${DIST}`,
  '--autoplay-policy=no-user-gesture-required',
  // CI 容器里以 root 跑 Chrome 需要这两个，否则沙箱起不来或 /dev/shm 太小。
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

const launchExtension = async () => {
  const profile = mkdtempSync(join(tmpdir(), 'vsc-profile-'));
  const executablePath = findChromium();

  // locale 固定成 zh-CN：chrome.i18n 的 UI 语言跟随浏览器，而 CI 容器是英文
  // 环境，断言文案写死中文就会「本地过、CI 挂」。这个坑已实锤过一次。
  const candidates = [
    { label: 'channel:chromium', options: { channel: 'chromium', headless: true, args: launchArgs() } },
    { label: 'executablePath', options: { executablePath, headless: true, args: launchArgs() } },
  ];

  let context = null;
  const failures = [];
  for (const candidate of candidates) {
    // 只在候选「指名要用 executablePath」而它又没解析出来时跳过；
    // channel 候选根本没有这个键，不能被这条守卫一起跳掉。
    if ('executablePath' in candidate.options && candidate.options.executablePath === undefined) {
      continue;
    }

    try {
      context = await chromium.launchPersistentContext(profile, candidate.options);
      break;
    } catch (error) {
      failures.push(`${candidate.label}: ${String(error).slice(0, 200)}`);
    }
  }

  if (!context) {
    rmSync(profile, { recursive: true, force: true });
    throw new Error('无法启动带扩展的浏览器：\n' + failures.join('\n'));
  }

  // 前置检查：扩展没加载成功时立刻失败。否则每条用例都会各等 30 秒超��，
  // 报出来的是看不出原因的超时（这个坑在 ubuntu-latest 上真的踩过一次）。
  const sw = context.serviceWorkers()[0]
    ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));
  if (!sw) {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
    throw new Error(
      '浏览器起来了但扩展没加载：没有等到 background service worker。\n' +
        'headless 下必须使用支持扩展的完整 chromium（channel: chromium），' +
        'headless shell 不支持 --load-extension。',
    );
  }

  return {
    context,
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
};

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
      const text = await page.locator('#vsc-first-run-hint').textContent();
      expect(text).toContain('F');
      expect(text).toContain('= / -');
      expect(text).not.toContain('Space');

      // 已经展示过 -> 落盘；重新加载后不该再出现。
      await page.reload();
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.evaluate(() => document.getElementById('v1').dispatchEvent(new Event('play')));
      await page.waitForTimeout(3500);
      await expect(page.locator('#vsc-first-run-hint.vsc-visible')).toHaveCount(0);
    } finally {
      await ext.close();
    }
  });

  test('同源 iframe 里的视频按 f：给出「接管不了」的提示，而不是静默', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      // 夹具见 iframe-outer.html：iframe 里的 video 属于另一个 document，
      // reparent 搬不动它，canEnter() 必然为 false。
      await page.goto('/tests/e2e/iframe-outer.html');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await page.waitForTimeout(500);

      // 点击必须落在顶层文档：点进 iframe 会把焦点移进去，之后的按键只派发给
      // iframe，顶层内容脚本收不到，「按 f 没反应」会被误判成扩展的 bug。
      // 夹具顶部那 400px 留白就是为这一下留的。
      await page.mouse.click(200, 100);
      await page.waitForTimeout(200);

      // 前置条件：iframe 里那个视频确实被扩展认成了受控对象。
      // 少了这条断言，整条用例可能什么都没测到就「通过」。
      await page.keyboard.press('=');
      await expect
        .poll(() => page.evaluate(
          () => document.getElementById('f1').contentDocument.getElementById('inner').playbackRate,
        ))
        .toBeCloseTo(1.1, 2);

      await page.keyboard.press('f');

      await expect(page.locator('#vsc-takeover-notice.vsc-visible')).toHaveCount(1);
      // 文案跟随浏览器语言（CI 是英文容器），断言对任一已翻译文案匹配。
      await expect(page.locator('#vsc-takeover-notice')).toHaveText(new RegExp(`^(${takeoverNoticeTexts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`));
      // 提示要贴住视频（坐标换算到 iframe 真实位置），不能掉到屏幕角落。
      const box = await page.locator('#vsc-takeover-notice').boundingBox();
      expect(box.x).toBeGreaterThan(50);
      expect(box.y).toBeGreaterThan(400);
      expect(box.y).toBeLessThan(700);

      // 不能提示了「接管不了」却又真的接管了。
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
      const inFullscreen = await page.evaluate(() => {
        const stage = document.getElementById('vsc-page-fullscreen-stage');
        const caption = document.getElementById('imt-caption-container');
        const video = document.getElementById('v1');
        if (!stage || !caption || !video) return null;
        const kids = Array.from(stage.children);
        return {
          captionInStage: stage.contains(caption),
          captionAfterVideo: kids.indexOf(caption) > kids.indexOf(video),
          captionVisible: caption.getBoundingClientRect().height > 0,
        };
      });
      expect(inFullscreen).not.toBeNull();
      expect(inFullscreen.captionInStage, '字幕应被搬进 stage 跟随视频').toBe(true);
      expect(inFullscreen.captionAfterVideo, '字幕必须排在视频之后，否则会被高 z-index 盖住').toBe(true);
      expect(inFullscreen.captionVisible).toBe(true);

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
