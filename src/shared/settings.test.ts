import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadSettings,
  markFirstRunHintShown,
  normalizePersistedSettings,
  purgeLegacySiteSpeeds,
  saveSettings,
  subscribeToSettings,
  wasFirstRunHintShown,
} from './settings';
import {
  DEFAULT_SHORTCUTS,
  FIRST_RUN_HINT_KEY,
  LEGACY_SITE_SPEEDS_KEY,
  LEGACY_SHORTCUTS_KEY,
  STORAGE_KEY,
} from './types';

/**
 * 有真实行为的 fake sync：记录 set/remove 的调用次数，而不是空 mock——
 * 写放大 bug 只有看得到写调用才能测出来。
 */
const installFakeSync = () => {
  const store = new Map<string, unknown>();
  const setCalls: Array<Record<string, unknown>> = [];
  const removeCalls: string[] = [];
  const listeners: Array<
    (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => void
  > = [];

  vi.stubGlobal('chrome', {
    runtime: { lastError: null },
    storage: {
      sync: {
        get: (key: string, callback: (result: Record<string, unknown>) => void) => {
          callback(store.has(key) ? { [key]: store.get(key) } : {});
        },
        set: (obj: Record<string, unknown>, callback?: () => void) => {
          setCalls.push(obj);
          Object.entries(obj).forEach(([key, value]) => store.set(key, value));
          callback?.();
        },
        remove: (key: string, callback?: () => void) => {
          removeCalls.push(key);
          store.delete(key);
          callback?.();
        },
      },
      onChanged: {
        addListener: (
          listener: (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => void,
        ) => {
          listeners.push(listener);
        },
        removeListener: (
          listener: (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => void,
        ) => {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
      },
    },
  });

  return { store, setCalls, removeCalls, listeners };
};

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizePersistedSettings', () => {
  it('falls back to every default when nothing is stored', () => {
    expect(normalizePersistedSettings(undefined)).toEqual({
      shortcuts: DEFAULT_SHORTCUTS,
    });
  });

  it('maps legacy v4 shortcut keys into the current schema', () => {
    const settings = normalizePersistedSettings(undefined, {
      increase: 'k',
      decrease: 'j',
      reset: 'r',
      'toggle-fullscreen': 'g',
      mute: 'm',
    });

    expect(settings.shortcuts).toEqual({
      ...DEFAULT_SHORTCUTS,
      increaseSpeed: 'k',
      decreaseSpeed: 'j',
      resetSpeed: 'r',
      fullscreen: 'g',
    });
  });

  it('keeps user shortcuts for legacy keys that are absent', () => {
    const settings = normalizePersistedSettings(
      { shortcuts: { increaseSpeed: 'ArrowUp', resetSpeed: 'r' } },
      { increase: 'k' },
    );

    expect(settings.shortcuts.increaseSpeed).toBe('k');
    expect(settings.shortcuts.resetSpeed).toBe('r');
  });

  it('keeps user shortcuts when legacy data maps to no known key', () => {
    const settings = normalizePersistedSettings(
      { shortcuts: { increaseSpeed: 'ArrowUp' } },
      { mute: 'm' },
    );

    expect(settings.shortcuts.increaseSpeed).toBe('ArrowUp');
  });

  it('normalizes modifier casing and the space key', () => {
    const settings = normalizePersistedSettings({
      shortcuts: {
        increaseSpeed: 'Shift+=',
        decreaseSpeed: 'Meta+-',
        togglePlay: 'Space',
        seekBack: 'ArrowLeft',
      },
    });

    expect(settings.shortcuts).toEqual({
      ...DEFAULT_SHORTCUTS,
      increaseSpeed: 'shift+=',
      decreaseSpeed: 'meta+-',
      togglePlay: ' ',
      seekBack: 'ArrowLeft',
    });
  });

  it('drops a dirty binding whose main key is a modifier', () => {
    const settings = normalizePersistedSettings({
      shortcuts: { increaseSpeed: 'shift+Shift' },
    });

    expect(settings.shortcuts.increaseSpeed).toBe(DEFAULT_SHORTCUTS.increaseSpeed);
  });

  it('turns the legacy "space toggles play" opt-out into an unbound action', () => {
    const settings = normalizePersistedSettings({ spaceTogglePlay: false });

    expect(settings.shortcuts.togglePlay).toBe('');
  });

  it('keeps the default space binding when the legacy opt-out was off', () => {
    const settings = normalizePersistedSettings({ spaceTogglePlay: true });

    expect(settings.shortcuts.togglePlay).toBe(' ');
  });

  it('never overrides an explicit play/pause binding with the legacy flag', () => {
    const settings = normalizePersistedSettings({
      shortcuts: { togglePlay: 'p' },
      spaceTogglePlay: false,
    });

    expect(settings.shortcuts.togglePlay).toBe('p');
  });

  it('rejects when the storage read fails', async () => {
    vi.stubGlobal('chrome', {
      runtime: { lastError: { message: 'read failed' } },
      storage: {
        sync: {
          get: vi.fn((_: string, callback: (result: Record<string, unknown>) => void) => callback({})),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    });

    await expect(loadSettings()).rejects.toThrow('read failed');
  });

  it('rejects when the storage write fails', async () => {
    const chromeMock = {
      runtime: { lastError: null as { message: string } | null },
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn((_: Record<string, unknown>, callback: () => void) => {
            chromeMock.runtime.lastError = { message: 'write failed' };
            callback();
            chromeMock.runtime.lastError = null;
          }),
          remove: vi.fn((_: string, callback: () => void) => callback()),
        },
      },
    };

    vi.stubGlobal('chrome', chromeMock);

    await expect(saveSettings({ shortcuts: DEFAULT_SHORTCUTS })).rejects.toThrow('write failed');
  });

  it('does not rewrite storage when the stored value is already normalized', async () => {
    const { store, setCalls } = installFakeSync();

    // 首次：空存储需要播种。
    await loadSettings();
    expect(setCalls).toHaveLength(1);
    expect(store.get(STORAGE_KEY)).toEqual({ shortcuts: DEFAULT_SHORTCUTS });

    // 第二次：内容脚本每次启动都会 loadSettings，已规范化的值不应再触发写。
    await loadSettings();
    expect(setCalls).toHaveLength(1);
  });

  it('still migrates and cleans up the legacy shortcut key exactly once', async () => {
    const { store, setCalls, removeCalls } = installFakeSync();
    store.set(LEGACY_SHORTCUTS_KEY, { increase: 'k' });

    const settings = await loadSettings();

    expect(settings.shortcuts.increaseSpeed).toBe('k');
    expect(setCalls).toHaveLength(1);
    expect(removeCalls).toEqual([LEGACY_SHORTCUTS_KEY]);
    expect(store.has(LEGACY_SHORTCUTS_KEY)).toBe(false);
  });

  it('feeds changes to subscribers without writing back to storage', async () => {
    const { setCalls, removeCalls, listeners } = installFakeSync();
    const received: unknown[] = [];

    const unsubscribe = subscribeToSettings((settings) => received.push(settings));
    expect(listeners).toHaveLength(1);

    // 模拟别处写入触发的 onChanged。回调只应只读重算，绝不能再写盘。
    listeners[0]({ [STORAGE_KEY]: { newValue: { shortcuts: DEFAULT_SHORTCUTS } } }, 'sync');
    await flushMicrotasks();

    expect(received).toEqual([{ shortcuts: DEFAULT_SHORTCUTS }]);
    expect(setCalls).toHaveLength(0);
    expect(removeCalls).toHaveLength(0);

    unsubscribe();
    expect(listeners).toHaveLength(0);
  });
});

/**
 * 首次使用引导的状态存在 storage.local（设备级），而不是 sync。
 * 这里的 fake 只实现 local，用来证明这两个函数确实落在 local 上。
 */
const installFakeLocal = () => {
  const store = new Map<string, unknown>();
  const writes: Array<Record<string, unknown>> = [];
  const removals: string[] = [];

  vi.stubGlobal('chrome', {
    runtime: { lastError: null },
    storage: {
      local: {
        get: (key: string, callback: (result: Record<string, unknown>) => void) => {
          callback(store.has(key) ? { [key]: store.get(key) } : {});
        },
        set: (obj: Record<string, unknown>, callback?: () => void) => {
          writes.push(obj);
          Object.entries(obj).forEach(([key, value]) => store.set(key, value));
          callback?.();
        },
        remove: (key: string, callback?: () => void) => {
          removals.push(key);
          store.delete(key);
          callback?.();
        },
      },
    },
  });

  return { store, writes, removals };
};

describe('first-run hint flag', () => {
  it('reports "not shown yet" on a fresh install', async () => {
    installFakeLocal();

    await expect(wasFirstRunHintShown()).resolves.toBe(false);
  });

  it('round-trips through storage.local', async () => {
    const { store, writes } = installFakeLocal();

    await markFirstRunHintShown();

    await expect(wasFirstRunHintShown()).resolves.toBe(true);
    expect(store.get(FIRST_RUN_HINT_KEY)).toBe(true);
    // 只写这一个键：内容脚本的状态不该顺手碰别的键。
    expect(writes).toEqual([{ [FIRST_RUN_HINT_KEY]: true }]);
  });

  it('only treats a literal true as shown', async () => {
    const { store } = installFakeLocal();
    // 存成字符串 "true" 之类的脏数据不该被当成「已经提示过」，
    // 否则一次异常写入会让引导永久消失。
    store.set(FIRST_RUN_HINT_KEY, 'true');

    await expect(wasFirstRunHintShown()).resolves.toBe(false);
  });
});

describe('legacy site speed memory purge', () => {
  it('deletes the abandoned per-site speed table from storage.local', async () => {
    const { store, removals } = installFakeLocal();
    // 6.0.7 删掉了站点速度记忆，但老用户机器上这份数据还在：
    // 它记录了访问过哪些站点并带着速度偏好，不该继续留存。
    store.set(LEGACY_SITE_SPEEDS_KEY, { 'youtube.com': 2, 'example.com': 1.75 });

    await purgeLegacySiteSpeeds();

    expect(store.has(LEGACY_SITE_SPEEDS_KEY)).toBe(false);
    // 只删这一个键：别顺手清掉引导状态或快捷键。
    expect(removals).toEqual([LEGACY_SITE_SPEEDS_KEY]);
  });

  it('is a no-op on a fresh install that never had the key', async () => {
    const { store, removals } = installFakeLocal();

    await purgeLegacySiteSpeeds();

    expect(removals).toEqual([LEGACY_SITE_SPEEDS_KEY]);
    expect(store.has(LEGACY_SITE_SPEEDS_KEY)).toBe(false);
  });
});
