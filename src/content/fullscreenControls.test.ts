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
  let playbackRate = 1;

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
    get: () => playbackRate,
    set: (value: number) => {
      playbackRate = value;
    },
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

/**
 * 控制条住在 shadow root 里（样式隔离，见 controlsStyles.ts），
 * 所以要透过 shadowRoot 才能拿到内部元素。
 */
const shadowRoot = () =>
  document.getElementById('vsc-controls')?.shadowRoot ?? null;

const $ = <T extends HTMLElement>(role: string) =>
  shadowRoot()?.querySelector<T>(`[data-role="${role}"]`) as T;

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
      expect(shadowRoot()?.querySelector(`[data-role="${role}"]`)).not.toBeNull();
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
    expect(shadowRoot()?.querySelector('.bar')?.classList.contains('bar--visible')).toBe(false);

    clickVideo({ button: 0 });
    expect(shadowRoot()?.querySelector('.bar')?.classList.contains('bar--visible')).toBe(true);
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

  it('unfreezes the thumb when a committed seek never lands', () => {
    mount();
    const progress = $<HTMLInputElement>('progress');
    progress.value = '75';
    progress.dispatchEvent(new Event('input'));
    progress.dispatchEvent(new Event('change'));
    expect(video.currentTime).toBe(75);

    // 播放器始终不派发 seeked：请求的位置在可寻址范围之外（流不连续、直播时移
    // 边界），Chrome 会直接拒绝这次跳转。视频其实还在原位继续播。
    video.currentTime = 30;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.value).toBe('75'); // 钉住期内仍防回弹，这是对的

    vi.advanceTimersByTime(3000);

    // 到点无条件解除钉住：滑块必须跟着真实进度走，而不是永久冻结在 75。
    expect(progress.value).toBe('30');
    expect($('time').textContent).toBe('0:30 / 2:00');
    video.currentTime = 40;
    video.dispatchEvent(new Event('timeupdate'));
    expect(progress.value).toBe('40');
  });

  it('cancels the pending-seek timer once the seek lands', () => {
    const controls = mount();
    const progress = $<HTMLInputElement>('progress');
    progress.value = '75';
    progress.dispatchEvent(new Event('input'));
    progress.dispatchEvent(new Event('change'));

    video.currentTime = 75;
    video.dispatchEvent(new Event('seeked'));

    // seeked 已解除钉住；上限计时器必须一起取消，不能在 3 秒后再动一次滑块。
    video.currentTime = 90;
    video.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(3000);
    expect(progress.value).toBe('90');

    // unmount 也不能留下孤儿计时器（jsdom 会对残留定时器报错）。
    controls.unmount();
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
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
    const bar = () => shadowRoot()?.querySelector('.bar');
    expect(bar()?.classList.contains('bar--visible')).toBe(true);

    vi.advanceTimersByTime(3000);
    expect(bar()?.classList.contains('bar--visible')).toBe(false);

    // jsdom 没有 PointerEvent 构造器；监听器只认事件名，用 MouseEvent 派发即可。
    window.dispatchEvent(new MouseEvent('pointermove'));
    expect(bar()?.classList.contains('bar--visible')).toBe(true);
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

  // --- 倍速档位菜单 ---

  const menu = () => $<HTMLDivElement>('speed-menu');
  const menuItem = (rate: string) =>
    menu().querySelector<HTMLButtonElement>(`[data-rate="${rate}"]`);

  /**
   * 当前拿到焦点的元素。
   *
   * 焦点落在 shadow tree 内部时，document.activeElement 会被重定向成宿主，
   * 想看「到底是哪个按钮」必须问 ShadowRoot.activeElement。
   */
  const focused = () => shadowRoot()?.activeElement ?? document.activeElement;

  const openMenu = () => {
    $('speed').click();
  };

  it('opens the speed menu and applies the picked rate', () => {
    mount();
    const changes: number[] = [];
    document.addEventListener('vsc-speed-change', (event) => {
      changes.push((event as CustomEvent<{ rate: number }>).detail.rate);
    });

    expect(menu().hidden).toBe(true);
    openMenu();
    expect(menu().hidden).toBe(false);
    expect($('speed').getAttribute('aria-expanded')).toBe('true');

    menuItem('1.5')!.click();

    expect(video.playbackRate).toBe(1.5);
    expect(changes).toEqual([1.5]);
    expect(menu().hidden).toBe(true);
    expect($('speed').getAttribute('aria-expanded')).toBe('false');
  });

  it('offers 0.5x — the real lower bound for slow viewing', () => {
    mount();
    openMenu();

    // playback.ts 允许到 0.1x，但 10 倍慢放必然音画不同步。
    // 档位是给鼠标用户的快捷入口，下限取 0.5。
    expect(menuItem('0.5')).not.toBeNull();
    expect(menuItem('1')).not.toBeNull();
    expect(menuItem('4')).not.toBeNull();
  });

  it('marks the current rate and keeps the badge text in sync', () => {
    mount();
    video.playbackRate = 1.5;
    video.dispatchEvent(new Event('ratechange'));

    expect($('speed').textContent).toBe('1.5x');
    expect($('speed').getAttribute('aria-label')).toContain('1.5x');

    openMenu();
    expect(menuItem('1.5')!.getAttribute('aria-current')).toBe('true');
    expect(menuItem('1')!.getAttribute('aria-current')).toBeNull();
  });

  it('prefers the onSpeedChange callback over the DOM event', () => {
    const onSpeedChange = vi.fn();
    const controls = new FullscreenControls(video, { onExit, onSpeedChange });
    controls.mount();

    const changes = vi.fn();
    document.addEventListener('vsc-speed-change', changes);

    openMenu();
    menuItem('2')!.click();

    expect(onSpeedChange).toHaveBeenCalledWith(2);
    // 两条通道是互斥的：都触发的话用户会看到两遍提示、读屏播报两遍。
    expect(changes).not.toHaveBeenCalled();
  });

  it('closes the menu on Escape and hands focus back to the badge', () => {
    mount();
    openMenu();
    expect(document.activeElement).toBe(document.getElementById('vsc-controls'));

    menuItem('1.5')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(menu().hidden).toBe(true);
    // 焦点在 shadow tree 内部时 document.activeElement 会被重定向成宿主。
    expect(document.activeElement).toBe(document.getElementById('vsc-controls'));
  });

  it('closes the menu when the user clicks outside it', () => {
    mount();
    openMenu();

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(menu().hidden).toBe(true);
  });

  it('moves focus between items with the arrow keys', () => {
    mount();
    openMenu();

    const items = Array.from(menu().querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    // 打开时焦点落在当前档位（1x）上。
    const start = items.findIndex((item) => item === focused());
    expect(start).toBeGreaterThanOrEqual(0);

    items[start].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(focused()).toBe(items[start + 1]);
  });

  it('keeps the bar on screen while the menu is open', () => {
    mount();
    openMenu();

    vi.advanceTimersByTime(10_000);

    // 菜单是控制条的一部分：控制条一藏，菜单也跟着没了。
    expect(shadowRoot()?.querySelector('.bar')?.classList.contains('bar--visible')).toBe(true);
  });

  it('keeps the bar on screen while focus is inside it', () => {
    mount();
    $('play').focus();

    vi.advanceTimersByTime(10_000);

    // 焦点还在控制条里却把它藏了，键盘用户盯着屏幕什么也看不到。
    expect(shadowRoot()?.querySelector('.bar')?.classList.contains('bar--visible')).toBe(true);
  });

  it('exposes focusFirst() for keyboard-driven fullscreen entry', () => {
    const controls = mount();
    expect(document.activeElement).not.toBe($('play'));

    controls.focusFirst();

    expect(document.activeElement).toBe(document.getElementById('vsc-controls'));
  });

  // --- 无障碍 ---

  it('labels the bar as a group and keeps the labels in sync with the state', () => {
    mount();

    const bar = shadowRoot()?.querySelector('.bar');
    expect(bar?.getAttribute('role')).toBe('group');
    expect(bar?.getAttribute('aria-label')).toBeTruthy();

    // 播放中：按钮的可访问名是「暂停」。
    expect($('play').getAttribute('aria-label')).toBe('暂停');
    video.pause();
    video.dispatchEvent(new Event('pause'));
    expect($('play').getAttribute('aria-label')).toBe('播放/暂停');

    // 进度用「1:48 / 30:00」这种念得出来的形式，而不是裸数字。
    expect($('progress').getAttribute('aria-valuetext')).toBe('0:30 / 2:00');

    expect($('speed').getAttribute('aria-live')).toBe('polite');
    expect($('speed').getAttribute('aria-haspopup')).toBe('menu');
    expect($('exit').getAttribute('aria-label')).toContain('Esc');
  });

  it('keeps the volume slider on the real volume while muted', () => {
    mount();

    video.volume = 0.65;
    video.muted = true;
    video.dispatchEvent(new Event('volumechange'));

    // 静音只影响喇叭图标；滑块显示的是真实音量。
    // 拉成 0 的话，一取消静音音量会突然跳回满格，看起来像 bug。
    expect($<HTMLInputElement>('volume').value).toBe('0.65');
    expect($('volume').getAttribute('aria-valuetext')).toBe('已静音');
    expect($('mute').getAttribute('aria-label')).toBe('取消静音');

    video.muted = false;
    video.dispatchEvent(new Event('volumechange'));

    expect($<HTMLInputElement>('volume').value).toBe('0.65');
    expect($('volume').getAttribute('aria-valuetext')).toBe('65%');
    expect($('mute').getAttribute('aria-label')).toBe('静音');
  });

  it('does not drag the volume slider to zero when muting', () => {
    mount();

    // 这条是 P1-D 的原始症状：静音后滑块掉到 0，用户以为音量被清空了。
    $('mute').click();
    expect(video.muted).toBe(true);

    // 真实浏览器里 muted 一变就会派发 volumechange，UI 同步挂在这个事件上。
    video.dispatchEvent(new Event('volumechange'));
    expect($<HTMLInputElement>('volume').value).toBe('1');
  });
});
