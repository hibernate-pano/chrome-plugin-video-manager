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
