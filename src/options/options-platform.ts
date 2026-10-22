/**
 * 按平台渲染快捷键。
 *
 * macOS 上显示 `⌘` 而不是 `Meta`：用户在自己的键盘上找的是那枚 ⌘ 键，
 * 界面上写着 "Meta" 他得先在脑子里换算一次才知道该按哪颗。
 * 这是 macOS 的通用约定（系统设置、VS Code、Chrome 自己都这么写）。
 *
 * ⚠️ 字母**保持小写**：匹配是区分 Shift 的（绑定 `f` 时按 Shift+F 不触发），
 * 显示成大写等于教用户按一个不生效的键。这条规矩对所有平台一致。
 *
 * ⚠️ 真正的实现住在 `src/shared/shortcuts.ts`：
 * 内容脚本（首次引导）也要渲染同一份绑定，两边各写一份就会漂移 ——
 * 曾经就漂移过一次：macOS 上「+」键在设置页与引导里都渲染成了空字符串。
 */

import { formatShortcutForPlatform, isMacPlatform } from '../shared/shortcuts';

export { isMacPlatform };

/**
 * 把一条绑定渲染成给人看的形式（按平台）。
 *
 * macOS 上修饰键用符号、且**不加 "+"**（系统设置的写法就是 "⌘⇧,"）。
 */
export const formatShortcutLabel = (value: string): string =>
  formatShortcutForPlatform(value, isMacPlatform());

/**
 * 渲染**扩展自己的命令键**（manifest.json 的 `commands`）。
 *
 * ⚠️ 与用户自己绑的键有一处**必须**不同：Chrome 的 commands API 在 macOS 上
 * 把 manifest 里写的 "Ctrl" 翻译成 "Command"（⌘）。
 * 于是 manifest 里的 "Ctrl+Shift+Comma" 在 macOS 上实际是 **⌘⇧,**，
 * 界面上却显示成 ⌃⇧, 就等于告诉用户去按一个不存在的组合。
 *
 * 用户自己的绑定**没有**这层翻译：他按 ⌃ 存下来就是 ctrl，显示 ⌃ 是对的。
 */
export const formatExtensionCommandLabel = (value: string): string => {
  if (!isMacPlatform()) {
    return formatShortcutLabel(value);
  }

  const translated = value
    .split('+')
    .map((part) => {
      const lowered = part.toLowerCase();
      return lowered === 'ctrl' || lowered === 'control' ? 'meta' : part;
    })
    .join('+');

  return formatShortcutLabel(translated);
};
