import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardController } from './keyboardController';
import { ShortcutSettings } from '../shared/types';

const createVideo = () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'playbackRate', {
    value: 1,
    writable: true,
    configurable: true,
  });
  return video;
};

describe('KeyboardController', () => {
  let shortcuts: ShortcutSettings;
  let video: HTMLVideoElement | null;
  let toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let showSpeedHud: ReturnType<typeof vi.fn>;
  let lastToggledVideo: HTMLVideoElement | null | undefined;
  let controller: KeyboardController;

  beforeEach(() => {
    vi.restoreAllMocks();
    shortcuts = {
      increaseSpeed: '=',
      decreaseSpeed: '-',
      resetSpeed: '0',
      fullscreen: 'f',
    };
    video = createVideo();
    lastToggledVideo = undefined;
    toggleFullscreen = (target) => {
      lastToggledVideo = target;
      return true;
    };
    exitFullscreen = vi.fn();
    showSpeedHud = vi.fn();

    controller = new KeyboardController({
      getShortcuts: () => shortcuts,
      getCurrentVideo: () => video,
      isFullscreenActive: () => false,
      toggleFullscreen,
      exitFullscreen,
      showSpeedHud,
    });
  });

  it('ignores editable targets', () => {
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: '=' });
    Object.defineProperty(event, 'target', { value: input });

    expect(controller.handleKeyDown(event)).toBe(false);
  });

  it('uses updated shortcut mappings immediately', () => {
    shortcuts = { ...shortcuts, increaseSpeed: 'k' };
    const event = new KeyboardEvent('keydown', { key: 'k' });

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(showSpeedHud).toHaveBeenCalledTimes(1);
  });

  it('resets playback speed without using hidden double-press behavior', () => {
    if (!video) {
      throw new Error('video missing');
    }

    video.playbackRate = 2.3;
    const event = new KeyboardEvent('keydown', { key: '0' });

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video.playbackRate).toBe(1);
  });

  it('toggles fullscreen with the configured shortcut', () => {
    const event = new KeyboardEvent('keydown', { key: 'f' });

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(lastToggledVideo).toBe(video);
  });

  it('exits fullscreen on escape', () => {
    controller = new KeyboardController({
      getShortcuts: () => shortcuts,
      getCurrentVideo: () => video,
      isFullscreenActive: () => true,
      toggleFullscreen,
      exitFullscreen,
      showSpeedHud,
    });

    const event = new KeyboardEvent('keydown', { key: 'Escape' });

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
