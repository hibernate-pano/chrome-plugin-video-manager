import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '../shared/types';
import { createChromeMock, flush } from './options-test-env';

const rowInputs = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('.vsc__key')) as HTMLInputElement[];

/**
 * 设置页冒烟：只有一件事——7 个动作的快捷键绑定。
 * 验证渲染数量、默认值回填、改键校验与保存写入。
 */
describe('options page smoke', () => {
  it('renders one row per action with default bindings', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const inputs = rowInputs(root);
    expect(inputs.length).toBe(SHORTCUT_DEFINITIONS.length);

    const byLabel = new Map(
      SHORTCUT_DEFINITIONS.map((definition) => [definition.id, root.querySelector(`#label-${definition.id}`)]),
    );
    byLabel.forEach((node) => expect(node).not.toBeNull());

    const fullscreenInput = inputs[SHORTCUT_DEFINITIONS.findIndex((d) => d.id === 'fullscreen')];
    expect(fullscreenInput.dataset.shortcut).toBe(DEFAULT_SHORTCUTS.fullscreen);
  });

  it('loads saved shortcuts from storage', async () => {
    const { render } = createChromeMock({
      sync: {
        'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g', togglePlay: 'p' } },
      },
    });
    const root = await render();

    const inputs = rowInputs(root);
    const fullscreenInput = inputs[SHORTCUT_DEFINITIONS.findIndex((d) => d.id === 'fullscreen')];
    const playInput = inputs[SHORTCUT_DEFINITIONS.findIndex((d) => d.id === 'togglePlay')];

    expect(fullscreenInput.dataset.shortcut).toBe('g');
    expect(playInput.dataset.shortcut).toBe('p');
  });

  it('flags a duplicate binding and blocks save', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    const inputs = rowInputs(root);
    const increase = inputs[SHORTCUT_DEFINITIONS.findIndex((d) => d.id === 'increaseSpeed')];
    const decrease = inputs[SHORTCUT_DEFINITIONS.findIndex((d) => d.id === 'decreaseSpeed')];

    // 通过真实按键把两个动作都绑到 'k'。
    increase.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    decrease.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));

    const status = root.querySelector('#status');
    expect(status?.textContent).not.toBe('');
    expect(increase.classList.contains('vsc--conflict')).toBe(true);
    expect(decrease.classList.contains('vsc--conflict')).toBe(true);

    (root.querySelector('#save') as HTMLButtonElement).click();
    await flush();
    // 校验失败时不应写入冲突值：sync 里的 increaseSpeed 仍是加载时回写的默认 '='，
    // 而不是 'k'。（loadSettings 会在加载时把默认值回写一次，所以 sync 非空是正常的。）
    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.increaseSpeed).toBe(DEFAULT_SHORTCUTS.increaseSpeed);
  });

  it('saves the current bindings', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    const inputs = rowInputs(root);
    const fullscreenInput = inputs[SHORTCUT_DEFINITIONS.findIndex((d) => d.id === 'fullscreen')];
    fullscreenInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    expect(fullscreenInput.dataset.shortcut).toBe('g');

    (root.querySelector('#save') as HTMLButtonElement).click();
    await flush();

    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe('g');
  });

  it('restores defaults on reset', async () => {
    const { render } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    const inputs = rowInputs(root);
    const fullscreenInput = inputs[SHORTCUT_DEFINITIONS.findIndex((d) => d.id === 'fullscreen')];
    expect(fullscreenInput.dataset.shortcut).toBe('g');

    (root.querySelector('#reset') as HTMLButtonElement).click();
    expect(fullscreenInput.dataset.shortcut).toBe(DEFAULT_SHORTCUTS.fullscreen);
  });
});
