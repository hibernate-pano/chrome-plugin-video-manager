import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentRuntime } from './runtime';
import { STORAGE_KEY, TOGGLE_FULLSCREEN_MESSAGE } from '../shared/types';

/** 取最近一个 ContentRuntime 注册的 onMessage 监听器（beforeEach 的实例先注册）。 */
const lastMessageListener = () => {
  const calls = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0];
};

/**
 * 取出 storage.onChanged 上注册的监听器。
 *
 * 这一层以前是 `vi.fn()`：注册了回调但从不派发，于是「设置热更新」这条链路的
 * 唯一接线点（runtime.ts 里 subscribeToSettings 的那个listener）从未被任何测试
 * 执行过。实测把runtime.ts 的 `this.settings = settings` 改成 `void settings`
 * 之后，185 个单测和 18 个 E2E 全部照样通过 —— 断链完全不会被发现。
 *
 * 改成真实派发：让回调能被调用，才能对它做行为断言。
 */
const storageChangeListener = () => {
  const calls = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0] as (
    changes: Record<string, chrome.storage.StorageChange>,
    namespace: string,
  ) => void;
};

const createVideo = () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'playbackRate', {
    value: 1,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, 'paused', {
    value: true,
    writable: true,
    configurable: true,
  });
  return video;
};

describe('ContentRuntime integration', () => {
  let runtime: ContentRuntime;
  let store: Map<string, unknown>;
  let video: HTMLVideoElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    store = new Map();
    video = createVideo();
    video.id = 'test-video';
    document.body.appendChild(video);

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: null,
        sendMessage: vi.fn(),
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
    runtime = new ContentRuntime();
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
  });

  afterEach(() => {
    runtime.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('enters page fullscreen on request from the toolbar icon', async () => {
    let response: unknown = null;

    lastMessageListener()(
      { type: TOGGLE_FULLSCREEN_MESSAGE },
      {},
      (value: unknown) => {
        response = value;
      },
    );

    expect(response).toEqual({ ok: true, active: true });
    expect(document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active')).toBe(true);
    expect(document.getElementById('vsc-controls')).not.toBeNull();

    // 再点一次退出，控制条要一并拆除。
    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, (value: unknown) => {
      response = value;
    });
    expect(response).toEqual({ ok: true, active: false });
    expect(document.getElementById('vsc-controls')).toBeNull();
  });

  it('ignores unrelated messages', () => {
    const listener = lastMessageListener();
    const sendResponse = vi.fn();

    listener({ type: 'something-else' }, {}, sendResponse);
    listener(null, {}, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('shows the speed toast both outside and inside fullscreen', async () => {
    // 键盘控制器挂在 window 捕获阶段（无桥接时的回落路径），所以派发在 window 上。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
    // 松开按键停掉长按连续定时器，否则 toast 会被持续刷新、一直可见。
    window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
    await vi.advanceTimersByTimeAsync(0);
    const toast = () => document.getElementById('vsc-speed-toast');
    expect(toast()?.classList.contains('vsc-visible')).toBe(true);

    // 进入全屏后仍然提示：控制条 3 秒无操作就隐藏，键盘调速时它不在屏幕上，
    // 不能指望它承担反馈。
    lastMessageListener()({ type: TOGGLE_FULLSCREEN_MESSAGE }, {}, () => {});

    // 让上一个 toast 自然消失，再在全屏内调速，断言它重新可见。
    await vi.advanceTimersByTimeAsync(1000);
    expect(toast()?.classList.contains('vsc-visible')).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: '=' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(toast()?.classList.contains('vsc-visible')).toBe(true);
    expect(document.getElementById('vsc-controls')).not.toBeNull();
  });

  it('applies shortcut changes to the already-open page without a reload', async () => {
    // 设置页副标题承诺「保存后已打开的页面会立即生效」，这是唯一的
    // 「设置 -> 运行时」闭环。此前它没有任何测试：onChanged 的回调从未被派发，
    // 于是把 runtime.ts 里 `this.settings = settings` 断掉，185 单测 + 18 E2E
    // 依然全绿 —— 用户改键后必须刷新页面才生效，而 UI 显示的是「已保存」。
    //
    // 复用 beforeEach 建好的 runtime：另起实例会让桥接监听器互相干扰，
    // 断言就测不到真实的那条接线。
    const press = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'ctrlKey', { value: false });
      Object.defineProperty(event, 'altKey', { value: false });
      Object.defineProperty(event, 'shiftKey', { value: false });
      Object.defineProperty(event, 'metaKey', { value: false });
      window.dispatchEvent(event);
      return event;
    };

    // 改前：默认 f 是网页全屏，q 不属于任何动作。
    expect(press('q').defaultPrevented, '改键前 q 不该被扩展处理').toBe(false);
    expect(press('f').defaultPrevented, '改键前 f 才是网页全屏的绑定键').toBe(true);

    // 模拟设置页保存：写入新的绑定并派发 storage 变更。
    // 这一步以前从未在任何测试里发生过。
    store.set(STORAGE_KEY, {
      shortcuts: {
        increaseSpeed: '=',
        decreaseSpeed: '-',
        resetSpeed: '0',
        togglePlay: ' ',
        seekBack: 'ArrowLeft',
        seekForward: 'ArrowRight',
        fullscreen: 'q',
      },
    });
    storageChangeListener()(
      { [STORAGE_KEY]: { newValue: store.get(STORAGE_KEY) } },
      'sync',
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(press('q').defaultPrevented, '改键后 q 必须立刻接管网页全屏').toBe(true);
    expect(press('f').defaultPrevented, '改键后 f 已解绑，不该再被扩展吞掉').toBe(false);
  });
});
