import { describe, expect, it } from 'vitest';
import { SITE_MEMORY_DISABLED_KEY, SITE_SPEEDS_KEY } from '../shared/types';
import { createChromeMock, flush } from './options-test-env';

/**
 * Options 页冒烟测试：验证页面能渲染出预设速度输入、空格开关与快捷键行，
 * 并能从（内存）设置中回填默认值。
 */
describe('options page smoke', () => {
  it('renders presets, space toggle and shortcut rows with defaults', async () => {
    const { render } = createChromeMock();
    const root = await render();

    expect(root).not.toBeNull();

    const presetInputs = root?.querySelectorAll('.vsc-options__preset-input') ?? [];
    expect(presetInputs.length).toBe(4);
    expect([...presetInputs].map((input) => (input as HTMLInputElement).value)).toEqual([
      '1.25', '1.5', '1.75', '2',
    ]);

    const spaceToggle = root?.querySelector('#space-toggle') as HTMLInputElement | null;
    expect(spaceToggle?.checked).toBe(true);

    const shortcutInputs = root?.querySelectorAll('.vsc-options__input') ?? [];
    expect(shortcutInputs.length).toBe(4);

    const saveButton = root?.querySelector('#save-button');
    expect(saveButton).not.toBeNull();
  });

  it('clears the per-site opt-out table together with the remembered speeds', async () => {
    const { render, localRemoves } = createChromeMock({
      local: {
        [SITE_SPEEDS_KEY]: { 'example.com': 1.5 },
        [SITE_MEMORY_DISABLED_KEY]: { 'example.com': true },
      },
    });

    const root = await render();
    (root.querySelector('#memory-clear-button') as HTMLButtonElement).click();
    await flush();

    // 只删速度表会留下「该站点永久不记忆」的隐形状态。
    expect(localRemoves).toEqual([SITE_SPEEDS_KEY, SITE_MEMORY_DISABLED_KEY]);
    expect(root.querySelector('#status')?.textContent).not.toBe('');
  });
});
