import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');
const outDir = resolve(root, 'store-assets', 'output');
const PORT = 4175;
const BASE = `http://127.0.0.1:${PORT}`;

mkdirSync(outDir, { recursive: true });

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

// 1) 设置页：只有一张快捷键卡片。
{
  const context = await browser.newContext({ viewport: { width: 900, height: 820 } });
  await context.addInitScript(() => {
    window.chrome = { i18n: { getMessage: () => '' }, runtime: { lastError: null }, storage: {
      sync: { get: (_k, cb) => cb({}), set: (_o, cb) => cb?.(), remove: (_k, cb) => cb?.() },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  await page.goto(BASE + '/options.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => document.querySelectorAll('.vsc__row').length);
  if (rows < 7) throw new Error('options page did not render 7 rows: ' + errors.join('; '));
  await page.screenshot({ path: resolve(outDir, 'store-options.png') });
  await context.close();
  console.log('store-options.png done (rows=' + rows + ')');
}

// 2) 极简调速提示（全屏外按 =）。
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + '/demo.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
  await page.locator('#demo-video').click();
  await page.keyboard.press('=');
  await page.waitForTimeout(200);
  const visible = await page.evaluate(() => document.getElementById('vsc-speed-toast')?.classList.contains('vsc-visible'));
  if (!visible) throw new Error('speed toast not visible at capture time');
  await page.screenshot({ path: resolve(outDir, 'store-speed-toast.png') });
  await page.close();
  console.log('store-speed-toast.png done');
}

// 3) 网页全屏 + 控制条（按 f，移动鼠标让控制条浮现）。
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE + '/demo.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
  await page.locator('#demo-video').click();
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  const active = await page.evaluate(() => document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active'));
  if (!active) throw new Error('fullscreen overlay not active');
  // 移动鼠标确保控制条处于可见状态（3 秒无操作会淡出）。
  await page.mouse.move(640, 700);
  await page.waitForTimeout(200);
  const ctlVisible = await page.evaluate(() => document.getElementById('vsc-controls')?.classList.contains('vsc-ctl--visible'));
  if (!ctlVisible) throw new Error('fullscreen controls not visible');
  await page.screenshot({ path: resolve(outDir, 'store-fullscreen.png') });
  await page.close();
  console.log('store-fullscreen.png done (controls=' + ctlVisible + ')');
}

await browser.close();
server.kill();
rmSync(demoPath, { force: true });
console.log('all store assets generated, demo.html cleaned');
