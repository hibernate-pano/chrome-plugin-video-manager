import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_OPTIONS_COMMAND, TOGGLE_FULLSCREEN_MESSAGE } from '../shared/types';

type ClickListener = (tab: { id?: number }) => void;
type CommandListener = (command: string) => void;

/**
 * ⚠️ 必须重置模块缓存，而且必须在**顶层**。
 *
 * background 的顶层代码（注册监听器）在模块**首次**导入时执行一次。
 * 不重置的话，第二个用例再 `import('./index')` 拿到的是**模块缓存**：
 * 顶层代码不重跑 → 监听器压根没注册 → 用例自己新建的 clickListeners
 * 永远是空数组 → `expect(sendMessage).not.toHaveBeenCalled()` **恒真**。
 *
 * 那是一道假守卫：把生产代码里 `if (tab.id == null) { return; }` 整段删掉，
 * 它照样绿。
 *
 * 放在某一个 describe 的 beforeEach 里是不够的 —— 另一个 describe 依然会
 * 拿到模块缓存。所以这个 beforeEach 必须是顶层的、两个 describe 共用。
 */
beforeEach(() => {
  vi.resetModules();
});

describe('background action click', () => {
  const stubChrome = (clickListeners: ClickListener[], sendMessage: ReturnType<typeof vi.fn>) => {
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: (fn: ClickListener) => clickListeners.push(fn) } },
      tabs: { sendMessage },
      runtime: { lastError: null },
    });
  };

  it('sends a fullscreen toggle to the clicked tab', async () => {
    const clickListeners: ClickListener[] = [];
    const sendMessage = vi.fn();
    stubChrome(clickListeners, sendMessage);

    await import('./index');

    // 前置断言：监听器必须真的注册上了。
    // 少了这条，下面的断言可能在「监听器压根没注册」的情况下恒真 ——
    // 那就是一道假守卫（变异验证：删掉 tab.id 判空，这条会红）。
    expect(clickListeners.length, 'action.onClicked 的监听器必须注册上').toBeGreaterThan(0);

    clickListeners[0]?.({ id: 7 });

    expect(sendMessage).toHaveBeenCalledWith(
      7,
      { type: TOGGLE_FULLSCREEN_MESSAGE },
      expect.any(Function),
    );
  });

  it('ignores tabs without an id', async () => {
    const clickListeners: ClickListener[] = [];
    const sendMessage = vi.fn();
    stubChrome(clickListeners, sendMessage);

    await import('./index');

    // 没有这条，下面的 not.toHaveBeenCalled() 可能在监听器压根没注册时恒真。
    expect(clickListeners.length, 'action.onClicked 的监听器必须注册上').toBeGreaterThan(0);

    clickListeners[0]?.({});

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('background 原生命令：打开设置页', () => {
  const stubChrome = (commandListeners: CommandListener[]) => {
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: () => undefined } },
      tabs: { sendMessage: vi.fn() },
      runtime: { lastError: null, openOptionsPage: vi.fn() },
      commands: { onCommand: { addListener: (fn: CommandListener) => commandListeners.push(fn) } },
    });
  };

  it('命令触发时打开设置页', async () => {
    const commandListeners: CommandListener[] = [];
    stubChrome(commandListeners);

    await import('./index');
    expect(commandListeners.length).toBeGreaterThan(0);

    commandListeners[0]?.(OPEN_OPTIONS_COMMAND);

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('别的命令不打开设置页', async () => {
    const commandListeners: CommandListener[] = [];
    stubChrome(commandListeners);

    await import('./index');
    expect(commandListeners.length, 'commands.onCommand 的监听器必须注册上').toBeGreaterThan(0);

    commandListeners[0]?.('some-other-command');

    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});
