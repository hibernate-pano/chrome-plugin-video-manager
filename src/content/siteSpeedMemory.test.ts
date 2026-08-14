import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_MEMORY_DISABLED_KEY, SITE_SPEEDS_KEY } from '../shared/types';
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
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const createMemory = async () => {
    const instance = new SiteSpeedMemory();
    await instance.load();
    return instance;
  };

  it('loads existing speeds and disabled sites', async () => {
    store.set(SITE_SPEEDS_KEY, { 'youtube.com': 2, 'bilibili.com': 1.5 });
    store.set(SITE_MEMORY_DISABLED_KEY, { 'youtube.com': true });

    memory = await createMemory();

    expect(memory.isLoaded()).toBe(true);
    expect(memory.getSpeed('youtube.com')).toBe(2);
    expect(memory.getSpeed('bilibili.com')).toBe(1.5);
    expect(memory.getSpeed('unknown.com')).toBeNull();
    expect(memory.isDisabled('youtube.com')).toBe(true);
    expect(memory.isDisabled('bilibili.com')).toBe(false);
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

  it('persists disabled sites immediately', async () => {
    memory = await createMemory();
    memory.setDisabled('example.com', true);
    await vi.advanceTimersByTimeAsync(0);

    expect(memory.isDisabled('example.com')).toBe(true);
    expect(store.get(SITE_MEMORY_DISABLED_KEY)).toEqual({ 'example.com': true });

    memory.setDisabled('example.com', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(memory.isDisabled('example.com')).toBe(false);
    expect(store.get(SITE_MEMORY_DISABLED_KEY)).toEqual({});
  });

  it('clears all remembered speeds', async () => {
    store.set(SITE_SPEEDS_KEY, { 'a.com': 1.5, 'b.com': 2 });
    memory = await createMemory();

    await memory.clearAll();

    expect(memory.getSpeed('a.com')).toBeNull();
    expect(memory.getSpeed('b.com')).toBeNull();
    expect(store.get(SITE_SPEEDS_KEY)).toEqual({});
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
