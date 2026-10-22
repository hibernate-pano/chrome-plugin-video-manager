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
 * ⚠️ 位置写死（index 3）而不是按名字找：SHORTCUT_DEFINITIONS 的顺序变了，
 * 写死的数字会指到别的动作上去 —— 那时这条用例会**假绿**。
 * 这里用 data-action 找，顺序变了也不会指错。
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
});
