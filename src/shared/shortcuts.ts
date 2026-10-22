import { DEFAULT_SHORTCUTS, ShortcutSettings } from './types';

const MODIFIER_KEYS = new Set(['ctrl', 'control', 'alt', 'shift', 'meta', 'os']);

/**
 * 「+」键的规范写法。
 *
 * 「+」同时是「修饰键与主键之间的分隔符」和「键盘上一个真实存在的键位」，
 * 让它自己当主键会立刻产生歧义：`ctrl++` 到底是「ctrl + 加号键」还是「ctrl + 加号字符」？
 * 于是主键为加号时统一写成这个记号：
 *
 * - 裸加号键：`plus`
 * - ctrl + 加号键：`ctrl+plus`
 *
 * 约定：**带修饰键的组合用 `+` 分隔（ctrl+shift+k），主键是加号键时写成 `plus`。**
 * 这个记号不含分隔符，split('+') 之后仍然是干净的 [修饰键..., 主键]，往返无损。
 *
 * 它只影响「主键是加号」这一种情况，历史绑定的含义完全不变。
 */
export const PLUS_KEY = 'plus';

/**
 * 修饰键前缀：`ctrl+` / `control+` / `alt+` / `shift+` / `meta+` / `os+`。
 *
 * 从左往右逐层剥掉修饰键，剩下的就是主键。
 */
const MODIFIER_PREFIX = /^(ctrl|control|alt|shift|meta|os)\+(.*)$/i;

/**
 * Shift 变体字符 → 基础键字符。
 *
 * 美式键盘上**物理键**与**它打出来的字符**不是一对一：Shift+, 打出来的是
 * `<`，但物理键还是那个逗号键（Shift 只是个修饰键）。
 *
 * 键盘事件给的是**带 Shift 的那个字符**（`event.key === '<'`），
 * 而 Chrome 的 suggested_key 写的是**基础键名**（`"Comma"`）。
 * 两套词不归一的话，同一个物理键被当成两个不同的绑定：
 * 扩展自己声明的命令键（`Ctrl+Shift+Comma`）就检测不出来 ——
 * 用户把动作绑上去，浏览器先打开设置页，那个动作一次都不会发生。
 *
 * ⚠️ 表里只放**确实由 Shift 产生**的那几个标点。
 * 别把无关的键也塞进来：映射表一旦掺进「本来就不同的键」，
 * 两个不同的绑定会被误判成同一个，用户会发现自己的两个快捷键莫名互相顶替。
 *
 * ⚠️ 归一是**单向**的（变体 → 基础键）。基础键不在表里，
 * 查表落空就原样返回 —— 于是 `<` 与 `,` 落到同一个值上，
 * 而 `,` 自己不会变成 `<`（否则同一个键在两次归一之间来回跳，
 * 存进 storage 的绑定与比对时用的绑定就对不上了）。
 */
export const SHIFT_VARIANT_KEYS: Readonly<Record<string, string>> = {
  '<': ',',
  '>': '.',
  '?': '/',
  '|': '\\',
  '"': "'",
  '~': '`',
};

/**
 * 主键归一：把 Shift 变体字符换回它的基础键。
 *
 * ⚠️ 必须与 `src/options/options-reserved.ts` 的 canonicalShortcut 用**同一张表** ——
 * 那两套归一规则的形态不同（修饰键排序、Chrome 键名），但「同一个物理键的
 * 两种写法必须归到同一个值」这条对两边一样成立。表只有一份，才不会一边改了
 * 另一边没改（这个洞就是这么漏的）。
 */
export const normalizeShiftVariant = (value: string): string =>
  SHIFT_VARIANT_KEYS[value] ?? value;

const normalizeMainKey = (value: string) => {
  if (value === '' || value === ' ' || value === 'Space' || value === 'Spacebar') {
    return ' ';
  }

  // 加号键走专用记号，理由见 PLUS_KEY 的说明。
  // 大小写都要收：'Plus' / 'PLUS' 与 '+' 是同一个键。
  if (value === '+' || value.toLowerCase() === 'plus') {
    return PLUS_KEY;
  }

  // ⚠️ Shift 变体要先归回基础键，再谈大小写：
  // 物理键只有一个（逗号键），Shift 只是修饰键，
  // 于是 'ctrl+shift+<' 与 'ctrl+shift+,' 必须是同一条绑定。
  const base = normalizeShiftVariant(value);

  if (base.length === 1) {
    return base.toLowerCase();
  }

  return base;
};

/**
 * 规范化快捷键字符串：
 * - 修饰键小写（ctrl/alt/shift/meta）
 * - 主键统一（'Space'/'Spacebar'/' ' -> ' '，'+' -> 'plus'）
 * - 空串原样返回（非法输入不产生有效快捷键）
 *
 * 解析方式是从左往右剥掉修饰键前缀，剩下的就是主键。这比「按 '+' 切段」更稳：
 * 切段无法区分「'ctrl++' 里的加号是主键」和「'ctrl+' 里的加号是分隔符」，
 * 而剥前缀之后主键只剩最后一段 —— 'ctrl++' 剥掉 'ctrl+' 剩下 '+'，正好就是加号键。
 *
 * 老数据的含义完全不变：
 * - 'ctrl+'（结尾是分隔符）-> 'ctrl+ '（空格，历史行为）
 * - 'shift+Shift' -> 'shift+shift'（主键是修饰键，交给上层判非法）
 * - 'ctrl+shift+k' -> 'ctrl+shift+k'（不变）
 */
export const normalizeShortcut = (value: string) => {
  if (value === '') {
    return '';
  }

  const modifiers: string[] = [];
  let rest = value;

  // 最多剥 4 层（ctrl+alt+shift+meta 已是最长组合），多一层就当非法。
  for (let depth = 0; depth < 4; depth += 1) {
    const matched = MODIFIER_PREFIX.exec(rest);
    if (!matched) {
      break;
    }

    modifiers.push(matched[1].toLowerCase());
    rest = matched[2];
  }

  // 剥完修饰键后，主键里还留着分隔符 -> 这条输入不是「修饰键 + 主键」的结构，判为非法。
  // 静默把它拼成一个看起来能用的绑定比直接拒绝危险得多：
  // 用户会在设置页看到「已保存」，但按键永远不触发。
  //
  // 唯一的例外是主键**就是**加号本身（'+' / 'ctrl++' 剥完剩下 '+'）：
  // 那正是我们要支持的写法。
  if (rest.includes('+') && rest !== '+') {
    return '';
  }

  const mainKey = normalizeMainKey(rest);

  if (modifiers.length === 0) {
    return mainKey;
  }

  return `${modifiers.join('+')}+${mainKey}`;
};

/** 末段主键归一化后落在修饰键集合里（历史脏数据 'shift+Shift' 之类），视为非法绑定。 */
const hasModifierMainKey = (shortcut: string) => {
  const parts = shortcut.split('+').filter(Boolean);
  const mainKey = parts[parts.length - 1];

  return mainKey !== undefined && MODIFIER_KEYS.has(normalizeMainKey(mainKey).toLowerCase());
};

/** 归一化单条绑定；主键是修饰键时回落到默认值，避免脏绑定被原样存盘后吞键。 */
const normalizeBinding = (value: string | undefined, fallback: string) => {
  const normalized = normalizeShortcut(value ?? fallback);

  return hasModifierMainKey(normalized) ? normalizeShortcut(fallback) : normalized;
};

export const normalizeShortcutSettings = (
  value?: Partial<ShortcutSettings> | null,
): ShortcutSettings => {
  const normalize = (id: keyof ShortcutSettings) =>
    normalizeBinding(value?.[id], DEFAULT_SHORTCUTS[id]);

  return {
    increaseSpeed: normalize('increaseSpeed'),
    decreaseSpeed: normalize('decreaseSpeed'),
    resetSpeed: normalize('resetSpeed'),
    togglePlay: normalize('togglePlay'),
    seekBack: normalize('seekBack'),
    seekForward: normalize('seekForward'),
    fullscreen: normalize('fullscreen'),
  };
};

export const keyboardEventToShortcut = (event: KeyboardEvent) => {
  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push('ctrl');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }
  if (event.metaKey) {
    parts.push('meta');
  }

  const key = normalizeMainKey(event.key);
  if (MODIFIER_KEYS.has(key.toLowerCase())) {
    return null;
  }

  parts.push(key);
  return parts.join('+');
};

/**
 * 一条绑定的结构：修饰键 + 主键。
 *
 * ⚠️ 为什么需要它：「主键是加号键」这件事**不能**靠 split('+') 还原 ——
 * 加号既是「修饰键与主键之间的分隔符」，又是一个真实存在的键位。
 * `formatShortcut('ctrl+plus')` 渲染出来是 `Ctrl++`，再 split('+') 就得到
 * `['Ctrl', '', '']` —— 那个键**整个消失**了（macOS 上尤其明显：
 * 符号表里查不到空串，于是那一段渲染成空）。
 *
 * 规范形里主键永远是 `plus` 这个记号（见 PLUS_KEY），所以按 `+` 切分规范形
 * 是**无损**的：切出来的最后一段就是主键，前面的都是修饰键。
 */
export interface ShortcutParts {
  /** 修饰键（小写）：ctrl / alt / shift / meta … */
  modifiers: string[];
  /** 主键：规范形里的写法（加号键是 `plus`）。 */
  mainKey: string;
}

/**
 * 把一条绑定拆成「修饰键 + 主键」。
 *
 * 只从**规范形**拆：规范形里主键不含分隔符（加号键写作 `plus`），
 * 所以这里按 `+` 切分是安全的。
 */
export const splitShortcut = (value: string): ShortcutParts => {
  const normalized = normalizeShortcut(value);
  if (normalized === '') {
    return { modifiers: [], mainKey: '' };
  }

  const segments = normalized.split('+').filter(Boolean);
  const mainKey = segments.pop() ?? '';

  return { modifiers: segments, mainKey };
};

/**
 * 键名的显示形式。
 *
 * 这些是**给人看的**，不是给机器解析的 —— 显示成什么样都不影响匹配
 * （匹配走 normalizeShortcut 之后的规范形）。
 */
export const DISPLAY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  os: 'Meta',
  plus: '+',
  enter: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  backspace: 'Backspace',
  delete: 'Delete',
  tab: 'Tab',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'Home',
  end: 'End',
};

/**
 * 把一条绑定渲染成给人看的形式。
 *
 * ⚠️ **字母保持原样，不大写。**
 * 旧实现把单字符一律 `toUpperCase()`，于是绑定 `f` 显示成 `F`。
 * 但匹配是**区分 Shift 的**：绑定 `f` 时，按 `Shift+F` 根本不会触发
 * （`matchesShortcut` 里 `event.shiftKey === modifiers.has('shift')`）。
 * 于是界面上写着 `F`，用户照着按大写 —— 按了没反应。
 * 显示成 `f` 才是"照着按就管用"。
 *
 * 方向键用箭头符号（`←` `→` `↑` `↓`）：`ArrowLeft` 是代码里的键名，
 * 不是键帽上印的东西。README 里的快捷键表也用箭头，两边保持一致。
 */
export const formatShortcut = (value: string) => {
  const { modifiers, mainKey } = splitShortcut(value);
  if (modifiers.length === 0 && mainKey === '') {
    return '';
  }

  return [...modifiers, mainKey]
    .map((part) => DISPLAY_NAMES[part.toLowerCase()] ?? part)
    .join('+');
};

/**
 * macOS 上的键名 → 符号。
 *
 * macOS 用户在自己的键盘上找的是 ⌘ / ⌥ / ⌃ / ⇧ 那几颗键，
 * 界面上写着 "Meta" 他得先在脑子里换算一次才知道该按哪颗。
 * 这是 macOS 的通用约定（系统设置、VS Code、Chrome 自己都这么写）。
 */
export const MAC_KEY_SYMBOLS: Record<string, string> = {
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
 *
 * ⚠️ 这里按**修饰键 / 主键**分开处理，绝不按 '+' 切分渲染结果：
 * 主键是加号键时，渲染结果是 `Ctrl++` —— 切开会得到 `['Ctrl','','']`，
 * 那个键就**整个消失**了（macOS 上符号表查不到空串 → 渲染成空）。
 * 用户把动作绑到小键盘的 '+' 上，界面上却空空如也，看起来像「没绑上」。
 */
export const formatShortcutForPlatform = (value: string, mac: boolean): string => {
  const { modifiers, mainKey } = splitShortcut(value);
  if (modifiers.length === 0 && mainKey === '') {
    return '';
  }

  const parts = [...modifiers, mainKey];
  if (!mac) {
    return parts.map((part) => DISPLAY_NAMES[part.toLowerCase()] ?? part).join('+');
  }

  return parts
    .map((part) => {
      const lowered = part.toLowerCase();
      return MAC_KEY_SYMBOLS[lowered] ?? DISPLAY_NAMES[lowered] ?? part;
    })
    .join('');
};

export const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
  const normalized = normalizeShortcut(shortcut);
  const parts = normalized.split('+').filter(Boolean);
  const expectedKey = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  // 主键是加号时，「裸加号」这一档不比较 Shift。
  //
  // 原因：绝大多数键盘上 '+' 字符只能靠 Shift+= 打出来（数字键盘上的 + 是另一个键）。
  // 若严格要求 shiftKey===false，用户在设置页按下 Shift+= 记下的是 'shift+plus'，
  // 但任何地方都不该出现「只有 shift+plus 能触发、裸加号触发不了」的割裂；
  // 更糟的是，用户若从别处导入一条裸 'plus' 绑定，它将永远无法触发。
  // 所以：带 shift 修饰的 'shift+plus' 仍严格要求 Shift，裸 'plus' 则两种都认。
  const shiftMatches = expectedKey === PLUS_KEY && !modifiers.has('shift')
    ? true
    : event.shiftKey === modifiers.has('shift');

  return normalizeMainKey(event.key) === expectedKey
    && event.ctrlKey === modifiers.has('ctrl')
    && event.altKey === modifiers.has('alt')
    && shiftMatches
    && event.metaKey === modifiers.has('meta');
};

export const isBrowserReservedShortcut = (shortcut: string) => {
  const value = normalizeShortcut(shortcut).toLowerCase();
  const reservedShortcuts = new Set([
    'ctrl+t',
    'ctrl+n',
    'ctrl+w',
    'ctrl+f',
    'ctrl+s',
    'ctrl+p',
    'ctrl+r',
    'ctrl+l',
    'ctrl+k',
    'ctrl+j',
    'ctrl+h',
    'ctrl+d',
    'ctrl+0',
    'ctrl+1',
    'ctrl+2',
    'ctrl+3',
    'ctrl+4',
    'ctrl+5',
    'ctrl+6',
    'ctrl+7',
    'ctrl+8',
    'ctrl+9',
    'ctrl+shift+n',
    'ctrl+tab',
    'ctrl+shift+tab',
    'f1',
    'f5',
    'f11',
    'meta+t',
    'meta+n',
    'meta+w',
    'meta+f',
    'meta+s',
    'meta+p',
    'meta+r',
    'meta+l',
    'meta+k',
    'meta+j',
    'meta+h',
    'meta+d',
    'meta+0',
    'meta+1',
    'meta+2',
    'meta+3',
    'meta+4',
    'meta+5',
    'meta+6',
    'meta+7',
    'meta+8',
    'meta+9',
    'meta+shift+n',
  ]);

  return reservedShortcuts.has(value);
};
