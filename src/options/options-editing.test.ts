import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '../shared/types';
import { normalizeShortcut } from '../shared/shortcuts';
import { createChromeMock, flush } from './options-test-env';
import { formatExtensionCommandLabel, formatShortcutLabel } from './options-platform';
import {
  canonicalShortcut,
  isBrowserReservedShortcut,
  isExtensionCommandShortcut,
} from './options-reserved';

/**
 * 设置页的「编辑 → 保存 → 撤销」这一整套行为。
 *
 * 这组用例守的是一件很小、但一旦坏掉就很难被用户察觉的事：
 * **用户改了什么、存没存、能不能撤销，必须在界面上看得见。**
 *
 * 之前的状态是：改完键状态栏是空的、保存按钮文案还是「保存」、
 * 按 Enter 什么都不发生 —— 用户刷新一下，改动静默消失，
 * 而他从头到尾不知道要按保存。
 */

const rowInputs = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('.vsc__key')) as HTMLInputElement[];

const inputOf = (root: HTMLElement, id: keyof typeof DEFAULT_SHORTCUTS): HTMLInputElement => {
  const index = SHORTCUT_DEFINITIONS.findIndex((definition) => definition.id === id);
  return rowInputs(root)[index]!;
};

const statusOf = (root: HTMLElement) => root.querySelector('#status')?.textContent?.trim() ?? '';
const saveButtonOf = (root: HTMLElement) => root.querySelector('#save') as HTMLButtonElement;

const press = (input: HTMLInputElement, key: string, modifiers: Partial<KeyboardEventInit> = {}) => {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }));
};

describe('设置页：改键与保存', () => {
  it('改了键但没保存：按钮标出「•」，状态栏说明有未保存的更改', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    press(input, 'k');

    expect(saveButtonOf(root).textContent).toContain('•');
    expect(statusOf(root)).toBe('有未保存的更改');
  });

  it('保存之后「•」消失，状态栏回到干净状态', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    press(input, 'k');
    saveButtonOf(root).click();
    await flush();

    expect(saveButtonOf(root).textContent).not.toContain('•');
    expect(statusOf(root)).toBe('已保存');
  });

  it('Enter 等同于保存', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    press(input, 'k');
    press(input, 'Enter');
    await flush();

    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe('k');
  });

  it('没有改动时按钮上**没有**「•」标记', async () => {
    const { render } = createChromeMock();
    const root = await render();

    // ⚠️ 这里刻意**不**把按钮置灰：一个灰掉的主按钮在商店截图上看着像
    // 「功能坏了」，而按下去也只是把同样的值再写一遍，无害。
    // 「有没有东西要存」由「•」和状态栏那一行表达，不靠 disabled。
    expect(saveButtonOf(root).textContent).not.toContain('•');
    expect(statusOf(root)).toBe('');

    const input = inputOf(root, 'fullscreen');
    press(input, 'k');
    expect(saveButtonOf(root).textContent).toContain('•');
  });

  it('清空绑定（Backspace）之后焦点仍在输入框里，Enter 照样能存', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    press(input, 'Backspace');
    expect(input.dataset.shortcut).toBe('');

    // ⚠️ 之前 Backspace 之后输入框会失焦，于是 Enter 送不到这个输入框，
    // 「Enter = 保存」在「刚清空绑定」这条路径上直接失效 ——
    // 用户以为没存上（真实原因是焦点跑了）。
    press(input, 'Enter');
    await flush();

    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe('');
  });

  it('Escape 撤销这次修改：回到**已保存**的值，而不是草稿', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    expect(input.value).toBe('g');

    press(input, 'k');
    expect(input.value).toBe('k');

    // ⚠️ 之前这里回填的是 dataset.shortcut（**草稿**），
    // 于是「取消这次修改」什么也没取消：框里还是 k，
    // 用户接着点保存就把错的键写进去了。
    press(input, 'Escape');

    expect(input.value).toBe('g');
    expect(input.dataset.shortcut).toBe('g');

    // 撤销之后草稿也回到已保存的值 —— 保存不会写进 k。
    saveButtonOf(root).click();
    await flush();
    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe('g');
  });

  it('恢复默认会真的落盘，并给出提示', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    (root.querySelector('#reset') as HTMLButtonElement).click();
    await flush();

    // ⚠️ 之前「恢复默认」只改界面，storage 里还是旧值 ——
    // 刷新页面又变回去，用户以为恢复了，其实什么都没发生。
    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe(DEFAULT_SHORTCUTS.fullscreen);
    expect(statusOf(root)).toBe('已恢复默认');
  });

  it('禁用的动作在刷新后仍有占位符，不是一个空白框', async () => {
    const { render } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: '' } } },
    });
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    // ⚠️ 之前落盘后是 value:"" + placeholder:"" —— 整行只剩动作名与说明，
    // 用户看不出「这里本来有东西」还是「这里被禁用了」。
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('未绑定（已禁用）');
    expect(input.getAttribute('aria-label')).toContain('未绑定');
  });

  it('长绑定带完整的 title 与 aria-label（框里装不下时也有兜底）', async () => {
    const { render } = createChromeMock({
      sync: {
        'vsc-settings': {
          shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'ctrl+alt+shift+meta+pagedown' },
        },
      },
    });
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    expect(input.title).toContain('PgDn');
    expect(input.getAttribute('aria-label')).toContain('PgDn');
  });

  it('设置页写明「点工具栏图标 = 全屏」与设置页快捷键', async () => {
    const { render } = createChromeMock();
    const root = await render();

    // 这两件事此前只写在 README 与商店文案里，产品内一处都没有。
    const tips = root.querySelector('#tips')?.textContent ?? '';
    expect(tips).toContain('点击工具栏图标');
    expect(tips).toContain('Ctrl+Shift+,');
  });
});

describe('设置页：浏览器保留键与自冲突一律拒绝保存', () => {
  it('浏览器保留键被拦住，且不会被「已保存」覆盖', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    // Ctrl+Shift+I 是开发者工具 —— 存下去的话，按下去永远不会有反应。
    press(input, 'I', { ctrlKey: true, shiftKey: true });

    expect(statusOf(root)).toBe('这个键被浏览器占用，换一个');

    saveButtonOf(root).click();
    await flush();

    // 错误提示必须留在屏幕上：之前点一次「保存」就被「已保存」盖掉。
    expect(statusOf(root)).toBe('这个键被浏览器占用，换一个');

    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe(DEFAULT_SHORTCUTS.fullscreen);
  });

  it('扩展自己的命令键（Ctrl+Shift+,）被拦住', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    press(input, ',', { ctrlKey: true, shiftKey: true });

    expect(statusOf(root)).toBe('这个键是扩展自己的命令，换一个');

    saveButtonOf(root).click();
    await flush();

    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe(DEFAULT_SHORTCUTS.fullscreen);
  });

  it('默认绑定不被误判成保留键（否则扩展一装就自我封锁）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const status = statusOf(root);
    expect(status).toBe('');
    expect(saveButtonOf(root).textContent).not.toContain('•');
  });
});

describe('保留键清单', () => {
  it('覆盖实测漏掉的那几个', () => {
    // 这几个在旧的清单里**一个都没有**，用户照样存了进去。
    ['ctrl+shift+i', 'ctrl+shift+t', 'ctrl+shift+w', 'ctrl+,', 'ctrl+shift+,']
      .forEach((shortcut) => {
        expect(isBrowserReservedShortcut(shortcut), `${shortcut} 没被认成保留键`).toBe(true);
      });
  });

  it('覆盖 F1–F12 与 Alt+方向键', () => {
    for (let index = 1; index <= 12; index += 1) {
      expect(isBrowserReservedShortcut(`f${index}`)).toBe(true);
    }

    ['alt+left', 'alt+right', 'alt+up', 'alt+down'].forEach((shortcut) => {
      expect(isBrowserReservedShortcut(shortcut)).toBe(true);
    });
  });

  it('裸键不算保留键', () => {
    // 默认绑定全是裸键：把它们判成保留键等于扩展一装就自我封锁。
    ['f', '0', '=', '-', ' ', 'arrowleft', 'arrowright'].forEach((shortcut) => {
      expect(isBrowserReservedShortcut(shortcut), `${shortcut} 被误判成保留键`).toBe(false);
    });
  });

  it('归一：修饰键顺序与 Chrome 的键名写法不影响判断', () => {
    // Chrome 的 suggested_key 写 "Ctrl+Shift+Comma"，用户绑的是 "ctrl+shift+,"。
    expect(canonicalShortcut('Ctrl+Shift+Comma')).toBe('ctrl+shift+,');
    expect(canonicalShortcut('shift+ctrl+,')).toBe('ctrl+shift+,');
    expect(isBrowserReservedShortcut('Ctrl+Shift+Comma')).toBe(true);
  });
});

/**
 * Shift 变体字符：同一个物理键只能算**一条**绑定。
 *
 * 背景：美式键盘上 Shift+, 打出来的是 `<`，键盘事件给的正是 `<`；
 * 而 manifest 里扩展自己的命令键写的是 "Ctrl+Shift+Comma"（归一成 `ctrl+shift+,`）。
 * 两套词不归一的话，用户把动作绑到 Ctrl+Shift+, 上时，
 * 自冲突检查比对的是 `ctrl+shift+<` 与 `ctrl+shift+,` —— 不相等，于是放行。
 * 结果：浏览器先处理命令（打开设置页），用户绑的动作一次都不会发生。
 */
describe('Shift 变体字符：同一个物理键只能算一条绑定', () => {
  beforeEach(() => {
    // extensionCommandShortcuts() 要读 chrome.runtime.getManifest()。
    createChromeMock();
  });

  it('canonicalShortcut 把带 Shift 的那一档归到基础键', () => {
    const PAIRS: Array<[string, string]> = [
      ['<', ','],
      ['>', '.'],
      ['?', '/'],
      ['|', '\\'],
      ['"', "'"],
      ['~', '`'],
    ];

    PAIRS.forEach(([shifted, base]) => {
      expect(canonicalShortcut(`ctrl+shift+${shifted}`), `${shifted} 没归到 ${base}`)
        .toBe(canonicalShortcut(`ctrl+shift+${base}`));
    });

    expect(canonicalShortcut('ctrl+shift+<')).toBe('ctrl+shift+,');
  });

  it('扩展自己的命令键：按出来的那一档也要被认出来', () => {
    // 变异打穿点：manifest 写的是 "Ctrl+Shift+Comma"，
    // 用户在设置页按出来的是 '<' —— 不归一的话自冲突检查会漏掉它。
    expect(isExtensionCommandShortcut('ctrl+shift+<')).toBe(true);
    expect(isExtensionCommandShortcut('ctrl+shift+,')).toBe(true);
    expect(isExtensionCommandShortcut('ctrl+shift+k')).toBe(false);
  });

  it('两套归一规则对同义键给出同一个答案', () => {
    // canonicalShortcut（设置页这一份）与 normalizeShortcut（shared 那份）
    // 形式不同是有原因的（修饰键排序、Chrome 键名），但**同义键必须一致** ——
    // 否则「两份都查」里有哪一份漏掉，自冲突就还是漏。
    const PAIRS: Array<[string, string]> = [
      ['<', ','],
      ['>', '.'],
      ['?', '/'],
      ['|', '\\'],
      ['"', "'"],
      ['~', '`'],
    ];

    PAIRS.forEach(([shifted, base]) => {
      expect(canonicalShortcut(`ctrl+shift+${shifted}`), `${shifted} 两套规则不一致`)
        .toBe(normalizeShortcut(`ctrl+shift+${shifted}`));
      expect(canonicalShortcut(`ctrl+shift+${base}`), `${base} 两套规则不一致`)
        .toBe(normalizeShortcut(`ctrl+shift+${base}`));
    });
  });
});

describe('macOS 上的按键显示', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');

  const stubPlatform = (value: string) => {
    Object.defineProperty(Navigator.prototype, 'platform', {
      configurable: true,
      get: () => value,
    });
  };

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(Navigator.prototype, 'platform', originalDescriptor);
    }
  });

  it('macOS 上显示 ⌘ 而不是 Meta', () => {
    stubPlatform('MacIntel');
    expect(formatShortcutLabel('meta+shift+,')).toBe('⌘⇧,');
    expect(formatShortcutLabel('meta+f')).toBe('⌘f');
  });

  it('Windows / Linux 上仍是 Ctrl / Alt / Shift / Meta', () => {
    stubPlatform('Win32');
    expect(formatShortcutLabel('ctrl+shift+,')).toBe('Ctrl+Shift+,');
    expect(formatShortcutLabel('meta+f')).toBe('Meta+f');
  });

  it('扩展自己的命令键在 macOS 上是 ⌘⇧,（Chrome 把 manifest 里的 Ctrl 翻成 Command）', () => {
    stubPlatform('MacIntel');
    // ⚠️ 之前这里显示成 ⌃⇧,：那是**用户自己绑**的键的写法。
    // manifest 里写的 "Ctrl+Shift+Comma" 在 macOS 上实际是 ⌘⇧,，
    // 照着 ⌃⇧, 去按是按不出来的。
    expect(formatExtensionCommandLabel('ctrl+shift+,')).toBe('⌘⇧,');
    // 用户自己按 ⌃ 绑的键仍然显示 ⌃ —— 那里没有 Chrome 的翻译。
    expect(formatShortcutLabel('ctrl+shift+,')).toBe('⌃⇧,');
  });
});

/**
 * 「怎么把绑定清空」必须**看得见**。
 *
 * 背景：输入框是只读的（readOnly），用户只能看到自己绑的键，
 * 却看不到「怎么变成空」—— 而「留空 = 禁用该动作」是设置页明写着的规则。
 * 原来聚焦时的占位符只有「按下要绑定的键」五个字，Backspace 这件事
 * 一个字都没提；用户于是以为这个动作没法禁用。
 */
describe('设置页：怎么清空绑定', () => {
  const rowInputs = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('.vsc__key')) as HTMLInputElement[];

  const inputOf = (root: HTMLElement, id: keyof typeof DEFAULT_SHORTCUTS): HTMLInputElement => {
    const index = SHORTCUT_DEFINITIONS.findIndex((definition) => definition.id === id);
    return rowInputs(root)[index]!;
  };

  const press = (input: HTMLInputElement, key: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };

  it('聚焦时的占位符说清「按 Backspace 清除」', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    input.dispatchEvent(new FocusEvent('focus'));

    // 占位符与 title 都要说 —— 框只有 250px 宽，鼠标用户看的是 title。
    expect(input.placeholder).toMatch(/Backspace/);
    expect(input.title).toMatch(/Backspace/);
  });

  it('Backspace 真的清空绑定（= 禁用该动作），而且框里显示「已禁用」', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    press(input, 'Backspace');
    expect(input.dataset.shortcut).toBe('');

    // 失焦后回填：空绑定要显示成「未绑定（已禁用）」，
    // 而不是留一个完全空白的框（用户看不出是「本来没绑」还是「刚被我删了」）。
    input.dispatchEvent(new FocusEvent('blur'));
    expect(input.value).toBe('');
    expect(input.placeholder).toContain('禁用');

    (root.querySelector('#save') as HTMLButtonElement).click();
    await flush();
    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(saved.shortcuts.fullscreen).toBe('');
  });

  it('Delete 也能清空（笔记本上 Fn+Delete 走的就是它）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    const input = inputOf(root, 'fullscreen');
    press(input, 'Delete');
    expect(input.dataset.shortcut).toBe('');
  });
});
