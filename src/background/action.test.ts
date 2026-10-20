import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_OPTIONS_COMMAND, TOGGLE_FULLSCREEN_MESSAGE } from '../shared/types';

type ClickListener = (tab: { id?: number }) => void;
type CommandListener = (command: string) => void;

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

  // ⚠️ 必须重置模块缓存。
  // background 的顶层代码（注册监听器）在模块**首次**导入时执行一次；
  // 上面那个 describe 已经导入过了，这里再 import 拿到的是缓存，
  // 顶层代码不会重跑 —— 监听器也就不会注册，测试会假失败。
  beforeEach(() => {
    vi.resetModules();
  });

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
    commandListeners[0]?.('some-other-command');

    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});
