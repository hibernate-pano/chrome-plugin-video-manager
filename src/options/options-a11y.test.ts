import { describe, expect, it } from 'vitest';
import { createChromeMock } from './options-test-env';

/**
 * 设置页无障碍测试：
 * 开关包在没有文本的 label 里，input 又被 opacity:0 隐藏但仍可聚焦，
 * 没有 aria-labelledby/aria-label 时它们对屏幕阅读器来说没有名字。
 */
describe('options page accessibility', () => {
  it('gives every toggle and shortcut input a non-empty accessible name', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const controls = [
      ...root.querySelectorAll('#space-toggle'),
      ...root.querySelectorAll('#memory-toggle'),
      ...root.querySelectorAll('.vsc-options__input'),
    ];

    expect(controls.length).toBe(6);

    const names = controls.map((control) => {
      const label = control.getAttribute('aria-label')?.trim() ?? '';
      const referenced = (control.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '');

      return label || referenced.join(' ').trim();
    });

    // 断言全部非空；失败时这条会列出有多少个控件仍然没有名字。
    expect(names.filter((name) => name.length === 0)).toEqual([]);
  });

  it('announces save and error feedback through a live region', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const status = root.querySelector('#status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });
});
