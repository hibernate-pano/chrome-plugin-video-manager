import { test, expect } from '@playwright/test';
import { CLIP_10S_WEBM_BASE64 } from './fixtures/clip-10s.ts';
import { launchExtension } from './helpers/launch.js';
import { anyLocale, anyLocaleFragment } from './helpers/i18n.js';

/**
 * 首次使用引导的回归守卫。
 *
 * 这套用例守的是「引导在**小视口**里怎么办」——
 * 引导住在**拥有视频的那个 frame 自己的文档**里，而那个文档的视口可能
 * 小得离谱（嵌入框常常只有 320×180）。
 *
 * 6.1.0 之前引导只跑在顶层文档，那时它永远有一整个页面的空间；
 * 6.1.0 之后它跑在「有视频的那个 frame」里，于是**小视口成了常态**。
 *
 * 症状（实测，真实 Chromium）：
 * - 320×180 的嵌入框里，完整版引导 130px 高 → 盖住播放器 72%；
 * - 240×135 的嵌入框里，它**装不下** → 顶部被裁（top = -11px）。
 *
 * 修法：量一量，放不下就退到精简版（只留「按哪个键」那两行）。
 * 舍弃的只是**视觉**版面 —— 读屏播报走的仍是完整版。
 */

/* ------------------------------------------------------------------ *
 * 浏览器与扩展
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 页面
 * ------------------------------------------------------------------ */

const CLIP = `data:video/webm;base64,${CLIP_10S_WEBM_BASE64}`;

const innerHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#fff}
video{display:block;width:100%;height:100%;background:#000}
</style></head><body><video id="inner" muted playsinline preload="auto" src="${CLIP}"></video></body></html>`;

const outerHtml = (width, height) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:1400px;background:#fff}
#spacer{height:400px;background:#eee}
iframe{display:block;width:${width}px;height:${height}px;border:0;margin-left:50px}
</style></head><body><div id="spacer">top</div><iframe id="f1" src="/vsc-hint-inner.html"></iframe></body></html>`;

/**
 * 读引导节点的几何。
 *
 * ⚠️ 必须量**它自己那份文档**的坐标：引导住在 iframe 里，
 * getBoundingClientRect() 返回的是相对那个 iframe 视口的坐标。
 */
const readHint = (frame) => frame.evaluate(() => {
  const el = document.getElementById('vsc-first-run-hint');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    text: el.textContent ?? '',
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
});

/**
 * 让嵌入框里的视频真的播起来，并且是**用户亲手点的**。
 *
 * ⚠️ 必须有用户手势：站点自己播起来的视频会被判成「装饰性自动播放」
 * （ambientPreview 的共享判定），引导根本不会为它出现。
 */
const playInFrame = async (frame) => {
  await frame.locator('#inner').click({ force: true });
  await frame.evaluate(() => {
    document.getElementById('inner').play().catch(() => {});
  });
};

test.describe('首次使用引导', () => {
  test('嵌入框很小 → 引导退到精简版，且完整地待在框里', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) return route.continue();
        if (url.includes('vsc-hint-inner.html')) {
          return route.fulfill({ status: 200, contentType: 'text/html', body: innerHtml() });
        }
        return route.fulfill({ status: 200, contentType: 'text/html', body: outerHtml(240, 135) });
      });
      await page.goto('http://127.0.0.1:4173/vsc-hint-outer.html');
      await page.waitForTimeout(600);

      const frame = page.frames().find((f) => f.url().includes('vsc-hint-inner.html'));
      expect(frame, '前置条件：没找到嵌入框').toBeTruthy();

      await playInFrame(frame);

      // 引导在播放满 2.5 秒后出现。
      await expect
        .poll(async () => (await readHint(frame)) !== null, { timeout: 8000 })
        .toBe(true);

      const hint = await readHint(frame);
      expect(hint.viewport.height, '前置条件：这是个很小的框').toBe(135);

      // ① 退到精简版：完整版那两行补充说明不在了。
      expect(hint.text).not.toMatch(anyLocaleFragment('hintToolbar'));
      // ② 但「按哪个键」还在 —— 那是引导存在的理由。
      expect(hint.text).toContain('f');

      // ③ 完整地待在框里：不被裁（上边不越界），也不高过框的一半。
      expect(hint.top, '提示的顶部不能被裁掉').toBeGreaterThanOrEqual(0);
      expect(
        hint.height,
        '提示最多占这个 frame 的一半 —— 超过就不是贴片，是把画面糊住了',
      ).toBeLessThanOrEqual(hint.viewport.height / 2);
    } finally {
      await ext.close();
    }
  });

  test('嵌入框「放得下但盖住大半个播放器」→ 也要退到精简版', async () => {
    // 320×180 的框：完整版 130px **放得下**（130 < 180-32），
    // 可它盖住了播放器 72%（实测，真实 Chromium）。
    //
    // ⚠️ 这条守的是「放得下」那个判据**不够用**：
    // 一块贴片不是「装得进去」，是「不能盖过它要讲的那个东西」。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) return route.continue();
        if (url.includes('vsc-hint-inner.html')) {
          return route.fulfill({ status: 200, contentType: 'text/html', body: innerHtml() });
        }
        return route.fulfill({ status: 200, contentType: 'text/html', body: outerHtml(320, 180) });
      });
      await page.goto('http://127.0.0.1:4173/vsc-hint-outer.html');
      await page.waitForTimeout(600);

      const frame = page.frames().find((f) => f.url().includes('vsc-hint-inner.html'));
      expect(frame, '前置条件：没找到嵌入框').toBeTruthy();

      await playInFrame(frame);

      await expect
        .poll(async () => (await readHint(frame)) !== null, { timeout: 8000 })
        .toBe(true);

      const hint = await readHint(frame);
      expect(hint.viewport.height).toBe(180);

      expect(hint.text, '盖住播放器 72% 的那一版不该出现').not.toMatch(anyLocaleFragment('hintToolbar'));
      expect(hint.height, '贴片最多占这个 frame 的一半').toBeLessThanOrEqual(hint.viewport.height / 2);
    } finally {
      await ext.close();
    }
  });

  test('顶层页面 → 引导显示完整版', async () => {
    // 顶层页面有一整个视口，没有理由缩水：用户该看到完整的三条信息。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) return route.continue();
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<video id="v" muted playsinline preload="auto" style="width:640px;height:360px" src="${CLIP}"></video>
</body></html>`,
        });
      });
      await page.goto('http://127.0.0.1:4173/vsc-hint-top.html');
      await page.waitForTimeout(600);

      await page.locator('#v').click();
      await page.evaluate(() => {
        document.getElementById('v').play().catch(() => {});
      });

      await expect
        .poll(async () => (await readHint(page)) !== null, { timeout: 8000 })
        .toBe(true);

      const hint = await readHint(page);
      expect(hint.text).toMatch(anyLocaleFragment('hintToolbar'));
      expect(hint.text).toContain('f');
    } finally {
      await ext.close();
    }
  });
});
