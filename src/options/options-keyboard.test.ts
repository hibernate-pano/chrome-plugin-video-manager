import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '../shared/types';
import { createChromeMock } from './options-test-env';

/**
 * 快捷键输入框的键盘行为。
 *
 * 这组用例守的是一条底线：**纯键盘用户必须能用完整个设置页**。
 *
 * 之前每个输入框的 keydown 都无条件 preventDefault()，把 Tab 当成「要绑定的键」存了进去。
 * 后果不是「多绑了一个没用的键」，而是焦点被永久困在第一个输入框里 ——
 * Tab 是键盘用户唯一的导航手段，困住了就等于整页不可用。
 */

const rowInputs = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('.vsc__key')) as HTMLInputElement[];

const inputOf = (root: HTMLElement, id: keyof typeof DEFAULT_SHORTCUTS): HTMLInputElement => {
  const index = SHORTCUT_DEFINITIONS.findIndex((definition) => definition.id === id);
  return rowInputs(root)[index]!;
};

describe('快捷键输入框的键盘行为', () => {
  it('Tab 不被拦截，焦点能正常移到下一个控件', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'increaseSpeed');
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    // defaultPrevented === false 是关键：一旦为 true，浏览器就不会移动焦点。
    expect(event.defaultPrevented).toBe(false);
    // 而且 Tab 不能被当成快捷键存进去。
    expect(input.dataset.shortcut).toBe(DEFAULT_SHORTCUTS.increaseSpeed);
  });

  it('Enter 不被拦截', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'increaseSpeed');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(input.dataset.shortcut).toBe(DEFAULT_SHORTCUTS.increaseSpeed);
  });

  it('Escape 放行，并取消编辑：恢复成已保存绑定的显示后失焦', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    const original = input.dataset.shortcut;

    // 聚焦时输入框会被清空、显示「按下按键」占位符。
    input.focus();
    expect(input.value).toBe('');

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    // Escape 不是「要绑定的键」：它不能被写进绑定。
    expect(input.dataset.shortcut).toBe(original);
    expect(input.dataset.shortcut).not.toBe('Escape');
    // 取消编辑：输入框恢复成已保存绑定的显示形式。
    // 显示保持小写 —— 匹配区分 Shift，绑定 f 时按 Shift+F 不触发，
    // 显示成大写会让用户照着按一个不生效的键。
    expect(input.value).toBe('f');
    // 并且失焦，把键盘焦点交还给页面。
    expect(document.activeElement).not.toBe(input);
  });

  it('Escape 不会把「Escape」写进绑定', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(input.dataset.shortcut).toBe(DEFAULT_SHORTCUTS.fullscreen);
  });

  it('普通按键仍然走绑定逻辑：被拦截并存进 dataset', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    const event = new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    // dataset 存的是**规范形**（匹配用它），value 是**显示**。
    expect(input.dataset.shortcut).toBe('g');
    // 显示保持小写：匹配是区分 Shift 的，绑定 g 时按 Shift+G 不会触发，
    // 显示成大写 G 会让用户照着按一个不生效的键。
    expect(input.value).toBe('g');
  });

  it('Backspace 清空绑定（禁用该动作）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));

    expect(input.dataset.shortcut).toBe('');
    expect(input.value).toBe('');
  });

  it('F1 这类功能键仍然可以被绑定（只有 Tab/Enter/Escape 被放行）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }));

    expect(input.dataset.shortcut).toBe('F1');
  });
});
