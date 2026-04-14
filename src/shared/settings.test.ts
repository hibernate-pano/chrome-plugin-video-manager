import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, normalizePersistedSettings, saveSettings } from './settings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizePersistedSettings', () => {
  it('maps legacy shortcut keys into the v5 schema', () => {
    const settings = normalizePersistedSettings(undefined, {
      increase: 'k',
      decrease: 'j',
      reset: 'r',
      'toggle-fullscreen': 'g',
      mute: 'm',
    });

    expect(settings.shortcuts).toEqual({
      increaseSpeed: 'k',
      decreaseSpeed: 'j',
      resetSpeed: 'r',
      fullscreen: 'g',
    });
  });

  it('normalizes nested v5 settings', () => {
    const settings = normalizePersistedSettings({
      shortcuts: {
        increaseSpeed: 'Shift+=',
        decreaseSpeed: 'Meta+-',
        resetSpeed: 'Space',
        fullscreen: 'f',
      },
    });

    expect(settings.shortcuts).toEqual({
      increaseSpeed: 'shift+=',
      decreaseSpeed: 'meta+-',
      resetSpeed: ' ',
      fullscreen: 'f',
    });
  });

  it('rejects when chrome storage read fails', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: { message: 'read failed' },
      },
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

  it('rejects when chrome storage write fails', async () => {
    const chromeMock = {
      runtime: {
        lastError: null as { message: string } | null,
      },
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

    await expect(saveSettings({
      shortcuts: {
        increaseSpeed: '=',
        decreaseSpeed: '-',
        resetSpeed: '0',
        fullscreen: 'f',
      },
    })).rejects.toThrow('write failed');
  });
});
