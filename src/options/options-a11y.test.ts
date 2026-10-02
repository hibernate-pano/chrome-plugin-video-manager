import { describe, expect, it } from 'vitest';
import { SHORTCUT_DEFINITIONS } from '../shared/types';
import { createChromeMock } from './options-test-env';

/**
 * 设置页无障碍：每个快捷键输入框必须有一个非空的无障碍名字，
 * 且保存/错误反馈要通过 live region 播报。
 */
describe('options page accessibility', () => {
  it('gives every shortcut input a non-empty accessible name', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const controls = Array.from(root.querySelectorAll('.vsc__key'));
    expect(controls.length).toBe(SHORTCUT_DEFINITIONS.length);

    const names = controls.map((control) => {
      const label = control.getAttribute('aria-label')?.trim() ?? '';
      const referenced = (control.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '');

      return label || referenced.join(' ').trim();
    });

    expect(names.filter((name) => name.length === 0)).toEqual([]);
  });

  it('announces save and error feedback through a live region', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const status = root.querySelector('#status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
  });

  it('marks save and reset as real buttons', async () => {
    const { render } = createChromeMock();
    const root = await render();

    expect(root.querySelector('#save')?.tagName).toBe('BUTTON');
    expect(root.querySelector('#reset')?.tagName).toBe('BUTTON');
  });
});
