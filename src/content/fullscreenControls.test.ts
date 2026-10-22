import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenControls, formatTime } from './fullscreenControls';
import { resetExtensionDom } from './testDom';

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

/**
 * 临时装一个 matchMedia。
 *
 * jsdom 没有实现 matchMedia（`window.matchMedia` 是 undefined），
 * 而「降低动效」「窄屏断点」这两件事都要问它。
 * 返回一个还原函数。
 */
const stubMatchMedia = (matches: (query: string) => boolean) => {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches: matches(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });

  return () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: original,
    });
  };
};

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
    resetExtensionDom();
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

  /**
   * 装一个「休息位」（生产环境里是播放器舞台）。
   *
   * ⚠️ tabindex="-1" 不是装饰：jsdom 只让**可聚焦**的元素接住 focus()，
   * 而「可聚焦」的判定之一就是有没有 tabindex 属性。生产环境里舞台也是
   * tabindex="-1"（可被程序聚焦，但不进 Tab 序列）。
   */
  const mountWithRestingTarget = () => {
    const restingTarget = document.createElement('div');
    restingTarget.id = 'vsc-test-player-surface';
    restingTarget.tabIndex = -1;
    document.body.appendChild(restingTarget);
    const controls = new FullscreenControls(video, { onExit, restingTarget });
    controls.mount();
    return { controls, restingTarget };
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
    // 初始 playing -> 显示暂停图标。
    expect($('play').classList.contains('is-playing')).toBe(true);

    $('play').click();
    expect(video.pause).toHaveBeenCalledTimes(1);
    video.dispatchEvent(new Event('pause'));
    expect($('play').classList.contains('is-playing')).toBe(false);
  });

  it('toggles play/pause when the video surface is left-clicked', () => {
    mount();

    // 播放中 -> 单击暂停。
    clickVideo({ button: 0 });
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();

    // 暂停中 -> 单击继续，图标随真实状态走（同步靠 media 事件，不是靠 play() 调用）。
    video.dispatchEvent(new Event('pause'));
    expect($('play').classList.contains('is-playing')).toBe(false);
    clickVideo({ button: 0 });
    expect(video.play).toHaveBeenCalledTimes(1);
    video.dispatchEvent(new Event('play'));
    expect($('play').classList.contains('is-playing')).toBe(true);
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

  /**
   * 视频状态变了 → 控制条必须醒过来。
   *
   * 为什么这条必须是「视频事件」而不是「按键」：
   * 扩展的键盘拦截跑在 window 捕获阶段的第一个（content-loader 在
   * document_start 注册的桥接），拦截成功时调 stopImmediatePropagation() ——
   * 它只挡住**同一节点上后注册**的监听器，于是控制条那个后注册的
   * 「按键唤醒」监听器永远收不到事件。
   *
   * 后果（实测）：全屏里按 `=` 调速，控制条不亮、倍速读数停在旧值 ——
   * 「全屏里键盘调速完全没有反馈」。
   */
  describe('视频状态变化会唤醒控制条', () => {
    const bar = () => shadowRoot()?.querySelector('.bar');

    const hideBar = () => {
      vi.advanceTimersByTime(3000);
      expect(bar()?.classList.contains('bar--visible')).toBe(false);
    };

    it('改倍速 → 控制条醒来，读数跟着更新', () => {
      mount();
      hideBar();

      // jsdom 不会因为改 playbackRate 自己派发 ratechange（浏览器会）。
      video.playbackRate = 1.5;
      video.dispatchEvent(new Event('ratechange'));

      expect(bar()?.classList.contains('bar--visible')).toBe(true);
      expect($('speed').textContent, '读数必须是最新的，不能停在旧值').toBe('1.5x');
    });

    it('播放/暂停 → 控制条醒来', () => {
      mount();
      hideBar();

      video.dispatchEvent(new Event('pause'));

      expect(bar()?.classList.contains('bar--visible')).toBe(true);
    });

    it('快进 → 控制条醒来', () => {
      mount();
      hideBar();

      video.dispatchEvent(new Event('seeked'));

      expect(bar()?.classList.contains('bar--visible')).toBe(true);
    });
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
    //
    // ⚠️ 这是**交不出焦点时的兜底**：没有休息位（焦点无处可去）就不能藏。
    // 生产路径有休息位（播放器舞台），走的是下一条用例。
    expect(shadowRoot()?.querySelector('.bar')?.classList.contains('bar--visible')).toBe(true);
  });

  it('hands the focus to the resting target before the bar collapses', () => {
    const { restingTarget } = mountWithRestingTarget();
    $('play').focus();
    expect(document.activeElement).toBe(document.getElementById('vsc-controls'));

    vi.advanceTimersByTime(10_000);

    // 控制条必须能自动隐藏 —— 键盘进全屏时焦点是**我们**放进去的，
    // 用户并没有选它；控制条因此永远霸占着屏幕（挡住字幕与画面），
    // 而「永远在的退出入口」也就永远不出现。
    expect(
      shadowRoot()?.querySelector('.bar')?.classList.contains('bar--visible'),
      '控制条必须能自动隐藏（焦点交出去之后就该藏）',
    ).toBe(false);
    // 焦点不能凭空消失：它必须落在看得见的地方。
    expect(document.activeElement, '焦点必须被交到休息位（看得见的地方）').toBe(restingTarget);
  });

  it('exposes focusFirst() for keyboard-driven fullscreen entry', () => {
    const controls = mount();
    expect(document.activeElement).not.toBe($('play'));

    controls.focusFirst();

    expect(document.activeElement).toBe(document.getElementById('vsc-controls'));
  });

  it('focusFirst() puts the focus on the player surface, not inside the bar', () => {
    const { controls, restingTarget } = mountWithRestingTarget();

    controls.focusFirst();

    // ⚠️ 焦点停在控制条里会同时坏掉两件事：
    // 1. 「焦点在里面就别藏控制条」那条守卫恒真 → 控制条永远不消失；
    // 2. 扩展的键盘拦截按**事件路径**判定，路径里有 #vsc-controls 就把
    //    空格与方向键让给自己的控件 → 键盘用户的播放/暂停与快进全废。
    expect(document.activeElement, '焦点必须落在控制条宿主之外').toBe(restingTarget);
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

  // ================================================================
  // 本轮修复的回归守卫
  //
  // 每条都对着一个**具体症状**写，症状在改动前都能复现。
  // ================================================================

  it('换播放/静音图标时不重写按钮的 DOM', () => {
    mount();
    const play = $('play');
    const mute = $('mute');
    const playBefore = play.innerHTML;
    const muteBefore = mute.innerHTML;

    // 两个图标一直都在 DOM 里，靠 class 切换显示哪一个。
    expect(play.querySelectorAll('svg')).toHaveLength(2);
    expect(mute.querySelectorAll('svg')).toHaveLength(2);

    // ⚠️ 绝不能用 innerHTML 换图标：实测 Chromium，光标下的元素被替换之后，
    // 浏览器会在**光标不动**的情况下重新派发 mouseover/mouseenter，
    // 控制条的 mouseenter 处理器随即取消待触发的隐藏计时器 ——
    // 而光标没动就没有 pointermove 来重新计时，控制条从此永远不再自动隐藏。
    video.pause();
    video.dispatchEvent(new Event('pause'));
    expect(play.classList.contains('is-playing')).toBe(false);
    expect(play.innerHTML).toBe(playBefore);

    video.play();
    video.dispatchEvent(new Event('play'));
    expect(play.classList.contains('is-playing')).toBe(true);
    expect(play.innerHTML).toBe(playBefore);

    video.muted = true;
    video.dispatchEvent(new Event('volumechange'));
    expect(mute.classList.contains('is-muted')).toBe(true);
    expect(mute.innerHTML).toBe(muteBefore);
  });

  it('指针移入控制条时重新计时，而不是取消隐藏', () => {
    mount();
    const bar = shadowRoot()?.querySelector('.bar');

    // mouseenter 的语义是「重新开始算 3 秒」，不是「保持可见」。
    // 取消计时器的话，光标不动就没有 pointermove 来重新计时，
    // 控制条从此永远不再自动隐藏。
    bar?.dispatchEvent(new MouseEvent('mouseenter'));

    vi.advanceTimersByTime(2999);
    expect(bar?.classList.contains('bar--visible')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(bar?.classList.contains('bar--visible')).toBe(false);
  });

  it('键盘调滑块时焦点不丢（长按方向键才有效）', () => {
    mount();
    const progress = $<HTMLInputElement>('progress');
    progress.focus();
    expect(shadowRoot()?.activeElement).toBe(progress);

    // 键盘操作滑块同样会触发 change，但**不能**因此把焦点甩掉：
    // 焦点一丢，按键重复就断了（实测长按方向键 1.2 秒只前进 0.1 秒），
    // 焦点环也会消失。
    progress.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    progress.dispatchEvent(new Event('change'));

    expect(shadowRoot()?.activeElement).toBe(progress);
  });

  it('指针拖完滑块后仍然放掉焦点（控制条要能重新自动隐藏）', () => {
    mount();
    const progress = $<HTMLInputElement>('progress');
    progress.focus();
    expect(shadowRoot()?.activeElement).toBe(progress);

    progress.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    progress.dispatchEvent(new Event('change'));

    expect(shadowRoot()?.activeElement).not.toBe(progress);
  });

  it('进度条与音量滑块的步长与全局快捷键一致', () => {
    mount();

    // 全局快进是 5 秒（shared/types.ts 的 SEEK_STEP_SECONDS）：
    // 早先进度条的步长是 0.1 秒，同一个产品里两套步长。
    expect($<HTMLInputElement>('progress').getAttribute('step')).toBe('5');
    // 音量：1% 太小，长按方向键几乎看不出变化。
    expect($<HTMLInputElement>('volume').getAttribute('step')).toBe('0.05');
  });

  it('PageUp/PageDown 按固定秒数跳，不是范围的 10%', () => {
    // 两小时的视频：原生 range 的 PageUp 是范围的 10% = 720 秒（12 分钟）。
    Object.defineProperty(video, 'duration', { get: () => 7200, configurable: true });
    mount();
    const progress = $<HTMLInputElement>('progress');
    progress.value = '0';

    progress.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    expect(Number(progress.value)).toBe(30);
    expect(video.currentTime).toBe(30);

    progress.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect(Number(progress.value)).toBe(0);
  });

  it('时间标签拆成「当前时间」与「总时长」两段', () => {
    mount();

    // 合在一起时宽度会随播放进度变化（"0:00" → "59:59" → "1:00:00"），
    // 它就坐在进度条左边 —— 宽度一变，进度条被挤得忽宽忽窄，整个控制条横抖。
    const now = $('time-now');
    const total = $('time-total');
    expect(now.textContent).toBe('0:30');
    expect(total.textContent).toBe('2:00');
    expect($('time').textContent).toBe('0:30 / 2:00');
  });

  it('按字幕的实际位置把它抬到控制条上方，控制条藏了又落回去', () => {
    const controls = mount();

    // jsdom 没有布局引擎：视口高度、控制条高度与字幕几何都得手动给。
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
    const root = shadowRoot()?.querySelector('.bar');
    Object.defineProperty(root, 'offsetHeight', { value: 66, configurable: true });

    // 字幕贴在视口最底边（底边 720，视口高 720）。
    const caption = document.createElement('div');
    document.body.appendChild(caption);
    caption.getBoundingClientRect = () => new DOMRect(0, 664, 100, 56);

    controls.setSubtitleLayers([
      {
        element: caption,
        kind: 'subtitle',
        rect: new DOMRect(0, 664, 100, 56),
        ink: null,
        originalParent: null,
        originalNextSibling: null,
        originalZIndex: '',
      },
    ]);

    // 控制条顶边 = 720 - 66 = 654；字幕底边 720 → 要抬 720 - 654 + 4(间隙) = 70。
    // 早先这里是「控制条高度 × 0.7 = 46px」写死的：字幕离画面底边远近不同，
    // 固定抬 46px 对 bottom: 4% 的字幕是浪费，对 bottom: 0 的字幕却**不够**
    // （实测字幕底边 674、控制条顶边 654，重叠 20px，最后一行被压暗）。
    expect(caption.style.transform).toContain('translateY(-70px)');

    // 控制条藏了，字幕回到它原本的位置。
    vi.advanceTimersByTime(3000);
    expect(caption.style.transform).toBe('');
  });

  // ================================================================
  // 收起态的独立退出钮（永远在的退出入口）
  //
  // 症状：控制条 3 秒 idle 后整个消失，屏幕上只剩一个铺满的 <video>。
  // 用户既不知道「这是扩展的全屏」，也不知道怎么退 —— 退出按钮
  // 在控制条里，条一藏就没了。
  //
  // 形态：控制条收起时，它塌缩成一枚独立的小退出钮（同一个 shadow root、
  // 同一个位置）。控制条一回来，退出钮让位。
  // ================================================================

  describe('收起态的独立退出钮', () => {
    const bar = () => shadowRoot()?.querySelector('.bar');
    const collapsed = () => $<HTMLButtonElement>('exit-collapsed');

    const barIsVisible = () => bar()?.classList.contains('bar--visible') === true;

    it('控制条可见时退出钮不可见，也不在焦点序列里', () => {
      mount();

      expect(barIsVisible()).toBe(true);
      expect(collapsed(), '收起态的退出钮必须始终存在于 shadow root 里').not.toBeNull();
      expect(collapsed().style.visibility).toBe('hidden');
      // 不可见还不够：还得不在 Tab 序列里（键盘用户不能 Tab 到一个看不见的东西）。
      expect(collapsed().tabIndex).toBe(-1);
      expect(collapsed().style.pointerEvents).toBe('none');
    });

    it('idle 收起控制条后退出钮顶上来，点它能退出全屏', () => {
      mount();

      vi.advanceTimersByTime(3000);

      expect(barIsVisible(), '控制条应该已经收起').toBe(false);
      expect(collapsed().style.visibility, '控制条收起后，退出入口必须还在').toBe('visible');
      expect(collapsed().style.pointerEvents).toBe('auto');
      // 可见就要能被 Tab 到：键盘用户要能不靠鼠标退出全屏。
      expect(collapsed().tabIndex).toBe(0);

      collapsed().click();
      expect(onExit, '点收起态的退出钮必须退出全屏（与控制条里的退出按钮同一个动作）')
        .toHaveBeenCalledTimes(1);
    });

    it('Tab 不会唤醒控制条 —— 唤醒会把收起态的退出钮踢出焦点序列', () => {
      mount();
      vi.advanceTimersByTime(3000);
      expect(barIsVisible(), '控制条应该已经收起').toBe(false);
      expect(collapsed().style.visibility).toBe('visible');

      // 真实的按键：Tab。
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

      // ⚠️ 唤醒处理跑在 **window 的捕获阶段**，而浏览器计算「下一个 Tab
      // 停靠点」发生在 keydown 的**默认动作**阶段 —— 也就是唤醒之后。
      // 唤醒会把收起态的退出钮移出焦点序列（tabIndex = -1），
      // 于是浏览器算停靠点时那枚「永远在的退出入口」已经不在序列里了：
      // 它**永远 Tab 不到**，键盘用户只能靠 Esc。
      //
      // 所以 Tab（导航键）不许唤醒控制条。
      expect(barIsVisible(), 'Tab 是导航键，不该唤醒控制条').toBe(false);
      expect(collapsed().tabIndex, '收起态的退出钮必须留在焦点序列里').toBe(0);
      expect(collapsed().style.visibility, '收起态的退出钮必须还在').toBe('visible');
    });

    it('其他按键仍然会把控制条唤回来', () => {
      mount();
      vi.advanceTimersByTime(3000);
      expect(barIsVisible(), '控制条应该已经收起').toBe(false);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

      // 纯键盘用户没有鼠标可动 —— 按键必须能把控制条唤回来。
      expect(barIsVisible(), '任何按键都要能把控制条唤回来').toBe(true);
    });

    it('焦点落到退出钮上 → 控制条回来、退出钮让位，焦点交接给控制条里的退出按钮', () => {
      mount();
      vi.advanceTimersByTime(3000);
      expect(collapsed().style.visibility).toBe('visible');

      collapsed().focus();

      expect(barIsVisible(), '焦点进来时完整控制条必须回来').toBe(true);
      expect(collapsed().style.visibility, '两个退出钮不能同时在').toBe('hidden');
      expect(collapsed().tabIndex).toBe(-1);
      // 焦点不能凭空消失（掉到 body 上 → 键盘用户丢失位置，Tab 要从头再来）。
      // 它落在控制条里**同一个动作**的按钮上。
      expect(shadowRoot()?.activeElement).toBe($('exit'));
    });

    it('退出钮有可访问名，且与控制条里的退出按钮一致', () => {
      mount();

      const label = collapsed().getAttribute('aria-label');
      expect(label, '退出钮必须有 aria-label').toBeTruthy();
      expect(label).toBe($('exit').getAttribute('aria-label'));
      expect(label).toContain('Esc');
    });

    it('退出钮不大于控制条里的退出按钮，并落在右下角同一个位置', () => {
      mount();

      const size = Number.parseFloat(collapsed().style.width);
      expect(size).toBeLessThanOrEqual(34); // .button 是 34×34
      expect(size).toBeGreaterThanOrEqual(24); // WCAG 2.5.8 的触控目标下限
      // 与控制条里的退出按钮同一个角：右下角往里 18px / 12px
      // （= 控制条 padding `20px 18px 12px` 的右/下）。
      expect(collapsed().style.position).toBe('fixed');
      expect(collapsed().style.right).toBe('18px');
      expect(collapsed().style.bottom).toBe('12px');
    });

    it('鼠标一动控制条就回来，退出钮让位', () => {
      mount();
      vi.advanceTimersByTime(3000);
      expect(collapsed().style.visibility).toBe('visible');

      window.dispatchEvent(new MouseEvent('pointermove'));

      expect(barIsVisible()).toBe(true);
      expect(collapsed().style.visibility).toBe('hidden');
    });

    it('收起态的退出钮与控制条不在同一棵子树里（控制条藏了它不能跟着藏）', () => {
      mount();

      const root = shadowRoot()?.querySelector('.bar');
      expect(bar()?.contains(collapsed()), '退出钮必须在 .bar 之外').toBe(false);
      expect(shadowRoot()?.contains(collapsed()), '退出钮必须与控制条同在 shadow root 里').toBe(true);
      expect(root).not.toBeNull();
    });

    it('系统要求降低动效时，退出钮不做过渡', () => {
      const restore = stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
      try {
        mount();

        vi.advanceTimersByTime(3000);

        expect(collapsed().style.transition, '降低动效时不该有任何过渡').toBe('none');
      } finally {
        restore();
      }
    });

    it('窄屏时退出钮跟着换位置（与控制条的窄屏内边距一致）', () => {
      const restore = stubMatchMedia((query) => query.includes('max-width'));
      try {
        mount();

        // 窄屏（≤380px）时控制条的 padding 是 `12px 10px 8px`，
        // 退出钮必须落在同一个角，否则窄屏下它跟退出按钮错开一截。
        expect(collapsed().style.right).toBe('10px');
        expect(collapsed().style.bottom).toBe('8px');
      } finally {
        restore();
      }
    });
  });
});
