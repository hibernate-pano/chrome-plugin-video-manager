import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * 影响边界回归守卫。
 *
 * 这些用例约束的是「扩展在非正常网页 / 非正常元素上的行为」，全部用真实扩展 +
 * 真实 Chromium 跑。它们不是功能测试，而是边界契约：每条都先断言「不该发生的事」。
 *
 * 因此这些用例会直接在真实浏览器里拦住以下回归：无 body 的文档里抛未捕获异常、
 * 把不可见视频当受控对象、iframe 内 toast 坐标系错位、跨 document 按 f 静默吞键、
 * 页面摘掉扩展样式后不自愈、shadow DOM 输入框被吞键。
 * 这些缺陷最初都在 v6.0.2 里真实存在过。
 *
 * 与 real-extension.spec.js 的分工：那套测「正常页面上的正常功能」，
 * 这套测「异常环境下的失败模式」。
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
  const profile = mkdtempSync(join(tmpdir(), 'vsc-boundary-'));
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
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
};

const serve = (page, body, contentType = 'text/html') =>
  page.route('**/*', (route) => {
    if (route.request().url().startsWith('chrome-extension://')) return route.continue();
    return route.fulfill({ status: 200, contentType, body });
  });

const watchErrors = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
};

const videoPage = (extraHead = '', body = '<video id="v1" muted playsinline style="width:480px;height:270px"></video>') =>
  `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}</style>${extraHead}</head><body>${body}</body></html>`;

test.describe('影响边界：异常文档', () => {
  test('无 document.body 但存在 video 的文档：不该抛未捕获异常', async () => {
    // SVG + foreignObject 是唯一实测可达的组合：document.body 为 null，
    // 而 querySelectorAll('video') 仍能找到真实 HTMLVideoElement，
    // 于是 keyboardController 的「无视频就早退」守卫失效，
    // 一路走到 speedToast/fullscreenController 的 document.body.appendChild 并抛 TypeError。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      await serve(page, `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="600" height="400">
  <foreignObject x="0" y="0" width="600" height="400">
    <xhtml:video id="v1" width="480" height="270" muted="muted"></xhtml:video>
  </foreignObject>
</svg>`, 'image/svg+xml');
      await page.goto('http://127.0.0.1:4173/x.svg');
      await page.waitForTimeout(600);

      // 前置条件：这个文档确实是「无 body 但有 video」，否则用例是空转。
      const precondition = await page.evaluate(() => ({
        bodyIsNull: document.body === null,
        videos: document.querySelectorAll('video').length,
      }));
      expect(precondition.bodyIsNull, '前置条件：document.body 应为 null').toBe(true);
      expect(precondition.videos, '前置条件：应能发现 video').toBeGreaterThan(0);

      await page.keyboard.press('=');
      await page.waitForTimeout(250);
      await page.keyboard.press('f');
      await page.waitForTimeout(350);

      expect(errors, '无 body 的文档里按键不该抛出未捕获异常').toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('纯 SVG / 纯 XML 文档：不该抛错，也不该注入 UI 节点', async () => {
    const ext = await launchExtension();
    try {
      for (const [name, contentType, body] of [
        ['SVG', 'image/svg+xml', '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100" height="100"/></svg>'],
        ['XML', 'application/xml', '<?xml version="1.0"?><root><item>hi</item></root>'],
      ]) {
        const page = await ext.context.newPage();
        const errors = watchErrors(page);
        await serve(page, body, contentType);
        await page.goto('http://127.0.0.1:4173/x');
        await page.waitForTimeout(400);
        for (const key of ['f', '=', '-', '0', ' ']) await page.keyboard.press(key === ' ' ? 'Space' : key);
        await page.waitForTimeout(250);

        const injected = await page.evaluate(() => ({
          overlay: !!document.getElementById('vsc-page-fullscreen-overlay'),
          controls: !!document.getElementById('vsc-controls'),
          toast: !!document.getElementById('vsc-speed-toast'),
        }));
        expect(errors, `${name} 文档不该有未捕获异常`).toEqual([]);
        expect(injected, `${name} 文档不该注入 UI 节点`).toEqual({ overlay: false, controls: false, toast: false });
        await page.close();
      }
    } finally {
      await ext.close();
    }
  });
});

test.describe('影响边界：异常元素', () => {
  test('页面上只有一条不可见视频时，不该把它当受控对象', async () => {
    // isVisible() 只给可见视频「加分」，不排除不可见候选；单候选时
    // 不可见视频仍会以最高分胜出 → 速度被改在看不见的视频上，
    // toast 还会因为 rect 全 0 而钳到屏幕角落 (16,16) 显示。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      await serve(page, videoPage('', '<video id="v1" muted playsinline style="display:none"></video>'));
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => {
        const video = document.getElementById('v1');
        const toast = document.getElementById('vsc-speed-toast');
        return { rate: video.playbackRate, toast: toast?.textContent ?? null };
      });

      expect(state.rate, '不可见视频不该被调速').toBe(1);
      expect(state.toast, '没有可见的受控对象时不该弹调速提示').toBeNull();
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('closed shadow root 里的视频：看不到就不该动它', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      await serve(page, videoPage('', `<div id="host"></div>
<script>
  const r = document.getElementById('host').attachShadow({mode:'closed'});
  r.innerHTML = '<video id="inner" muted playsinline style="width:480px;height:270px"></video>';
  window.__inner = r.getElementById('inner');
<\/script>`));
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);
      await page.keyboard.press('=');
      await page.waitForTimeout(300);

      const rate = await page.evaluate(() => window.__inner.playbackRate);
      expect(rate, 'closed shadow root 里的视频不该被改动').toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });
});

test.describe('影响边界：键盘豁免', () => {
  test('shadow DOM 里的输入框应与顶层输入框得到同样的豁免', async () => {
    // 键盘事件跨 shadow 边界时 event.target 会被重定向为宿主元素，
    // 所以 isEditableTarget(event.target) 看到的不是真实输入框。
    // 正确做法是看 event.composedPath()[0]。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      await serve(page, videoPage('', `<div id="host"></div>
<script>
  const r = document.getElementById('host').attachShadow({mode:'open'});
  r.innerHTML = '<input id="si" type="text">';
  window.__si = r.getElementById('si');
  const light = document.createElement('input');
  light.id = 'li'; light.type = 'text';
  document.body.appendChild(light);
<\/script>`));
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      // 对照组：顶层 input 应正常收到空格。
      await page.locator('#li').click();
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      const lightValue = await page.evaluate(() => document.getElementById('li').value);
      expect(lightValue, '顶层输入框应豁免（对照组）').toBe(' ');

      // 实验组：shadow input 应得到同样结果。
      await page.locator('#host input').click();
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      const shadowValue = await page.evaluate(() => window.__si.value);

      expect(shadowValue, 'shadow DOM 输入框应与顶层输入框得到相同豁免').toBe(lightValue);
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('无视频的页面：7 个默认键全部透传，不吞任何一个', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serve(page, videoPage(
        `<script>window.__seen=[];window.addEventListener('keydown',e=>window.__seen.push(e.key));<\/script>`,
        '<p>no video</p>',
      ));
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      const keys = ['=', '-', '0', ' ', 'ArrowLeft', 'ArrowRight', 'f'];
      for (const key of keys) await page.keyboard.press(key === ' ' ? 'Space' : key);
      await page.waitForTimeout(200);

      const seen = await page.evaluate(() => window.__seen);
      expect(seen, '无视频页面不该吞掉任何按键').toEqual(keys);
    } finally {
      await ext.close();
    }
  });
});

test.describe('影响边界：同源 iframe', () => {
  const INNER = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0}video{width:320px;height:180px;background:#000}</style>
</head><body><video id="inner" muted playsinline></video></body></html>`;

  // iframe 故意下移 400px：若 toast 用 iframe 内坐标定位，就会与真实屏幕位置明显错开。
  const OUTER = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;height:1400px}#spacer{height:400px;background:#eee}
iframe{width:400px;height:300px;border:0;display:block;margin-left:50px}</style>
<script>window.__seen=[];window.addEventListener('keydown',e=>window.__seen.push(e.key));<\/script>
</head><body><div id="spacer">top</div><iframe id="f1" src="/inner.html"></iframe></body></html>`;

  const routeIframe = (page) => page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('chrome-extension://')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/html', body: url.includes('inner.html') ? INNER : OUTER });
  });

  test('iframe 内视频的调速提示应出现在视频附近，而不是屏幕角落', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      await routeIframe(page);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);

      // 焦点留在顶层文档，否则按键进不了顶层的内容脚本。
      await page.mouse.click(200, 100);
      await page.waitForTimeout(200);

      const frameTop = await page.evaluate(
        () => Math.round(document.getElementById('f1').getBoundingClientRect().top),
      );

      await page.keyboard.press('=');
      await page.waitForTimeout(400);

      const state = await page.evaluate(() => {
        const inner = document.getElementById('f1').contentDocument.getElementById('inner');
        const toast = document.getElementById('vsc-speed-toast');
        return { innerRate: inner.playbackRate, toastTop: toast?.style.top ?? null, toastText: toast?.textContent ?? null };
      });

      expect(state.innerRate, '同源 iframe 里的视频应能被调速').toBeCloseTo(1.1, 2);
      expect(state.toastText, '应显示新速率').toBe('1.1x');
      // 视频在屏幕 y≈frameTop，toast 应落在它附近；iframe 内坐标会让它跑到 16px。
      expect(
        Math.abs(parseFloat(state.toastTop) - (frameTop + 16)),
        `toast 应定位在视频附近（视频 y≈${frameTop}，实际 toast y=${state.toastTop}）`,
      ).toBeLessThan(50);
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });

  test('跨 document 的视频按 f：不该吞掉按键却什么都不做', async () => {
    // fullscreenController.enter() 对 ownerDocument !== document 的 video 直接返回 false，
    // 但 keyboardController 已经先 intercept() 吞掉了按键 —— 用户失去按键、也得不到反馈。
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      await routeIframe(page);
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(700);
      await page.mouse.click(200, 100);
      await page.waitForTimeout(200);

      // 先用 = 证明扩展确实认到了 iframe 里那个视频。
      await page.keyboard.press('=');
      await page.waitForTimeout(250);
      const rate = await page.evaluate(
        () => document.getElementById('f1').contentDocument.getElementById('inner').playbackRate,
      );
      expect(rate, '前置条件：扩展应能认到 iframe 内的视频').toBeCloseTo(1.1, 2);

      await page.keyboard.press('f');
      await page.waitForTimeout(400);

      const state = await page.evaluate(() => ({
        seen: window.__seen,
        overlay: !!document.getElementById('vsc-page-fullscreen-overlay'),
      }));

      const swallowed = !state.seen.includes('f');
      // 两种可接受结果：要么不吞（让页面自己处理），要么真的进了全屏。
      expect(
        swallowed && !state.overlay,
        '按 f 被吞掉却没进入全屏 = 用户失去按键且无任何反馈',
      ).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });
});

test.describe('影响边界：页面回收扩展节点', () => {
  test('页面移除扩展样式节点后，控制条不应失去定位样式', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      const errors = watchErrors(page);
      await serve(page, videoPage());
      await page.goto('http://127.0.0.1:4173/');
      await page.waitForTimeout(500);

      await page.keyboard.press('f');
      await page.waitForTimeout(400);

      const before = await page.evaluate(() => {
        const controls = document.getElementById('vsc-controls');
        return controls ? getComputedStyle(controls).position : null;
      });
      expect(before, '前置条件：进入全屏后控制条应已挂载').toBe('fixed');

      // SPA 重建、站点清理外来节点都可能把扩展的 style 摘掉。
      await page.evaluate(() => document.getElementById('vsc-runtime-styles')?.remove());
      await page.waitForTimeout(600);

      const after = await page.evaluate(() => {
        const controls = document.getElementById('vsc-controls');
        return {
          styleRebuilt: !!document.getElementById('vsc-runtime-styles'),
          controlsPosition: controls ? getComputedStyle(controls).position : null,
        };
      });

      expect(after.styleRebuilt, '扩展样式被移除后应自愈重建').toBe(true);
      expect(after.controlsPosition, '控制条应保持 fixed 定位').toBe('fixed');
      expect(errors).toEqual([]);
    } finally {
      await ext.close();
    }
  });
});
