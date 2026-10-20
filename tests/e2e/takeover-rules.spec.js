import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { SD_4X3_MP4_BASE64 } from './fixtures/sd-4x3.ts';

/**
 * 「接管规则」：扩展到底该不该对某个视频动手。
 *
 * 这组用例守的是 6.0.9 审计第二轮查出的接管判定缺陷：
 *   - P0-1：站点的**主播放器**（autoplay + 无 controls）被判成装饰 →
 *           整页放弃接管，扩展等于没装（iQiyi 实测：按 = / Space / f 全无反应）
 *   - P0-2：shadow DOM 里的播放器永远不被接管（Document.contains 不穿透 shadow tree）
 *   - P1-1：文章页里站点用 JS 启动的大预览视频被接管 → 空格翻页被抢走
 *   - P1-3：多视频页面上「目标视频」会漂移（连按空格依次暂停多个视频）
 *   - P1-4：feed 里上一条还在后台播放时，快捷键仍打在已经滚走的视频上
 *   - P2-1：站点主播放器滚出视口后仍独占全部按键
 *   - P2-2：hover 预览小窗被接管并被拉进全屏
 *   - P2-3：铺满全屏的竖屏短视频 feed 整页失灵
 *   - P2-6：课程页小窗：切换后只有 10 秒窗口，之后快捷键跳回大播放器
 *   - P2-7：站点自己的迷你播放器（小窗）完全不被接管
 *
 * 为什么必须用**真实浏览器**：这套规则的每一档判据都依赖布局引擎
 * （rect、clientWidth、视口尺寸、shadow tree、真实播放状态）。
 * jsdom 里这些全是 0，测出来的只是「早退分支」的行为 —— 恰恰是最容易骗过人的那种。
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
  const profile = mkdtempSync(join(tmpdir(), 'vsc-rules-'));
  const executablePath = findChromium();
  const candidates = [
    { options: { channel: 'chromium', headless: true, args: launchArgs() } },
    { options: { executablePath, headless: true, args: launchArgs() } },
  ];
  let context = null;
  for (const candidate of candidates) {
    if ('executablePath' in candidate.options && candidate.options.executablePath === undefined) continue;
    try {
      context = await chromium.launchPersistentContext(profile, candidate.options);
      break;
    } catch {
      // 换下一个候选
    }
  }
  if (!context) {
    rmSync(profile, { recursive: true, force: true });
    throw new Error('无法启动带扩展的浏览器');
  }
  const sw = context.serviceWorkers()[0]
    ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));
  if (!sw) {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
    throw new Error('扩展没加载：没有等到 background service worker');
  }
  return {
    context,
    sw,
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
};

/**
 * 把页面喂给浏览器。
 *
 * 视频必须**有源**才能真的播起来（没有源时 paused 恒为 true）。
 * 用真实的 mp4 素材，不 mock —— mock 只在页面世界生效，
 * 而内容脚本跑在隔离世界，读到的是真实的 media 状态。
 */
const serve = (page, body, contentType = 'text/html') =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
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

/** 页面里所有视频的倍速与播放状态。 */
const readVideos = (page, ids) =>
  page.evaluate((list) => {
    const result = {};
    for (const id of list) {
      const video = document.getElementById(id);
      result[id] = video
        ? { rate: video.playbackRate, paused: video.paused, time: video.currentTime }
        : null;
    }
    return result;
  }, ids);

/** 当前有没有进全屏。 */
const fullscreenTarget = (page) => page.evaluate(() => {
  const stage = document.getElementById('vsc-page-fullscreen-stage');
  return stage?.querySelector('video')?.id ?? null;
});

test.describe('接管规则：证据分层', () => {
  test.setTimeout(60_000);

  test('P0-1：占满大半个视口的 autoplay 无 controls 视频必须被接管', async () => {
    // iQiyi 首页主播放器的真实形状（实测，真实 Chromium）：
    //   <video class="full" autoplay muted>，1353×671，视口 1440×900 → 70.1%。
    //
    // 它与文章页里的装饰性预览在 DOM 上**一模一样**（autoplay + 无 controls），
    // 唯一的区别是它占满了大半个屏幕 —— 装饰性预览从来不会那样。
    //
    // 实测（修复前）：按 `=` / `Space` / `f` 全部无反应，扩展等于没装。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:1353px;height:671px;background:#000}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="main" autoplay muted playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      // 前置条件：这个视频的形状就是 iQiyi 主播放器。
      const shape = await page.evaluate(() => {
        const v = document.getElementById('main');
        const r = v.getBoundingClientRect();
        return {
          autoplay: v.hasAttribute('autoplay'),
          controls: v.hasAttribute('controls'),
          fraction: (r.width * r.height) / (window.innerWidth * window.innerHeight),
        };
      });
      expect(shape.autoplay, '前置条件：视频带 autoplay 属性').toBe(true);
      expect(shape.controls, '前置条件：视频没有原生 controls').toBe(false);
      expect(shape.fraction, '前置条件：视频占视口 70%').toBeGreaterThan(0.6);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const rate = await page.evaluate(() => document.getElementById('main').playbackRate);
      expect(rate, '页面主角必须被接管（否则扩展等于没装）').toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('P0-1：站点点名的主播放器（爱奇艺）即使又小也必须被接管', async () => {
    // 上一条靠的是「占满视口」；这条靠的是**站点自己点名** ——
    // 用真实的 iQiyi 域名 + 真实的容器类名（`.iq-player-cont`）。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}.iq-player-cont{width:320px;height:180px}</style>
${PAGE_WATCHES_KEYS}</head><body>
<div class="iq-player-cont"><video id="main" autoplay muted playsinline src="/sd-4x3.mp4"></video></div>
</body></html>`);
      await page.goto('http://www.iqiyi.com/');
      await page.waitForTimeout(600);

      // 前置条件：页面跑在 iQiyi 的域名下（站点适配器按域名生效）。
      expect(
        await page.evaluate(() => location.hostname),
        '前置条件：页面应跑在 iQiyi 域名下',
      ).toBe('www.iqiyi.com');

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const rate = await page.evaluate(() => document.getElementById('main').playbackRate);
      expect(rate, '站点点名的主播放器不该被当成装饰视频').toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('P0-2：shadow DOM 里的播放器必须被接管', async () => {
    // `Document.contains()` **不穿透 shadow tree** —— 用它判「还挂在文档里」
    // 会把 shadow DOM 里的每一个 <video> 都判成「已从文档移除」。
    //
    // 实测（修复前）：960×540、带 controls 的 shadow-DOM 播放器 →
    // 按 `=` / `ArrowRight` / `f` 三个键全部无效。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#host{display:block;width:960px;height:540px}</style>
${PAGE_WATCHES_KEYS}</head><body>
<div id="host"></div>
<script>
  const shadow = document.getElementById('host').attachShadow({ mode: 'open' });
  const video = document.createElement('video');
  video.id = 'shadow-player';
  video.setAttribute('controls', '');
  video.setAttribute('playsinline', '');
  video.style.width = '960px';
  video.style.height = '540px';
  shadow.append(video);
<\/script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      // 前置条件：旧判据会把它误杀。
      const shape = await page.evaluate(() => {
        const video = document.getElementById('host').shadowRoot.querySelector('video');
        return {
          documentContains: document.contains(video),
          isConnected: video.isConnected,
        };
      });
      expect(shape.documentContains, '前置条件：Document.contains 不穿透 shadow tree').toBe(false);
      expect(shape.isConnected, '前置条件：原生 isConnected 对 shadow DOM 是对的').toBe(true);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const rate = await page.evaluate(
        () => document.getElementById('host').shadowRoot.querySelector('video').playbackRate,
      );
      expect(rate, 'shadow DOM 里的播放器必须能被接管').toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('P0-2：shadow DOM 里的视频被摘掉之后，快捷键不再打它身上', async () => {
    // ⚠️ 为什么这条单测守不住、必须用真实浏览器：
    // 扩展的 MutationObserver 挂在 document.body 上、subtree: true ——
    // 但 **shadow tree 是另一棵树**，document 上的观察器收不到 shadow root
    // 里的增删（真实 Chromium 与 spec 一致；jsdom 反而会递送，所以那条
    // 单测在 jsdom 里是恒真的假守卫）。
    //
    // 于是「DOM 变更代次」不会前进、缓存也不会失效 ——
    // 唯一能认出「它已经被摘掉了」的是**命中缓存前的存活检查**。
    // 少了它：视频节点都不在页面上了，快捷键还在打它（按什么都没反应）。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#host{display:block;width:640px;height:360px}#tail{height:2000px}</style>
${PAGE_WATCHES_KEYS}</head><body>
<div id="host"></div>
<div id="tail"></div>
<script>
  const shadow = document.getElementById('host').attachShadow({ mode: 'open' });
  const video = document.createElement('video');
  video.id = 'shadow-player';
  video.controls = true;
  video.muted = true;
  video.src = '/sd-4x3.mp4';
  shadow.append(video);
<\/script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      // 前置条件：它现在是个正常的目标（空格被扩展接管 → 页面收不到）。
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      expect(
        await page.evaluate(() => window.__seen.length),
        '前置条件：shadow 里的播放器在被接管时，空格不该穿透给页面',
      ).toBe(0);

      // 站点把 shadow 里的视频摘掉了（shadow tree 的变化不会推进 DOM 代次）。
      await page.evaluate(() => {
        document.getElementById('host').shadowRoot.querySelector('video').remove();
      });
      await page.waitForTimeout(300);

      await page.keyboard.press('Space');
      await page.waitForTimeout(400);

      const after = await page.evaluate(() => ({
        seen: window.__seen,
        scrollY: window.scrollY,
      }));
      expect(
        after.seen,
        '视频已经被摘掉之后，扩展不该再接管它（空格必须放行给页面）',
      ).toContain(' ');
      expect(after.scrollY, '页面必须能继续滚动').toBeGreaterThan(0);
    } finally {
      await ext.close();
    }
  });

  test('P1-1：文章页里站点用 JS 启动的大预览：按键必须穿透给页面', async () => {
    // 文章页里那种「边滚动边播的预览」是站点用 `video.play()` 起的 ——
    // DOM 上**没有** `autoplay` 属性。老判据把「有 autoplay 属性」当硬前提，
    // 于是它绕过了装饰性判定，被接管：
    //   实测按 Space → 键被吞（页面完全没收到，翻不了页），
    //   按 `=` → 改成 1.1x，按 `f` → 被拉进全屏。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:900px;height:506px;background:#222}#tail{height:2000px}</style>
${PAGE_WATCHES_KEYS}</head><body>
<p>这是一篇很长的文章，用户正在读字。</p>
<video id="preview" playsinline src="/sd-4x3.mp4"></video>
<div id="tail"></div>
<script>
  const preview = document.getElementById('preview');
  preview.muted = true;
  preview.play();
<\/script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      // 前置条件：这个预览确实是被站点用 JS 播起来的（没有 autoplay 属性）。
      const shape = await page.evaluate(() => {
        const v = document.getElementById('preview');
        return {
          autoplay: v.hasAttribute('autoplay'),
          controls: v.hasAttribute('controls'),
          started: v.currentTime > 0 || v.paused === false,
        };
      });
      expect(shape.autoplay, '前置条件：预览没有 autoplay 属性').toBe(false);
      expect(shape.controls, '前置条件：预览没有原生 controls').toBe(false);
      expect(shape.started, '前置条件：站点用 JS 启动了预览').toBe(true);

      const before = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => window.scrollY);

      expect(after, '空格必须翻页（页面收到了空格）').toBeGreaterThan(before);

      await page.keyboard.press('=');
      await page.keyboard.press('f');
      await page.waitForTimeout(400);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('preview').playbackRate,
        seen: window.__seen,
        overlay: Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
      }));
      expect(state.rate, '装饰性预览不该被调速').toBe(1);
      expect(state.overlay, '装饰性预览不该被拉进全屏').toBe(false);
      expect(state.seen, '按键必须完整穿透给页面').toEqual([' ', '=', 'f']);
    } finally {
      await ext.close();
    }
  });

  test('P1-3：多视频页面：键盘命中哪个视频，后续按键就跟着它', async () => {
    // 「正在播」这一档会让目标**漂移**：用户刚用空格暂停了 A，
    // A 立刻失去「正在播」的加分，还在播的 B 变成最高分，
    // 下一次按键就打到 B 身上。
    //
    // 实测（修复前）：`=` → cam1；空格 → cam1 暂停；`f` → 进的是 cam2 的全屏。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:600px;height:338px;background:#000;display:block}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="cam1" controls autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
<video id="cam2" controls autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(900);

      // 前置条件：两个视频都在播。
      const playing = await readVideos(page, ['cam1', 'cam2']);
      expect(playing.cam1.paused, '前置条件：cam1 应该在播').toBe(false);
      expect(playing.cam2.paused, '前置条件：cam2 应该在播').toBe(false);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const afterSpeed = await readVideos(page, ['cam1', 'cam2']);
      expect(afterSpeed.cam1.rate, '第一下应命中 cam1').toBeCloseTo(1.1, 2);
      expect(afterSpeed.cam2.rate, 'cam2 不该被改').toBe(1);

      // ⚠️ 必须等过缓存有效期（5 秒）再按下一个键，否则这条用例是**恒真的
      // 假守卫**：快捷键路径的缓存会把上一次的命中结果直接返回，
      // 「目标漂移」根本没机会发生（实测：把键盘目标的 +8000 权重归零，
      // 这条用例照样绿）。
      await page.waitForTimeout(6_000);

      await page.keyboard.press('Space');
      await page.waitForTimeout(400);
      const afterSpace = await readVideos(page, ['cam1', 'cam2']);
      expect(afterSpace.cam1.paused, '空格必须暂停 cam1（键盘刚命中过它）').toBe(true);
      expect(afterSpace.cam2.paused, 'cam2 不该被暂停（目标不能漂移）').toBe(false);

      await page.keyboard.press('f');
      await page.waitForTimeout(700);
      expect(
        await fullscreenTarget(page),
        '全屏必须进 cam1（目标不能漂移）',
      ).toBe('cam1');
    } finally {
      await ext.close();
    }
  });

  test('P1-4：feed 里滚走的视频不再吃快捷键', async () => {
    // 竖屏 feed：点第 1 条 → 滚到第 2 条（第 1 条仍在后台播放、可见度 0）。
    // 老规则里「选过 + 还在播（60 秒）」让旧视频长期霸占「用户正在看的」身份，
    // 快捷键继续打在已经滚走的视频上。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:960px;height:540px;background:#000;display:block}#spacer{height:900px}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="feed1" controls autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
<div id="spacer"></div>
<video id="feed2" controls autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
<div style="height:900px"></div>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(800);

      // 用户点了第 1 条。
      await page.locator('#feed1').click();
      await page.waitForTimeout(300);
      // Chrome 里点一个带 controls 的视频会切换播放 —— 恢复播放，
      // 还原「上一条还在后台播」的真实场景。
      await page.evaluate(() => document.getElementById('feed1').play());
      await page.waitForTimeout(300);

      // 滚到第 2 条。
      await page.evaluate(() => window.scrollTo(0, 1000));
      await page.waitForTimeout(400);

      // 前置条件：第 1 条已经滚出视口，但还在后台播放。
      const geo = await page.evaluate(() => {
        const first = document.getElementById('feed1');
        const r = first.getBoundingClientRect();
        return { top: r.top, paused: first.paused };
      });
      expect(geo.top, '前置条件：第 1 条已经滚出视口').toBeLessThan(0);
      expect(geo.paused, '前置条件：第 1 条还在后台播放').toBe(false);

      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      const state = await readVideos(page, ['feed1', 'feed2']);
      expect(state.feed2.rate, '快捷键必须落在当前在视口里的第 2 条').toBeCloseTo(1.1, 2);
      expect(state.feed1.rate, '已经滚走的第 1 条不该再吃快捷键').toBe(1);
    } finally {
      await ext.close();
    }
  });

  test('P2-1：站点主播放器完全滚出视口后，不再独占按键', async () => {
    // YouTube watch 页滚到 4000px（播放器 top = -1750）→ 老规则里
    // 「站点点名的主播放器 → 直接短路」排在所有可见性判据之前，
    // 于是按 `=` 改的是看不见的主播放器，按空格暂停了它。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:960px;height:540px;background:#000;display:block}#tail{height:4000px}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="main" class="html5-main-video" autoplay muted playsinline src="/sd-4x3.mp4"></video>
<div id="tail"></div>
</body></html>`);
      await page.goto('http://www.youtube.com/');
      await page.waitForTimeout(600);

      await page.evaluate(() => window.scrollTo(0, 4000));
      await page.waitForTimeout(400);

      // 前置条件：主播放器完全滚出视口。
      const top = await page.evaluate(
        () => document.getElementById('main').getBoundingClientRect().top,
      );
      expect(top, '前置条件：主播放器已完全滚出视口').toBeLessThan(0);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('main').playbackRate,
        seen: window.__seen,
      }));
      expect(state.rate, '看不见的主播放器不该被接管').toBe(1);
      expect(state.seen, '按键必须穿透给页面').toEqual(['=']);
    } finally {
      await ext.close();
    }
  });

  test('P2-2：hover 预览小窗不被接管，也不该被拉进全屏', async () => {
    // 真实 YouTube 搜索页 hover 出来的 YTD-VIDEO-PREVIEW（504×283，正在播）。
    // 老规则按「宽 ≥ 480 且高 ≥ 270」放行 → 它被接管，并被搬进全屏 stage，
    // 真正的（0×0 的）主播放器被忽略。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:504px;height:283px;background:#222;display:block}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="preview" playsinline src="/sd-4x3.mp4"></video>
<script>
  const preview = document.getElementById('preview');
  preview.muted = true;
  preview.loop = true;
  preview.play();
<\/script>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      await page.keyboard.press('=');
      await page.keyboard.press('f');
      await page.waitForTimeout(500);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('preview').playbackRate,
        overlay: Boolean(document.getElementById('vsc-page-fullscreen-overlay')),
        seen: window.__seen,
      }));
      expect(state.rate, 'hover 预览不该被调速').toBe(1);
      expect(state.overlay, 'hover 预览不该被拉进全屏').toBe(false);
      expect(state.seen, '按键必须穿透给页面').toEqual(['=', 'f']);
    } finally {
      await ext.close();
    }
  });

  test('P2-3：铺满全屏的竖屏短视频 feed 必须被接管', async () => {
    // 405×720 的竖屏 feed（autoplay 属性 + 无 controls）→
    // 老规则里按 `=` / `ArrowRight` / `Space` / `f` / `0` 全部穿透给页面，
    // 倍速不变、无全屏 —— 而视频明明占满整屏。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.setViewportSize({ width: 405, height: 720 });
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:405px;height:720px;background:#000;display:block}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="feed" autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const rate = await page.evaluate(() => document.getElementById('feed').playbackRate);
      expect(rate, '铺满全屏的竖屏短视频必须被接管').toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('P2-6：用户点过的小窗：11 秒后快捷键仍然落在它身上', async () => {
    // 课程页：点侧边 320×180 的小窗 → `=` 命中小窗 ✓；
    // 11 秒后再按 `=` → 老规则跳回了大播放器 ✗。
    //
    // 根因：老规则只有「10 秒内选过」与「选过且还在播（60 秒）」两档，
    // 被暂停的小窗永远不满足后者。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#big{width:960px;height:540px;background:#000}#small{width:320px;height:180px;background:#222}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="big" controls playsinline src="/sd-4x3.mp4"></video>
<video id="small" controls playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      // 用户点了小窗。
      await page.locator('#small').click();
      await page.waitForTimeout(300);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const early = await readVideos(page, ['big', 'small']);
      expect(early.small.rate, '刚点过时必须命中小窗').toBeCloseTo(1.1, 2);

      // 等 10 秒窗口过去。
      await page.waitForTimeout(11_000);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const later = await readVideos(page, ['big', 'small']);
      expect(
        later.small.rate,
        '用户点开且暂停的小窗，11 秒后仍必须能被调速',
      ).toBeCloseTo(1.2, 2);
      expect(later.big.rate, '大播放器不该抢走快捷键').toBe(1);
    } finally {
      await ext.close();
    }
  });

  test('P2-7：站点自己的迷你播放器（400×225）必须能被接管', async () => {
    // 400×225 在 1280×720 里占 9.8%：绝对线（480×270）差得远、
    // 相对线（10%）又差一点 —— 两条线都不过，于是完全不被接管。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:400px;height:225px;background:#000}</style>
${PAGE_WATCHES_KEYS}</head><body>
<video id="mini" controls playsinline src="/sd-4x3.mp4"></video>
</body></html>`);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(600);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => ({
        rate: document.getElementById('mini').playbackRate,
        seen: window.__seen,
      }));
      expect(state.rate, '400×225 的播放器必须能被接管').toBeCloseTo(1.1, 2);
      expect(state.seen, '按键不该穿透给页面').toEqual([]);
    } finally {
      await ext.close();
    }
  });
});
