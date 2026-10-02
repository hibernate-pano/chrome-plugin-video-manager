import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, normalizePersistedSettings, saveSettings } from './settings';
import { DEFAULT_SHORTCUTS } from './types';

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
});
