/**
 * 按平台渲染快捷键。
 *
 * macOS 上显示 `⌘` 而不是 `Meta`：用户在自己的键盘上找的是那枚 ⌘ 键，
 * 界面上写着 "Meta" 他得先在脑子里换算一次才知道该按哪颗。
 * 这是 macOS 的通用约定（系统设置、VS Code、Chrome 自己都这么写）。
 *
 * ⚠️ 字母**保持小写**：匹配是区分 Shift 的（绑定 `f` 时按 Shift+F 不触发），
 * 显示成大写等于教用户按一个不生效的键。这条规矩对所有平台一致。
 */

import { formatShortcut } from '../shared/shortcuts';

/** macOS 上的键名 → 符号。 */
const MAC_SYMBOLS: Record<string, string> = {
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  meta: '⌘',
  os: '⌘',
  cmd: '⌘',
  command: '⌘',
};

/**
 * 当前是不是 macOS。
 *
 * 优先用 `navigator.userAgentData.platform`（Chrome 116+ 有，值是 "macOS"），
 * 回落 `navigator.platform`（Chrome 里是 "MacIntel"），再回落 UA 串。
 *
 * ⚠️ 不能只看 UA 里的 "Mac"：iPadOS 的 UA 也带 "Mac"，而 iPad 上接的
 * 键盘没有 ⌘ 键（外接键盘才有）。`userAgentData.platform` 在 iPad 上给的是
 * "macOS"…这一档只能靠平台启发式判断，Chrome 自己也是这么判的。
 */
export const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const withUserAgentData = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = withUserAgentData.userAgentData?.platform ?? navigator.platform ?? '';

  if (platform) {
    return /mac/i.test(platform);
  }

  return /mac/i.test(navigator.userAgent ?? '');
};

/**
 * 把一条绑定渲染成给人看的形式（按平台）。
 *
 * macOS 上修饰键用符号、且**不加 "+"**（系统设置的写法就是 "⌘⇧,"）。
 */
export const formatShortcutLabel = (value: string): string => {
  const base = formatShortcut(value);
  if (base === '' || !isMacPlatform()) {
    return base;
  }

  return base
    .split('+')
    .map((part) => MAC_SYMBOLS[part.toLowerCase()] ?? part)
    .join('');
};

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
