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
  let seeking = false;

  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
    configurable: true,
  });
  Object.defineProperty(video, 'seeking', {
    get: () => seeking,
    set: (value: boolean) => {
      seeking = value;
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

  const mountWithSurface = (ownsVideoSurface: () => boolean) => {
    const controls = new FullscreenControls(video, { onExit, ownsVideoSurface });
    controls.mount();
    return controls;
  };

  const clickVideo = (init: MouseEventInit = {}) => {
    video.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
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

  it('toggles play/pause when the video surface is left-clicked', () => {
    mount();

    // 播放中 -> 单击暂停。
    clickVideo({ button: 0 });
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();

    // 暂停中 -> 单击继续，图标随真实状态走（同步靠 media 事件，不是靠 play() 调用）。
    video.dispatchEvent(new Event('pause'));
    expect($('play').innerHTML).toContain('M8 5.5v13');
    clickVideo({ button: 0 });
    expect(video.play).toHaveBeenCalledTimes(1);
    video.dispatchEvent(new Event('play'));
    expect($('play').innerHTML).toContain('M7 5h3.5');
  });

  it('wakes the control bar when the video surface is clicked', () => {
    vi.useFakeTimers();
    mount();

    // 先让控制条自动隐藏。
    vi.advanceTimersByTime(3000);
    expect($('play').closest('#vsc-controls')?.classList.contains('vsc-ctl--visible')).toBe(false);

    clickVideo({ button: 0 });
    expect(document.getElementById('vsc-controls')?.classList.contains('vsc-ctl--visible')).toBe(true);
  });

  it('does not toggle when the site still owns the video surface (css-cover)', () => {
    mountWithSurface(() => false);

    clickVideo({ button: 0 });

    // css-cover 模式下视频仍留在站点 DOM 里，站点自己的点击监听器照常工作；
    // 我们再切一次就是双重切换（点一下等于没点）。
    expect(video.pause).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it('ignores non-left clicks and clicks the site already handled', () => {
    mount();

    clickVideo({ button: 2 });
    clickVideo({ button: 1 });
    expect(video.pause).not.toHaveBeenCalled();

    // 站点在捕获阶段已经处理并 preventDefault：让位，不重复切换。
    const handled = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    handled.preventDefault();
    video.dispatchEvent(handled);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('stops handling video clicks after unmount', () => {
    const controls = mount();
    controls.unmount();

    clickVideo({ button: 0 });
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('scrubs live on input (no seek) and commits exactly once on change', () => {
    mount();
    const progress = $<HTMLInputElement>('progress');
    // 拖动预览：input 只移动滑块并更新时间标签，绝不 seek（避免流媒体反复缓冲）。
    progress.value = '75';
    progress.dispatchEvent(new Event('input'));
    expect(video.currentTime).toBe(30); // input 不 seek，currentTime 不变
    expect(progress.style.getPropertyValue('--vsc-progress')).toBe('62.5%'); // 75/120
    expect($('time').textContent).toBe('1:15 / 2:00');
    // 松手/点定：change 提交一次跳转。
    progress.dispatchEvent(new Event('change'));
    expect(video.currentTime).toBe(75);
  });

  it('keeps the scrubbed thumb steady while a committed seek is still pending', () => {
    mount();
    const progress = $<HTMLInputElement>('progress');
    progress.value = '75';
    progress.dispatchEvent(new Event('input'));
    progress.dispatchEvent(new Event('change'));
    expect(video.currentTime).toBe(75);
    // 跳转已提交但尚未落地：真实播放器会把 currentTime 暂时报回旧值。
    // 模拟这一瞬间——一次 timeupdate 不得把滑块拉回旧位置（防回弹）。
    video.currentTime = 0;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.value).toBe('75');
    // 跳转落地：seeked 清除 pendingSeek，滑块回到真实位置。
    video.dispatchEvent(new Event('seeked'));
    expect(progress.value).toBe('0');
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
