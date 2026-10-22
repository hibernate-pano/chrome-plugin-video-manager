import { test, expect } from '@playwright/test';
import { launchExtension } from './helpers/launch.js';
import { anyLocale } from './helpers/i18n.js';

/**
 * 设置页：扩展**自己**的命令键必须被当成自冲突拦下来。
 *
 * 背景：扩展在 manifest 里注册了 `Ctrl+Shift+Comma`（打开设置页）。
 * 这个键归浏览器调度 —— 用户要是把某个动作也绑上去，
 * 按下去打开的是设置页，他绑的动作一次都不会发生。
 * 所以设置页必须**拒绝保存**这种绑定，而不是「保存成功但永远不生效」。
 *
 * ⚠️ 这条用例守的是一个**具体的字形**问题：
 * 美式键盘上 Shift+, 打出来的是 `<`，键盘事件给的正是 `<`；
 * 而 manifest 里写的是 "Ctrl+Shift+Comma"（基础键）。
 * 两套词不归一的话，按钮上的自冲突检查比对的是
 * `ctrl+shift+<` 与 `ctrl+shift+,` —— 不相等，于是放行。
 * 症状：界面上没有任何报错，状态栏显示「已保存」，
 * `chrome.storage.sync` 里真的写进了 `togglePlay: "ctrl+shift+<"`。
 *
 * 为什么必须**真加载扩展**来测：自冲突检查读的是
 * `chrome.runtime.getManifest().commands` —— 那是扩展自己的命令键，
 * 用 mock 写一份「假装是 Chrome 的 manifest」测的正是那份假装，不是产品。
 */

/** 打开设置页并等它渲染完（动作行 + 页脚）。 */
const openOptions = async (ext) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/options.html`);
  await page.waitForSelector('.vsc__row');
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

/**
 * 「播放/暂停」那一行的输入框。
 *
 * ⚠️ 按 data-action 找，而不是按位置（index 3）：SHORTCUT_DEFINITIONS 的顺序变了，
 * 写死的数字会指到别的动作上去 —— 那时这条用例会**假绿**。
 */
const togglePlayInput = (page) => page.locator('.vsc__key[data-action="togglePlay"]');

test.describe('设置页：扩展自己的命令键算自冲突', () => {
  test('按 Ctrl+Shift+Comma 绑定：那一行报错，保存被拒', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);
      const input = togglePlayInput(page);

      // ⚠️ 这条键在真实浏览器里就是扩展自己的命令键（manifest: Ctrl+Shift+Comma）。
      // 按下它时键盘事件给的是 '<'（Shift 变体），不是 ','。
      await input.click();
      await page.keyboard.press('Control+Shift+Comma');

      // 那一行必须**就地**报错：状态栏在页面最底部，指不出是哪一行。
      const rowError = page.locator('#error-togglePlay');
      await expect(rowError).toHaveText(anyLocale('optSelfConflict'));
      await expect(page.locator('#status')).toHaveText(anyLocale('optSelfConflict'));

      // 点保存：错误提示必须留在屏幕上，而且存不下去。
      await page.locator('#save').click();
      await expect(page.locator('#status')).toHaveText(anyLocale('optSelfConflict'));
      await expect(rowError).toHaveText(anyLocale('optSelfConflict'));

      // ⚠️ storage 里必须还是**原来的值**（默认绑定是空格）。
      expect((await storedShortcuts(page))?.togglePlay).toBe(' ');

      // 收集到的绑定必须归一到基础键 —— 否则「同一条绑定的两种写法」
      // 在比对时不相等，自冲突就漏了。
      await expect(input).toHaveAttribute('data-shortcut', 'ctrl+shift+,');
    } finally {
      await ext.close();
    }
  });

  /**
   * **历史绑定**：老版本按**键盘事件的字形**把绑定存进了 sync。
   *
   * ⚠️ 美式键盘上 Shift+, 打出来的是 `<`，键盘事件给的正是 `<`。
   * 早期版本照着事件字形存，于是 sync 里躺着的是 `ctrl+shift+<`。
   * 而扩展自己的命令键在 manifest 里写的是 "Ctrl+Shift+Comma"（基础键）。
   * 两套词不归一的话：设置页加载这份历史数据 → 拿 `ctrl+shift+<` 去比
   * `ctrl+shift+,` → 不相等 → **自冲突检测不出来**。
   * 症状：界面上没有任何报错、状态栏一切正常，而存下去的那条绑定
   * 与扩展自己的命令键撞车 —— 用户按下去打开的是设置页，
   * 他绑的那个动作一次都没发生。
   *
   * 所以这条守的是**加载路径**（不是用户现场按键那条路径）：
   * 读盘 → 归一 → 比对 → 报错 → 拒绝保存。
   * 只测「现场按键」那条路径，历史数据这条路就是**没人走过的**。
   */
  test('历史绑定存的是 Ctrl+Shift+<（Shift 的字形）→ 加载后必须被认成自冲突，保存被拒', async () => {
    const ext = await launchExtension();
    try {
      const page = await openOptions(ext);

      // 把「历史形态」的绑定写进 sync：Shift 变体的字形。
      await page.evaluate(async () => {
        const current = await chrome.storage.sync.get('vsc-settings');
        const stored = current['vsc-settings'] ?? {};
        await chrome.storage.sync.set({
          'vsc-settings': {
            ...stored,
            shortcuts: { ...(stored.shortcuts ?? {}), togglePlay: 'ctrl+shift+<' },
          },
        });
      });

      // 重新加载设置页，让它从 sync 读那份历史数据。
      await page.reload();
      await page.waitForSelector('.vsc__row');

      const input = togglePlayInput(page);

      // 归一必须发生：同一个物理键（逗号键），存的是字形 `<`，
      // 界面上必须显示成基础键 `,`。
      await expect(input).toHaveAttribute('data-shortcut', 'ctrl+shift+,');

      // 并且必须被认成自冲突 —— 就在加载后，不用用户碰任何东西。
      await expect(page.locator('#error-togglePlay')).toHaveText(anyLocale('optSelfConflict'));
      await expect(page.locator('#status')).toHaveText(anyLocale('optSelfConflict'));

      // 点保存：存不下去。
      await page.locator('#save').click();
      await expect(page.locator('#status')).toHaveText(anyLocale('optSelfConflict'));

      // ⚠️ 而且**不能因为打开页面就把用户的历史绑定改写掉** ——
      // 加载页面不是用户的一次编辑。
      expect((await storedShortcuts(page))?.togglePlay).toBe('ctrl+shift+<');
    } finally {
      await ext.close();
    }
  });
});
