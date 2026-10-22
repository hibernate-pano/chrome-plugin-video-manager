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
    fullscreen: 'Watch web video fullscreen',
    controls: 'Auto-hiding controls, out of your way',
    speed: 'Fine-tune speed in 0.1x steps',
    speedMenu: 'Click a speed preset — 0.5x to 4x',
    options: '7 shortcuts you can rebind',
  },
  zh_CN: {
    fullscreen: '网页视频，一键全屏',
    controls: '控制条自动隐藏，不打扰观看',
    speed: '0.1x 精细调速',
    speedMenu: '倍速档位可点选：0.5x 到 4x',
    options: '7 个快捷键，全部可改绑',
  },
};

// 从 _locales/<lang>/messages.json 取真实文案交给页面里的 chrome.i18n stub，
// 让 options 设置页渲染成对应语言，而不是回落到内置的中文 FALLBACKS。
// 不处理 placeholder；取不到的 key 让 getMessage 返回空串即可。

/**
 * 扩展版本号（来自构建产物里的 manifest.json）。
 *
 * 设置页的页脚要显示它，而截图用的 chrome stub 必须提供 getManifest() ——
 * 少了它，页脚就是 "Version —"，截图上那行字看着像渲染坏了。
 */
const manifestVersion = (() => {
  try {
    const manifest = JSON.parse(readFileSync(resolve(distDir, 'manifest.json'), 'utf8'));
    return manifest.version ?? '';
  } catch {
    return '';
  }
})();
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
 *
 * 还有一个 top-left：设置页那一屏的**左右两侧各有一条 320px 宽的空白**，
 * 而「Restore defaults / Save」按钮与页脚都在中间那条内容列里 ——
 * 标题放进左侧空白，就谁也压不住。
 * （此前用 bottom-center 时它正好盖住「Restore defaults」按钮。）
 */
const addCaption = async (page, text, placement) => {
  await page.evaluate(
    ({ message, position, id }) => {
      document.getElementById(id)?.remove();
      const el = document.createElement('div');
      el.id = id;
      el.textContent = message;
      const isBottom = position === 'bottom-center';
      const isLeft = position === 'top-left';
      el.style.cssText = [
        'position:fixed',
        isLeft ? 'left:24px' : 'left:50%',
        isLeft ? 'top:24px' : 'transform:translateX(-50%)',
        isBottom ? 'bottom:24px' : isLeft ? '' : 'top:40px',
        'z-index:2147483647',
        'pointer-events:none',
        'box-sizing:border-box',
        // 左侧那条空白只有 320px 宽，标题必须能换行才不会压到内容列。
        isLeft ? 'max-width:236px' : 'max-width:calc(100vw - 32px)',
        isLeft ? 'white-space:normal' : 'white-space:nowrap',
        'padding:0.48em 1em',
        'border-radius:999px',
        'background:rgba(3,7,18,0.8)',
        'border:1px solid rgba(255,255,255,0.18)',
        'box-shadow:0 20px 60px rgba(0,0,0,0.45)',
        'color:#ffffff',
        "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
        isLeft ? 'font-size:24px' : 'font-size:clamp(20px, 3.4vw, 32px)',
        'font-weight:700',
        'letter-spacing:-0.01em',
        'line-height:1.15',
        isLeft ? 'text-align:left' : 'text-align:center',
      ].join(';');
      document.body.appendChild(el);
    },
    { message: text, position: placement, id: CAPTION_ID },
  );
};

/**
 * 标题胶囊不许压住任何**用户要读的东西**：
 *
 *  - 扩展自己画的界面（控制条 / 调速小胶囊 / 倍速档位菜单）
 *  - 演示页 poster 上那段「视频内容」文字
 *
 * ⚠️ 这不是假想：store-speed-toast 那张的胶囊正好落在 poster 的居中大字上，
 * 两段字叠在一起，截图上看着像渲染坏了。判据要量**真实的盒子**
 * （getBoundingClientRect），不是「看起来好像没压到」。
 *
 * ⚠️ poster 上那段文字是画在 SVG 里的，页面上查不到 —— 所以由 demo.html
 * 把它在 poster 坐标系里的边界写在 `data-poster-text` 上，这里按
 * object-fit: cover 的规则换算到屏幕坐标再比。
 */
const assertCaptionDoesNotCover = async (page, label) => {
  const caption = await page.locator(`#${CAPTION_ID}`).boundingBox();
  if (!caption) throw new Error(`${label}: 标题胶囊不存在`);

  const overlaps = (a, b) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

  const targets = [
    { name: '全屏控制条', selector: '#vsc-controls .bar' },
    { name: '调速小胶囊', selector: '#vsc-speed-toast' },
    { name: '倍速档位菜单', selector: '#vsc-controls .speed-menu' },
  ];
  for (const target of targets) {
    const locator = page.locator(target.selector);
    if ((await locator.count()) === 0) continue;
    const box = await locator.boundingBox();
    if (box && overlaps(caption, box)) {
      throw new Error(
        `${label}: 标题胶囊压住了${target.name}（${JSON.stringify(box)}）—— 截图上两样东西叠在一起。`,
      );
    }
  }

  const posterText = await page.evaluate(() => {
    const raw = document.body.dataset.posterText;
    const video = document.getElementById('demo-video');
    if (!raw || !video) return null;
    const rect = video.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const box = JSON.parse(raw);
    // object-fit: cover —— poster 按「填满」缩放后居中，超出部分被裁掉。
    const scale = Math.max(rect.width / 960, rect.height / 540);
    const drawWidth = 960 * scale;
    const drawHeight = 540 * scale;
    return {
      x: rect.left + (rect.width - drawWidth) / 2 + box.x * scale,
      y: rect.top + (rect.height - drawHeight) / 2 + box.y * scale,
      width: box.width * scale,
      height: box.height * scale,
    };
  });
  if (posterText && overlaps(caption, posterText)) {
    throw new Error(
      `${label}: 标题胶囊压住了画面里的文字（${JSON.stringify(posterText)}）—— ` +
        `截图上那段字被盖住，看起来像渲染坏了。`,
    );
  }
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
          () => {
            // 控制条搬进 shadow root 之后，可见状态由**影子树里**的 bar 元素
            // 用 `bar--visible` 标记 —— 宿主元素上不再有任何可见性 class。
            // 旧写法查宿主上的 `vsc-ctl--visible`，那个 class 早就没了，
            // 于是这条守卫恒为 false。
            const host = document.getElementById('vsc-controls');
            const bar = host?.shadowRoot?.querySelector('.bar');
            return Boolean(bar?.classList.contains('bar--visible'));
          },
        );
        if (!ctlVisible) throw new Error('fullscreen controls not visible');
        await addCaption(page, captions.fullscreen, 'top-center');
        await assertCaptionDoesNotCover(page, 'store-fullscreen');
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
          () => {
            // 控制条搬进 shadow root 之后，可见状态由**影子树里**的 bar 元素
            // 用 `bar--visible` 标记 —— 宿主元素上不再有任何可见性 class。
            // 旧写法查宿主上的 `vsc-ctl--visible`，那个 class 早就没了，
            // 于是这条守卫恒为 false。
            const host = document.getElementById('vsc-controls');
            const bar = host?.shadowRoot?.querySelector('.bar');
            return Boolean(bar?.classList.contains('bar--visible'));
          },
        );
        if (!ctlVisible) throw new Error('fullscreen controls not visible (closeup)');
        await addCaption(page, captions.controls, 'top-center');
        await assertCaptionDoesNotCover(page, 'store-controls');
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
        await assertCaptionDoesNotCover(page, 'store-speed-toast');
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
        await context.addInitScript((payload) => {
          window.chrome = {
            i18n: {
              /**
               * ⚠️ 这个 stub 必须**照样替换位置占位符**。
               * 真实的 chrome.i18n.getMessage(key, substitutions) 会把文案里的
               * $1..$9 换成传入的值；stub 之前只返回原文，于是设置页那行
               * 「按 $1 打开设置页」在截图上露出字面量 "$1"。
               */
              getMessage: (key, substitutions) => {
                const raw = payload.messages[key] ?? '';
                if (!raw) return '';
                return raw.replace(/\$([1-9])(?!\d)/g, (match, index) => {
                  const value = substitutions?.[Number(index) - 1];
                  return value === undefined ? match : value;
                });
              },
            },
            runtime: {
              lastError: null,
              // ⚠️ 少了 getManifest，设置页读不到版本号 ——
              // 页脚会显示成 "Version —"，截图上那行字看着像渲染坏了。
              getManifest: () => ({ version: payload.version }),
            },
            storage: {
              sync: { get: (_k, cb) => cb({}), set: (_o, cb) => cb?.(), remove: (_k, cb) => cb?.() },
              local: { get: (_k, cb) => cb({}), set: (_o, cb) => cb?.(), remove: (_k, cb) => cb?.() },
              onChanged: { addListener: () => {}, removeListener: () => {} },
            },
          };
        }, { messages, version: manifestVersion });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
        await page.goto(BASE + '/options.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        // ⚠️ 必须分别数两处：`.vsc__row` 一共 8 行（7 个可改键的动作 +
        // 「重新显示使用引导」那一行），而**可改键的动作**是 7 行 ——
        // 两者混在一起数，改键区少渲染一行也照样「通过」。
        const rows = await page.evaluate(() => ({
          shortcutRows: document.querySelectorAll('#rows .vsc__row').length,
          allRows: document.querySelectorAll('.vsc__row').length,
          resetHint: document.querySelectorAll('#reset-hint').length,
        }));
        if (rows.shortcutRows !== 7 || rows.resetHint !== 1) {
          throw new Error('options page did not render 7 shortcut rows + reset hint: ' + JSON.stringify(rows) + ' ' + errors.join('; '));
        }
        // 标题放**左侧空白**：bottom-center 会正好盖住「Restore defaults」。
        await addCaption(page, captions.options, 'top-left');
        await page.screenshot({ path: outPath('store-options', locale) });
        console.log(`${label('store-options', locale)} done (shortcutRows=${rows.shortcutRows}, allRows=${rows.allRows}, locale=${locale})`);
      } finally {
        await context.close();
      }
    }

    // 4) 倍速档位菜单：全屏控制条上的倍速徽标点开，列出 0.5x–4x。
    //
    // ⚠️ 为什么是这一张：它展示的是**鼠标用户唯一的调速路径** ——
    // 键盘有 = / -，但鼠标此前只能看着只读的发愁。
    // 商店文案早就承诺了「全屏控制条上的倍速可以点开，列出 0.5x 到 4x」，
    // 而 5 张截图里**一张都没有**它 —— 承诺了却看不见，是最容易被忽略的缺口。
    //
    // ⚠️ 替换掉的是原来第 5 张「不记忆速度」：那张与首图**长得几乎一样**
    // （都是全屏 + 控制条显示 1x），生成脚本自己的注释就写着
    // 「白白浪费一个展示位」—— 只靠换个背景色来区分，是治标。
    // 「从不记忆速度」是个**行为**，靠文案承载更合适（详细描述里已经写了）。
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
        // ⚠️ 不能等 `#vsc-controls` 的 visible 状态：控制条搬进 shadow root 之后，
        // **宿主元素**自己就是 visibility:hidden（可见性由影子树里的 bar 元素
        // 用 `bar--visible` 标记）。等宿主的 visible 会永远超时 ——
        // 此前这条正好卡死在这，截图脚本整个跑不完。
        // 改成等宿主「已挂载」，可见性另由下面那条 bar--visible 守卫把关。
        await page.waitForSelector('#vsc-controls', { state: 'attached' });
        await page.waitForFunction(() => {
          const host = document.getElementById('vsc-controls');
          const bar = host?.shadowRoot?.querySelector('.bar');
          return Boolean(bar?.classList.contains('bar--visible'));
        });
        // 点开倍速档位菜单。控制条在 shadow root 里，Playwright 的 CSS
        // 选择器会自动穿透开放 shadow DOM。
        await page.locator('#vsc-controls .speed').click();
        await page.waitForFunction(() => {
          const host = document.getElementById('vsc-controls');
          const menu = host?.shadowRoot?.querySelector('.speed-menu');
          return Boolean(menu && !menu.hasAttribute('hidden'));
        });
        const rates = await page.evaluate(() => {
          const host = document.getElementById('vsc-controls');
          const items = host?.shadowRoot?.querySelectorAll('.speed-menu__item') ?? [];
          return Array.from(items).map((item) => item.textContent);
        });
        if (rates.length === 0) throw new Error('speed menu is empty');
        // 移动鼠标让控制条保持可见（3 秒不动会淡出，菜单跟着一起消失）。
        await page.mouse.move(320, 385);
        await page.waitForTimeout(150);
        await addCaption(page, captions.speedMenu, 'top-center');
        await assertCaptionDoesNotCover(page, 'store-speed-menu');
        await page.screenshot({ path: outPath('store-speed-menu', locale) });
        console.log(`${label('store-speed-menu', locale)} done (${rates.length} presets)`);
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
