import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * 工具栏图标标题 = 当前标签页的倍速。
 *
 * 为什么必须真实加载扩展来测：标题写在 `chrome.action.setTitle` 上，
 * 只有真正的 service worker + 真正的 content script 才能跑通这条链路
 * （内容脚本在隔离世界里，普通 page.evaluate 改不到它）。
 *
 * 断言方式：从 service worker 里查 `chrome.action.getTitle({ tabId })`。
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
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

const launchExtension = async () => {
  const profile = mkdtempSync(join(tmpdir(), 'vsc-title-'));
  const executablePath = findChromium();
  const candidates = [
    { options: { channel: 'chromium', headless: true, args: launchArgs() } },
    { options: { executablePath, headless: true, args: launchArgs() } },
  ];

  const failures = [];
  for (const candidate of candidates) {
    if (
      'executablePath' in candidate.options &&
      candidate.options.executablePath === undefined
    ) {
      continue;
    }

    try {
      const context = await chromium.launchPersistentContext(profile, candidate.options);
      const worker = context.serviceWorkers()[0]
        ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));
      if (!worker) {
        await context.close();
        continue;
      }

      return {
        context,
        worker: () => context.serviceWorkers()[0] ?? worker,
        async close() {
          await context.close();
          rmSync(profile, { recursive: true, force: true });
        },
      };
    } catch (error) {
      failures.push(String(error).slice(0, 200));
    }
  }

  rmSync(profile, { recursive: true, force: true });
  throw new Error(`无法启动带扩展的浏览器：\n${failures.join('\n')}`);
};

const testHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>vsc toolbar title</title>
<style>body{margin:0}video{width:480px;height:270px;background:#000}</style>
</head><body>
<video id="v1"></video>
<script>
window.__rate = () => document.getElementById('v1').playbackRate;
</script>
</body></html>`;

const serveHtml = async (page, html) => {
  await page.route('**/*', async (route) => {
    // 内容脚本是靠动态 import 拉 chrome-extension://.../content.js 的，
    // 那个请求一旦也被 fulfill 成 text/html，MIME 严格检查会让 import 直接失败。
    if (route.request().url().startsWith('chrome-extension://')) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: html,
    });
  });
};

test.describe('工具栏图标标题显示当前倍速', () => {
  test('调速后标题跟着变，刷新后复位', async () => {
    const ext = await launchExtension();
    try {
      const page = await ext.context.newPage();
      await serveHtml(page, testHtml);
      await page.goto('http://vsc-title.test/');
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });

      const worker = ext.worker();
      // 必须按 URL 找标签页：launchPersistentContext 会自带一个空白页，
      // tabs[0] 未必是我们在用的那个。
      const tabId = await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.find((tab) => tab.url?.startsWith('http://vsc-title.test/'))?.id ?? null;
      });
      expect(tabId).not.toBeNull();

      const title = () => worker.evaluate(
        (id) => chrome.action.getTitle({ tabId: id }),
        tabId,
      );

      // 默认状态：标题是扩展名，不带倍速。
      await expect.poll(title).not.toMatch(/\d+(\.\d+)?x/);

      await page.locator('#v1').click();
      await page.evaluate(() => {
        const v = document.getElementById('v1');
        Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(v, 'paused', { value: false, writable: true, configurable: true });
      });

      await page.keyboard.press('=');
      await expect.poll(() => page.evaluate(() => window.__rate())).toBeCloseTo(1.1, 2);

      // 关键断言：工具栏标题上出现当前倍速。
      await expect.poll(title, { timeout: 10_000 }).toContain('1.1x');

      // 刷新 = 换了新视频 = 倍速回到 1.0，标题也必须复位。
      await page.reload();
      await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
      await expect.poll(title, { timeout: 10_000 }).not.toMatch(/1\.1x/);
    } finally {
      await ext.close();
    }
  });
});
