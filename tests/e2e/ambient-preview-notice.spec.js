import { test, expect } from '@playwright/test';
import { SD_4X3_MP4_BASE64 } from './fixtures/sd-4x3.ts';
import { launchExtension } from './helpers/launch.js';
import { anyLocale, anyLocaleFragment } from './helpers/i18n.js';

/**
 * 「页面预览」这条解释的守卫。
 *
 * ⚠️ 这条守卫量的是**用户真正看到/听到的东西**：
 * - 视觉：提示节点的 **computed style**（display / visibility / opacity 三样都要过）
 * - 读屏：live region 的 textContent **非空**
 *
 * ⚠️ 而且**采样必须被证明发生过**：提示只挂 2.6 秒，所以守卫要在页面里挂一个
 * 采样器持续记录「有没有一次采样看见它真的可见」——
 * 只断言「最后读到的状态」的话，采样器一次都没跑也是绿的（恒真的守卫）。
 *
 * 背景（实测，真实 Chromium + 真实扩展）：
 * 一个**看得见、正在播、没有原生 controls** 的预览视频占视口 25% 时，
 * 按 `=` 三次：倍速不动、胶囊不出现、live region 全空。
 * 而**同一个视频**点工具栏图标却能进网页全屏 ——
 * 于是产品面结果是「图标能、键盘不能」且**无解释**。
 */

const NOTICE_ID = 'vsc-takeover-notice';
const LIVE_REGION_ID = 'vsc-live-region';

const serve = (page, body) =>
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
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });

/**
 * 在页面里挂一个**持续采样**的探针。
 *
 * ⚠️ 为什么采样器住在页面里而不是在测试里轮询：
 * 提示只挂 2.6 秒，测试侧的轮询间隔一大就可能整段错过它；
 * 而「错过了」与「根本没出现」在断言上长得一模一样 ——
 * 那就是一条恒真的守卫。
 *
 * 采样器会记下三件事：
 * - `samples`：采了多少次（证明采样真的跑过）
 * - `sawVisible`：有没有**一次**采样看见它真的可见（三样 computed style 都过）
 * - `liveTexts`：live region 里读到过的非空文本（读屏通道）
 */
const startSampler = (page) =>
  page.evaluate(
    ({ noticeId, liveId }) => {
      window.__vscProbe = { samples: 0, sawVisible: false, liveTexts: [] };
      const timer = setInterval(() => {
        const probe = window.__vscProbe;
        probe.samples += 1;

        const notice = document.getElementById(noticeId);
        if (notice) {
          const computed = getComputedStyle(notice);
          if (
            computed.display !== 'none'
            && computed.visibility !== 'hidden'
            && Number(computed.opacity) > 0
          ) {
            probe.sawVisible = true;
          }
        }

        const live = document.getElementById(liveId);
        const text = (live?.textContent ?? '').trim();
        if (text && !probe.liveTexts.includes(text)) {
          probe.liveTexts.push(text);
        }
      }, 50);
      window.__vscStopProbe = () => clearInterval(timer);
    },
    { noticeId: NOTICE_ID, liveId: LIVE_REGION_ID },
  );

const stopSampler = (page) =>
  page.evaluate(() => {
    window.__vscStopProbe?.();
    return window.__vscProbe;
  });

/** 页面里所有视频的倍速与播放状态。 */
const readVideos = (page, ids) =>
  page.evaluate((list) => {
    const result = {};
    for (const id of list) {
      const video = document.getElementById(id);
      result[id] = video
        ? { rate: video.playbackRate, paused: video.paused }
        : null;
    }
    return result;
  }, ids);

/**
 * 文章页里那个装饰性预览：autoplay + 静音 + **没有原生 controls**，
 * 占视口 25%（640×360 / 1280×720）—— 远不到「页面主角」的 60%。
 */
const ambientPreviewHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#preview{width:640px;height:360px;background:#222;display:block}</style>
<script>
window.__seen = [];
window.addEventListener('keydown', (e) => window.__seen.push(e.key));
<\/script>
</head><body>
<p>这是一篇很长的文章，用户正在读字。</p>
<video id="preview" autoplay muted loop playsinline src="/sd-4x3.mp4"></video>
</body></html>`;

/** 一个正经的播放器：有原生 controls，占满大半个视口。 */
const realPlayerHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}#main{width:900px;height:600px;background:#000;display:block}</style>
</head><body>
<video id="main" controls playsinline src="/sd-4x3.mp4"></video>
</body></html>`;

test.describe('页面预览：接管不了 ≠ 什么都不说', () => {
  test.setTimeout(60_000);

  test('在装饰性预览上按快捷键 → 说清楚为什么，并给出下一步', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, ambientPreviewHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(900);

      // 前置条件：这条视频确实在播、确实没有原生 controls。
      const shape = await page.evaluate(() => {
        const video = document.getElementById('preview');
        return {
          paused: video.paused,
          controls: video.hasAttribute('controls'),
          area: (video.getBoundingClientRect().width * video.getBoundingClientRect().height)
            / (window.innerWidth * window.innerHeight),
        };
      });
      expect(shape.paused, '前置条件：预览应该在播').toBe(false);
      expect(shape.controls, '前置条件：预览没有原生 controls').toBe(false);
      expect(shape.area, '前置条件：预览远不到视口的 60%').toBeLessThan(0.6);

      await startSampler(page);

      await page.keyboard.press('=');
      await page.waitForTimeout(1200);

      const probe = await stopSampler(page);

      // ⚠️ 先证明采样真的跑过 —— 否则下面两条断言在「采样器压根没启动」时
      // 也会是绿的（恒真的守卫）。
      expect(probe.samples, '采样器必须真的采到过').toBeGreaterThan(0);

      // ① 视觉通道：提示**真的可见**（三样 computed style 都要过）。
      expect(
        probe.sawVisible,
        '「这是页面预览」必须真的出现在屏幕上（display/visibility/opacity 三样都过）',
      ).toBe(true);

      // ② 读屏通道：live region 里有非空文本，而且说的就是那件事。
      expect(probe.liveTexts.length, '读屏通道必须有非空播报').toBeGreaterThan(0);
      expect(
        probe.liveTexts.some((text) => anyLocale('noticeAmbientPreview').test(text)),
        `读屏必须念出「这是页面预览」那句（听到的是：${JSON.stringify(probe.liveTexts)}）`,
      ).toBe(true);

      // ③ 但视频**没有被接管**：克制仍然在（别顺手把装饰物接管了）。
      const videos = await readVideos(page, ['preview']);
      expect(videos.preview.rate, '页面预览不该被调速').toBe(1);

      // ④ 键必须**完整穿透**给页面（放行 ≠ 吞键）。
      const seen = await page.evaluate(() => window.__seen);
      expect(seen, '按键必须完整穿透给页面').toContain('=');
    } finally {
      await ext.close();
    }
  });

  test('这条话不能是「控制不了」—— 那与工具栏图标的事实矛盾', async () => {
    // ⚠️ 两条路径的**说明**必须一致：工具栏图标（显式点击）**能**接管
    // 页面预览，所以快捷键路径说「控制不了」就是自相矛盾。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, ambientPreviewHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(900);

      await startSampler(page);
      await page.keyboard.press('=');
      await page.waitForTimeout(1200);
      const probe = await stopSampler(page);

      expect(probe.samples, '采样器必须真的采到过').toBeGreaterThan(0);
      const said = probe.liveTexts.join('\n');
      expect(
        said,
        '不能说「控制不了」—— 工具栏图标那条路径恰恰能接管它',
      ).not.toMatch(anyLocale('noticeCannotTakeOver'));
    } finally {
      await ext.close();
    }
  });

  test('点一下它就能用快捷键 —— 这句话必须是真的', async () => {
    // ⚠️ 提示给出的「下一步」必须**真的**管用：
    // 用户点一下视频之后，它就不再是「站点摆在那儿的装饰」，
    // 于是快捷键立刻能用了 —— 两条路径从此指向同一条视频。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, ambientPreviewHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(900);

      // 点一下视频（真实手势）。
      await page.locator('#preview').click({ force: true });
      await page.waitForTimeout(300);

      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      const videos = await readVideos(page, ['preview']);
      expect(
        videos.preview.rate,
        '用户点过之后，这条视频就该能被快捷键接管（提示里的「下一步」必须是真的）',
      ).toBeCloseTo(1.1, 2);
    } finally {
      await ext.close();
    }
  });

  test('在真视频上按快捷键 → 不该弹这条（不要在无关场景触发）', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, realPlayerHtml());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(900);

      await startSampler(page);
      await page.keyboard.press('=');
      await page.waitForTimeout(1200);
      const probe = await stopSampler(page);

      expect(probe.samples, '采样器必须真的采到过').toBeGreaterThan(0);
      expect(
        probe.liveTexts.some((text) => anyLocale('noticeAmbientPreview').test(text)),
        '真视频上不该说「这是页面预览」',
      ).toBe(false);
      expect(
        probe.liveTexts.some((text) => anyLocaleFragment('speedChanged').test(text)),
        `真视频上该播报的是倍速（听到的是：${JSON.stringify(probe.liveTexts)}）`,
      ).toBe(true);
    } finally {
      await ext.close();
    }
  });
});
