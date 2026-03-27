import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardHandler } from './keyboardHandler';
import { activeMediaSession } from './runtime';

describe('KeyboardHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores editable targets', () => {
    const handler = new KeyboardHandler();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const getCurrentMedia = vi.spyOn(activeMediaSession, 'getCurrentMedia').mockReturnValue(document.createElement('video'));
    const event = new KeyboardEvent('keydown', { key: '=' });
    Object.defineProperty(event, 'target', { value: input });

    expect(handler.handleKeyDown(event)).toBe(false);
    expect(getCurrentMedia).not.toHaveBeenCalled();
  });

  it('routes fullscreen through a single action path', () => {
    const handler = new KeyboardHandler();
    vi.spyOn(activeMediaSession, 'getCurrentMedia').mockReturnValue(document.createElement('video'));
    const toggleLightbox = vi.spyOn(activeMediaSession, 'toggleLightbox').mockImplementation(() => {});
    const event = new KeyboardEvent('keydown', { key: 'f' });

    expect(handler.handleKeyDown(event)).toBe(true);
    expect(toggleLightbox).toHaveBeenCalledTimes(1);
  });
});
