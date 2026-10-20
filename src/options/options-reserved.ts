/**
 * 浏览器保留键 —— 设置页用来**硬拦**的清单。
 *
 * ⚠️ 为什么不在 shared/shortcuts.ts 里改：那个文件此刻正被别人的改动碰着，
 * 改它会冲突。所以这里**另写一份**，并在下面把 shared 那份的行为也并进来
 * （`isSharedReservedShortcut`），保证「旧的清单 + 新的清单」都拦得住。
 *
 * ⚠️ 这份清单与 shared 那份的**关系是「包含」而不是「替代」**：
 * shared 那份只有 50 来条，覆盖的是最常见的一小撮；实测
 * Ctrl+Shift+i / Ctrl+Shift+t / Ctrl+Shift+w / Ctrl+, / Ctrl+Shift, 全都不在
 * 里面 —— 用户照样存进去了，按下去浏览器先处理，扩展的动作永远不触发。
 * 那不是「警告一下」能解决的：**存了但永远不生效**是最坏的一种结局，
 * 所以这里对浏览器保留键一律**拒绝保存**。
 */

import { isBrowserReservedShortcut as isSharedReserved } from '../shared/shortcuts';

/** 修饰键的规范名（用于把 Chrome 的写法归一）。 */
const MODIFIER_NAMES = new Set([
  'ctrl',
  'control',
  'alt',
  'option',
  'shift',
  'meta',
  'os',
  'cmd',
  'command',
]);

/**
 * Chrome 的 `suggested_key` 与扩展内部绑定用的键名不是一套词。
 *
 * Chrome 写 "Ctrl+Shift+Comma"，而键盘事件给的是 `event.key === ','`，
 * 扩展内部存的也是 `ctrl+shift+,`。两套词不归一的话，扩展自己的命令键
 * 永远匹配不上用户绑的键 —— 「自冲突」就检测不出来。
 */
const CHROME_KEY_NAMES: Record<string, string> = {
  comma: ',',
  period: '.',
  slash: '/',
  backslash: '\\',
  semicolon: ';',
  quote: "'",
  bracketleft: '[',
  bracketright: ']',
  minus: '-',
  equal: '=',
  plus: 'plus',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  pageup: 'pageup',
  pagedown: 'pagedown',
  home: 'home',
  end: 'end',
  insert: 'insert',
  delete: 'delete',
  backspace: 'backspace',
  tab: 'tab',
  enter: 'enter',
  escape: 'escape',
};

/**
 * 把一条绑定归一成**可比较**的形式。
 *
 * 形如 `ctrl+shift+,`（修饰键按字母序排，主键在最后）。
 *
 * 为什么修饰键要排序：`shift+ctrl+x` 与 `ctrl+shift+x` 是同一条绑定，
 * 不排序就会当成两条，重复检测会漏。
 */
export const canonicalShortcut = (value: string): string => {
  const raw = value.trim().toLowerCase();
  if (raw === '') {
    return '';
  }

  // 主键就是加号时，结尾那个 '+' 是分隔符而不是键名 —— 补成 'plus' 再切。
  const padded = raw.endsWith('+') ? `${raw}plus` : raw;
  const parts = padded.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return '';
  }

  const mainRaw = parts[parts.length - 1] as string;
  const modifiers = parts
    .slice(0, -1)
    .filter((part) => MODIFIER_NAMES.has(part))
    .sort();

  const main = CHROME_KEY_NAMES[mainRaw] ?? mainRaw;

  return [...modifiers, main].join('+');
};

/**
 * 浏览器自己占用的组合键。
 *
 * 覆盖三块：
 * 1. Chrome/Edge 的常用键（开新标签、找东西、开发者工具、缩放…）
 * 2. F1–F12（浏览器与系统各占了一部分）
 * 3. Alt+方向键 / Alt+Home 等浏览器与系统共用的导航键
 *
 * ⚠️ **裸键不算保留键**：`f` / `0` / `=` / 空格 / 方向键这些都是合法的用户
 * 绑定（也正是本扩展的默认绑定）。只有**带修饰键**的组合才是保留键。
 */
const RESERVED_BROWSER_SHORTCUTS: ReadonlySet<string> = new Set([
  // —— 标签页 / 窗口 ——
  'ctrl+n',
  'ctrl+shift+n',
  'ctrl+t',
  'ctrl+shift+t',
  'ctrl+w',
  'ctrl+shift+w',
  'ctrl+tab',
  'ctrl+shift+tab',
  'ctrl+1',
  'ctrl+2',
  'ctrl+3',
  'ctrl+4',
  'ctrl+5',
  'ctrl+6',
  'ctrl+7',
  'ctrl+8',
  'ctrl+9',
  'ctrl+0',
  'ctrl+shift+delete',
  'ctrl+shift+escape',
  'ctrl+shift+q',
  'ctrl+shift+m',

  // —— 地址栏 / 查找 / 收藏 ——
  'ctrl+l',
  'ctrl+e',
  'ctrl+k',
  'ctrl+f',
  'ctrl+g',
  'ctrl+shift+g',
  'ctrl+j',
  'ctrl+h',
  'ctrl+d',
  'ctrl+shift+d',
  'ctrl+o',
  'ctrl+shift+o',
  'ctrl+p',
  'ctrl+shift+p',
  'ctrl+s',
  'ctrl+u',
  'ctrl+r',
  'ctrl+shift+r',
  'ctrl+shift+b',
  'ctrl+,',
  'ctrl+shift+,',

  // —— 开发者工具 / 页面视图 ——
  'ctrl+shift+i',
  'ctrl+shift+j',
  'ctrl+shift+c',
  'ctrl+shift+u',
  'ctrl+plus',
  'ctrl+-',

  // —— 浏览器与系统共用的导航键 ——
  'alt+arrowleft',
  'alt+arrowright',
  'alt+arrowup',
  'alt+arrowdown',
  'alt+home',
  'alt+f4',
  'alt+f3',
  'alt+enter',
  'alt+space',
  'ctrl+alt+delete',
  'ctrl+space',
  'ctrl+shift+space',

  // —— 功能键 ——
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',

  // —— macOS 的对应键（Chrome 把 ⌘ 映射到 meta）——
  'meta+n',
  'meta+shift+n',
  'meta+t',
  'meta+shift+t',
  'meta+w',
  'meta+shift+w',
  'meta+q',
  'meta+tab',
  'meta+shift+tab',
  'meta+1',
  'meta+2',
  'meta+3',
  'meta+4',
  'meta+5',
  'meta+6',
  'meta+7',
  'meta+8',
  'meta+9',
  'meta+0',
  'meta+l',
  'meta+e',
  'meta+k',
  'meta+f',
  'meta+g',
  'meta+shift+g',
  'meta+j',
  'meta+h',
  'meta+d',
  'meta+shift+d',
  'meta+o',
  'meta+shift+o',
  'meta+p',
  'meta+shift+p',
  'meta+s',
  'meta+u',
  'meta+r',
  'meta+shift+r',
  'meta+shift+b',
  'meta+,',
  'meta+shift+,',
  'meta+alt+l',
  'meta+alt+f',
  'meta+ctrl+f',
  'meta+m',
  'meta+shift+m',
  'meta+space',
  'meta+alt+escape',
]);

/**
 * shared/shortcuts.ts 里那份清单（那份文件此刻不能改，只读不改）。
 *
 * 它用的是自己的归一规则（normalizeShortcut），与这里的 canonicalShortcut
 * 不是同一套 —— 所以两份都查，取「任一命中即保留」。
 * 那份清单是本清单的**子集**，留着它是为了「改一边不会把另一边的能力弄丢」。
 */
const isSharedReservedShortcut = (shortcut: string): boolean => {
  try {
    return isSharedReserved(shortcut);
  } catch {
    // 判不出来就当「不是保留键」：那只是少拦一个键，
    // 不会把一个合法绑定误判成保留键。
    return false;
  }
};

/** 这条绑定是不是浏览器自己占用的。 */
export const isBrowserReservedShortcut = (shortcut: string): boolean => {
  if (shortcut === '') {
    return false;
  }

  if (RESERVED_BROWSER_SHORTCUTS.has(canonicalShortcut(shortcut))) {
    return true;
  }

  return isSharedReservedShortcut(shortcut);
};

/**
 * 扩展**自己**声明的命令键（manifest.json 的 `commands`）。
 *
 * 这些键归浏览器调度：扩展的命令与内容脚本的快捷键撞在一起时，
 * 浏览器会先处理命令 —— 用户绑了 `Ctrl+Shift+,`，按下去打开的是设置页，
 * 他要的动作一次都不会发生。所以这属于**自冲突**，必须拦。
 */
export const extensionCommandShortcuts = (): string[] => {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.getManifest) {
      return [];
    }

    const commands = chrome.runtime.getManifest().commands ?? {};
    const keys: string[] = [];

    Object.values(commands).forEach((command) => {
      const suggested = command?.suggested_key as Record<string, string> | undefined;
      if (!suggested) {
        return;
      }

      Object.values(suggested).forEach((key) => {
        const canonical = canonicalShortcut(key);
        if (canonical !== '') {
          keys.push(canonical);
        }
      });
    });

    return keys;
  } catch {
    return [];
  }
};

/** 这条绑定是不是撞上了扩展自己的命令键。 */
export const isExtensionCommandShortcut = (shortcut: string): boolean => {
  if (shortcut === '') {
    return false;
  }

  const canonical = canonicalShortcut(shortcut);
  return canonical !== '' && extensionCommandShortcuts().includes(canonical);
};
