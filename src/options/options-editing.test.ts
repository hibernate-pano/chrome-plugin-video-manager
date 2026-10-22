import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, SHORTCUT_DEFINITIONS } from '../shared/types';
import { normalizeShortcut } from '../shared/shortcuts';
import { createChromeMock, flush } from './options-test-env';
import { formatExtensionCommandLabel, formatShortcutLabel } from './options-platform';
import {
  RESERVED_BROWSER_SHORTCUTS,
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

/**
 * storage 出故障时的设置页。
 *
 * ## 为什么单独一组
 *
 * 「读设置失败」「写设置失败」是设置页里**唯一**会静默毁掉用户数据的
 * 两条路径：
 *
 * - 读失败时，界面上显示的是**默认值**，而 storage 里是用户真实的绑定。
 *   之前 catch 分支写的是 `apply(DEFAULT_SHORTCUTS, { markSaved: true })` ——
 *   把默认值当成了「用户已经保存过的值」。于是页面上显示默认键、状态栏空的、
 *   「保存」按钮上没有「•」，用户完全看不出这里出过任何事；接着他改一个键
 *   按「保存」，storage 里 7 条自定义绑定中的 6 条被默认值**静默抹掉**，
 *   而页面从头到尾显示「一切正常」。
 *
 * - 写失败时，失败提示只是直接写进 DOM，下一次改键就被「有未保存的更改」
 *   盖掉 —— 「保存失败，请重试」只在「用户什么都不做」的那几秒里存在。
 *
 * 两条都属于「用户界面看起来是好的，数据已经坏了」这一类，
 * 所以这里断言的全是**用户真正感知到的东西**：
 * 状态栏上那句话、storage 里到底有没有被写过、界面回不回滚。
 */

/** 让 `chrome.storage.sync.get` 失败（模拟 storage 读不出来）。 */
const breakSyncGet = () => {
  const chromeMock = (globalThis as Record<string, unknown>).chrome as {
    runtime: { lastError: unknown };
    storage: { sync: { get: unknown } };
  };
  chromeMock.storage.sync.get = (
    _key: string,
    callback: (result: Record<string, unknown>) => void,
  ) => {
    chromeMock.runtime.lastError = { message: 'mock: storage.sync.get failed' };
    callback({});
    chromeMock.runtime.lastError = null;
  };
};

/** 让 `chrome.storage.sync.set` 失败（模拟写盘失败）。 */
const breakSyncSet = () => {
  const chromeMock = (globalThis as Record<string, unknown>).chrome as {
    runtime: { lastError: unknown };
    storage: { sync: { set: unknown } };
  };
  chromeMock.storage.sync.set = (
    _value: Record<string, unknown>,
    callback?: () => void,
  ) => {
    chromeMock.runtime.lastError = { message: 'mock: storage.sync.set failed' };
    callback?.();
    chromeMock.runtime.lastError = null;
  };
};

/** 用户自定义过的 7 条绑定 —— 读失败之后**这些**才是 storage 里的真值。 */
const CUSTOM = {
  increaseSpeed: '1',
  decreaseSpeed: '2',
  resetSpeed: '3',
  togglePlay: '4',
  seekBack: '5',
  seekForward: '6',
  fullscreen: '7',
};

const resetButtonOf = (root: HTMLElement) => root.querySelector('#reset') as HTMLButtonElement;

describe('设置页：读取设置失败', () => {
  it('状态栏明确说「读取失败」，而不是一声不响', async () => {
    const { render } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: CUSTOM } },
    });
    // ⚠️ 必须在 render **之前**把 get 弄坏：设置页一打开就在读。
    breakSyncGet();
    const root = await render();

    expect(statusOf(root)).toContain('读取设置失败');
    // 而且必须说清「重试」这条出路。
    expect(statusOf(root)).toContain('重试');
  });

  it('给一个「重试读取」的按钮', async () => {
    const { render } = createChromeMock();
    breakSyncGet();
    const root = await render();

    const retry = root.querySelector('#retry-load') as HTMLButtonElement | null;
    expect(retry, '读取失败时必须有「重试读取」按钮').not.toBeNull();
    expect(retry!.hidden, '读取失败时「重试读取」必须可见').toBe(false);
  });

  it('改键再点保存：一个字节都不写进去', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: CUSTOM } },
    });
    breakSyncGet();
    const root = await render();

    press(inputOf(root, 'fullscreen'), 'z');
    saveButtonOf(root).click();
    await flush();

    // ⚠️ 核心守卫：storage 里**仍然是**用户原来的 7 条自定义绑定。
    // 之前写进去的是 {increaseSpeed:'=', ..., fullscreen:'z'} ——
    // 用户的 7 条自定义绑定里的 6 条被默认值静默抹掉。
    const stored = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS } | undefined;
    expect(stored?.shortcuts ?? CUSTOM).toEqual(CUSTOM);
  });

  it('「恢复默认」也一个字节都不写进去', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: CUSTOM } },
    });
    breakSyncGet();
    const root = await render();

    resetButtonOf(root).click();
    await flush();

    const stored = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS } | undefined;
    expect(stored?.shortcuts ?? CUSTOM).toEqual(CUSTOM);
  });

  it('读取失败时界面明确标成「不可保存」，不是看着一切正常', async () => {
    const { render } = createChromeMock();
    breakSyncGet();
    const root = await render();

    // ⚠️ 之前这里没有「不可保存」这个概念：按钮上**没有**「•」，
    // 状态栏是空的 —— 用户完全看不出这里出过任何事。
    expect(saveButtonOf(root).getAttribute('aria-disabled')).toBe('true');
    expect(resetButtonOf(root).getAttribute('aria-disabled')).toBe('true');
    // 而且**不**显示「•」：此刻界面上的值只是默认值，
    // 说「有未保存的更改」是假的。
    expect(saveButtonOf(root).textContent).not.toContain('•');
  });

  it('读取成功之后恢复正常（没有留下「不可保存」的残迹）', async () => {
    const { render } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: CUSTOM } },
    });
    breakSyncGet();
    const root = await render();
    expect(saveButtonOf(root).getAttribute('aria-disabled')).toBe('true');

    // 把 get 修回去，点「重试读取」。
    const chromeMock = (globalThis as Record<string, unknown>).chrome as {
      runtime: { lastError: unknown };
      storage: { sync: { get: unknown } };
    };
    chromeMock.storage.sync.get = (
      _key: string,
      callback: (result: Record<string, unknown>) => void,
    ) => {
      callback({ 'vsc-settings': { shortcuts: CUSTOM } });
    };

    (root.querySelector('#retry-load') as HTMLButtonElement).click();
    await flush();

    // 恢复正常 = 那个属性**不存在**（不是 "false"）。
    expect(saveButtonOf(root).getAttribute('aria-disabled')).toBeNull();
    // 重试之后界面上显示的是**用户真实的绑定**，不是默认值。
    expect(inputOf(root, 'fullscreen').value).toBe('7');
  });
});

describe('设置页：保存失败', () => {
  it('状态栏是失败文案', async () => {
    const { render } = createChromeMock();
    const root = await render();

    breakSyncSet();
    press(inputOf(root, 'fullscreen'), 'k');
    saveButtonOf(root).click();
    await flush();

    expect(statusOf(root)).toBe('保存失败，请重试');
  });

  it('再按一个键，失败文案**仍然**在（不被「有未保存的更改」盖掉）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    breakSyncSet();
    press(inputOf(root, 'fullscreen'), 'k');
    saveButtonOf(root).click();
    await flush();
    expect(statusOf(root)).toBe('保存失败，请重试');

    // ⚠️ 关键一步：用户再动一下输入框。
    // 之前这一步就把失败提示冲掉了 —— 失败信息只在「用户什么都不做」
    // 的窗口里存在。
    press(inputOf(root, 'fullscreen'), 'j');
    await flush();

    expect(statusOf(root), '失败提示必须留在屏幕上').toBe('保存失败，请重试');
  });

  it('失败之后 storage 里没有被写入', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    breakSyncSet();
    press(inputOf(root, 'fullscreen'), 'k');
    saveButtonOf(root).click();
    await flush();

    const stored = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(stored.shortcuts.fullscreen).toBe('g');
  });
});

describe('设置页：「恢复默认」写盘失败', () => {
  it('状态栏是失败文案', async () => {
    const { render } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    breakSyncSet();
    resetButtonOf(root).click();
    await flush();

    expect(statusOf(root)).toBe('保存失败，请重试');
  });

  it('storage 里没有被写入默认值', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    breakSyncSet();
    resetButtonOf(root).click();
    await flush();

    const stored = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(stored.shortcuts.fullscreen, '默认值一个字节都不许写进去').toBe('g');
  });

  it('界面回滚：仍然显示用户原来的绑定（不是默认值）', async () => {
    const { render } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    breakSyncSet();
    resetButtonOf(root).click();
    await flush();

    // ⚠️ 之前 apply(DEFAULT_SHORTCUTS, { markSaved: true }) 在写盘**之前**
    // 就改了界面与 savedShortcuts：页面显示着默认值、storage 里是旧值、
    // 「保存」按钮上没有「•」—— 页面看着干净且已保存，实际一个字节都没变。
    expect(inputOf(root, 'fullscreen').value).toBe('g');
    expect(saveButtonOf(root).textContent, '没有待存的东西时不该有「•」').not.toContain('•');
  });

  it('再动一下输入框，失败文案**仍然**在', async () => {
    const { render } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    breakSyncSet();
    resetButtonOf(root).click();
    await flush();
    expect(statusOf(root)).toBe('保存失败，请重试');

    press(inputOf(root, 'fullscreen'), 'k');
    await flush();

    expect(statusOf(root), '失败提示必须留在屏幕上').toBe('保存失败，请重试');
  });
});

describe('设置页：「恢复默认」可以撤销', () => {
  it('落盘之后出现「撤销」，点它能把原来的绑定写回去', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    resetButtonOf(root).click();
    await flush();

    // 落盘成功 → 按钮变成「撤销」。
    const stored = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(stored.shortcuts.fullscreen).toBe('f');
    expect(resetButtonOf(root).textContent).toContain('撤销');

    // 点「撤销」→ 原来的 'g' 写回去。
    resetButtonOf(root).click();
    await flush();

    const restored = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(restored.shortcuts.fullscreen).toBe('g');
    expect(inputOf(root, 'fullscreen').value).toBe('g');
  });

  it('用户改过键之后，那份「撤销」备份就过期了（不能再拿它覆盖用户新存的东西）', async () => {
    const { render, sync } = createChromeMock({
      sync: { 'vsc-settings': { shortcuts: { ...DEFAULT_SHORTCUTS, fullscreen: 'g' } } },
    });
    const root = await render();

    resetButtonOf(root).click();
    await flush();
    expect(resetButtonOf(root).textContent).toContain('撤销');

    // 用户改了键 → 那份备份不再代表他想要的东西。
    press(inputOf(root, 'fullscreen'), 'k');
    expect(resetButtonOf(root).textContent).not.toContain('撤销');

    // 而且此时点「恢复默认」是**新的一次**恢复（不是撤销上一次），
    // 撤销按钮不该再出现。
    resetButtonOf(root).click();
    await flush();
    const stored = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS };
    expect(stored.shortcuts.fullscreen).toBe('f');
  });
});

describe('设置页：有未保存的改动时不许悄悄走人', () => {
  it('改键之后触发 beforeunload 拦阻', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'fullscreen'), 'k');

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(
      event.defaultPrevented,
      '有未保存的改动时必须拦一下 —— 之前刷新页面改动静默消失',
    ).toBe(true);
  });

  it('没有改动时不拦（用户正常关页不该被拦）', async () => {
    const { render } = createChromeMock();
    await render();

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
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

/**
 * 「同一个物理事件同时命中两个动作」必须在设置页就被拦下（缺陷 4）。
 *
 * 复现路径（实测）：
 * 1. 「加速」绑小键盘 `+`（录成 `plus`）；
 * 2. 「重置」绑 `Shift+=`（录成 `shift+plus`）；
 * 3. 点保存 → **保存成功**，状态栏「已保存」，两行都没有错误提示；
 * 4. 在视频页按 `Shift+=` → **rate 从 1.5 变成 1.6（加速赢了，重置没跑）**。
 *
 * ⚠️ 这条守的是**设置页**那一半；运行时那一半由
 * `shortcuts.test.ts` 的「撞车判据与运行时匹配逐字一致」守着。
 * 两层必须同时绿 —— 只有一层绿就还是「设置页说没事、运行时打架」。
 */
describe('设置页：会同时命中的两条绑定必须拒绝保存', () => {
  it('plus 与 shift+plus：两行都报重复，保存被拒，storage 不变', async () => {
    const { render, sync } = createChromeMock();
    const root = await render();

    // 「加速」= 小键盘 +，「重置」= Shift+=。
    press(inputOf(root, 'increaseSpeed'), '+');
    press(inputOf(root, 'resetSpeed'), '+', { shiftKey: true });

    // 两行都必须**就地**报错（状态栏在页面最底部，指不出是哪一行）。
    expect(inputOf(root, 'increaseSpeed').dataset.shortcut).toBe('plus');
    expect(inputOf(root, 'resetSpeed').dataset.shortcut).toBe('shift+plus');

    // 逐行错误与状态栏用的是两条不同的文案：
    // 行内是「与『X』重复（键）」，状态栏是「『X』与『Y』绑定了同一个键」。
    const rowText = '重复';
    const statusText = '绑定了同一个键';
    expect(root.querySelector('#error-increaseSpeed')?.textContent).toContain(rowText);
    expect(root.querySelector('#error-resetSpeed')?.textContent).toContain(rowText);
    expect(statusOf(root)).toContain(statusText);

    // 点保存：存不下去，storage 里还是默认值。
    saveButtonOf(root).click();
    await flush();

    expect(statusOf(root)).toContain(statusText);
    const saved = sync['vsc-settings'] as { shortcuts: typeof DEFAULT_SHORTCUTS } | undefined;
    expect(saved?.shortcuts.increaseSpeed ?? DEFAULT_SHORTCUTS.increaseSpeed).toBe(
      DEFAULT_SHORTCUTS.increaseSpeed,
    );
    expect(saved?.shortcuts.resetSpeed ?? DEFAULT_SHORTCUTS.resetSpeed).toBe(
      DEFAULT_SHORTCUTS.resetSpeed,
    );
  });

  it('换一个键之后撞车消失（错误不会粘在界面上）', async () => {
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), '+');
    press(inputOf(root, 'resetSpeed'), '+', { shiftKey: true });
    expect(root.querySelector('#error-resetSpeed')?.textContent).toContain('重复');

    // 把「重置」改成别的键 → 两行的错误都要消失。
    press(inputOf(root, 'resetSpeed'), 'k');

    expect(root.querySelector('#error-increaseSpeed')?.textContent ?? '').toBe('');
    expect(root.querySelector('#error-resetSpeed')?.textContent ?? '').toBe('');
    expect(statusOf(root)).not.toContain('重复');
  });

  it('只有 Shift 不同的普通键**不算**撞车（别误伤正常绑定）', async () => {
    // `k` 与 `shift+k` 是两个不同的键：运行时 Shift 不同，不会同时命中。
    // 判据若写成「主键相同就算撞车」，这两条会被误拦 ——
    // 那会把「加速 = k、重置 = Shift+K」这种完全正常的组合挡在门外。
    const { render } = createChromeMock();
    const root = await render();

    press(inputOf(root, 'increaseSpeed'), 'k');
    press(inputOf(root, 'resetSpeed'), 'k', { shiftKey: true });

    expect(statusOf(root)).not.toContain('重复');
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

  /**
   * **清单里没有死条目**（6.2.0 审计缺陷 2）。
   *
   * 死条目 = `canonicalShortcut` **永远产生不出来**的形态 ——
   * 守卫查的是一串字面量，而真实输入归一出来是另一个串，两者永不相等。
   * 于是那条保留键**从来没有生效过**。
   *
   * ⚠️ 死条目不只是「没用」—— 它们让人**误以为有防护**：
   * 清单里写着 `alt+space`，作者就以为「Alt+空格已经被拦住了」。
   * 实测：清单里有 9 条这样的死条目（`alt+space`、`ctrl+space`、
   * `ctrl+shift+space`、`meta+space`、`ctrl+alt+delete`、
   * `meta+alt+escape`、`meta+alt+f`、`meta+alt+l`、`meta+ctrl+f`），
   * 用户把 Alt+空格绑上去照样存得进去，按下去浏览器抢走，扩展一声不吭。
   *
   * 这条守卫的判据很直接：**清单里每一条，都必须能被产生器造出来** ——
   * 即 `canonicalShortcut(entry) === entry`（规范形是不动点）。
   */
  it('清单里没有死条目：每一条都是 canonicalShortcut 能产生出来的形态', () => {
    const dead = [...RESERVED_BROWSER_SHORTCUTS].filter(
      (entry) => canonicalShortcut(entry) !== entry,
    );

    expect(
      dead,
      `这些条目永远不会被触发（canonicalShortcut 产出的是另一个串）：\n` +
        dead.map((entry) => `  ${entry} → ${canonicalShortcut(entry)}`).join('\n'),
    ).toEqual([]);
  });

  it('清单里的每一条都真的拦得住（不是只存在于清单里）', () => {
    // 上一条查的是「形态自洽」，这一条查的是「端到端真的生效」：
    // 拿清单里的每一条去过一遍守卫，必须全部命中。
    const missed = [...RESERVED_BROWSER_SHORTCUTS].filter(
      (entry) => !isBrowserReservedShortcut(entry),
    );

    expect(missed, `这些条目写进了清单却拦不住：${missed.join(', ')}`).toEqual([]);
  });

  /**
   * Chrome 的真实缩放键（缺陷 2）。
   *
   * 实测：用 CDP 派发真实 `Ctrl+Shift+=`（`event.key === '+'`），
   * 设置页录成 `ctrl+shift+plus`，**不报任何错** ——
   * 而清单里明明写着 `ctrl+plus` 和 `ctrl+-`。
   *
   * 根因：清单里只有**没有 Shift 的那一档**。Chrome 的缩放键恰恰是
   * `Ctrl+Shift+=`（放大）/ `Ctrl+Shift+-`（缩小），Shift 是必须的。
   */
  it('Chrome 的真实缩放键 Ctrl+Shift+= / Ctrl+Shift+- 必须被硬拦', () => {
    // 设置页按 Ctrl+Shift+= 录出来的就是 'ctrl+shift+plus'（'+' 归到 plus）。
    expect(canonicalShortcut('ctrl+shift+plus')).toBe('ctrl+shift+plus');
    expect(isBrowserReservedShortcut('ctrl+shift+plus'), 'Ctrl+Shift+= 没被拦住').toBe(true);
    expect(isBrowserReservedShortcut('ctrl+shift+-'), 'Ctrl+Shift+- 没被拦住').toBe(true);

    // 不带 Shift 的那一档也仍然拦着（Ctrl+= / Ctrl+- 在部分布局上同样是缩放）。
    expect(isBrowserReservedShortcut('ctrl+plus')).toBe(true);
    expect(isBrowserReservedShortcut('ctrl+-')).toBe(true);
  });

  /**
   * `Ctrl+1..9` / `Ctrl+0` 的 Shift 变体（缺陷 3）。
   *
   * `Ctrl+Shift+1` 是 Chrome 的「切到第 1 个标签页」的另一种写法
   * （以及部分版本上的「切到上一个标签组」）—— 它同样归浏览器调度。
   * 只列 `ctrl+1` 这一档的话，Shift 变体**存得进去**。
   */
  it('Ctrl+1..9 / Ctrl+0 的 Shift 变体也要拦', () => {
    for (let index = 0; index <= 9; index += 1) {
      expect(
        isBrowserReservedShortcut(`ctrl+shift+${index}`),
        `Ctrl+Shift+${index} 没被拦住`,
      ).toBe(true);
    }
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
