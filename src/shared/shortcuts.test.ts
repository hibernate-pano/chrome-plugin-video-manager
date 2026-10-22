import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  formatShortcutForPlatform,
  keyboardEventToShortcut,
  matchesShortcut,
  normalizeShortcut,
  normalizeShortcutSettings,
  splitShortcut,
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
