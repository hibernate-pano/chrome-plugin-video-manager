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

// jsdom 的 location.hostname 是 [LegacyUnforgeable]，只能在用例内整体替换
// window.location 对象来伪造 hostname；beforeEach 恢复原始描述符。
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
const setHostname = (hostname: string) => {
  Object.defineProperty(window, 'location', {
    value: { hostname },
    configurable: true,
    writable: true,
  });
};

describe('KeyboardController', () => {
  let settings: PersistedSettings;
  let video: HTMLVideoElement | null;
  let toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  let canToggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let showSpeedFeedback: ReturnType<typeof vi.fn>;
  let lastToggledVideo: HTMLVideoElement | null | undefined;
  let controller: KeyboardController;

  const createController = (fullscreenActive = false) => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getCurrentVideo: () => video,
      isFullscreenActive: () => fullscreenActive,
      canToggleFullscreen,
      toggleFullscreen,
      exitFullscreen,
      showSpeedFeedback,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    if (originalLocationDescriptor) {
      Object.defineProperty(window, 'location', originalLocationDescriptor);
    }
    settings = createSettings();
    video = createVideo();
    lastToggledVideo = undefined;
    toggleFullscreen = (target) => {
      lastToggledVideo = target;
      return true;
    };
    canToggleFullscreen = () => true;
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

  it('ignores an input nested in a shadow root whose event target was retargeted', () => {
    // 回归：键盘事件跳 shadow 边界时，event.target 会被重定向为宿主元素，
    // 所以只认 target 会把这个 <input> 误判为非编辑态，用户在里面打字被吞。
    // 真实事件里 composedPath()[0] 才是那个 input。
    const host = document.createElement('div');
    const input = document.createElement('input');
    host.append(input);
    document.body.append(host);

    const event = keyEvent(' ');
    Object.defineProperty(event, 'target', { value: host });
    Object.defineProperty(event, 'composedPath', { value: () => [input, host, document, window] });

    expect(controller.handleKeyDown(event)).toBe(false);
  });

  it('still runs shortcuts when the composed path starts on a range slider', () => {
    // 与上一条镜像：composedPath 优先级提高后，进度条的既有行为不能回退。
    const host = document.createElement('div');
    const slider = document.createElement('input');
    slider.type = 'range';
    host.append(slider);

    const event = keyEvent('ArrowRight');
    Object.defineProperty(event, 'target', { value: host });
    Object.defineProperty(event, 'composedPath', { value: () => [slider, host, document, window] });

    expect(controller.handleKeyDown(event)).toBe(true);
  });

  it('still runs shortcuts when focus is on a range slider (our progress bar)', () => {
    // 回归：点击全屏进度条后焦点落在 <input type="range"> 上；旧逻辑把所有
    // <input> 当编辑态，导致方向键/Esc/f 全部失灵。
    const slider = document.createElement('input');
    slider.type = 'range';
    const target = (key: string) => {
      const e = keyEvent(key);
      Object.defineProperty(e, 'target', { value: slider });
      return e;
    };

    expect(controller.handleKeyDown(target('ArrowRight'))).toBe(true); // 交给播放器跳转，而非滑块 0.1s 微调
    expect(controller.handleKeyDown(target('f'))).toBe(true);           // 仍能切换全屏
    // Escape 仅在「全屏激活」时才被拦截（用于退出全屏）。
    createController(true);
    expect(controller.handleKeyDown(target('Escape'))).toBe(true);      // 仍能退出全屏
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

  it('does not swallow the fullscreen key when the action cannot succeed', () => {
    // 回归：视频在同源 iframe 里时 enter() 必然失败；若仍先吞键再失败，
    // 用户既失去按键又没有任何反馈。canToggleFullscreen 为 false 时必须放行。
    canToggleFullscreen = () => false;
    const toggleSpy = vi.fn(toggleFullscreen);
    toggleFullscreen = toggleSpy;
    createController();

    const event = keyEvent('f');
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    expect(controller.handleKeyDown(event)).toBe(false);
    expect(toggleSpy).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('still swallows and exits fullscreen with f when canEnter is false', () => {
    // 防回归：全屏已激活时按 f 是「退出」，此时 canEnter 必然为 false，
    // 但按键必须仍被吞掉并调 exitFullscreen，否则全屏里按 f 退不出去。
    canToggleFullscreen = () => false;
    createController(true);

    const event = keyEvent('f');
    const preventDefault = vi.spyOn(event, 'preventDefault');

    expect(controller.handleKeyDown(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
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

  it('defers a bare space to the site on YouTube-style players', () => {
    // YouTube 的原生空格处理挂在 keyup 上；我们在 keydown 切换一次、它的
    // keyup 再切换一次 = 一次空格两次切换。所以裸空格必须整体放行。
    setHostname('www.youtube.com');
    createController();

    expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
    expect(video?.pause).not.toHaveBeenCalled();
    expect(video?.play).not.toHaveBeenCalled();
  });

  it('still honors a rebound play/pause key on YouTube-style players', () => {
    // 用户把播放/暂停改绑到别的键时，那个键不受站点特判影响。
    settings = createSettings({ togglePlay: 'p' });
    setHostname('www.youtube.com');
    createController();

    expect(controller.handleKeyDown(keyEvent('p'))).toBe(true);
    expect(video?.pause).toHaveBeenCalledTimes(1);
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
