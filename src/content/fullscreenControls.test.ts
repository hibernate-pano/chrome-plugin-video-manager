import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenControls, formatTime } from './fullscreenControls';

interface MockVideo extends HTMLVideoElement {
  __currentTime: number;
}

const createMockVideo = () => {
  const video = document.createElement('video') as MockVideo;
  let currentTime = 30;
  let paused = false;
  let volume = 1;
  let muted = false;

  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
    configurable: true,
  });
  Object.defineProperty(video, 'duration', {
    get: () => 120,
    configurable: true,
  });
  Object.defineProperty(video, 'paused', {
    get: () => paused,
    configurable: true,
  });
  Object.defineProperty(video, 'playbackRate', {
    get: () => 1,
    configurable: true,
  });
  Object.defineProperty(video, 'volume', {
    get: () => volume,
    set: (value: number) => {
      volume = value;
    },
    configurable: true,
  });
  Object.defineProperty(video, 'muted', {
    get: () => muted,
    set: (value: boolean) => {
      muted = value;
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

const $ = <T extends HTMLElement>(role: string) =>
  document.querySelector<T>(`#vsc-controls [data-role="${role}"]`)!;

describe('formatTime', () => {
  it('formats mm:ss and h:mm:ss and guards invalid input', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(Number.NaN)).toBe('--:--');
    expect(formatTime(-1)).toBe('--:--');
  });
});

describe('FullscreenControls', () => {
  let video: MockVideo;
  let onExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    video = createMockVideo();
    onExit = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mount = () => {
    const controls = new FullscreenControls(video, { onExit });
    controls.mount();
    return controls;
  };

  it('renders the full control set and shows progress + speed', () => {
    mount();

    ['play', 'mute', 'exit', 'progress', 'volume', 'time', 'speed'].forEach((role) => {
      expect(document.querySelector(`#vsc-controls [data-role="${role}"]`)).not.toBeNull();
    });

    expect($('time').textContent).toBe('0:30 / 2:00');
    expect($('speed').textContent).toBe('1x');
    expect($('progress')).toHaveProperty('disabled', false);
  });

  it('toggles play/pause through the button and reflects video events', () => {
    mount();
    // 初始 playing -> 图标是暂停。
    expect($('play').innerHTML).toContain('M7 5h3.5');

    $('play').click();
    expect(video.pause).toHaveBeenCalledTimes(1);
    video.dispatchEvent(new Event('pause'));
    expect($('play').innerHTML).toContain('M8 5.5v13');
  });

  it('seeks the video when the progress bar is dragged', () => {
    mount();
    const progress = $<HTMLInputElement>('progress');
    progress.value = '75';
    progress.dispatchEvent(new Event('input'));

    expect(video.currentTime).toBe(75);
  });

  it('changes volume and unmutes when the volume slider moves up', () => {
    mount();
    // createMockVideo 已给 muted 配了 setter，直接赋值即可。
    video.muted = true;
    const volume = $<HTMLInputElement>('volume');
    volume.value = '0.5';
    volume.dispatchEvent(new Event('input'));

    expect(video.volume).toBe(0.5);
    expect(video.muted).toBe(false);
  });

  it('toggles mute through the mute button', () => {
    mount();
    $('mute').click();
    expect(video.muted).toBe(true);
  });

  it('calls onExit when the exit button is clicked', () => {
    mount();
    $('exit').click();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('hides itself after idle and reappears on pointer movement', () => {
    mount();
    const root = document.getElementById('vsc-controls')!;
    expect(root.classList.contains('vsc-ctl--visible')).toBe(true);

    vi.advanceTimersByTime(3000);
    expect(root.classList.contains('vsc-ctl--visible')).toBe(false);

    // jsdom 没有 PointerEvent 构造器；监听器只认事件名，用 MouseEvent 派发即可。
    window.dispatchEvent(new MouseEvent('pointermove'));
    expect(root.classList.contains('vsc-ctl--visible')).toBe(true);
  });

  it('disables the progress bar for a live stream without a duration', () => {
    Object.defineProperty(video, 'duration', { get: () => Number.NaN, configurable: true });
    mount();

    const progress = $<HTMLInputElement>('progress');
    expect(progress.disabled).toBe(true);
    expect($('time').textContent).toBe('0:30 / --:--');
  });

  it('removes the bar and its video listeners on unmount', () => {
    const controls = mount();
    controls.unmount();

    expect(document.getElementById('vsc-controls')).toBeNull();
    // 卸载后再触发视频事件不应报错（监听器已摘除）。
    expect(() => video.dispatchEvent(new Event('timeupdate'))).not.toThrow();
  });
});
