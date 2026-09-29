import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeMaxSpeed, normalizePersistedSettings, normalizePresetSpeeds, loadSettings, saveSettings } from './settings';
import { DEFAULT_MAX_SPEED, DEFAULT_PRESET_SPEEDS } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizePresetSpeeds', () => {
  it('returns defaults for missing or empty values', () => {
    expect(normalizePresetSpeeds(undefined)).toEqual(DEFAULT_PRESET_SPEEDS);
    expect(normalizePresetSpeeds('nope')).toEqual(DEFAULT_PRESET_SPEEDS);
    expect(normalizePresetSpeeds([])).toEqual(DEFAULT_PRESET_SPEEDS);
  });

  it('drops non-numeric items and clamps the rest', () => {
    expect(normalizePresetSpeeds([1.5, 'x', 0.1, 99, 1.234])).toEqual([1.5, 0.25, 8, 1.23]);
  });
});

describe('normalizeMaxSpeed', () => {
  it('returns default for missing or invalid values', () => {
    expect(normalizeMaxSpeed(undefined)).toBe(DEFAULT_MAX_SPEED);
    expect(normalizeMaxSpeed('fast')).toBe(DEFAULT_MAX_SPEED);
  });

  it('clamps to the configurable range', () => {
    expect(normalizeMaxSpeed(0.5)).toBe(1.5);
    expect(normalizeMaxSpeed(99)).toBe(16);
    expect(normalizeMaxSpeed(2.5)).toBe(2.5);
  });
});

describe('normalizePersistedSettings', () => {
  it('maps legacy shortcut keys into the v5 schema with new defaults', () => {
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
    expect(settings.presetSpeeds).toEqual(DEFAULT_PRESET_SPEEDS);
    expect(settings.spaceTogglePlay).toBe(true);
    expect(settings.maxSpeed).toBe(DEFAULT_MAX_SPEED);
    expect(settings.siteSpeedMemory).toBe(true);
  });

  it('keeps user v5 shortcuts for legacy keys that are absent', () => {
    const settings = normalizePersistedSettings({
      shortcuts: {
        increaseSpeed: 'ArrowUp',
        decreaseSpeed: 'ArrowDown',
        resetSpeed: 'r',
        fullscreen: 'g',
      },
    }, { increase: 'k' });

    expect(settings.shortcuts).toEqual({
      increaseSpeed: 'k',
      decreaseSpeed: 'ArrowDown',
      resetSpeed: 'r',
      fullscreen: 'g',
    });
  });

  it('keeps user v5 shortcuts when legacy data maps to no known key', () => {
    const settings = normalizePersistedSettings({
      shortcuts: {
        increaseSpeed: 'ArrowUp',
        decreaseSpeed: 'ArrowDown',
        resetSpeed: 'r',
        fullscreen: 'g',
      },
    }, { mute: 'm' });

    expect(settings.shortcuts).toEqual({
      increaseSpeed: 'ArrowUp',
      decreaseSpeed: 'ArrowDown',
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

  it('keeps preset speeds, space toggle and new fields when present', () => {
    const settings = normalizePersistedSettings({
      shortcuts: {},
      presetSpeeds: [1.2, 1.6],
      spaceTogglePlay: false,
      maxSpeed: 2.5,
      siteSpeedMemory: false,
    });

    expect(settings.presetSpeeds).toEqual([1.2, 1.6]);
    expect(settings.spaceTogglePlay).toBe(false);
    expect(settings.maxSpeed).toBe(2.5);
    expect(settings.siteSpeedMemory).toBe(false);
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
      presetSpeeds: DEFAULT_PRESET_SPEEDS,
      spaceTogglePlay: true,
      maxSpeed: 4,
      siteSpeedMemory: true,
    })).rejects.toThrow('write failed');
  });
});
