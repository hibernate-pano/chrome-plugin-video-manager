import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');
const outDir = resolve(root, 'store-assets', 'output');
const PORT = 4175;
const BASE = `http://127.0.0.1:${PORT}`;

// 以 dist 为 web 根目录服务（vite 产物使用绝对路径 /options.js 等）
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', distDir], {
  stdio: 'ignore',
});

const waitForServer = async () => {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(BASE + '/manifest.json');
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('static server did not start');
};

// 演示页：写入 dist（引用 ./content.js），截图后删除，避免混入发布包
const demoHtml = readFileSync(resolve(root, 'store-assets', 'demo.html'), 'utf8')
  .replace('../../dist/content.js', './content.js');
const demoPath = resolve(distDir, 'demo.html');
writeFileSync(demoPath, demoHtml);

const browser = await chromium.launch();
await waitForServer();

// 1) 设置页
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  await page.goto(BASE + '/options.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const rendered = await page.evaluate(() => document.querySelectorAll('.vsc-options__panel').length);
  if (rendered < 2) throw new Error('options page did not render: ' + errors.join('; '));
  await page.screenshot({ path: resolve(outDir, 'store-options.png') });
  await page.close();
  console.log('store-options.png done (panels=' + rendered + ')');
}

// 2) Popup（注入假 chrome 环境）
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    window.chrome = {
      i18n: { getMessage: () => '' },
      runtime: { lastError: null, openOptionsPage: () => {}, onMessage: { addListener: () => {}, removeListener: () => {} } },
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: (_id, _msg, cb) => cb({ speed: 1.75, playing: true, hostname: 'www.bilibili.com', hasVideo: true }),
      },
      storage: {
        local: { get: (_k, cb) => cb({}), set: (_o, cb) => cb?.() },
      },
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  await page.goto(BASE + '/popup.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const rate = await page.evaluate(() => document.getElementById('rate-value')?.textContent);
  if (rate !== '1.75') throw new Error('popup did not render expected state: rate=' + rate + ' errors=' + errors.join('; '));
  await page.evaluate(() => {
    document.body.style.margin = '150px auto';
  });
  await page.screenshot({ path: resolve(outDir, 'store-popup.png') });
  await context.close();
  console.log('store-popup.png done (rate=' + rate + ')');
}

// 3) HUD 演示（真实 content script + 数字键 2）
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + '/demo.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
  await page.locator('#demo-video').click();
  await page.keyboard.press('2');
  await page.waitForTimeout(300);
  const hudVisible = await page.evaluate(() => document.getElementById('vsc-speed-hud')?.classList.contains('vsc-visible'));
  if (!hudVisible) throw new Error('HUD not visible at capture time');
  await page.screenshot({ path: resolve(outDir, 'store-speed-hud.png') });
  await page.close();
  console.log('store-speed-hud.png done (hud=' + hudVisible + ')');
}

// 4) 网页全屏演示
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + '/demo.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
  await page.locator('#demo-video').click();
  await page.keyboard.press('f');
  await page.waitForTimeout(450);
  const active = await page.evaluate(() => document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active'));
  if (!active) throw new Error('fullscreen overlay not active');
  await page.screenshot({ path: resolve(outDir, 'store-fullscreen.png') });
  await page.close();
  console.log('store-fullscreen.png done (active=' + active + ')');
}

await browser.close();
server.kill();
rmSync(demoPath, { force: true });
console.log('all store assets generated, demo.html cleaned');
