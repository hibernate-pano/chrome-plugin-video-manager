import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { launchExtension } from './helpers/launch.js';
import { anyLocale, anyLocaleFragment } from './helpers/i18n.js';

/**
 * 设置页的真实浏览器回归。
 *
 * 为什么必须**真加载扩展**来测：设置页读的是 `chrome.storage.sync`、
 * 写的是 `chrome.storage.sync`，还从 `chrome.runtime.getManifest()` 取版本号
 * 与扩展自己的命令键。用 jsdom mock 测这些，等于自己写一份「假装是 Chrome」
 * 的实现 —— 测的正是那份实现，不是产品。
 *
 * 守卫的是一组**用户能看见的**行为：
 *   - 改完键不保存 → 界面必须说「有未保存的更改」，刷新后改动必须真的丢掉
 *   - Enter = 保存；Escape = 撤销这次修改（回到**已保存**的值）
 *   - 「恢复默认」必须真的落盘
 *   - 浏览器保留键必须**存不下去**（存下去也永远不会生效）
 *   - 禁用的动作刷新后仍是「未绑定（已禁用）」，不是一个空白框
 *   - 长绑定必须带完整 title / aria-label
 */

/**
 * 设置页上有几行「可改键的动作」。
 *
 * ⚠️ 这个数字是**设置页自己的事实**，不是本文档写死的常数：
 * 它由 SHORTCUT_DEFINITIONS 决定，而那份清单会随版本变
 * （6.2.0 加了「重新显示使用引导」那一行）。
 * 写死数字的代价是：加一行设置，**整份设置页的 e2e 全红**，
 * 而那些红灯与设置页本身对不对毫无关系。
 */
const SHORTCUT_ROWS = 7;

/** 打开设置页并等它渲染完（动作行 + 页脚）。 */
const openOptions = async (ext) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/options.html`);
  await page.waitForSelector('.vsc__row');
  // ⚠️ 这里等的是「**至少**渲染出 7 个可改键的动作行」——
  // 那一段的行数是稳定的（SHORTCUT_DEFINITIONS 决定），
  // 而整页的行数还会因为别的卡片（引导重置）而变。
  await expect
    .poll(() => page.locator('#rows .vsc__row').count())
    .toBe(SHORTCUT_ROWS);
  return page;
};

/** 读 storage.sync 里真正存下来的绑定。 */
const storedShortcuts = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.storage.sync.get('vsc-settings', (result) => {
          resolve(result['vsc-settings']?.shortcuts ?? null);
        });
      }),
  );

/** 第 n 行（0 起）的输入框。 */
const inputAt = (page, index) => page.locator('.vsc__key').nth(index);

/** 「网页全屏」是最后一行（SHORTCUT_DEFINITIONS 的顺序）。 */
const FULLSCREEN_ROW = 6;

test.describe('设置页：改键、保存、撤销', () => {
  test('渲染出 7 个可改键的动作、真实版本号与两条使用提示', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);

      await expect(page.locator('#rows .vsc__row')).toHaveCount(SHORTCUT_ROWS);

      // 「重新显示使用引导」是**独立的一张卡片**，不是可改键的动作行 ——
      // 单独断言它在，免得以后有人把它混进行数里，数字又对不上了。
      await expect(page.locator('#reset-hint')).toHaveCount(1);

      // ⚠️ 之前页脚是 "Version —"：chrome mock / stub 少了 getManifest()，
      // 版本号读不出来。截图上那行字看着像渲染坏了。
      const version = await page.locator('.vsc__version').textContent();
      expect(version).toMatch(/\d+\.\d+\.\d+/);
      expect(version).not.toContain('—');

      // 这两件事此前只写在 README 与商店文案里，产品内一处都没有。
      const tips = (await page.locator('#tips').textContent()) ?? '';
      expect(tips).toMatch(anyLocaleFragment('optTipsToolbar'));
      expect(tips).toMatch(anyLocaleFragment('optTipsOptions'));
    } finally {
      await ext.close();
    }
  });

  test('改了键不保存：按钮出现「•」，状态栏说清楚，刷新后改动真的丢掉', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      await input.click();
      await page.keyboard.press('k');

      await expect(page.locator('#save')).toContainText('•');
      await expect(page.locator('#status')).toHaveText(anyLocale('optUnsaved'));

      // 刷新 = 放弃草稿。存下去的东西必须**没有**被改动。
      await page.reload();
      await page.waitForSelector('.vsc__row');
      await expect(inputAt(page, FULLSCREEN_ROW)).toHaveValue('f');
      expect((await storedShortcuts(page))?.fullscreen).toBe('f');
    } finally {
      await ext.close();
    }
  });

  test('Enter 等同于保存：写进 storage，刷新后还在', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      await input.click();
      await page.keyboard.press('k');
      await page.keyboard.press('Enter');

      await expect(page.locator('#status')).toHaveText(anyLocale('optSaved'));
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('k');

      await page.reload();
      await page.waitForSelector('.vsc__row');
      await expect(inputAt(page, FULLSCREEN_ROW)).toHaveValue('k');
    } finally {
      await ext.close();
    }
  });

  test('Escape 撤销这次修改：回到已保存的值，不把它覆盖掉', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      // 先存一个 'g'，这样「已保存的值」与默认值不同，撤销才有意义。
      await input.click();
      await page.keyboard.press('g');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('g');

      await input.click();
      await page.keyboard.press('k');
      await expect(input).toHaveValue('k');

      // ⚠️ 之前这里回填的是**草稿**，撤销等于什么也没撤销：
      // 框里还是 k，之后一点保存就把错的键写进去了。
      await page.keyboard.press('Escape');
      await expect(input).toHaveValue('g');

      await page.locator('#save').click();
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('g');
    } finally {
      await ext.close();
    }
  });

  test('恢复默认真的落盘', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      await input.click();
      await page.keyboard.press('g');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('g');

      await page.locator('#reset').click();
      await expect(page.locator('#status')).toHaveText(anyLocale('optRestored'));
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('f');

      // 刷新后仍然是默认值 —— 之前「恢复默认」只改界面，storage 里还是旧值。
      await page.reload();
      await page.waitForSelector('.vsc__row');
      await expect(inputAt(page, FULLSCREEN_ROW)).toHaveValue('f');
    } finally {
      await ext.close();
    }
  });

  test('禁用的动作刷新后仍显示「未绑定（已禁用）」，不是一个空白框', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      await input.click();
      await page.keyboard.press('Backspace');
      await expect(input).toHaveValue('');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('');

      await page.reload();
      await page.waitForSelector('.vsc__row');

      const reloaded = inputAt(page, FULLSCREEN_ROW);
      await expect(reloaded).toHaveValue('');
      await expect(reloaded).toHaveAttribute('placeholder', anyLocale('optDisabled'));
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：浏览器保留键一律拒绝保存', () => {
  test('保留键被拦下，且存不下去', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      // Ctrl+Shift+U：Chrome 自己不占用，但它是浏览器保留键清单里的一条
      //（Firefox 的查看源码键、macOS 的输入源切换等）。
      // ⚠️ 不能用 Ctrl+Shift+I / Ctrl+Shift+W 这类**浏览器自己**的快捷键：
      // 那些在按键到达页面之前就被浏览器吃掉了，测不到「扩展拦不拦」。
      await input.click();
      await page.keyboard.press('Control+Shift+U');

      await expect(page.locator('#status')).toHaveText(anyLocale('optReserved'));

      // 点保存：错误提示必须**留在屏幕上**，而且存不下去。
      await page.locator('#save').click();
      await expect(page.locator('#status')).toHaveText(anyLocale('optReserved'));
      expect((await storedShortcuts(page))?.fullscreen).toBe('f');
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：长绑定与无障碍', () => {
  test('长绑定带完整的 title 与 aria-label', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      // 最长的组合：框里装不下时，靠 title / aria-label 兜底。
      await input.click();
      await page.keyboard.press('Control+Alt+Shift+Meta+PageDown');
      await page.keyboard.press('Enter');
      // ⚠️ 存的是 'PageDown'（event.key 的原样），显示时才归一成 'PgDn'。
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen)
        .toBe('ctrl+alt+shift+meta+PageDown');

      await page.reload();
      await page.waitForSelector('.vsc__row');
      const reloaded = inputAt(page, FULLSCREEN_ROW);
      await expect(reloaded).toHaveAttribute('title', /PgDn/);
      await expect(reloaded).toHaveAttribute('aria-label', /PgDn/);
    } finally {
      await ext.close();
    }
  });

  test('聚焦输入框时占位符提示怎么按', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      await input.click();
      // ⚠️ 之前是「按下按键」——四个字里少了一个「要」，读着别扭。
      await expect(input).toHaveAttribute('placeholder', anyLocale('optPressKey'));
    } finally {
      await ext.close();
    }
  });
});

/**
 * storage 出故障时的设置页。
 *
 * ## 为什么这一组必须**真加载扩展**来测
 *
 * 「读设置失败」与「写设置失败」是设置页里唯一会**静默毁掉用户数据**的两条路径：
 *
 * - 读失败时，界面上显示的是**默认值**，而 storage 里是用户真实的绑定。
 *   之前的 catch 分支写的是 `apply(DEFAULT_SHORTCUTS, { markSaved: true })` ——
 *   把默认值当成了「用户已经保存过的值」。于是页面上显示默认键、状态栏空的、
 *   「保存」按钮上没有「•」，用户完全看不出这里出过任何事；接着他改一个键
 *   按「保存」，storage 里 7 条自定义绑定中的 6 条被默认值**静默抹掉**，
 *   而页面从头到尾显示「一切正常」。
 *
 * - 写失败时，失败提示只是直接写进 DOM，下一次改键就被「有未保存的更改」
 *   盖掉 —— 「保存失败，请重试」只在「用户什么都不做」的那几秒里存在。
 *
 * 怎么造故障：用 `addInitScript` 在页面脚本之前把 `chrome.storage.sync.get/set`
 * 换掉，模拟 Chrome 读/写失败时的形态（回调被调用，但 `chrome.runtime.lastError`
 * 非空 —— `settings.ts` 的 getValue/setValue 正是靠 lastError 来 reject 的）。
 *
 * ⚠️ 读失败必须在**页面加载之前**注入：设置页一打开就在读设置。
 * 而写失败可以在页面加载**之后**注入 —— 这样初始播种那一笔写盘不受影响，
 * 我们测的才是「用户改完键再保存」这一笔。
 */

/** 让 `chrome.storage.sync.get` 失败（必须在页面加载前注入）。 */
const breakSyncGet = (page) =>
  page.addInitScript(() => {
    const chromeMock = chrome;
    chromeMock.storage.sync.get = (key, callback) => {
      chromeMock.runtime.lastError = { message: 'e2e: storage.sync.get failed' };
      callback({});
      chromeMock.runtime.lastError = null;
    };
  });

/** 让 `chrome.storage.sync.set` 失败（页面加载后注入即可）。 */
const breakSyncSet = (page) =>
  page.evaluate(() => {
    const chromeMock = chrome;
    chromeMock.storage.sync.set = (value, callback) => {
      chromeMock.runtime.lastError = { message: 'e2e: storage.sync.set failed' };
      callback?.();
      chromeMock.runtime.lastError = null;
    };
  });

test.describe('设置页：读取设置失败', () => {
  test('明确报错，而且**不写**任何东西进 storage', async () => {
    const ext = await launchExtension();
    try {
      // 先在 service worker 里存一份用户自定义过的绑定。
      await ext.serviceWorker.evaluate(
        () =>
          new Promise((resolve) => {
            chrome.storage.sync.set(
              {
                'vsc-settings': {
                  shortcuts: {
                    increaseSpeed: '1',
                    decreaseSpeed: '2',
                    resetSpeed: '3',
                    togglePlay: '4',
                    seekBack: '5',
                    seekForward: '6',
                    fullscreen: '7',
                  },
                },
              },
              resolve,
            );
          }),
      );

      const page = await ext.context.newPage();
      await breakSyncGet(page);
      await page.goto(`chrome-extension://${ext.extensionId}/options.html`);
      await page.waitForSelector('.vsc__row');

      // (a) 状态栏有明确的错误文案。
      await expect(page.locator('#status')).toHaveText(anyLocale('optLoadFailed'));
      // 而且给了「重试读取」这条出路。
      await expect(page.locator('#retry-load')).toBeVisible();

      // (b) 改一个键再点保存 —— storage 里**一个字节都不许变**。
      // ⚠️ 之前写进去的是 {increaseSpeed:'=', ..., fullscreen:'z'}：
      // 用户 7 条自定义绑定里的 6 条被默认值静默抹掉。
      const input = inputAt(page, FULLSCREEN_ROW);
      await input.click();
      await page.keyboard.press('z');
      // ⚠️ 按钮在读失败时是 aria-disabled（不是 disabled）——
      // 它**仍然可点**（点下去会给出明确错误，而不是毫无反应），
      // 但 Playwright 的可操作性检查会认为 aria-disabled 的元素不可点。
      // 这里用 dispatchEvent 绕开「替用户点」这一层，
      // 测的是产品自己的点击处理。
      await page.locator('#save').dispatchEvent('click');

      // ⚠️ 必须**等这一轮保存走完**再读 storage：
      // 写盘是异步的，不等就会读到「还没写进去」的旧值 ——
      // 那样这条断言是**假绿**的（守卫守不住任何东西）。
      // 读不到真值时，保存必须被拒绝：状态栏仍然是那条读取失败。
      await expect(page.locator('#status')).toHaveText(anyLocale('optLoadFailed'));

      // storage 里的真值必须**原封不动**。
      const stored = await ext.serviceWorker.evaluate(
        () =>
          new Promise((resolve) => {
            chrome.storage.sync.get('vsc-settings', (result) => {
              resolve(result['vsc-settings']?.shortcuts ?? null);
            });
          }),
      );
      expect(stored).toEqual({
        increaseSpeed: '1',
        decreaseSpeed: '2',
        resetSpeed: '3',
        togglePlay: '4',
        seekBack: '5',
        seekForward: '6',
        fullscreen: '7',
      });
    } finally {
      await ext.close();
    }
  });

  test('「恢复默认」也不写任何东西进 storage', async () => {
    const ext = await launchExtension();
    try {
      await ext.serviceWorker.evaluate(
        () =>
          new Promise((resolve) => {
            chrome.storage.sync.set(
              { 'vsc-settings': { shortcuts: { fullscreen: '7' } } },
              resolve,
            );
          }),
      );

      const page = await ext.context.newPage();
      await breakSyncGet(page);
      await page.goto(`chrome-extension://${ext.extensionId}/options.html`);
      await page.waitForSelector('.vsc__row');

      await page.locator('#reset').dispatchEvent('click');

      // ⚠️ 等这一轮写盘走完（写盘是异步的），
      // 否则读到的是「还没写进去」的旧值 —— 断言会变成假绿。
      await expect(page.locator('#status')).toHaveText(anyLocale('optLoadFailed'));

      const stored = await ext.serviceWorker.evaluate(
        () =>
          new Promise((resolve) => {
            chrome.storage.sync.get('vsc-settings', (result) => {
              resolve(result['vsc-settings']?.shortcuts ?? null);
            });
          }),
      );
      expect(stored?.fullscreen).toBe('7');
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：保存失败', () => {
  test('失败文案留在屏幕上，再按一个键也不消失', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      // 页面加载完再弄坏写盘：这样我们测的正是「用户改完键再保存」这一笔。
      await breakSyncSet(page);

      const input = inputAt(page, FULLSCREEN_ROW);
      await input.click();
      await page.keyboard.press('k');
      await page.locator('#save').click();

      await expect(page.locator('#status')).toHaveText(anyLocale('optSaveFailed'));

      // ⚠️ 关键一步：用户再动一下输入框。
      // 之前这一步就把失败提示冲掉了 —— 失败信息只在「用户什么都不做」
      // 的窗口里存在。
      //
      // ⚠️ 必须先点回输入框：点过「保存」之后焦点在按钮上，
      // 直接按的键根本不会进到输入框的 keydown 里 ——
      // 那样这一步等于什么都没做，断言就成了假绿。
      await inputAt(page, FULLSCREEN_ROW).click();
      await page.keyboard.press('j');
      await expect(
        page.locator('#status'),
        '失败提示必须留在屏幕上，直到下一次成功为止',
      ).toHaveText(anyLocale('optSaveFailed'));
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：「恢复默认」写盘失败', () => {
  test('失败时回滚界面，并且一个字节都不写', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);

      // 先存一个自定义值，让「恢复默认」有东西可回滚。
      const input = inputAt(page, FULLSCREEN_ROW);
      await input.click();
      await page.keyboard.press('g');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('g');

      await breakSyncSet(page);

      // (a) 状态栏是失败文案。
      await page.locator('#reset').click();
      await expect(page.locator('#status')).toHaveText(anyLocale('optSaveFailed'));

      // (b) storage 里没有被写入默认值。
      expect((await storedShortcuts(page))?.fullscreen).toBe('g');

      // 界面回滚：仍然显示用户原来的绑定。
      await expect(inputAt(page, FULLSCREEN_ROW)).toHaveValue('g');

      // (c) 再动一下输入框，失败文案**仍在**。
      await inputAt(page, FULLSCREEN_ROW).click();
      await page.keyboard.press('k');
      await expect(page.locator('#status')).toHaveText(anyLocale('optSaveFailed'));
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：「恢复默认」可以撤销', () => {
  test('落盘之后出现「撤销」，点它能把原来的绑定写回去', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      await input.click();
      await page.keyboard.press('g');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('g');

      await page.locator('#reset').click();
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('f');

      // 落盘之后必须有「撤销」——
      // 误点一下就把 7 条绑定全恢复默认，而页面**不显示历史**，
      // 用户原来的自定义键在界面上没有任何记录可以找回。
      await expect(page.locator('#reset')).toHaveText(anyLocale('optUndoRestore'));

      await page.locator('#reset').click();
      await expect.poll(async () => (await storedShortcuts(page))?.fullscreen).toBe('g');
      await expect(inputAt(page, FULLSCREEN_ROW)).toHaveValue('g');
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：有未保存的改动时不许悄悄走人', () => {
  test('改完键刷新页面：浏览器弹出拦阻的对话框', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = inputAt(page, FULLSCREEN_ROW);

      await input.click();
      await page.keyboard.press('k');
      await expect(page.locator('#save')).toContainText('•');

      // ⚠️ 之前完全没有拦阻：刷新一下，改动静默消失。
      const dialogs = [];
      page.on('dialog', async (dialog) => {
        dialogs.push(dialog.type());
        await dialog.accept();
      });

      await page.reload();
      await page.waitForSelector('.vsc__row');

      expect(dialogs, '有未保存的改动时必须弹出 beforeunload 对话框').toContain('beforeunload');
    } finally {
      await ext.close();
    }
  });

  test('没有改动时刷新页面：不拦（用户正常关页不该被打扰）', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);

      const dialogs = [];
      page.on('dialog', async (dialog) => {
        dialogs.push(dialog.type());
        await dialog.accept();
      });

      await page.reload();
      await page.waitForSelector('.vsc__row');

      expect(dialogs).toEqual([]);
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：读屏用户能听到「现在绑的是哪个键」', () => {
  test('AX tree 里输入框的可访问名带着当前绑定的键', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);

      // ⚠️ 判据是 **AX tree**，不是 DOM 属性。
      // DOM 上写着 aria-label 是一回事，读屏软件实际念什么是另一回事 ——
      // accname 的规则是 aria-labelledby 优先于 aria-label，
      // 两者同时存在时 aria-label 是**死代码**。
      const cdp = await page.context().newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');

      const textboxes = nodes.filter((node) => node.role?.value === 'textbox');
      expect(textboxes.length).toBe(SHORTCUT_ROWS);

      // 「网页全屏」是最后一行，绑的是 'f'。
      const fullscreen = textboxes[textboxes.length - 1];
      const name = fullscreen?.name?.value ?? '';
      expect(
        name,
        '可访问名里必须带当前绑定的键（之前只有「网页全屏」，键是死代码）',
      ).toContain('f');
      // 动作名也还在（WCAG 2.5.3：标签在名字里）。
      //
      // ⚠️ 这里**不能**用「把 f 删掉，看剩下什么」来反推动作名 ——
      // 英文 locale 下动作名是 "Page fullscreen"，删掉所有 f 会变成
      // "Page ullscree: "，于是这条断言在 CI（英文环境）上必然失败，
      // 而本地（中文系统）刚好通过。
      // 动作名随语言变，**只能**从 locale 文件里取。
      expect(name).toMatch(anyLocaleFragment('actionFullscreen'));
    } finally {
      await ext.close();
    }
  });

  test('聚焦输入框之后，AX 的 value 仍然带着当前绑定的键', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      await inputAt(page, FULLSCREEN_ROW).click();

      const cdp = await page.context().newCDPSession(page);
      const { nodes } = await cdp.send('Accessibility.getFullAXTree');

      const textboxes = nodes.filter((node) => node.role?.value === 'textbox');
      const fullscreen = textboxes[textboxes.length - 1];
      // ⚠️ 之前 focus 处理把 value 清空，于是聚焦之后 AX 的 value
      // 直接变成 undefined —— 读屏用户聚焦过去听到的是
      // 「加速，只读，加快播放速度（+0.1，长按连续）」，
      // 完全不知道当前绑的是哪个键。
      expect(
        fullscreen?.value?.value,
        '聚焦之后必须还听得到当前绑定的键',
      ).toBe('f');
    } finally {
      await ext.close();
    }
  });
});

test.describe('设置页：页面结构', () => {
  /**
   * 「保存」按钮必须**一直**在视口底部。
   *
   * ⚠️ 这条守卫的**上一版**守的是 DOM 顺序（「使用引导」必须在动作行之后），
   * 那是个**代理指标**：它假设「动作行排在最后」就等于「吸底」。
   * 实际测出来不是 ——
   *   - 1280×800（页面不滚动）：sticky 根本不生效，动作条悬在页面中间，
   *     离视口底 159px，下面还空着 50px 才轮到「使用引导」；
   *   - 640×480 滚到底：sticky 被后面的元素顶开，离视口底 149px。
   * 根因：sticky 只在它是包含块里**最后一个**流内元素时才吸得住底。
   *
   * 所以现在这条守的是**行为**：量动作条底边与视口底边的距离。
   * 代理指标（DOM 顺序）已经换成真指标（几何）。
   */
  test('「保存」按钮一直贴在视口底部（不滚动时也贴、滚到底也贴）', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);

      // 1) 结构前提：动作条必须是 <main> 的**最后一个**元素。
      //    这不是排版偏好，是 sticky 能吸住底的前提条件。
      const structure = await page.evaluate(() => {
        const main = document.querySelector('main');
        const actions = document.querySelector('.vsc__actions');
        if (!main || !actions) return null;
        return {
          isLastChild: main.lastElementChild === actions,
          hintIsCard: document.querySelector('#hint')?.classList.contains('vsc__card') ?? true,
        };
      });
      expect(structure, '页面结构节点必须都在').not.toBeNull();
      expect(
        structure.isLastChild,
        '动作条必须是 <main> 的最后一个元素 —— 它后面若还有元素，sticky 会被顶离视口底',
      ).toBe(true);
      // 「使用引导」不再套那张跟快捷键表一样的白卡片 ——
      // 同一个 .vsc__card 会让用户以为它管的是快捷键。
      expect(structure.hintIsCard).toBe(false);

      /**
       * 量动作条底边离视口底边有多远（0 = 严丝合缝）。
       *
       * ⚠️ 断言时**必须取绝对值**：负数意味着条子掉到视口**下面**去了
       * （用户看不见它），那也是坏的。只判「≤ 1」的话，
       * 掉到下面去反而会被放过 —— 这条用例一开始就是这么写错的。
       */
      const gapToViewportBottom = (page) =>
        page.evaluate(() => {
          const bar = document.querySelector('.vsc__actions');
          if (!bar) return null;
          return Math.round(window.innerHeight - bar.getBoundingClientRect().bottom);
        });

      // 2) 1280×800：这一屏**装得下**整页 → 页面不滚动 → sticky 不会触发。
      //    动作条仍然必须贴在视口底（靠 min-height + flex 把多余空间吃掉）。
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(150);
      expect(
        Math.abs(await gapToViewportBottom(page)),
        '1280×800（整页装得下、不滚动）时「保存」也必须贴着视口底',
      ).toBeLessThanOrEqual(1);

      // 3) 640×480：页面要滚。滚到底时动作条**仍然**必须贴着视口底 ——
      //    之前它在这里被后面的「使用引导 / 版本行」顶高了 149px。
      await page.setViewportSize({ width: 640, height: 480 });
      await page.waitForTimeout(150);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      expect(
        Math.abs(await gapToViewportBottom(page)),
        '滚到页面底部时「保存」必须仍然贴着视口底',
      ).toBeLessThanOrEqual(1);

      // 4) ⚠️ **滚动途中**才是 sticky 的活儿。
      //    上面那两条端点状态，光靠 min-height + flex + margin-top:auto 就能过 ——
      //    所以只测它们的话，把 position: sticky 拆掉这条用例照样绿（假守卫）。
      //    滚到中间时，动作条必须**仍然**钉在视口底。
      await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
      await page.waitForTimeout(150);
      expect(
        Math.abs(await gapToViewportBottom(page)),
        '滚动到页面中间时「保存」必须仍然钉在视口底（这才是 sticky 的活儿）',
      ).toBeLessThanOrEqual(1);
    } finally {
      await ext.close();
    }
  });
});
