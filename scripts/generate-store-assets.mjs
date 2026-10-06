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

// 默认只产出英文那套（商店主 locale 是 en）；需要中英双语时用 --langs=en,zh_CN。
const langArg = process.argv.find((arg) => arg.startsWith('--langs='));
const LANGS = (langArg ? langArg.slice('--langs='.length) : 'en')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const CAPTIONS = {
  en: {
    fullscreen: 'Watch any web video fullscreen',
    controls: 'Auto-hiding controls, out of your way',
    speed: 'Fine-tune speed in 0.1x steps',
    options: '7 shortcuts you can rebind',
    freshSpeed: 'Every video starts at 1.0x',
  },
  zh_CN: {
    fullscreen: '任意网页视频，一键全屏',
    controls: '控制条自动隐藏，不打扰观看',
    speed: '0.1x 精细调速',
    options: '7 个快捷键，全部可改绑',
    freshSpeed: '每个视频都从 1.0x 开始',
  },
};

// 从 _locales/<lang>/messages.json 取真实文案交给页面里的 chrome.i18n stub，
// 让 options 设置页渲染成对应语言，而不是回落到内置的中文 FALLBACKS。
// 不处理 placeholder；取不到的 key 让 getMessage 返回空串即可。
const loadMessages = (locale) => {
  try {
    const raw = readFileSync(resolve(root, '_locales', locale, 'messages.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const messages = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value.message === 'string') {
        messages[key] = value.message;
      }
    }
    return messages;
  } catch {
    return {};
  }
};

const outPath = (base, locale) =>
  resolve(outDir, locale === 'en' ? `${base}.png` : `${base}.${locale.replace('_', '-')}.png`);

const label = (base, locale) => `${base}${locale === 'en' ? '' : `.${locale.replace('_', '-')}`}.png`;

const CAPTION_ID = 'vsc-store-caption';

/**
 * 截图前注入一句标题覆盖层。控制条固定在底部、调速小胶囊固定在左上角，
 * 所以标题只放在 top-center（避开胶囊、压住控制条上方）或 bottom-center（避开控制条）。
 */
const addCaption = async (page, text, placement) => {
  await page.evaluate(
    ({ message, position, id }) => {
      document.getElementById(id)?.remove();
      const el = document.createElement('div');
      el.id = id;
      el.textContent = message;
      const isBottom = position === 'bottom-center';
      el.style.cssText = [
        'position:fixed',
        'left:50%',
        'transform:translateX(-50%)',
        isBottom ? 'bottom:24px' : 'top:40px',
        'z-index:2147483647',
        'pointer-events:none',
        'box-sizing:border-box',
        'max-width:calc(100vw - 32px)',
        'white-space:nowrap',
        'padding:0.48em 1em',
        'border-radius:999px',
        'background:rgba(3,7,18,0.8)',
        'border:1px solid rgba(255,255,255,0.18)',
        'box-shadow:0 20px 60px rgba(0,0,0,0.45)',
        'color:#ffffff',
        "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
        'font-size:clamp(20px, 3.4vw, 32px)',
        'font-weight:700',
        'letter-spacing:-0.01em',
        'line-height:1.15',
        'text-align:center',
      ].join(';');
      document.body.appendChild(el);
    },
    { message: text, position: placement, id: CAPTION_ID },
  );
};

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

try {
  await waitForServer();

  for (const locale of LANGS) {
    const captions = CAPTIONS[locale] ?? CAPTIONS.en;
    const messages = loadMessages(locale);

    // 1) 首图：网页全屏 + 底部控制条（核心差异点）。
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(`${BASE}/demo.html?lang=${locale}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
        await page.mouse.click(640, 300);
        await page.keyboard.press('f');
        await page.waitForTimeout(300);
        const active = await page.evaluate(
          () => document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active'),
        );
        if (!active) throw new Error('fullscreen overlay not active');
        // 移动鼠标确保控制条处于可见状态（3 秒无操作会淡出）。
        await page.mouse.move(640, 760);
        await page.waitForTimeout(200);
        const ctlVisible = await page.evaluate(
          () => document.getElementById('vsc-controls')?.classList.contains('vsc-ctl--visible'),
        );
        if (!ctlVisible) throw new Error('fullscreen controls not visible');
        await addCaption(page, captions.fullscreen, 'top-center');
        await page.screenshot({ path: outPath('store-fullscreen', locale) });
        console.log(`${label('store-fullscreen', locale)} done (controls=visible)`);
      } finally {
        await context.close();
      }
    }

    // 2) 控制条特写：640×400 @2x 输出仍是 1280×800，控制条被放大一倍。
    {
      const context = await browser.newContext({
        viewport: { width: 640, height: 400 },
        deviceScaleFactor: 2,
      });
      try {
        const page = await context.newPage();
        await page.goto(`${BASE}/demo.html?lang=${locale}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
        await page.mouse.click(320, 200);
        await page.keyboard.press('f');
        await page.waitForTimeout(300);
        const active = await page.evaluate(
          () => document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active'),
        );
        if (!active) throw new Error('fullscreen overlay not active (closeup)');
        await page.mouse.move(320, 380);
        await page.waitForTimeout(200);
        const ctlVisible = await page.evaluate(
          () => document.getElementById('vsc-controls')?.classList.contains('vsc-ctl--visible'),
        );
        if (!ctlVisible) throw new Error('fullscreen controls not visible (closeup)');
        await addCaption(page, captions.controls, 'top-center');
        await page.screenshot({ path: outPath('store-controls', locale) });
        console.log(`${label('store-controls', locale)} done (2x closeup)`);
      } finally {
        await context.close();
      }
    }

    // 3) 调速提示特写：640×400 @2x，小胶囊放大到可读；标题放底部避开左上角胶囊。
    {
      const context = await browser.newContext({
        viewport: { width: 640, height: 400 },
        deviceScaleFactor: 2,
      });
      try {
        const page = await context.newPage();
        await page.goto(`${BASE}/demo.html?lang=${locale}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#vsc-runtime-styles', { state: 'attached' });
        await addCaption(page, captions.speed, 'bottom-center');
        await page.mouse.click(320, 200);
        await page.keyboard.press('=');
        await page.waitForTimeout(120);
        const visible = await page.evaluate(
          () => document.getElementById('vsc-speed-toast')?.classList.contains('vsc-visible'),
        );
        if (!visible) throw new Error('speed toast not visible at capture time');
        await page.screenshot({ path: outPath('store-speed-toast', locale) });
        console.log(`${label('store-speed-toast', locale)} done (2x closeup)`);
      } finally {
        await context.close();
      }
    }

    // 4) 设置页：1280×800，i18n stub 返回 _locales 真实文案（英文）。
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        await context.addInitScript((msgs) => {
          window.chrome = {
            i18n: { getMessage: (key) => msgs[key] ?? '' },
            runtime: { lastError: null },
            storage: {
              sync: { get: (_k, cb) => cb({}), set: (_o, cb) => cb?.(), remove: (_k, cb) => cb?.() },
              local: { get: (_k, cb) => cb({}), set: (_o, cb) => cb?.(), remove: (_k, cb) => cb?.() },
              onChanged: { addListener: () => {}, removeListener: () => {} },
            },
          };
        }, messages);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
        await page.goto(BASE + '/options.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        const rows = await page.evaluate(() => document.querySelectorAll('.vsc__row').length);
        if (rows < 7) throw new Error('options page did not render 7 rows: ' + errors.join('; '));
        await addCaption(page, captions.options, 'bottom-center');
        await page.screenshot({ path: outPath('store-options', locale) });
        console.log(`${label('store-options', locale)} done (rows=${rows}, locale=${locale})`);
      } finally {
        await context.close();
      }
    }

    // 5) 「不记忆速度」示意：演示页 scene=fresh-speed 的两张速度卡片。
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(`${BASE}/demo.html?lang=${locale}&scene=fresh-speed`, { waitUntil: 'networkidle' });
        await page.waitForSelector('.speed-scene', { state: 'visible' });
        await addCaption(page, captions.freshSpeed, 'top-center');
        await page.screenshot({ path: outPath('store-fresh-speed', locale) });
        console.log(`${label('store-fresh-speed', locale)} done (scene=fresh-speed)`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
  rmSync(demoPath, { force: true });
  console.log('all store assets generated, demo.html cleaned');
}
