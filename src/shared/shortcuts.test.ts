import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  keyboardEventToShortcut,
  matchesShortcut,
  normalizeShortcut,
  normalizeShortcutSettings,
} from './shortcuts';

describe('normalizeShortcut', () => {
  it('normalizes plain and modified keys', () => {
    expect(normalizeShortcut('=')).toBe('=');
    expect(normalizeShortcut('Shift+=')).toBe('shift+=');
    expect(normalizeShortcut('Meta+-')).toBe('meta+-');
  });

  it('keeps space as a valid main key', () => {
    expect(normalizeShortcut(' ')).toBe(' ');
    expect(normalizeShortcut('Space')).toBe(' ');
    expect(normalizeShortcut('Spacebar')).toBe(' ');
    expect(normalizeShortcut('Ctrl+ ')).toBe('ctrl+ ');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeShortcut('')).toBe('');
  });

  it('round-trips through format and match', () => {
    expect(formatShortcut(' ')).toBe('Space');
    expect(formatShortcut('ctrl+ ')).toBe('Ctrl+Space');

    const event = new KeyboardEvent('keydown', { key: ' ' });
    expect(matchesShortcut(event, ' ')).toBe(true);
    expect(matchesShortcut(event, 'Space')).toBe(true);

    const ctrlEvent = new KeyboardEvent('keydown', { key: ' ', ctrlKey: true });
    expect(matchesShortcut(ctrlEvent, 'ctrl+ ')).toBe(true);
    expect(matchesShortcut(ctrlEvent, ' ')).toBe(false);
  });
});

describe('normalizeShortcutSettings', () => {
  it('fills defaults for missing values', () => {
    expect(normalizeShortcutSettings({})).toEqual({
      increaseSpeed: '=',
      decreaseSpeed: '-',
      resetSpeed: '0',
      fullscreen: 'f',
    });
  });

  it('normalizes a space shortcut set from the options page', () => {
    const settings = normalizeShortcutSettings({
      increaseSpeed: '=',
      decreaseSpeed: '-',
      resetSpeed: ' ',
      fullscreen: 'f',
    });

    expect(settings.resetSpeed).toBe(' ');
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: ' ' }), settings.resetSpeed)).toBe(true);
  });
});

describe('keyboardEventToShortcut', () => {
  it('captures space and modifier combinations', () => {
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: ' ' }))).toBe(' ');
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: ' ', ctrlKey: true }))).toBe('ctrl+ ');
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'k' }))).toBe('k');
    expect(keyboardEventToShortcut(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe('Escape');
  });
});
