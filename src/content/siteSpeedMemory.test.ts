import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_SPEEDS_KEY } from '../shared/types';
import { SiteSpeedMemory } from './siteSpeedMemory';

describe('SiteSpeedMemory', () => {
  let memory: SiteSpeedMemory;
  let store: Map<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new Map();
    vi.stubGlobal('chrome', {
      runtime: { lastError: null },
      storage: {
        local: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => {
            callback({ [key]: store.get(key) });
          },
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
      },
    });
  });

  afterEach(() => {
    memory?.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const createMemory = async () => {
    const instance = new SiteSpeedMemory();
    await instance.load();
    return instance;
  };

  it('loads existing speeds and reports unknown hosts as null', async () => {
    store.set(SITE_SPEEDS_KEY, { 'youtube.com': 2, 'bilibili.com': 1.5 });

    memory = await createMemory();

    expect(memory.isLoaded()).toBe(true);
    expect(memory.getSpeed('youtube.com')).toBe(2);
    expect(memory.getSpeed('bilibili.com')).toBe(1.5);
    expect(memory.getSpeed('unknown.com')).toBeNull();
  });

  it('does not report speeds before loading finishes', () => {
    memory = new SiteSpeedMemory();
    expect(memory.isLoaded()).toBe(false);
    expect(memory.getSpeed('youtube.com')).toBeNull();
  });

  it('remembers a speed and persists it after the debounce', async () => {
    memory = await createMemory();
    memory.remember('example.com', 1.75);

    expect(memory.getSpeed('example.com')).toBe(1.75);
    expect(store.get(SITE_SPEEDS_KEY)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(900);
    expect(store.get(SITE_SPEEDS_KEY)).toEqual({ 'example.com': 1.75 });
  });

  it('forgets a site when reset to 1x', async () => {
    store.set(SITE_SPEEDS_KEY, { 'example.com': 1.5 });
    memory = await createMemory();

    memory.remember('example.com', 1);
    await vi.advanceTimersByTimeAsync(900);

    expect(memory.getSpeed('example.com')).toBeNull();
    expect(store.get(SITE_SPEEDS_KEY)).toEqual({});
  });

  it('ignores non-finite speeds', async () => {
    memory = await createMemory();
    memory.remember('example.com', Number.NaN);
    await vi.advanceTimersByTimeAsync(900);

    expect(memory.getSpeed('example.com')).toBeNull();
    expect(store.get(SITE_SPEEDS_KEY)).toBeUndefined();
  });

  it('persists pending changes on pagehide so a refresh cannot drop the last speed', async () => {
    memory = await createMemory();
    memory.remember('example.com', 1.5);

    // 还没到 800ms debounce：此刻绝不能已经写盘，否则测不出 pagehide 的作用。
    expect(store.get(SITE_SPEEDS_KEY)).toBeUndefined();

    // 刷新/关标签时浏览器派发 pagehide，必须立即落盘而不是继续等 debounce。
    window.dispatchEvent(new Event('pagehide'));

    expect(store.get(SITE_SPEEDS_KEY)).toEqual({ 'example.com': 1.5 });
  });

  it('drops the pagehide listener on destroy so a discarded instance never writes again', async () => {
    memory = await createMemory();
    memory.remember('example.com', 1.75);
    memory.destroy();

    // destroy 应先落盘，再摘掉监听器。
    expect(store.get(SITE_SPEEDS_KEY)).toEqual({ 'example.com': 1.75 });

    store.delete(SITE_SPEEDS_KEY);
    window.dispatchEvent(new Event('pagehide'));

    // 监听器已移除：销毁后的实例不再响应 pagehide。
    expect(store.get(SITE_SPEEDS_KEY)).toBeUndefined();
  });

  it('is inert without chrome storage', async () => {
    vi.unstubAllGlobals();
    memory = new SiteSpeedMemory();
    await memory.load();

    expect(memory.isLoaded()).toBe(true);
    memory.remember('example.com', 1.5);
    expect(memory.getSpeed('example.com')).toBe(1.5);
    await vi.advanceTimersByTimeAsync(900);
    expect(memory.getSpeed('example.com')).toBe(1.5);
  });
});
