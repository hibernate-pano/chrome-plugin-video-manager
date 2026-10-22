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

import {
  isBrowserReservedShortcut as isSharedReserved,
  MODIFIER_ALIASES,
  normalizeShiftVariant,
} from '../shared/shortcuts';

/**
 * 修饰键的规范名（用于把 Chrome 的写法归一）。
 *
 * ⚠️ 别名（control / option / os / cmd / command）必须**折成规范名**，
 * 而不是各自算一个「另一种修饰键」—— 否则清单里写 `ctrl+…`、
 * 用户按 `control+…` 时就对不上，那条保留键就白写了。
 * 别名表与 shared 那份**共用一张**（MODIFIER_ALIASES）。
 */
const MODIFIER_NAMES = new Set(Object.keys(MODIFIER_ALIASES));

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
  backquote: '`',
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
  const lowered = value.toLowerCase();

  // ⚠️ **空格键**必须最先处理，不能先 trim 再切。
  //
  // 主键是空格时，结尾那个空格会被 `trim()` 吃掉：`'alt+ '` 变成 `'alt+'`，
  // 再被当成「结尾是分隔符」补成 `'alt+plus'` —— 于是「Alt+空格」
  // 被归一成「Alt+加号」。两者完全是两个键，而清单里写的就是 `'alt+ '`。
  // 症状：那条保留键**永远不触发**（这正是缺陷 2 里最难看见的一条）。
  //
  // 两种写法都认：`'alt+ '`（显式空格）与 `'alt+'`（历史写法，见 normalizeShortcut）。
  let raw = lowered;

  if (/\+\+$/.test(raw)) {
    // `'ctrl++'`：结尾那个 '+' 是**主键**（加号键），不是分隔符。
    raw = `${raw.slice(0, -1)}plus`;
  } else if (/\+\s*$/.test(raw)) {
    // `'alt+'` / `'alt+ '`：结尾那个 '+' 是分隔符，主键是空格。
    raw = `${raw.replace(/\+\s*$/, '')}+space`;
  }

  raw = raw.trim();
  if (raw === '') {
    return '';
  }

  const parts = raw.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return '';
  }

  const mainRaw = parts[parts.length - 1] as string;
  // ⚠️ 修饰键别名必须**折成规范名**（control → ctrl、os → meta）。
  // 不折的话，清单里写 `ctrl+t`，用户按 `control+t` 时就对不上 ——
  // 那条保留键等于白写。
  const modifiers = parts
    .slice(0, -1)
    .filter((part) => MODIFIER_NAMES.has(part))
    .map((part) => MODIFIER_ALIASES[part] ?? part)
    .sort();

  const main = CHROME_KEY_NAMES[mainRaw] ?? mainRaw;

  // ⚠️ Shift 变体字符必须在这里归回**基础键**。
  //
  // 背景：物理按下 Ctrl+Shift+, 时，键盘事件给的 `event.key` 是 `<`
  // （带 Shift 的逗号），而 manifest 里扩展自己的命令键写的是
  // "Ctrl+Shift+Comma" —— 归一成 `ctrl+shift+,`。
  // 两边不相等的话，扩展自己的命令键就检测不出来：用户把动作绑上去，
  // 浏览器先处理命令（打开设置页），他要的动作一次都不会发生。
  //
  // 归一之后 `ctrl+shift+<` 与 `ctrl+shift+,` 是同一条绑定 ——
  // 这正是要的效果：**同一个物理键只能算一条**。
  //
  // 表是 shared 那份（SHIFT_VARIANT_KEYS）：两套归一规则共用一张表，
  // 免得「改了一边、另一边还漏着」。
  return [...modifiers, normalizeShiftVariant(main)].join('+');
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
 *
 * ⚠️⚠️ **清单里的每一条都必须是 `canonicalShortcut` 真能产生出来的形态**
 * （6.2.0 审计缺陷 2）。
 *
 * 死条目不只是「没用」—— 它们让人**误以为有防护**：
 * 清单里写着 `alt+space`，于是作者以为「Alt+空格已经被拦住了」，
 * 而守卫**永远不会触发**（`canonicalShortcut('alt+space')` 产出的是
 * `alt+ ` —— 空格在规范形里是 `' '`，不是 `'space'`）。
 * 于是用户把 Alt+空格绑上去，存得进去，按下去浏览器抢走，扩展一声不吭。
 *
 * 这条约束由 `options-editing.test.ts` 里的守卫盯着：
 * **清单里每一条都必须能被产生器造出来**。
 *
 * ⚠️ **Shift 变体要列全**（缺陷 2 与缺陷 3）：
 * Chrome 的缩放键是 `Ctrl+Shift+=`（放大）与 `Ctrl+Shift+-`（缩小），
 * 不是 `Ctrl+=` / `Ctrl+-`。只列后者的话，真实缩放键存得进去。
 * 同理 `Ctrl+1..9` / `Ctrl+0`（切标签）也要把 Shift 变体列全。
 */
export const RESERVED_BROWSER_SHORTCUTS: ReadonlySet<string> = new Set([
  // —— 标签页 / 窗口 ——
  'ctrl+n',
  'ctrl+shift+n',
  'ctrl+t',
  'ctrl+shift+t',
  'ctrl+w',
  'ctrl+shift+w',
  'ctrl+tab',
  'ctrl+shift+tab',
  // ⚠️ Ctrl+1..9 / Ctrl+0 是「切到第 N 个标签页」，Shift 变体同样要拦。
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
  'ctrl+shift+1',
  'ctrl+shift+2',
  'ctrl+shift+3',
  'ctrl+shift+4',
  'ctrl+shift+5',
  'ctrl+shift+6',
  'ctrl+shift+7',
  'ctrl+shift+8',
  'ctrl+shift+9',
  'ctrl+shift+0',
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
  // ⚠️ **缩放键**：Chrome 的真实缩放键是 Ctrl+Shift+= / Ctrl+Shift+-。
  // 之前清单里只有 'ctrl+plus' / 'ctrl+-' —— 那是**没有 Shift 的那一档**，
  // 真实缩放键存得进去，一声不吭。
  // 'plus' 是加号键（`normalizeMainKey` 把 '+' 折成它），
  // 于是缩放那一档在规范形里是 'ctrl+shift+plus'。
  'ctrl+plus',
  'ctrl+shift+plus',
  'ctrl+-',
  'ctrl+shift+-',

  // —— 浏览器与系统共用的导航键 ——
  'alt+arrowleft',
  'alt+arrowright',
  'alt+arrowup',
  'alt+arrowdown',
  'alt+home',
  'alt+f4',
  'alt+f3',
  'alt+enter',
  // ⚠️ 空格在规范形里是 ' '（一个空格字符），不是 'space'。
  // 之前写 'alt+space' / 'ctrl+space' / 'ctrl+shift+space' / 'meta+space'
  // 是**死条目**：canonicalShortcut 产出的是 'alt+ ' / 'ctrl+ ' / …，
  // 与清单里的字面量永远不相等 —— 那条保留键从来没有生效过。
  'alt+ ',
  'ctrl+ ',
  'ctrl+shift+ ',
  'meta+ ',
  // ⚠️ 修饰键在规范形里是**按字母序排**的（canonicalShortcut 排的序）。
  // 清单里必须照那个形态写，否则这条就是死条目 ——
  // 'ctrl+alt+delete' 归一出来是 'alt+ctrl+delete'，两者永不相等。
  'alt+ctrl+delete',

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
  'meta+shift+1',
  'meta+shift+2',
  'meta+shift+3',
  'meta+shift+4',
  'meta+shift+5',
  'meta+shift+6',
  'meta+shift+7',
  'meta+shift+8',
  'meta+shift+9',
  'meta+shift+0',
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
  // ⚠️ 下面三条是**按字母序排**的规范形（`alt` < `meta`、`ctrl` < `meta`）。
  // 写成 'meta+alt+l' / 'meta+ctrl+f' 是死条目 —— canonicalShortcut 会把
  // 修饰键排序，产出 'alt+meta+l' / 'ctrl+meta+f'，两者永不相等。
  'alt+meta+l',
  'alt+meta+f',
  'ctrl+meta+f',
  'meta+m',
  'meta+shift+m',
  // ⚠️ 同样是「按字母序排」的规范形（见上面那条的说明）。
  'alt+meta+escape',
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
