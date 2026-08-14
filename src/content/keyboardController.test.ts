import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardController } from './keyboardController';
import { DEFAULT_PRESET_SPEEDS, PersistedSettings } from '../shared/types';

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

const createSettings = (overrides: Partial<PersistedSettings> = {}): PersistedSettings => ({
  shortcuts: {
    increaseSpeed: '=',
    decreaseSpeed: '-',
    resetSpeed: '0',
    fullscreen: 'f',
  },
  presetSpeeds: [...DEFAULT_PRESET_SPEEDS],
  spaceTogglePlay: true,
  maxSpeed: 4,
  siteSpeedMemory: true,
  ...overrides,
});

const keyEvent = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, ...init });

describe('KeyboardController', () => {
  let settings: PersistedSettings;
  let video: HTMLVideoElement | null;
  let toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let showSpeedHud: ReturnType<typeof vi.fn>;
  let showPlaybackState: ReturnType<typeof vi.fn>;
  let lastToggledVideo: HTMLVideoElement | null | undefined;
  let controller: KeyboardController;

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
    showSpeedHud = vi.fn();
    showPlaybackState = vi.fn();

    controller = new KeyboardController({
      getSettings: () => settings,
      getCurrentVideo: () => video,
      isFullscreenActive: () => false,
      toggleFullscreen,
      exitFullscreen,
      showSpeedHud,
      showPlaybackState,
    });
  });

  it('ignores editable targets', () => {
    const input = document.createElement('input');
    const event = keyEvent('=');
    Object.defineProperty(event, 'target', { value: input });

    expect(controller.handleKeyDown(event)).toBe(false);
  });

  it('uses updated shortcut mappings immediately', () => {
    settings = createSettings({ shortcuts: { ...settings.shortcuts, increaseSpeed: 'k' } });
    const event = keyEvent('k');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(showSpeedHud).toHaveBeenCalledTimes(1);
  });

  it('resets playback speed without using hidden double-press behavior', () => {
    if (!video) {
      throw new Error('video missing');
    }

    video.playbackRate = 2.3;
    const event = keyEvent('0');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video.playbackRate).toBe(1);
  });

  it('toggles fullscreen with the configured shortcut', () => {
    const event = keyEvent('f');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(lastToggledVideo).toBe(video);
  });

  it('exits fullscreen on escape', () => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getCurrentVideo: () => video,
      isFullscreenActive: () => true,
      toggleFullscreen,
      exitFullscreen,
      showSpeedHud,
      showPlaybackState,
    });

    const event = keyEvent('Escape');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('seeks backward and forward with arrow keys in fullscreen', () => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getCurrentVideo: () => video,
      isFullscreenActive: () => true,
      toggleFullscreen,
      exitFullscreen,
      showSpeedHud,
      showPlaybackState,
    });

    const backwardEvent = keyEvent('ArrowLeft');
    const forwardEvent = keyEvent('ArrowRight');

    expect(controller.handleKeyDown(backwardEvent)).toBe(true);
    expect(video?.currentTime).toBe(7);
    expect(controller.handleKeyDown(forwardEvent)).toBe(true);
    expect(video?.currentTime).toBe(12);
  });

  it('toggles playback with space in fullscreen', () => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getCurrentVideo: () => video,
      isFullscreenActive: () => true,
      toggleFullscreen,
      exitFullscreen,
      showSpeedHud,
      showPlaybackState,
    });

    const pauseEvent = keyEvent(' ');
    const playEvent = keyEvent(' ');

    expect(controller.handleKeyDown(pauseEvent)).toBe(true);
    expect(video?.pause).toHaveBeenCalledTimes(1);
    expect(video?.paused).toBe(true);
    expect(showPlaybackState).toHaveBeenLastCalledWith(false, video);

    expect(controller.handleKeyDown(playEvent)).toBe(true);
    expect(video?.play).toHaveBeenCalledTimes(1);
    expect(video?.paused).toBe(false);
    expect(showPlaybackState).toHaveBeenLastCalledWith(true, video);
  });

  it('toggles playback with space outside fullscreen when enabled', () => {
    const pauseEvent = keyEvent(' ');

    expect(controller.handleKeyDown(pauseEvent)).toBe(true);
    expect(video?.pause).toHaveBeenCalledTimes(1);
    expect(video?.paused).toBe(true);
    expect(showPlaybackState).toHaveBeenCalledWith(false, video);
  });

  it('ignores space outside fullscreen when disabled', () => {
    settings = createSettings({ spaceTogglePlay: false });

    const event = keyEvent(' ');

    expect(controller.handleKeyDown(event)).toBe(false);
    expect(video?.pause).not.toHaveBeenCalled();
  });

  it('ignores repeated space keydowns', () => {
    const event = keyEvent(' ', { repeat: true });

    expect(controller.handleKeyDown(event)).toBe(false);
    expect(video?.pause).not.toHaveBeenCalled();
  });

  it('applies a preset speed with the matching digit key', () => {
    const event = keyEvent('2');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video?.playbackRate).toBe(1.5);
    expect(showSpeedHud).toHaveBeenCalledWith(1.5, video);
  });

  it('does nothing for digits without a configured preset', () => {
    const event = keyEvent('9');

    expect(controller.handleKeyDown(event)).toBe(false);
    expect(showSpeedHud).not.toHaveBeenCalled();
  });

  it('does not treat modified digit keys as presets', () => {
    const event = keyEvent('2', { ctrlKey: true });

    expect(controller.handleKeyDown(event)).toBe(false);
    expect(video?.playbackRate).toBe(1);
  });

  it('applies presets in fullscreen mode too', () => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getCurrentVideo: () => video,
      isFullscreenActive: () => true,
      toggleFullscreen,
      exitFullscreen,
      showSpeedHud,
      showPlaybackState,
    });

    const event = keyEvent('4');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video?.playbackRate).toBe(2);
  });

  it('gives a custom Space shortcut priority over global play/pause', () => {
    if (!video) {
      throw new Error('video missing');
    }

    settings = createSettings({ shortcuts: { ...settings.shortcuts, resetSpeed: 'Space' } });

    const event = keyEvent(' ');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video?.playbackRate).toBe(1);
    expect(video?.pause).not.toHaveBeenCalled();
    expect(showPlaybackState).not.toHaveBeenCalled();
  });

  it('clamps stepped speed at the configured maxSpeed', () => {
    if (!video) {
      throw new Error('video missing');
    }

    settings = createSettings({ maxSpeed: 2 });
    video.playbackRate = 1.9;
    const event = keyEvent('=');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video.playbackRate).toBe(2);

    const again = keyEvent('=');
    expect(controller.handleKeyDown(again)).toBe(true);
    expect(video.playbackRate).toBe(2);
  });

  it('clamps preset speeds at the configured maxSpeed', () => {
    if (!video) {
      throw new Error('video missing');
    }

    settings = createSettings({ maxSpeed: 2 });
    video.playbackRate = 1;

    const event = keyEvent('4'); // preset 2.0 == max, fine
    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video.playbackRate).toBe(2);

    settings = createSettings({ maxSpeed: 1.5, presetSpeeds: [1.25, 1.5, 1.75, 2] });
    const event2 = keyEvent('3'); // preset 1.75 > max 1.5
    expect(controller.handleKeyDown(event2)).toBe(true);
    expect(video.playbackRate).toBe(1.5);
  });

  it('gives custom shortcuts priority over digit presets', () => {
    if (!video) {
      throw new Error('video missing');
    }

    settings = createSettings({ shortcuts: { ...settings.shortcuts, resetSpeed: '2' } });
    video.playbackRate = 2.5;

    const event = keyEvent('2');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(video.playbackRate).toBe(1);
    expect(showSpeedHud).toHaveBeenCalledWith(1, video);
  });
});
