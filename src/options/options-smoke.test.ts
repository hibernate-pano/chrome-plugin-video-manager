import { describe, expect, it } from 'vitest';

/**
 * Options 页冒烟测试：验证页面能渲染出预设速度输入、空格开关与快捷键行，
 * 并能从（内存）设置中回填默认值。
 */
describe('options page smoke', () => {
  it('renders presets, space toggle and shortcut rows with defaults', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    (globalThis as Record<string, unknown>).chrome = {
      runtime: { lastError: null },
      storage: {
        sync: {
          get: (_key: string, callback: (result: Record<string, unknown>) => void) => callback({}),
          set: (_value: Record<string, unknown>, callback?: () => void) => callback?.(),
          remove: (_key: string, callback?: () => void) => callback?.(),
        },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    };

    await import('./index');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const root = document.getElementById('root');
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
});
