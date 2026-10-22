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
