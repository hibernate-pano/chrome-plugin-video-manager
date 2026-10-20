import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  keyboardEventToShortcut,
  matchesShortcut,
  normalizeShortcut,
  normalizeShortcutSettings,
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
