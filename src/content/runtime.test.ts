import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentRuntime } from './runtime';
import { GET_STATE_MESSAGE, RESET_SPEED_MESSAGE, SITE_SPEEDS_KEY, STORAGE_KEY } from '../shared/types';

type ChromeStorageStub = {
  runtime: { lastError: unknown };
  storage: {
    local: {
      get: (key: string, callback: (result: Record<string, unknown>) => void) => void;
      set: (obj: Record<string, unknown>, callback?: () => void) => void;
    };
  };
};

const chromeStub = () => chrome as unknown as ChromeStorageStub;

/** 取最近一个 ContentRuntime 注册的 onMessage 监听器（beforeEach 的实例先注册）。 */
const lastMessageListener = () => {
  const calls = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0];
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

  it('restores the remembered site speed when a video starts at 1x', async () => {
    store.set(SITE_SPEEDS_KEY, { localhost: 1.75 });

    const instance = new ContentRuntime();
    instance.stop();
    await instance.start();
    await vi.advanceTimersByTimeAsync(0);

    video.dispatchEvent(new Event('play'));
    expect(video.playbackRate).toBe(1.75);
    instance.stop();
  });

  it('does not override a speed the site already set', async () => {
    store.set(SITE_SPEEDS_KEY, { localhost: 2 });
    const instance = new ContentRuntime();
    await instance.start();
    await vi.advanceTimersByTimeAsync(0);

    video.playbackRate = 1.25;
    video.dispatchEvent(new Event('play'));

    expect(video.playbackRate).toBe(1.25);
    instance.stop();
  });

  it('remembers the current video rate and persists it', async () => {
    video.playbackRate = 1.5;
    video.dispatchEvent(new Event('ratechange'));
    await vi.advanceTimersByTimeAsync(900);

    expect(store.get(SITE_SPEEDS_KEY)).toEqual({ localhost: 1.5 });
  });

  it('answers popup state queries', async () => {
    video.playbackRate = 2;
    let response: unknown = null;
    const sendResponse = (value: unknown) => {
      response = value;
    };

    const listener = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0];
    listener({ type: GET_STATE_MESSAGE }, {}, sendResponse);

    expect(response).toEqual({
      speed: 2,
      playing: false,
      hostname: 'localhost',
      hasVideo: true,
    });
  });

  it('resets the current video speed on request', async () => {
    video.playbackRate = 2.5;
    let response: unknown = null;

    const listener = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0];
    listener({ type: RESET_SPEED_MESSAGE }, {}, (value: unknown) => {
      response = value;
    });

    expect(response).toEqual({ ok: true });
    expect(video.playbackRate).toBe(1);
  });

  it('keeps every site memory when the memory failed to load before a reset', async () => {
    store.set(SITE_SPEEDS_KEY, { 'a.com': 2 });
    // 只让 storage.local.get 失败（设置走 sync），制造"读失败但写可用"的局部故障窗口。
    chromeStub().storage.local.get = (key, callback) => {
      chromeStub().runtime.lastError = { message: 'boom' };
      callback({ [key]: store.get(key) });
      chromeStub().runtime.lastError = null;
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const instance = new ContentRuntime();
    await instance.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(errorSpy).toHaveBeenCalledWith(
      'Video Speed Controller failed to load site speed memory',
      expect.any(Error),
    );

    lastMessageListener()({ type: RESET_SPEED_MESSAGE }, {}, () => {});
    await vi.advanceTimersByTimeAsync(900);

    // 改动前：speeds 恒为空 Map，remember(1) 走 delete 分支并把整张表覆盖写成 {}。
    expect(store.get(SITE_SPEEDS_KEY)).toEqual({ 'a.com': 2 });
    instance.stop();
  });

  it('writes no site memory on reset when the feature is turned off', async () => {
    store.set(STORAGE_KEY, { siteSpeedMemory: false });
    store.set(SITE_SPEEDS_KEY, { 'a.com': 2 });
    const localSet = vi.fn((obj: Record<string, unknown>, callback?: () => void) => {
      Object.entries(obj).forEach(([key, value]) => store.set(key, value));
      callback?.();
    });
    chromeStub().storage.local.set = localSet;

    const instance = new ContentRuntime();
    await instance.start();
    await vi.advanceTimersByTimeAsync(0);

    lastMessageListener()({ type: RESET_SPEED_MESSAGE }, {}, () => {});
    await vi.advanceTimersByTimeAsync(900);

    expect(localSet).not.toHaveBeenCalled();
    expect(store.get(SITE_SPEEDS_KEY)).toEqual({ 'a.com': 2 });
    instance.stop();
  });

  it('ignores rate changes coming from a video the user is not watching', async () => {
    const other = createVideo();
    other.id = 'other-video';
    document.body.appendChild(other);

    // 让 registry 把 video 记成最后交互的视频，稳定成为 getCurrentVideo()。
    video.dispatchEvent(new Event('play'));
    other.playbackRate = 2;
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockClear();

    other.dispatchEvent(new Event('ratechange'));
    await vi.advanceTimersByTimeAsync(900);

    // 改动前：other 的 ratechange 也会上报徽章。
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(store.get(SITE_SPEEDS_KEY)).toBeUndefined();
  });

  it('restores the remembered site speed when play fires before startup finishes', async () => {
    store.set(SITE_SPEEDS_KEY, { localhost: 1.75 });
    const stub = chromeStub();
    const pending: Array<() => void> = [];
    let deferredCalls = 0;
    // 把 storage.local.get 的回调存住不立即调用，制造两段加载都没落地的启动窗口。
    stub.storage.local.get = (key, callback) => {
      deferredCalls += 1;
      pending.push(() => callback({ [key]: store.get(key) }));
    };

    const instance = new ContentRuntime();
    let started = false;
    const startPromise = instance.start().then(() => { started = true; }, () => { started = true; });

    // 窗口内页面就播了：监听器必须已经挂上，否则这次事件被永久漏掉。
    video.dispatchEvent(new Event('play'));
    expect(video.playbackRate).toBe(1);

    for (let attempt = 0; attempt < 20 && !started; attempt += 1) {
      pending.splice(0, pending.length).forEach((flush) => flush());
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(deferredCalls).toBeGreaterThanOrEqual(2);
    await startPromise;
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    // 改动前：监听器此时还没注册，事件被漏掉，速度停在 1。
    expect(video.playbackRate).toBe(1.75);
    instance.stop();
  });
});
