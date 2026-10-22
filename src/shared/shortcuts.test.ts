import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  formatShortcutForPlatform,
  keyboardEventToShortcut,
  matchesShortcut,
  normalizeShortcut,
  normalizeShortcutSettings,
  splitShortcut,
  shortcutsOverlap,
} from './shortcuts';
import { DEFAULT_SHORTCUTS } from './types';

describe('normalizeShortcut', () => {
  it('normalizes plain and modified keys', () => {
    expect(normalizeShortcut('=')).toBe('=');
    expect(normalizeShortcut('Shift+=')).toBe('shift+=');
    expect(normalizeShortcut('Meta+-')).toBe('meta+-');
  });

  it('keeps space as a valid main key', () => {
    expect(normalizeShortcut(' ')).toBe(' ');
    expect(normalizeShortcut('Space')).toBe(' ');
    expect(normalizeShortcut('Spacebar')).toBe(' ');
    expect(normalizeShortcut('Ctrl+ ')).toBe('ctrl+ ');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeShortcut('')).toBe('');
  });

  it('round-trips through format and match', () => {
    expect(formatShortcut(' ')).toBe('Space');
    expect(formatShortcut('ctrl+ ')).toBe('Ctrl+Space');

    const event = new KeyboardEvent('keydown', { key: ' ' });
    expect(matchesShortcut(event, ' ')).toBe(true);
    expect(matchesShortcut(event, 'Space')).toBe(true);

    const ctrlEvent = new KeyboardEvent('keydown', { key: ' ', ctrlKey: true });
    expect(matchesShortcut(ctrlEvent, 'ctrl+ ')).toBe(true);
    expect(matchesShortcut(ctrlEvent, ' ')).toBe(false);
  });
});

describe('normalizeShortcutSettings', () => {
  it('fills defaults for missing values', () => {
    // 基于 DEFAULT_SHORTCUTS 断言：新增动作时这条不会脆断，
    // 真正的默认值变化由 types.ts 里的单一来源负责。
    expect(normalizeShortcutSettings({})).toEqual(DEFAULT_SHORTCUTS);
  });

  it('normalizes a space shortcut set from the options page', () => {
    const settings = normalizeShortcutSettings({
      increaseSpeed: '=',
      decreaseSpeed: '-',
      resetSpeed: ' ',
      fullscreen: 'f',
    });

    expect(settings.resetSpeed).toBe(' ');
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: ' ' }), settings.resetSpeed)).toBe(true);
  });

  it('drops bindings whose main key is a bare modifier', () => {
    const settings = normalizeShortcutSettings({
      increaseSpeed: 'shift+Shift',
      decreaseSpeed: 'ctrl+Control',
      resetSpeed: 'r',
      fullscreen: 'f',
    });

    expect(settings).toEqual({
      ...DEFAULT_SHORTCUTS,
      increaseSpeed: '=',
      decreaseSpeed: '-',
      resetSpeed: 'r',
      fullscreen: 'f',
    });
  });
});

/**
 * 修饰键必须**逐个**对上。
 *
 * 之前这里只有一条涉及修饰键的断言（ctrl），而 ctrl 的判断恰好把用例挡住了 ——
 * 把 `event.altKey === modifiers.has('alt')` 与
 * `event.metaKey === modifiers.has('meta')` 整半删掉，测试照样全绿。
 *
 * 少了这两半的后果：绑定 `k`（加速）会在用户按 Alt+k 或 Cmd+k 时也触发，
 * 而这些组合往往属于浏览器 / 系统（Alt+Tab、Cmd+K 打开地址栏）。
 */
describe('matchesShortcut 的修饰键逐个比对', () => {
  it('绑定没写 alt 时，按住 Alt 不算命中', () => {
    const withAlt = new KeyboardEvent('keydown', { key: 'k', altKey: true });

    expect(matchesShortcut(withAlt, 'k')).toBe(false);
    expect(matchesShortcut(withAlt, 'ctrl+k')).toBe(false);
  });

  it('绑定没写 meta 时，按住 Meta 不算命中', () => {
    const withMeta = new KeyboardEvent('keydown', { key: 'k', metaKey: true });

    expect(matchesShortcut(withMeta, 'k')).toBe(false);
  });

  it('绑定写了 meta 时，不按 Meta 不算命中', () => {
    const plain = new KeyboardEvent('keydown', { key: 'k' });

    expect(matchesShortcut(plain, 'meta+k')).toBe(false);
  });

  it('绑定写了 ctrl+alt 时，缺 alt 不算命中', () => {
    // 只按 Ctrl 不按 Alt：两条组合键不能互相顶替。
    const ctrlOnly = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });

    expect(matchesShortcut(ctrlOnly, 'ctrl+alt+k')).toBe(false);
  });

  it('绑定写了 ctrl+alt 时，alt 到位才算命中', () => {
    const both = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, altKey: true });

    expect(matchesShortcut(both, 'ctrl+alt+k')).toBe(true);
  });
});

/**
 * 归一化里的几处边界。
 *
 * 这些都是「改坏了没人拦」的口子：归一化是设置页与匹配之间唯一的翻译层，
 * 它一旦判错，用户在界面上看到「已保存」的绑定却永远触发不了。
 */
describe('normalizeShortcut 的边界', () => {
  it('四个修饰键的组合也要认（剥 4 层，不是 3 层）', () => {
    // 剥离深度从 4 改成 3 的话，最后一个修饰键会留在主键里，
    // 而主键里带着 '+' → 整条绑定被判非法（归一化成空串）。
    expect(normalizeShortcut('ctrl+alt+shift+meta+k')).toBe('ctrl+alt+shift+meta+k');
  });

  it('control / os 是被认可的修饰键写法（不能被判非法）', () => {
    // 修饰键前缀里认 'control' / 'os'：老绑定里可能有这些写法。
    // 判非法的话，用户的绑定会被静默丢成空串 —— 界面上还显示着，
    // 按键却永远不触发。
    expect(normalizeShortcut('control+k')).not.toBe('');
    expect(normalizeShortcut('os+k')).not.toBe('');
  });

  /**
   * 修饰键别名必须**折成规范名**（6.2.0 审计缺陷 3）。
   *
   * 根因：`MODIFIER_PREFIX` 曾经同时接受 `control` / `os`，
   * 而 `matchesShortcut` 只认 `ctrl` / `meta` —— 两套集合**分裂**了。
   * 于是 `control+j` 落进 storage 就是一条**永远不生效**的绑定：
   * 归一后保留成 `control+j`，而事件匹配时找的是 `ctrl` → 永远匹配不上。
   *
   * 更糟的是它**抢走了裸键**：`control+j` 的主键也是 `j`，
   * 但匹配时 `modifiers.has('ctrl')` 为假 → 连**裸按 j** 都不触发。
   * 实测：写 `increaseSpeed: "control+j"` 之后，裸按 j 也没反应（rate 恒为 1）。
   *
   * 修法：归一时就把别名折成规范名 —— `control+j` → `ctrl+j`，
   * 于是它立刻生效（Ctrl+J 就是 Ctrl+J），而且不再抢裸键。
   */
  it('修饰键别名归一到规范名（control → ctrl，os → meta）', () => {
    // 变异打穿点：若归一时不折别名，这两条会原样返回 'control+k' / 'os+k'。
    expect(normalizeShortcut('control+k')).toBe('ctrl+k');
    expect(normalizeShortcut('os+k')).toBe('meta+k');
    expect(normalizeShortcut('CTRL+K')).toBe('ctrl+k');
    expect(normalizeShortcut('Control+Shift+K')).toBe('ctrl+shift+k');
    expect(normalizeShortcut('option+k')).toBe('alt+k');
    expect(normalizeShortcut('cmd+k')).toBe('meta+k');
    expect(normalizeShortcut('command+k')).toBe('meta+k');
  });

  it('别名的绑定**真的能触发**（不是归一后仍然匹配不上）', () => {
    // 变异打穿点：若 matchesShortcut 仍按别名找修饰键，
    // 这两条就会是 false —— 归一与匹配又分裂了。
    const ctrlJ = new KeyboardEvent('keydown', { key: 'j', ctrlKey: true });
    const metaK = new KeyboardEvent('keydown', { key: 'k', metaKey: true });

    expect(matchesShortcut(ctrlJ, 'control+j')).toBe(true);
    expect(matchesShortcut(metaK, 'os+k')).toBe(true);
  });

  it('别名归一**不抢走裸键**（裸按 j 仍然是 j，不是 control+j）', () => {
    // 6.2.0 审计缺陷 3 的最坏后果：脏数据 `control+j` 会让**裸 j** 也不触发，
    // 因为匹配时 `modifiers.has('ctrl')` 为假而事件没有 Ctrl。
    // 归一成 `ctrl+j` 之后，裸 j 的绑定不受影响。
    const plainJ = new KeyboardEvent('keydown', { key: 'j' });

    expect(matchesShortcut(plainJ, 'j')).toBe(true);
    expect(matchesShortcut(plainJ, 'control+j')).toBe(false);
  });

  it('读盘路径也要归一（历史脏数据自愈成可用的绑定）', () => {
    // 判据 11 第 1 条：读盘路径也要归一。
    // `normalizeShortcutSettings` 是**读盘**时走的归一（settings.ts 用它）。
    const settings = normalizeShortcutSettings({ increaseSpeed: 'control+j' });

    expect(settings.increaseSpeed).toBe('ctrl+j');
    expect(
      matchesShortcut(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }), settings.increaseSpeed),
    ).toBe(true);
  });

  it('单字符主键统一转小写', () => {
    // Caps Lock 打开时 event.key 是大写 'K'，绑定 'k' 仍要能命中。
    expect(normalizeShortcut('K')).toBe('k');
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'K' }), 'k')).toBe(true);
  });
});

/**
 * Shift 变体字符。
 *
 * 背景：美式键盘上 Shift+, 打出来的是 `<`，**键盘事件给的正是 `<`**。
 * 而 Chrome 的命令键写的是基础键（manifest 里的 `Ctrl+Shift+Comma`）。
 * 两套词不归一的话，同一个物理键被当成两个不同的绑定 ——
 * 扩展自己的命令键就检测不出来：用户把动作绑到 Ctrl+Shift+, 上，
 * 浏览器先打开设置页，那个动作一次都不会发生。
 *
 * 归一必须是**双向**的：`,` 与 `<` 是同一个物理键（Shift 只是修饰键），
 * 归一到同一个值才对。
 */
describe('Shift 变体字符的归一', () => {
  const PAIRS: Array<[string, string]> = [
    ['<', ','],
    ['>', '.'],
    ['?', '/'],
    ['|', '\\'],
    ['"', "'"],
    ['~', '`'],
  ];

  it('带 Shift 的字符与基础字符归一到同一个值', () => {
    PAIRS.forEach(([shifted, base]) => {
      expect(normalizeShortcut(`ctrl+shift+${shifted}`), `${shifted} 没归到 ${base}`)
        .toBe(normalizeShortcut(`ctrl+shift+${base}`));
    });
  });

  it('归一到基础字符本身（不是两个都变成同一个怪字符）', () => {
    expect(normalizeShortcut('ctrl+shift+<')).toBe('ctrl+shift+,');
    expect(normalizeShortcut('ctrl+shift+>')).toBe('ctrl+shift+.');
    expect(normalizeShortcut('ctrl+shift+?')).toBe('ctrl+shift+/');
    expect(normalizeShortcut('ctrl+shift+|')).toBe('ctrl+shift+\\');
    expect(normalizeShortcut('ctrl+shift+"')).toBe("ctrl+shift+'");
    expect(normalizeShortcut('ctrl+shift+~')).toBe('ctrl+shift+`');
  });

  it('只归一确实由 Shift 产生的那些键', () => {
    // 字母、数字、减号都不是 Shift 变体，不能被顺手改掉。
    expect(normalizeShortcut('ctrl+shift+a')).toBe('ctrl+shift+a');
    expect(normalizeShortcut('ctrl+shift+1')).toBe('ctrl+shift+1');
    expect(normalizeShortcut('ctrl+shift+-')).toBe('ctrl+shift+-');
    expect(normalizeShortcut('ctrl+shift+;')).toBe('ctrl+shift+;');
  });

  it('设置页按 Ctrl+Shift+, 收集到的就是基础键', () => {
    // 变异打穿点：若归一只认基础键，按出来的那一档（`<`）就存成了另一条绑定。
    const event = new KeyboardEvent('keydown', { key: '<', ctrlKey: true, shiftKey: true });
    expect(keyboardEventToShortcut(event)).toBe('ctrl+shift+,');
  });

  it('归一之后仍然要求 Shift 到位', () => {
    // 归一只解决「同一个键的两种写法」，不放宽「按没按 Shift」。
    const withShift = new KeyboardEvent('keydown', { key: '<', ctrlKey: true, shiftKey: true });
    const withoutShift = new KeyboardEvent('keydown', { key: ',', ctrlKey: true });

    expect(matchesShortcut(withShift, 'ctrl+shift+,')).toBe(true);
    expect(matchesShortcut(withoutShift, 'ctrl+shift+,')).toBe(false);
  });
});

describe('keyboardEventToShortcut', () => {
  it('captures space and modifier combinations', () => {
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: ' ' }))).toBe(' ');
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: ' ', ctrlKey: true }))).toBe('ctrl+ ');
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'k' }))).toBe('k');
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe('Escape');
  });

  it('ignores bare modifier key presses', () => {
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))).toBeNull();
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))).toBeNull();
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }))).toBeNull();
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }))).toBeNull();
  });

  it('修饰键的顺序固定（ctrl → alt → shift → meta）', () => {
    // 顺序变了，同一个物理按键组合就会存成不同的绑定串 ——
    // 用户在设置页里改了键、再打开就发现对不上了。
    const all = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      metaKey: true,
    });
    expect(keyboardEventToShortcut(all)).toBe('ctrl+alt+shift+meta+k');
  });
});

describe('formatShortcut 的显示必须"照着按就管用"', () => {
  /**
   * 最重要的一条不变式：**界面上显示的东西，用户按出来必须能触发**。
   *
   * 旧实现把单字符一律大写：绑定 `f` 显示成 `F`。但匹配是区分 Shift 的
   * （`event.shiftKey === modifiers.has('shift')`），绑定 `f` 时按 `Shift+F`
   * 根本不会触发 —— 用户照着界面按大写，按了没反应。
   */
  it('字母保持原样，不大写', () => {
    expect(formatShortcut('f')).toBe('f');
    expect(formatShortcut('0')).toBe('0');
    expect(formatShortcut('=')).toBe('=');
  });

  it('显示成大写字母的绑定，按大写反而不会触发', () => {
    // 这条是上面那条的反证：证明"大写显示"确实是错的，而不只是风格问题。
    const event = new KeyboardEvent('keydown', { key: 'F', shiftKey: true });
    expect(matchesShortcut(event, 'f')).toBe(false);
  });

  it('方向键显示为箭头符号', () => {
    // ArrowLeft 是代码里的键名，不是键帽上印的东西。
    expect(formatShortcut('ArrowLeft')).toBe('←');
    expect(formatShortcut('ArrowRight')).toBe('→');
    expect(formatShortcut('ArrowUp')).toBe('↑');
    expect(formatShortcut('ArrowDown')).toBe('↓');
  });

  it('显示的箭头不能被当成绑定传回去', () => {
    // 显示是**给人看的**，不是规范形。设置页把真实绑定存在 dataset.shortcut，
    // 显示只写进 input.value —— 所以显示串不能被回写成绑定。
    // 这条锁住这个边界：将来谁把 input.value 当成绑定回写，会立刻失败。
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    expect(matchesShortcut(event, 'ArrowLeft')).toBe(true);
    expect(matchesShortcut(event, formatShortcut('ArrowLeft'))).toBe(false);
  });

  it('修饰键与主键的显示', () => {
    // 主键保持原样：绑定 ctrl+shift+k 就该显示 k（Shift 已经写出来了）。
    expect(formatShortcut('ctrl+shift+k')).toBe('Ctrl+Shift+k');
    expect(formatShortcut('meta+ ')).toBe('Meta+Space');
    expect(formatShortcut('plus')).toBe('+');
  });
});

/**
 * 「+」键的绑定。
 *
 * 背景：「+」既是修饰键的分隔符，又是键盘上一个真实存在的键位。旧实现按 '+'
 * 切段，于是用户想把「+」绑成加速键时，写进去的 "+" 被切成 ["", ""]、
 * 过滤后变成空串、再被归一化成 **空格** —— 绑定静默变成了「空格 = 加速」，
 * 用户在设置页看到「已保存」，实际触发的却是另一个动作。
 *
 * 现在的约定：**主键是加号时写成 `plus`**（裸加号 `plus`，带修饰键 `ctrl+plus`）。
 * 这个记号本身不含分隔符，所以「修饰键 + 主键」的结构始终是清晰的。
 */
describe('「+」键的绑定', () => {
  it('裸加号键归一化成 plus 记号', () => {
    // 变异打穿点：若 normalizeMainKey 不把 '+' 映射成 'plus'，
    // 这条会返回 '+' 而不是 'plus'。
    expect(normalizeShortcut('+')).toBe('plus');
    expect(normalizeShortcut('Plus')).toBe('plus');
    expect(normalizeShortcut('PLUS')).toBe('plus');
  });

  it('带修饰键的加号组合归一化成 ctrl+plus', () => {
    // 变异打穿点：若修饰键前缀里没有 'ctrl'，'ctrl++' 不会剥掉前缀，
    // 也就不会剩下一个 '+' 主键。
    expect(normalizeShortcut('ctrl++')).toBe('ctrl+plus');
    expect(normalizeShortcut('ctrl+plus')).toBe('ctrl+plus');
    expect(normalizeShortcut('ctrl+shift+plus')).toBe('ctrl+shift+plus');
  });

  it('普通组合不受影响', () => {
    // 变异打穿点：剥前缀的实现改坏了的话，这条会跟着挂。
    expect(normalizeShortcut('ctrl+shift+k')).toBe('ctrl+shift+k');
    expect(normalizeShortcut('Shift+=')).toBe('shift+=');
    expect(normalizeShortcut('Meta+-')).toBe('meta+-');
    expect(normalizeShortcut('=')).toBe('=');
  });

  it('老数据的含义不变', () => {
    // 'ctrl+' 结尾是分隔符，历史含义是「ctrl + 空格」，不能被 '+' 的新约定改掉。
    expect(normalizeShortcut('ctrl+')).toBe('ctrl+ ');
    expect(normalizeShortcut('ctrl+ ')).toBe('ctrl+ ');
    expect(normalizeShortcut(' ')).toBe(' ');
    expect(normalizeShortcut('Space')).toBe(' ');
  });

  it('主键里含分隔符的输入判为非法', () => {
    // 变异打穿点：若去掉 rest.includes('+') 的守卫，
    // 'ctrl+a+b' 会被拼成一条看起来能用的绑定，而它永远不可能触发。
    expect(normalizeShortcut('ctrl+a+b')).toBe('');
    expect(normalizeShortcut('a+b')).toBe('');
    expect(normalizeShortcut('++')).toBe('');
  });

  it('plus 绑定能原样存进设置', () => {
    // 走一遍真正的持久化归一化：加号键不该在这里被判非法。
    const settings = normalizeShortcutSettings({ increaseSpeed: 'plus' });
    expect(settings.increaseSpeed).toBe('plus');
  });

  it('显示成 +，修饰键组合显示成 Ctrl++', () => {
    expect(formatShortcut('plus')).toBe('+');
    expect(formatShortcut('ctrl+plus')).toBe('Ctrl++');
  });

  it('裸 plus 绑定在按下和不按 Shift 时都匹配', () => {
    // 原因：绝大多数键盘上 '+' 字符只能靠 Shift+= 打出来。
    // 若裸 plus 严格要求 shiftKey===false，用户按 Shift+= 时这条绑定永远不触发。
    const withoutShift = new KeyboardEvent('keydown', { key: '+' });
    const withShift = new KeyboardEvent('keydown', { key: '+', shiftKey: true });

    expect(matchesShortcut(withoutShift, 'plus')).toBe(true);
    expect(matchesShortcut(withShift, 'plus')).toBe(true);
  });

  it('shift+plus 仍然严格要求 Shift', () => {
    // 上面那条的边界：显式写了 shift 修饰的绑定不能被放宽，
    // 否则 'shift+plus' 和 'plus' 就成了同一条绑定。
    const withShift = new KeyboardEvent('keydown', { key: '+', shiftKey: true });
    const withoutShift = new KeyboardEvent('keydown', { key: '+' });

    expect(matchesShortcut(withShift, 'shift+plus')).toBe(true);
    expect(matchesShortcut(withoutShift, 'shift+plus')).toBe(false);
  });

  it('ctrl+plus 要求 Ctrl 成立', () => {
    const ctrlPlus = new KeyboardEvent('keydown', { key: '+', ctrlKey: true });
    const plainPlus = new KeyboardEvent('keydown', { key: '+' });

    expect(matchesShortcut(ctrlPlus, 'ctrl+plus')).toBe(true);
    expect(matchesShortcut(plainPlus, 'ctrl+plus')).toBe(false);
  });

  it('设置页收集到的加号键就是 plus 记号', () => {
    // 变异打穿点：若 keyboardEventToShortcut 仍把 '+' 原样返回，
    // 设置页存进去的就是 '+'，下次归一化时又被判非法 ——
    // 用户会看到「已保存」但按键不触发。
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: '+' }))).toBe('plus');
    expect(
      keyboardEventToShortcut(new KeyboardEvent('keydown', { key: '+', ctrlKey: true })),
    ).toBe('ctrl+plus');
  });
});

/**
 * macOS 上的显示。
 *
 * 背景：macOS 的键帽上印的是 ⌘ / ⌥ / ⌃ / ⇧，界面上写 "Meta" 用户得自己换算。
 * 旧实现把渲染结果按 '+' 切一遍再查符号表 ——
 * 而渲染结果本身是 `Ctrl++`（主键是加号键），
 * 切完得到 `['Ctrl', '', '']`，那个键**整个消失**：
 * 符号表里查不到空串，于是 macOS 用户看到的是「⌃」，
 * 键位不见了，看起来像「这条绑定没保存上」。
 *
 * 现在的约定：**先按「修饰键 / 主键」拆开，再逐段查表**，绝不切渲染结果。
 */
describe('macOS 上的快捷键显示', () => {
  it('修饰键用符号，符号之间不加「+」', () => {
    // macOS 的通用写法（系统设置、VS Code、Chrome 自己都这么写）。
    expect(formatShortcutForPlatform('meta+shift+k', true)).toBe('⌘⇧k');
    expect(formatShortcutForPlatform('ctrl+alt+k', true)).toBe('⌃⌥k');
  });

  it('「+」键在 macOS 上不会消失', () => {
    // 变异打穿点：若渲染改成按 '+' 切分渲染结果，
    // 'ctrl+plus' 会得到 ['Ctrl','','']，主键消失。
    expect(formatShortcutForPlatform('plus', true)).toBe('+');
    expect(formatShortcutForPlatform('ctrl+plus', true)).toBe('⌃+');
    expect(formatShortcutForPlatform('ctrl+shift+plus', true)).toBe('⌃⇧+');
  });

  it('「+」键在 Windows / Linux 上同样不会消失', () => {
    expect(formatShortcutForPlatform('plus', false)).toBe('+');
    expect(formatShortcutForPlatform('ctrl+plus', false)).toBe('Ctrl++');
  });

  it('空绑定渲染成空串（不渲染出一个孤零零的符号）', () => {
    expect(formatShortcutForPlatform('', true)).toBe('');
    expect(formatShortcutForPlatform('', false)).toBe('');
  });

  it('拆分是结构性的：修饰键与主键分开，加号键是主键', () => {
    // 这条是上面几条的地基：拆出来的**主键**必须是 'plus'，
    // 绝不能是 '' —— 那个空串就是「键消失」的元凶。
    expect(splitShortcut('ctrl+plus')).toEqual({ modifiers: ['ctrl'], mainKey: 'plus' });
    expect(splitShortcut('ctrl+shift+plus')).toEqual({
      modifiers: ['ctrl', 'shift'],
      mainKey: 'plus',
    });
    expect(splitShortcut('plus')).toEqual({ modifiers: [], mainKey: 'plus' });
    expect(splitShortcut('')).toEqual({ modifiers: [], mainKey: '' });
  });
});

/**
 * 「两条绑定会不会被同一个物理事件同时命中」。
 *
 * ## 为什么要有这个函数
 *
 * 6.2.0 审计缺陷 4：设置页把「加速」绑成小键盘 `+`（录成 `plus`）、
 * 把「重置」绑成 `Shift+=`（录成 `shift+plus`）——
 * **保存成功**，状态栏「已保存」，两行都没有错误提示。
 *
 * 但在视频页按 `Shift+=` → **rate 从 1.5 变成 1.6（加速赢了，重置没跑）**。
 *
 * 根因有两层，缺一不可：
 * 1. **运行时**：`matchesShortcut` 对主键是 `plus` 的裸绑定**不比较 Shift**
 *    （`shiftMatches = true`），所以 `shift+plus` 与 `plus` 匹配同一个物理键；
 * 2. **设置页**：重复检测用的是**原始草稿字符串**（`plus` vs `shift+plus`
 *    是两个不同的串），所以设置页完全看不见这个撞车。
 *
 * ## 这条判据必须**只有一份**
 *
 * 运行时与设置页必须用**同一个函数**。只在设置页单方面加一条特判的话，
 * 就会变成「设置页说没事、运行时打架」——
 * 那正是缺陷 4 本身的样子。
 */
describe('shortcutsOverlap：撞车检测与运行时共用同一份判据', () => {
  it('裸 plus 与 shift+plus 是真撞车', () => {
    // 变异打穿点：若这条判据退回「比原始字符串」，
    // 这两条会判成不撞车 —— 而运行时它们**确实**同时命中。
    expect(shortcutsOverlap('plus', 'shift+plus')).toBe(true);
    expect(shortcutsOverlap('shift+plus', 'plus')).toBe(true);
  });

  it('完全相同的绑定当然撞车', () => {
    expect(shortcutsOverlap('plus', 'plus')).toBe(true);
    expect(shortcutsOverlap('ctrl+k', 'ctrl+k')).toBe(true);
  });

  it('不同的键不撞车', () => {
    expect(shortcutsOverlap('=', '-')).toBe(false);
    expect(shortcutsOverlap('ctrl+k', 'ctrl+j')).toBe(false);
  });

  it('Shift 不同、且主键不是加号时不撞车', () => {
    // `ctrl+k` 与 `ctrl+shift+k` 是两个不同的键：
    // 运行时 Shift 不同 → 一个都不命中另一个。
    expect(shortcutsOverlap('ctrl+k', 'ctrl+shift+k')).toBe(false);
    expect(shortcutsOverlap('k', 'shift+k')).toBe(false);
  });

  it('ctrl / alt / meta 不同就不撞车', () => {
    expect(shortcutsOverlap('ctrl+k', 'alt+k')).toBe(false);
    expect(shortcutsOverlap('ctrl+k', 'meta+k')).toBe(false);
    expect(shortcutsOverlap('ctrl+k', 'k')).toBe(false);
  });

  it('空绑定不与任何东西撞车', () => {
    expect(shortcutsOverlap('', 'plus')).toBe(false);
    expect(shortcutsOverlap('plus', '')).toBe(false);
  });

  it('撞车判据与运行时匹配**逐字一致**（这是这条存在的全部理由）', () => {
    // ⚠️ 这条把「判据」与「运行时」钉在一起：
    // 「会撞车」的准确含义是「**存在**一个物理事件，两条绑定同时命中」。
    // 所以这里枚举全部 16 种修饰键组合，逐个问运行时：
    // 只要**有任何一个**事件同时命中两条，就说明它们真会打架。
    //
    // 若判据与运行时漂移了，就会重新出现「设置页说没事、运行时打架」。
    const CASES: Array<[string, string]> = [
      ['plus', 'shift+plus'],
      ['plus', 'plus'],
      ['ctrl+k', 'ctrl+k'],
      ['ctrl+k', 'ctrl+shift+k'],
      ['ctrl+k', 'ctrl+j'],
      ['ctrl+k', 'k'],
      ['k', 'shift+k'],
      ['plus', 'shift+plus'],
    ];

    CASES.forEach(([a, b]) => {
      const mainKey = splitShortcut(a).mainKey;
      const key = mainKey === 'plus' ? '+' : mainKey;

      let runtimeCanBothMatch = false;
      for (let mask = 0; mask < 16 && !runtimeCanBothMatch; mask += 1) {
        const event = new KeyboardEvent('keydown', {
          key,
          ctrlKey: (mask & 1) !== 0,
          altKey: (mask & 2) !== 0,
          metaKey: (mask & 4) !== 0,
          shiftKey: (mask & 8) !== 0,
        });

        if (matchesShortcut(event, a) && matchesShortcut(event, b)) {
          runtimeCanBothMatch = true;
        }
      }

      expect(
        runtimeCanBothMatch,
        `${a} 与 ${b}：判据说撞车，运行时却说不会（或反过来）`,
      ).toBe(shortcutsOverlap(a, b));
    });
  });
});

/**
 * 物理键位（`event.code`）参与归一。
 *
 * 6.2.0 审计缺陷 6：同一个物理键（`code: "Comma"`）在不同键盘布局下
 * 给出不同的 `event.key`：
 *
 * | 布局 | 模拟按键 | 录成 | 设置页判定 |
 * | --- | --- | --- | --- |
 * | 美式 | Ctrl+Shift+Comma（`event.key = '<'`） | `ctrl+shift+,` | ★「这个键是扩展自己的命令」✓ |
 * | 德式 | Ctrl+Shift+Comma（`event.key = ';'`） | `ctrl+shift+;` | **没拦** ✗ |
 *
 * 后果：德语键盘上用户可以把动作绑到 Ctrl+Shift+Comma ——
 * 那是扩展自己的「打开设置页」命令键。浏览器先调度命令，
 * 用户按下去弹出的是设置页，他要的动作一次都不发生，
 * 而且设置页**从没提示过**。
 */
describe('物理键位（event.code）参与归一', () => {
  it('德式键盘上的 Ctrl+Shift+Comma 录成与美式一样的绑定', () => {
    // 变异打穿点：若归一不读 event.code，
    // 德式那条会录成 'ctrl+shift+;' —— 与 manifest 的 'Ctrl+Shift+Comma' 对不上。
    const german = new KeyboardEvent('keydown', {
      key: ';',
      code: 'Comma',
      ctrlKey: true,
      shiftKey: true,
    });
    const american = new KeyboardEvent('keydown', {
      key: '<',
      code: 'Comma',
      ctrlKey: true,
      shiftKey: true,
    });

    expect(keyboardEventToShortcut(german)).toBe('ctrl+shift+,');
    expect(keyboardEventToShortcut(german)).toBe(keyboardEventToShortcut(american));
  });

  it('没有 code 时回落到字符（老浏览器 / 合成事件）', () => {
    // ⚠️ 合成事件没有 code（code 是 ''），那必须能正常工作。
    const event = new KeyboardEvent('keydown', { key: '<', ctrlKey: true, shiftKey: true });

    expect(keyboardEventToShortcut(event)).toBe('ctrl+shift+,');
  });

  it('只有「跨布局必须指向同一个物理位」的键才按 code 归一', () => {
    // ⚠️ 这条守的是「不要把 code 归一推广到所有键」：
    // 德式键盘上 `code: "Slash"` 那个键印的是 `-`，
    // 按物理键归一会把默认的「减速 = `-`」改成 `/` —— 用户的默认绑定被改掉。
    const germanSlash = new KeyboardEvent('keydown', {
      key: '-',
      code: 'Slash',
    });
    const germanMinus = new KeyboardEvent('keydown', {
      key: 'ß',
      code: 'Minus',
    });

    expect(keyboardEventToShortcut(germanSlash)).toBe('-');
    expect(keyboardEventToShortcut(germanMinus)).toBe('ß');
  });
});
