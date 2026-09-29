import { describe, expect, it, vi } from 'vitest';
import { SPEED_CHANGED_MESSAGE } from '../shared/types';

type MessageListener = (message: unknown, sender: unknown) => void;

describe('background badge', () => {
  it('sets badge text from speed change messages and clears at 1x', async () => {
    // 用数组收集而不是 let listener = null：赋值发生在 addListener 回调里，
    // TypeScript 的控制流分析看不到，`listener?.()` 会被收窄成 never。
    const listeners: MessageListener[] = [];
    const setBadgeText = vi.fn();
    const setBadgeBackgroundColor = vi.fn();

    vi.stubGlobal('chrome', {
      action: { setBadgeText, setBadgeBackgroundColor },
      runtime: {
        onMessage: {
          addListener: (fn: MessageListener) => {
            listeners.push(fn);
          },
        },
        onInstalled: { addListener: () => {} },
      },
    });

    await import('./index');

    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#0ea5e9' });

    const listener = listeners[0];
    const sender = { tab: { id: 7 } };
    listener?.({ type: SPEED_CHANGED_MESSAGE, speed: 1.5 }, sender);
    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: '1.5' });

    listener?.({ type: SPEED_CHANGED_MESSAGE, speed: 1.75 }, sender);
    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: '1.75' });

    listener?.({ type: SPEED_CHANGED_MESSAGE, speed: 1 }, sender);
    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: '' });

    // 非速度消息不触发 badge 更新
    listener?.({ type: 'other' }, sender);
    expect(setBadgeText).toHaveBeenCalledTimes(3);
  });

  it('ignores messages without a tab', async () => {
    const listeners: MessageListener[] = [];
    const setBadgeText = vi.fn();

    vi.stubGlobal('chrome', {
      action: { setBadgeText, setBadgeBackgroundColor: vi.fn() },
      runtime: {
        onMessage: {
          addListener: (fn: MessageListener) => {
            listeners.push(fn);
          },
        },
        onInstalled: { addListener: () => {} },
      },
    });

    await import('./index');

    listeners[0]?.({ type: SPEED_CHANGED_MESSAGE, speed: 2 }, {});
    expect(setBadgeText).not.toHaveBeenCalled();
  });
});
