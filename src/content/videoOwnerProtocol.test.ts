import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ContentRuntime } from './runtime';
import {
  VIDEO_OWNER_ASK_MESSAGE,
  VIDEO_OWNER_QUERY_MESSAGE,
  VIDEO_OWNER_REPORT_MESSAGE,
} from '../shared/types';

/**
 * 「这个标签页的视频在哪儿」这条协议的内容脚本一侧。
 *
 * 背景：6.1.0 起每个 frame 只管**自己文档里**的视频（注册表不再钻进 iframe
 * —— 两个运行时抢同一个 `<video>` 会打架）。于是「视频在哪」只有把各个
 * frame 问一遍才知道，而 background 自己看不见任何 DOM。
 *
 * 这条协议要解决的是实测到的两个静默失败：
 * - 点工具栏图标 → 视频在嵌入框里时，答案是「这个页面里没有视频」；
 * - 按快捷键 → 视频在嵌入框里时，**什么都不会发生**（键穿透给了页面）。
 */

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse?: (response: unknown) => void,
) => void;

/** 取最近一个 ContentRuntime 注册的 onMessage 监听器。 */
const lastMessageListener = () => {
  const calls = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0] as MessageListener;
};

const createVideo = () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'playbackRate', { value: 1, writable: true, configurable: true });
  Object.defineProperty(video, 'paused', { value: false, writable: true, configurable: true });
  return video;
};

describe('内容脚本回答「谁有视频」', () => {
  let runtime: ContentRuntime;
  let store: Map<string, unknown>;
  let sendMessage: Mock<any[]>;

  const setup = async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    store = new Map();
    sendMessage = vi.fn();

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: null,
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        sync: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        local: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    runtime = new ContentRuntime({ isTrustedEvent: () => true });
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(async () => {
    await setup();
  });

  afterEach(() => {
    runtime.stop();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('收到广播 → 报告自己这个 frame 的情况', async () => {
    const video = createVideo();
    video.id = 'main';
    document.body.appendChild(video);

    lastMessageListener()?.({ type: VIDEO_OWNER_ASK_MESSAGE }, {});
    await vi.advanceTimersByTimeAsync(0);

    const report = sendMessage.mock.calls
      .map((call) => call[0] as { type?: unknown; explicit?: unknown; watched?: unknown; playing?: unknown })
      .find((message) => message?.type === VIDEO_OWNER_REPORT_MESSAGE);

    expect(report, '必须回答「谁有视频」').toBeDefined();
    expect(report?.explicit, '显式操作（点图标）能接管这个视频').toBe(true);
    expect(report?.watched, '快捷键路径也能接管这个视频').toBe(true);
    expect(report?.playing, '视频正在播').toBe(true);
  });

  it('这个 frame 里没有视频 → 如实说没有', async () => {
    document.body.innerHTML = '';

    lastMessageListener()?.({ type: VIDEO_OWNER_ASK_MESSAGE }, {});
    await vi.advanceTimersByTimeAsync(0);

    const report = sendMessage.mock.calls
      .map((call) => call[0] as { type?: unknown; explicit?: unknown; watched?: unknown })
      .find((message) => message?.type === VIDEO_OWNER_REPORT_MESSAGE);

    expect(report).toBeDefined();
    expect(report?.explicit).toBe(false);
    expect(report?.watched).toBe(false);
  });
});

describe('快捷键在本层没有目标时的解释', () => {
  let runtime: ContentRuntime;
  let store: Map<string, unknown>;
  let sendMessage: Mock<any[]>;

  /** background 对「别的 frame 有没有视频」的回答。 */
  let queryAnswer: unknown = null;

  const setup = async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    store = new Map();
    queryAnswer = null;

    sendMessage = vi.fn((message: { type?: unknown }) => {
      if (message?.type === VIDEO_OWNER_QUERY_MESSAGE) {
        return Promise.resolve(queryAnswer);
      }
      return Promise.resolve(undefined);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: null,
        sendMessage,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        sync: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        local: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    runtime = new ContentRuntime({ isTrustedEvent: () => true });
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(async () => {
    await setup();
  });

  afterEach(() => {
    runtime.stop();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const noticeText = () => document.getElementById('vsc-takeover-notice')?.textContent ?? null;

  it('别的 frame 有视频 → 告诉用户视频在嵌入框里', async () => {
    queryAnswer = { frameId: 3, playing: true };

    // 这一层没有视频 → 按 `=` 只能放行给页面。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);

    expect(noticeText(), '必须解释「为什么没反应」').toContain('嵌入框');
  });

  it('别的 frame 也没有视频 → 不提示（别给无关的话）', async () => {
    queryAnswer = { frameId: null, playing: false };

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);

    expect(noticeText()).toBeNull();
  });

  it('提示要节流：连按同一个键不会反复问 background', async () => {
    queryAnswer = { frameId: 3, playing: true };

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);

    const queries = sendMessage.mock.calls.filter((call) => (
      (call[0] as { type?: unknown })?.type === VIDEO_OWNER_QUERY_MESSAGE
    ));
    expect(queries.length, '一分钟内只问一次').toBe(1);
  });

  it('有视频的层不该问 —— 有事做的时候不要多嘴', async () => {
    const video = createVideo();
    video.id = 'main';
    document.body.appendChild(video);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);

    const queries = sendMessage.mock.calls.filter((call) => (
      (call[0] as { type?: unknown })?.type === VIDEO_OWNER_QUERY_MESSAGE
    ));
    expect(queries.length).toBe(0);
    expect(noticeText()).toBeNull();
  });
});
