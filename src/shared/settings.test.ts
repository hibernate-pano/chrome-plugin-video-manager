import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_RUN_HINT_COOLDOWN_KEY,
  FIRST_RUN_HINT_COOLDOWN_MS,
  FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY,
  loadSettings,
  markFirstRunHintShown,
  normalizePersistedSettings,
  purgeLegacySiteSpeeds,
  recordFirstRunHintFailedAttempt,
  saveSettings,
  subscribeToFirstRunHintState,
  subscribeToSettings,
  wasFirstRunHintShown,
  type FirstRunHintStateChange,
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

  it('读失败时不产生未捕获的 promise 拒绝', async () => {
    const { listeners } = installFakeSync();
    const received: unknown[] = [];

    // 存储读失败：chrome.runtime.lastError 非空时 getValue 会 reject。
    (
      globalThis as unknown as { chrome: { runtime: { lastError: unknown } } }
    ).chrome.runtime.lastError = { message: 'storage unavailable' };

    // Node 在微任务队列排空后才把「没人接的拒绝」报成 unhandledRejection。
    // 这里自己挂一个监听器，才能把「有没有产生未捕获异常」变成可断言的事实，
    // 而不是靠「测试文件有没有红」这种间接信号。
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      subscribeToSettings((settings) => received.push(settings));
      listeners[0]({ [STORAGE_KEY]: { newValue: { shortcuts: DEFAULT_SHORTCUTS } } }, 'sync');
      await flushMicrotasks();
      // 再等一轮宏任务，给 Node 报出未处理拒绝的机会。
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(
      rejections,
      '存储读失败不该变成一条 "Uncaught (in promise) Error" —— 那是一次无关紧要的故障',
    ).toEqual([]);
    // 读不到就当这次变更没发生（与 purgeLegacySiteSpeeds 的「失败无所谓」同一套约定）。
    expect(received).toEqual([]);
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

/**
 * 引导状态变化的通道（storage.local）。
 *
 * 背景：「重新显示使用引导」在设置页只做了一件事 —— 清 storage。
 * 而内容脚本把「本会话已展示」记在**内存**里，从不复位；
 * 又因为引导状态在 local，而 `subscribeToSettings` 只听 sync，
 * 没有任何一条通道把「用户点了重置」这件事告诉内容脚本。
 * 于是按钮点下去什么都不会发生（除非手动刷新页面，
 * 而界面从头到尾没说这一点）。
 *
 * 这条通道就是那条缺失的线：内容脚本订阅它，收到「已展示标记被删了」
 * 就把内存里的会话状态复位，下一次 reveal() 走完整套流程。
 */
/**
 * 冷却期必须**有上限**，而且上限不能长到「等于永久沉默」。
 */
describe('首次引导的冷却期', () => {
  it('冷却是一天，不是七天', () => {
    // ⚠️ 原来是 7 天：引导是全键盘界面下**唯一**的可见入口，
    // 冷他 7 天等于「这个扩展对我没用」被写进了产品里。
    expect(FIRST_RUN_HINT_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('连续失败到上限之后，冷却的截止时间在一天之内', async () => {
    const { store, writes } = installFakeLocal();

    await recordFirstRunHintFailedAttempt();
    await recordFirstRunHintFailedAttempt();

    // 还没到上限（3 次）之前不进冷却。
    expect(store.get(FIRST_RUN_HINT_COOLDOWN_KEY)).toBeUndefined();
    expect(writes).toContainEqual({ [FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY]: 2 });

    // 第三次失败：进冷却。
    await recordFirstRunHintFailedAttempt();
    expect(writes).toContainEqual({ [FIRST_RUN_HINT_FAILED_ATTEMPTS_KEY]: 3 });

    const until = store.get(FIRST_RUN_HINT_COOLDOWN_KEY) as number;
    expect(typeof until).toBe('number');
    expect(until - Date.now()).toBeLessThanOrEqual(FIRST_RUN_HINT_COOLDOWN_MS);
    expect(until - Date.now()).toBeGreaterThan(FIRST_RUN_HINT_COOLDOWN_MS - 60_000);
  });
});

describe('subscribeToFirstRunHintState', () => {
  const installFakeStorage = () => {
    const listeners: Array<
      (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => void
    > = [];

    vi.stubGlobal('chrome', {
      runtime: { lastError: null },
      storage: {
        local: {
          get: (_key: string, callback: (result: Record<string, unknown>) => void) => callback({}),
          set: (_obj: Record<string, unknown>, callback?: () => void) => callback?.(),
          remove: (_key: string, callback?: () => void) => callback?.(),
        },
        sync: {
          get: (_key: string, callback: (result: Record<string, unknown>) => void) => callback({}),
          set: (_obj: Record<string, unknown>, callback?: () => void) => callback?.(),
          remove: (_key: string, callback?: () => void) => callback?.(),
        },
        onChanged: {
          addListener: (
            listener: (
              changes: Record<string, chrome.storage.StorageChange>,
              namespace: string,
            ) => void,
          ) => {
            listeners.push(listener);
          },
          removeListener: (
            listener: (
              changes: Record<string, chrome.storage.StorageChange>,
              namespace: string,
            ) => void,
          ) => {
            const index = listeners.indexOf(listener);
            if (index >= 0) {
              listeners.splice(index, 1);
            }
          },
        },
      },
    });

    return { listeners };
  };

  it('「已展示」标记被删掉时通知订阅者（设置页的重置按钮走的就是这条路）', () => {
    const { listeners } = installFakeStorage();
    const received: FirstRunHintStateChange[] = [];

    subscribeToFirstRunHintState((change) => received.push(change));
    listeners[0]({ [FIRST_RUN_HINT_KEY]: { oldValue: true } }, 'local');

    // 变异打穿点：若把 newValue !== undefined 也当成「重置」，
    // 那么「用户读过了引导」会被误判成「请再来一次」——
    // 引导会在同一次会话里反复弹。
    expect(received).toEqual([{ shownCleared: true, cooldownCleared: false }]);
  });

  it('sync 命名空间的变更不算数（引导状态在 local，不在 sync）', () => {
    const { listeners } = installFakeStorage();
    const received: FirstRunHintStateChange[] = [];

    subscribeToFirstRunHintState((change) => received.push(change));
    listeners[0]({ [FIRST_RUN_HINT_KEY]: { oldValue: true } }, 'sync');

    // 变异打穿点：若把 namespace 判断去掉，这条就会收到通知，
    // 于是「快捷键变了」会被当成「引导重置了」。
    expect(received).toEqual([]);
  });

  it('把标记写成 true 不算「重置」（那是「用户读过了」）', () => {
    const { listeners } = installFakeStorage();
    const received: FirstRunHintStateChange[] = [];

    subscribeToFirstRunHintState((change) => received.push(change));
    listeners[0]({ [FIRST_RUN_HINT_KEY]: { oldValue: undefined, newValue: true } }, 'local');

    expect(received).toEqual([{ shownCleared: false, cooldownCleared: false }]);
  });

  it('冷却时间戳被删掉时也会通知', () => {
    const { listeners } = installFakeStorage();
    const received: FirstRunHintStateChange[] = [];

    subscribeToFirstRunHintState((change) => received.push(change));
    listeners[0]({ [FIRST_RUN_HINT_COOLDOWN_KEY]: { oldValue: 123 } }, 'local');

    expect(received).toEqual([{ shownCleared: false, cooldownCleared: true }]);
  });

  it('退订之后不再收到通知', () => {
    const { listeners } = installFakeStorage();
    const received: FirstRunHintStateChange[] = [];

    const unsubscribe = subscribeToFirstRunHintState((change) => received.push(change));
    expect(listeners, '订阅时应该挂上一个监听器').toHaveLength(1);

    unsubscribe();

    // 退订必须真的把监听器摘掉 ——
    // 内容脚本 destroy() 时会调它，摘不掉就等于每次开关页面都多一个僵尸监听器。
    expect(listeners, '退订必须真的把监听器摘掉').toHaveLength(0);
    expect(received).toEqual([]);
  });

  it('没有 chrome.storage.onChanged 时返回一个空函数，不抛异常', () => {
    // 有些测试环境（以及极老的 Chrome）没有 onChanged：
    // 订阅必须安静地什么都不做，而不是把整个内容脚本炸掉。
    vi.stubGlobal('chrome', {
      runtime: { lastError: null },
      storage: { local: { get: () => {}, set: () => {}, remove: () => {} } },
    });

    const unsubscribe = subscribeToFirstRunHintState(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});
