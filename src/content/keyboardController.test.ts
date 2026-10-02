import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardController } from './keyboardController';
import { DEFAULT_SHORTCUTS, PersistedSettings, ShortcutSettings } from '../shared/types';

const createVideo = () => {
  const video = document.createElement('video');
  let paused = false;
  Object.defineProperty(video, 'playbackRate', {
    value: 1,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, 'currentTime', {
    value: 12,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, 'duration', {
    value: 100,
    configurable: true,
  });
  Object.defineProperty(video, 'paused', {
    get: () => paused,
    set: (value: boolean) => {
      paused = value;
    },
    configurable: true,
  });
  Object.defineProperty(video, 'play', {
    value: vi.fn(() => {
      paused = false;
      return Promise.resolve();
    }),
    configurable: true,
  });
  Object.defineProperty(video, 'pause', {
    value: vi.fn(() => {
      paused = true;
    }),
    configurable: true,
  });
  return video;
};

const createSettings = (
  shortcuts: Partial<ShortcutSettings> = {},
): PersistedSettings => ({
  shortcuts: { ...DEFAULT_SHORTCUTS, ...shortcuts },
});

const keyEvent = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, ...init });

const keyUpEvent = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keyup', { key, ...init });

describe('KeyboardController', () => {
  let settings: PersistedSettings;
  let video: HTMLVideoElement | null;
  let toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let showSpeedFeedback: ReturnType<typeof vi.fn>;
  let lastToggledVideo: HTMLVideoElement | null | undefined;
  let controller: KeyboardController;

  const createController = (fullscreenActive = false) => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getCurrentVideo: () => video,
      isFullscreenActive: () => fullscreenActive,
      toggleFullscreen,
      exitFullscreen,
      showSpeedFeedback,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    settings = createSettings();
    video = createVideo();
    lastToggledVideo = undefined;
    toggleFullscreen = (target) => {
      lastToggledVideo = target;
      return true;
    };
    exitFullscreen = vi.fn();
    showSpeedFeedback = vi.fn();
    createController();
  });

  it('ignores editable targets', () => {
    const input = document.createElement('input');
    const event = keyEvent('=');
    Object.defineProperty(event, 'target', { value: input });

    expect(controller.handleKeyDown(event)).toBe(false);
  });

  it('steps speed up and down with feedback', () => {
    expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
    expect(video?.playbackRate).toBe(1.1);
    expect(showSpeedFeedback).toHaveBeenLastCalledWith(1.1, video);

    expect(controller.handleKeyDown(keyEvent('-'))).toBe(true);
    expect(video?.playbackRate).toBe(1);
  });

  it('uses updated shortcut mappings immediately', () => {
    settings = createSettings({ increaseSpeed: 'k' });

    expect(controller.handleKeyDown(keyEvent('k'))).toBe(true);
    expect(showSpeedFeedback).toHaveBeenCalledTimes(1);
  });

  it('resets playback speed to 1x', () => {
    if (!video) throw new Error('video missing');

    video.playbackRate = 2.3;
    expect(controller.handleKeyDown(keyEvent('0'))).toBe(true);
    expect(video.playbackRate).toBe(1);
  });

  it('toggles fullscreen with the configured shortcut', () => {
    expect(controller.handleKeyDown(keyEvent('f'))).toBe(true);
    expect(lastToggledVideo).toBe(video);
  });

  it('exits fullscreen on escape without needing a video', () => {
    createController(true);
    video = null;

    expect(controller.handleKeyDown(keyEvent('Escape'))).toBe(true);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('toggles playback with the bound key', () => {
    expect(controller.handleKeyDown(keyEvent(' '))).toBe(true);
    expect(video?.pause).toHaveBeenCalledTimes(1);
    expect(video?.paused).toBe(true);

    expect(controller.handleKeyDown(keyEvent(' '))).toBe(true);
    expect(video?.play).toHaveBeenCalledTimes(1);
    expect(video?.paused).toBe(false);
  });

  it('seeks backward and forward by 5 seconds', () => {
    expect(controller.handleKeyDown(keyEvent('ArrowLeft'))).toBe(true);
    expect(video?.currentTime).toBe(7);

    expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(true);
    expect(video?.currentTime).toBe(12);
  });

  it('clamps seeks to the video bounds', () => {
    if (!video) throw new Error('video missing');

    video.currentTime = 2;
    controller.handleKeyDown(keyEvent('ArrowLeft'));
    expect(video.currentTime).toBe(0);

    video.currentTime = 98;
    controller.handleKeyDown(keyEvent('ArrowRight'));
    expect(video.currentTime).toBe(100);
  });

  it('ignores modifier combinations', () => {
    expect(controller.handleKeyDown(keyEvent(' ', { shiftKey: true }))).toBe(false);
    expect(controller.handleKeyDown(keyEvent('=', { ctrlKey: true }))).toBe(false);
    expect(video?.pause).not.toHaveBeenCalled();
  });

  it('does nothing when the action is unbound', () => {
    settings = createSettings({ togglePlay: '', seekBack: '' });

    expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
    expect(controller.handleKeyDown(keyEvent('ArrowLeft'))).toBe(false);
    expect(video?.pause).not.toHaveBeenCalled();
    expect(video?.currentTime).toBe(12);
  });

  it('does nothing when there is no video on the page', () => {
    video = null;

    expect(controller.handleKeyDown(keyEvent('='))).toBe(false);
    expect(showSpeedFeedback).not.toHaveBeenCalled();
  });

  it('keeps repeating while a speed key is held, and stops on keyup', () => {
    vi.useFakeTimers();
    try {
      controller.start();
      expect(controller.handleKeyDown(keyEvent('='))).toBe(true);

      vi.advanceTimersByTime(1000);
      const callsBefore = showSpeedFeedback.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(1);

      expect(controller.handleKeyUp(keyUpEvent('='))).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(showSpeedFeedback).toHaveBeenCalledTimes(callsBefore);
    } finally {
      controller.stop();
      vi.useRealTimers();
    }
  });

  it('stops the speed repeat when the window loses focus', () => {
    if (!video) throw new Error('video missing');

    vi.useFakeTimers();
    try {
      controller.start();
      expect(controller.handleKeyDown(keyEvent('='))).toBe(true);

      vi.advanceTimersByTime(1000);
      const callsBeforeBlur = showSpeedFeedback.mock.calls.length;
      const rateBeforeBlur = video.playbackRate;
      expect(callsBeforeBlur).toBeGreaterThan(1);

      // 切走窗口后 keyup 永远不会再到达，只能靠 blur 兜底。
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(1000);

      expect(showSpeedFeedback).toHaveBeenCalledTimes(callsBeforeBlur);
      expect(video.playbackRate).toBe(rateBeforeBlur);
    } finally {
      controller.stop();
      vi.useRealTimers();
    }
  });

  it('stops the speed repeat when the page is hidden', () => {
    vi.useFakeTimers();
    try {
      controller.start();
      controller.handleKeyDown(keyEvent('='));
      vi.advanceTimersByTime(1000);
      const callsBefore = showSpeedFeedback.mock.calls.length;

      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(1000);

      expect(showSpeedFeedback).toHaveBeenCalledTimes(callsBefore);
    } finally {
      controller.stop();
      vi.useRealTimers();
    }
  });

  it('ignores synthesized repeat events for speed keys', () => {
    controller.start();
    expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
    const calls = showSpeedFeedback.mock.calls.length;

    // 浏览器在长按时会自己发 repeat=true 的 keydown；重复计数交给我们的定时器，
    // 不能让它再叠加一次。
    expect(controller.handleKeyDown(keyEvent('=', { repeat: true }))).toBe(true);
    expect(showSpeedFeedback).toHaveBeenCalledTimes(calls);
    controller.stop();
  });
});
