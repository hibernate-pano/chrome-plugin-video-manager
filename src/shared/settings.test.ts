import { describe, expect, it } from 'vitest';
import { normalizePersistedSettings } from './settings';

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
});
