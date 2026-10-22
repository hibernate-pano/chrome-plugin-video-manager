import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardController } from './keyboardController';
import { DEFAULT_SHORTCUTS, PersistedSettings, ShortcutSettings } from '../shared/types';

/**
 * 造一个「可 seek 区间」，模拟浏览器里已经加载完元数据的点播视频。
 *
 * ⚠️ jsdom **不实现** HTMLMediaElement 的 seekable/readyState：
 * `video.seekable` 恒是长度 0 的空壳，`video.readyState` 恒是 0（HAVE_NOTHING）。
 * 不显式摆出来的话，「这个流能不能 seek」那条判据在单测里永远是
 * 「不能」——于是「快进到底该不该被吞掉」这条契约根本测不到。
 */
const seekableRange = (start: number, end: number) => ({
  length: 1,
  start: (index: number) => (index === 0 ? start : 0),
  end: (index: number) => (index === 0 ? end : 0),
});

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
  // HAVE_METADATA = 1：元数据已到，duration 与 seekable 都可信。
  Object.defineProperty(video, 'readyState', {
    value: 1,
    configurable: true,
  });
  Object.defineProperty(video, 'seekable', {
    value: seekableRange(0, 100),
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

/**
 * 造一个键盘事件。
 *
 * 6.0.9 起键盘控制器只处理「可信」事件（页面能 dispatchEvent 伪造按键来
 * 操纵用户的视频）。但 jsdom 造不出可信事件：`isTrusted` 在 jsdom 里是
 * **实例上的 non-configurable 属性**（实测 `Object.defineProperty` 抛
 * TypeError，连原型上的 getter 都覆盖不了）。
 *
 * 所以信任判定被做成**可注入**的依赖（`isTrustedEvent`）：
 * 真实运行时读 `event.isTrusted`，单测里由我们控制。
 * 这样「可信 → 接管」与「不可信 → 完全放行」两个方向都能测到。
 */
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
  let notifyTakeoverUnavailable: ReturnType<typeof vi.fn>;
  let lastToggledVideo: HTMLVideoElement | null | undefined;
  let controller: KeyboardController;

  const createController = (fullscreenActive = false) => {
    controller = new KeyboardController({
      getSettings: () => settings,
      // 默认「用户正在看的视频」就是那个 video；测「没有明确目标」那条时置 null。
      getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
      isFullscreenActive: () => fullscreenActive,
      canToggleFullscreen,
      toggleFullscreen,
      exitFullscreen,
      showSpeedFeedback,
      notifyTakeoverUnavailable,
      // 默认所有事件都算「可信」——除专门的不可信用例外，其余用例关注的
      // 是快捷键匹配本身。真实运行时读的是 event.isTrusted。
      isTrustedEvent: () => true,
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
    notifyTakeoverUnavailable = vi.fn();
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

  it('站点的 range 滑块拿走方向键，但别的快捷键照常', () => {
    // ⚠️ 这条曾经断言「站点的 range 滑块也抢不到键」（方向键仍然被我们接管），
    // 而那是**错的**：实测（真实 Chromium）焦点落在站点的 range 上按 →，
    // 滑块 value 纹丝不动、`input` 事件 0 次，键却被视频吃了（currentTime 0→5）。
    // 滑块在键盘下**彻底失效**。
    //
    // 「视频够大」与「焦点落在哪个控件上」是**两条独立的轴**，
    // 不能用前者去推断后者。
    const host = document.createElement('div');
    const slider = document.createElement('input');
    slider.type = 'range';
    host.append(slider);

    const event = keyEvent('ArrowRight');
    Object.defineProperty(event, 'target', { value: host });
    Object.defineProperty(event, 'composedPath', { value: () => [slider, host, document, window] });

    // 方向键归滑块。
    expect(controller.handleKeyDown(event)).toBe(false);

    // 但 `=` 不是滑块要的键 —— 仍然归我们。
    expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
  });

  it('我们自己控制条上的控件仍然只让路给方向键，f / Esc 照常', () => {
    // 回归：点击全屏进度条后焦点落在 <input type="range"> 上；旧逻辑把所有
    // <input> 当编辑态，导致方向键/Esc/f 全部失灵。
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.setAttribute('data-role', 'progress');
    const target = (key: string) => {
      const e = keyEvent(key);
      Object.defineProperty(e, 'target', { value: slider });
      Object.defineProperty(e, 'composedPath', { value: () => [slider, document, window] });
      return e;
    };

    expect(controller.handleKeyDown(target('ArrowRight'))).toBe(false); // 交给滑块自己
    expect(controller.handleKeyDown(target('f'))).toBe(true);           // 仍能切换全屏
    // Escape 仅在「全屏激活」时才被拦截（用于退出全屏）。
    createController(true);
    expect(controller.handleKeyDown(target('Escape'))).toBe(true);      // 仍能退出全屏
  });

  /**
   * 我们**自己**的滑块（带 data-role）必须把方向键让给原生 range 行为。
   *
   * 默认绑定里方向键是「快退/快进 5 秒」。焦点落在进度条上时若仍被我们抢走，
   * 滑块在键盘下就**完全不可用** —— 读屏用户按方向键，滑块一动不动
   * （原生 range 的方向键行为被 preventDefault 吃掉了）。
   *
   * ⚠️ 但只有**我们自己的**滑块让路：站点自己的 range 不该由我们让路
   * （那会让站点滑块在视频全屏里失灵）。
   */
  it('焦点在我们自己的滑块上时，方向键让给原生 range 行为', () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.setAttribute('data-role', 'progress');
    const target = (key: string) => {
      const e = keyEvent(key);
      Object.defineProperty(e, 'target', { value: slider });
      Object.defineProperty(e, 'composedPath', { value: () => [slider, document, window] });
      return e;
    };

    // 方向键归滑块：原生 range 的一格步进。
    expect(controller.handleKeyDown(target('ArrowRight'))).toBe(false);
    expect(controller.handleKeyDown(target('ArrowLeft'))).toBe(false);
    expect(controller.handleKeyDown(target('Home'))).toBe(false);
    expect(controller.handleKeyDown(target('End'))).toBe(false);

    // 其它键仍然归我们：f 切全屏。
    expect(controller.handleKeyDown(target('f'))).toBe(true);
  });

  it('焦点在音量滑块上时，方向键同样让给原生 range 行为', () => {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.setAttribute('data-role', 'volume');
    const event = keyEvent('ArrowRight');
    Object.defineProperty(event, 'target', { value: slider });
    Object.defineProperty(event, 'composedPath', { value: () => [slider, document, window] });

    expect(controller.handleKeyDown(event)).toBe(false);
  });

  it('站��自己的 range 滑块不再被我们抢走方向键', () => {
    // 站点滑块（没有 data-role）拿回自己的方向键 —— 见上面那条的实测证据：
    // 抢走它的后果是滑块在键盘下彻底失效，而不是「让站点滑块动不了」。
    const slider = document.createElement('input');
    slider.type = 'range';
    const event = keyEvent('ArrowRight');
    Object.defineProperty(event, 'target', { value: slider });
    Object.defineProperty(event, 'composedPath', { value: () => [slider, document, window] });

    expect(controller.handleKeyDown(event)).toBe(false);
  });

  /**
   * 页面伪造的键盘事件不得驱动扩展。
   *
   * 扩展在 document_start 抢注捕获阶段监听器，本来是为了赢过页面脚本 ——
   * 副作用是页面能 `dispatchEvent(new KeyboardEvent('keydown', {key:'='}))`
   * 随意操纵用户的视频：改倍速、触发全屏、劫持进度。
   */
  it('页面伪造的键盘事件被完全放行', () => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
      isFullscreenActive: () => false,
      canToggleFullscreen,
      toggleFullscreen,
      exitFullscreen,
      showSpeedFeedback,
      notifyTakeoverUnavailable,
      // 真实运行时的判定：合成事件 isTrusted 为 false。
      isTrustedEvent: (event) => event.isTrusted,
    });

    // jsdom 造出来的事件 isTrusted 恒为 false —— 正好就是「页面伪造的那种」。
    const forged = keyEvent('=');
    expect(forged.isTrusted, '前置条件：jsdom 的合成事件不可信').toBe(false);

    const event = keyEvent('=');
    const preventDefault = vi.spyOn(event, 'preventDefault');

    expect(controller.handleKeyDown(event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(video?.playbackRate, '伪造事件不该改变速度').toBe(1);
    expect(showSpeedFeedback).not.toHaveBeenCalled();
  });

  it('页面伪造的 keyup 也不该掐断长按加速', () => {
    // 信任判定做成可注入的：这里用一个「按事件类型区分」的判定 ——
    // keydown 可信、keyup 不可信 —— 于是能验证「不可信的 keyup 被忽略」。
    controller = new KeyboardController({
      getSettings: () => settings,
      getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
      isFullscreenActive: () => false,
      canToggleFullscreen,
      toggleFullscreen,
      exitFullscreen,
      showSpeedFeedback,
      notifyTakeoverUnavailable,
      isTrustedEvent: (event) => event.type === 'keydown',
    });

    vi.useFakeTimers();
    try {
      expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
      vi.advanceTimersByTime(1000);
      const callsBefore = showSpeedFeedback.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(1);

      // 一个不可信的 keyup 想让长按停下来 —— 不理它。
      expect(controller.handleKeyUp(keyUpEvent('='))).toBe(false);
      vi.advanceTimersByTime(1000);

      expect(showSpeedFeedback.mock.calls.length, '伪造的 keyup 不该掐断长按')
        .toBeGreaterThan(callsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * 没有「正在看的视频」时，快捷键必须**完全穿透**给页面。
   *
   * 这是 6.0.9 最重要的一条行为变更：以前只要页面上存在任何 <video>，
   * 空格/方向键就在整页生效 —— 用户在读长文（页面里嵌了个静音预览视频），
   * 按空格翻页结果视频跳了。这是唯一会让人直接卸载的问题。
   */
  it('没有明确目标时，所有快捷键都穿透给页面', () => {
    controller = new KeyboardController({
      getSettings: () => settings,
      getWatchedTarget: () => null,
      isFullscreenActive: () => false,
      canToggleFullscreen,
      toggleFullscreen,
      exitFullscreen,
      showSpeedFeedback,
      notifyTakeoverUnavailable,
      isTrustedEvent: () => true,
    });

    for (const key of ['=', '-', '0', ' ', 'ArrowLeft', 'ArrowRight', 'f']) {
      const event = keyEvent(key);
      const preventDefault = vi.spyOn(event, 'preventDefault');
      expect(controller.handleKeyDown(event), `按键 ${key} 不该被接管`).toBe(false);
      expect(preventDefault, `按键 ${key} 不该被吞掉`).not.toHaveBeenCalled();
    }

    expect(showSpeedFeedback).not.toHaveBeenCalled();
    expect(video?.playbackRate).toBe(1);
  });

  /**
   * ARIA 角色标注的输入框同样要让位给站点。
   *
   * 站点常用 `role="textbox"` / `role="searchbox"` 造自己的输入框
   * （富文本编辑器、组合框、代码输入区）。它们不是 <input>、也不是
   * contentEditable —— 只认标签类型的话，用户在那里打字会被吞掉。
   */
  it('role="textbox" 的元素算编辑态，打字不被吞', () => {
    const box = document.createElement('div');
    box.setAttribute('role', 'textbox');
    document.body.append(box);

    const event = keyEvent('=');
    Object.defineProperty(event, 'target', { value: box });
    Object.defineProperty(event, 'composedPath', { value: () => [box, document, window] });

    expect(controller.handleKeyDown(event)).toBe(false);
  });

  it('role="searchbox" / "combobox" 同样算编辑态', () => {
    for (const role of ['searchbox', 'combobox']) {
      const box = document.createElement('div');
      box.setAttribute('role', role);
      document.body.append(box);

      const event = keyEvent('=');
      Object.defineProperty(event, 'target', { value: box });
      Object.defineProperty(event, 'composedPath', { value: () => [box, document, window] });

      expect(controller.handleKeyDown(event), `role=${role} 应算编辑态`).toBe(false);
    }
  });

  /**
   * 设置改了，正在跑的长按重复必须立刻停掉。
   *
   * 否则：用户按着 `=` 的过程中改了键，`=` 不再绑在加速上 ——
   * 松开按键时 keyup 匹配不上，`clearRepeat()` 不会被调用，
   * 那个 120ms 的重复定时器会**一直跑到页面销毁**。
   * 表现是：用户松手了，速度却还在自己往上飘，而且再也停不下来。
   */
  it('设置热更新时停掉正在跑的长按重复', () => {
    vi.useFakeTimers();
    try {
      controller.start();
      expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
      vi.advanceTimersByTime(1000);
      const callsBefore = showSpeedFeedback.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(1);

      controller.onSettingsChanged();

      vi.advanceTimersByTime(2000);
      expect(showSpeedFeedback).toHaveBeenCalledTimes(callsBefore);
      controller.stop();
    } finally {
      vi.useRealTimers();
    }
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

  it('explains why the fullscreen key did nothing when takeover is impossible', () => {
    // 放行按键是必要的，但只放行不解释，在用户眼里和「扩展坏了」是同一件事。
    canToggleFullscreen = () => false;
    createController();

    expect(controller.handleKeyDown(keyEvent('f'))).toBe(false);
    expect(notifyTakeoverUnavailable).toHaveBeenCalledTimes(1);
    expect(notifyTakeoverUnavailable).toHaveBeenCalledWith(video);
  });

  it('does not report an unavailable takeover when there is no video at all', () => {
    // 页面上没有视频时按 f 是再正常不过的「这个键不属于扩展」，
    // 报「接管不了」只会变成噪音。
    video = null;
    createController();

    expect(controller.handleKeyDown(keyEvent('f'))).toBe(false);
    expect(notifyTakeoverUnavailable).not.toHaveBeenCalled();
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

  /**
   * 「站点自己处理哪些键」是一等公民，而不是某个站点的特判。
   *
   * 根因：扩展在 window 捕获阶段拦下 keydown（页面收不到 keydown），
   * 而 keyup 是**另一次事件派发**、页面照收不误 ——
   * 对「在 keyup 上处理按键」的站点，我们拦掉的不是一次按键，而是**半截按键**：
   * 它只收到 keyup，于是它的处理照样跑一遍。
   * 我们的「切播放/暂停」在 keydown 跑一次、站点的在 keyup 再跑一次
   * = 一次按键两次切换 = **净效果为零**。
   *
   * 这里用**注入的适配器**造出「某个站点在 keyup 上处理空格」这种形状：
   * 仓库里没有一份可信的「各站点键位表」可以当夹具 ——
   * 凭空写一个真实站点的键位，等于往产品里塞一条没核实过的事实。
   * 真实站点的那份数据由 siteAdapters.test.ts 单独守。
   */
  describe('站点自己处理某些键（nativeKeyHandling）', () => {
    const nativeSpaceAdapter = {
      selectors: ['video'],
      mainSelectors: [],
      nativeKeyHandling: [' '],
    };

    const useNativeSite = () => {
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        isTrustedEvent: () => true,
        getSiteAdapter: () => nativeSpaceAdapter,
      });
    };

    it('keydown 放行：不切换播放，也不吞掉按键', () => {
      useNativeSite();

      const event = keyEvent(' ');
      const preventDefault = vi.spyOn(event, 'preventDefault');
      const stopPropagation = vi.spyOn(event, 'stopPropagation');

      expect(controller.handleKeyDown(event)).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(stopPropagation).not.toHaveBeenCalled();
      expect(video?.pause).not.toHaveBeenCalled();
      expect(video?.play).not.toHaveBeenCalled();
    });

    it('keyup 一起放行：站点要拿到完整的一次按键', () => {
      useNativeSite();

      const event = keyUpEvent(' ');
      const preventDefault = vi.spyOn(event, 'preventDefault');
      const stopPropagation = vi.spyOn(event, 'stopPropagation');

      expect(controller.handleKeyUp(event)).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(stopPropagation).not.toHaveBeenCalled();
    });

    it('只让路那一个键：别的快捷键照常接管', () => {
      useNativeSite();

      expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
      expect(showSpeedFeedback).toHaveBeenCalled();
    });

    it('让路的那次按住不算我们的归属（长按空格页面照样能滚）', () => {
      // 放行之后「按住」的归属必须保持为空 ——
      // 否则浏览器长按派发的 repeat 事件会被我们吞掉，页面滚不动。
      useNativeSite();

      expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
      expect(controller.handleKeyDown(keyEvent(' ', { repeat: true }))).toBe(false);
    });

    it('带修饰键的组合不让路（站点处理的是裸键）', () => {
      // 站点监听的是裸空格 —— ctrl+空格它根本不会处理。
      // 如果连组合也让路，扩展就会白白丢掉一批快捷键。
      settings = createSettings({ togglePlay: 'ctrl+ ' });
      useNativeSite();

      expect(controller.handleKeyDown(keyEvent(' ', { ctrlKey: true }))).toBe(true);
      expect(video?.pause).toHaveBeenCalledTimes(1);
    });
  });

  it('YouTube 上「k」也整体放行（站点在 keyup 上处理它）', () => {
    // 'k' 是 YouTube 的播放/暂停键，与空格走同一条路径。
    // 用户把播放/暂停改绑到 'k' 时，同样不能出现「切两次」。
    settings = createSettings({ togglePlay: 'k' });
    setHostname('www.youtube.com');
    createController();

    expect(controller.handleKeyDown(keyEvent('k'))).toBe(false);
    expect(video?.pause).not.toHaveBeenCalled();
    expect(video?.play).not.toHaveBeenCalled();
  });

  it('YouTube 上没被站点接管的键仍然归我们（方向键/全屏不受让路影响）', () => {
    // ⚠️ 让路是**按键**级的、且只针对站点真的在 keyup 上处理的那几个键。
    // 如果把方向键也列进去，扩展在 YouTube 上就彻底失去快进与网页全屏
    // —— 那是最不该被牺牲的两项。
    setHostname('www.youtube.com');
    createController();

    expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(true);
    expect(video?.currentTime).toBe(17);
    expect(controller.handleKeyDown(keyEvent('f'))).toBe(true);
    expect(lastToggledVideo).toBe(video);
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

  /**
   * 改快捷键之后，长按加速必须**停得下来**。
   *
   * 根因：松手的判定读的是**当前**的绑定。
   * 用户按着 `=` 的过程中改了键（设置页在另一个标签页保存），
   * `=` 不再绑在加速上 —— keyup 永远匹配不上 → `clearRepeat()` 不执行
   * → 那个 120ms 的重复定时器一直跑到页面销毁。
   * 表现是：用户松手了，速度却还在自己往上飘，而且再也停不下来。
   *
   * 而唯一那条止损点（onSettingsChanged）走的是**异步**的 storage 读，
   * 读失败时被 `.catch(() => {})` 静默吞掉 → 它根本不会被调用。
   * 所以「松手」这件事必须**只依赖按键本身**。
   */
  describe('长按加速停不下来', () => {
    it('绑定被改掉之后，松手仍然停得住（不再依赖设置变更事件）', () => {
      vi.useFakeTimers();
      try {
        controller.start();
        expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
        vi.advanceTimersByTime(1000);
        const callsBefore = showSpeedFeedback.mock.calls.length;
        expect(callsBefore).toBeGreaterThan(1);

        // 用户在另一个标签页改了绑定 —— 但那次存储变更**读失败了**
        // （readSettings 的失败被 .catch(() => {}) 静默吞掉），
        // 于是 onSettingsChanged 根本不会被调用。
        settings = createSettings({ increaseSpeed: 'k' });

        // 松手。判据是「按下时记下的键」，不是当前绑定
        // （当前绑定已经不认识 '=' 了）。
        expect(controller.handleKeyUp(keyUpEvent('='))).toBe(true);

        vi.advanceTimersByTime(1000);
        expect(showSpeedFeedback, '松手之后不该再自己往上飘').toHaveBeenCalledTimes(callsBefore);
        controller.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('倍速被外部改写时，长按加速自动停下', () => {
      // 第二道防线：用户拖了速度条、或站点自己重置了速度 ——
      // 「按住」这个前提已经不成立，继续加只会把用户的设置冲掉。
      vi.useFakeTimers();
      try {
        if (!video) throw new Error('video missing');
        controller.start();
        expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
        vi.advanceTimersByTime(1000);
        const callsBefore = showSpeedFeedback.mock.calls.length;
        expect(callsBefore).toBeGreaterThan(1);

        // 外部改写倍速。
        video.playbackRate = 3;

        vi.advanceTimersByTime(1000);
        expect(showSpeedFeedback, '倍速被改写后不该继续加').toHaveBeenCalledTimes(callsBefore);
        expect(video.playbackRate).toBe(3);
        controller.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('倍速到上限时，长按加速自动停下（再加也不会变）', () => {
      vi.useFakeTimers();
      try {
        if (!video) throw new Error('video missing');
        video.playbackRate = 16;
        controller.start();

        expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
        vi.advanceTimersByTime(1000);

        // 只有「按下那一下」的反馈，后面不该再有连发。
        expect(showSpeedFeedback).toHaveBeenCalledTimes(1);
        expect(video.playbackRate).toBe(16);
        controller.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('倍速到下限时，长按减速自动停下', () => {
      vi.useFakeTimers();
      try {
        if (!video) throw new Error('video missing');
        video.playbackRate = 0.1;
        controller.start();

        expect(controller.handleKeyDown(keyEvent('-'))).toBe(true);
        vi.advanceTimersByTime(1000);

        expect(showSpeedFeedback).toHaveBeenCalledTimes(1);
        expect(video.playbackRate).toBe(0.1);
        controller.stop();
      } finally {
        vi.useRealTimers();
      }
    });
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

  /**
   * 长按（浏览器自动重复的 keydown）不能重复执行动作。
   *
   * 实测（真实 Chromium + 真实扩展 + CDP autoRepeat 按键）：
   *   空格：按 1 次 + 自动重复 3 次 → 播放状态被切了 4 次（视频在闪）
   *   →  ：按 1 次 + 自动重复 3 次 → 进度多跳了 15 秒
   *   f  ：按 1 次 + 自动重复 3 次 → 全屏被退出了
   */
  describe('按住不放（event.repeat）', () => {
    it('空格长按不再反复切换播放/暂停', () => {
      expect(controller.handleKeyDown(keyEvent(' '))).toBe(true);
      expect(video?.pause).toHaveBeenCalledTimes(1);

      expect(controller.handleKeyDown(keyEvent(' ', { repeat: true }))).toBe(true);
      expect(controller.handleKeyDown(keyEvent(' ', { repeat: true }))).toBe(true);

      expect(video?.pause).toHaveBeenCalledTimes(1);
      expect(video?.play).not.toHaveBeenCalled();
    });

    it('方向键长按不再反复快进', () => {
      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(true);
      expect(video?.currentTime).toBe(17);

      expect(controller.handleKeyDown(keyEvent('ArrowRight', { repeat: true }))).toBe(true);
      expect(controller.handleKeyDown(keyEvent('ArrowRight', { repeat: true }))).toBe(true);

      expect(video?.currentTime).toBe(17);
    });

    it('全屏键长按不再反复进出全屏', () => {
      const toggle = vi.fn(() => true);
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen: toggle,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        isTrustedEvent: () => true,
      });

      expect(controller.handleKeyDown(keyEvent('f'))).toBe(true);
      expect(toggle).toHaveBeenCalledTimes(1);

      expect(controller.handleKeyDown(keyEvent('f', { repeat: true }))).toBe(true);

      expect(toggle).toHaveBeenCalledTimes(1);
      expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it('松手之后长按的归属作废：下一次按下重新判定', () => {
      expect(controller.handleKeyDown(keyEvent(' '))).toBe(true);
      expect(controller.handleKeyUp(keyUpEvent(' '))).toBe(false);

      // 松手后再次按下（不是 repeat）→ 正常再切一次。
      expect(controller.handleKeyDown(keyEvent(' '))).toBe(true);
      expect(video?.pause).toHaveBeenCalledTimes(1);
      expect(video?.play).toHaveBeenCalledTimes(1);
    });

    it('页面上没有视频时，长按的空格仍然完整放行给页面（页面要能滚动）', () => {
      video = null;

      expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
      expect(controller.handleKeyDown(keyEvent(' ', { repeat: true }))).toBe(false);
    });

    it('长按期间页面不会被我们抢走按键（吞掉但不执行）', () => {
      // cancelable 必须是 true，否则 preventDefault 在 jsdom 里什么也不做。
      const event = keyEvent(' ', { repeat: true, cancelable: true });
      controller.handleKeyDown(keyEvent(' '));

      expect(controller.handleKeyDown(event)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    });

    it('不是我们快捷键的键根本不查视频', () => {
      const getWatchedTarget = vi.fn(() => (video ? { video, permission: 'full' as const } : null));
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget,
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        isTrustedEvent: () => true,
      });

      expect(controller.handleKeyDown(keyEvent('a'))).toBe(false);
      expect(controller.handleKeyDown(keyEvent('F5'))).toBe(false);
      expect(controller.handleKeyDown(keyEvent('Tab'))).toBe(false);
      expect(getWatchedTarget).not.toHaveBeenCalled();
    });
  });

  /**
   * 焦点在站点自己的控件上时，那个控件的键归它自己。
   *
   * 实测（真实 Chromium，站点自己的 range + 按钮）：
   * - 焦点在 range 上按 → → 滑块 value 纹丝不动、input 事件 0 次，
   *   而视频 currentTime 从 0 跳到 5（键被视频吃了）；
   * - 焦点在按钮上按空格 → 按钮 click 次数 0（没触发），视频反而开始播放。
   */
  describe('焦点在站点控件上', () => {
    const withTarget = (target: HTMLElement, key: string) => {
      const event = keyEvent(key);
      Object.defineProperty(event, 'target', { value: target });
      Object.defineProperty(event, 'composedPath', { value: () => [target, document, window] });
      return event;
    };

    it('站点的 range 滑块拿走方向键', () => {
      const slider = document.createElement('input');
      slider.type = 'range';

      expect(controller.handleKeyDown(withTarget(slider, 'ArrowRight'))).toBe(false);
      expect(controller.handleKeyDown(withTarget(slider, 'Home'))).toBe(false);
      expect(controller.handleKeyDown(withTarget(slider, 'End'))).toBe(false);
      // 但视频没被 seek 过。
      expect(video?.currentTime).toBe(12);
    });

    it('站点的按钮拿走空格与 Enter', () => {
      const button = document.createElement('button');

      expect(controller.handleKeyDown(withTarget(button, ' '))).toBe(false);
      expect(controller.handleKeyDown(withTarget(button, 'Enter'))).toBe(false);
      // 视频没被切换播放。
      expect(video?.pause).not.toHaveBeenCalled();
      expect(video?.play).not.toHaveBeenCalled();
    });

    it('站点按钮上的调速键仍然归我们', () => {
      const button = document.createElement('button');

      expect(controller.handleKeyDown(withTarget(button, '='))).toBe(true);
      expect(showSpeedFeedback).toHaveBeenCalled();
    });

    it('ARIA 角色同样算数', () => {
      const slider = document.createElement('div');
      slider.setAttribute('role', 'slider');

      expect(controller.handleKeyDown(withTarget(slider, 'ArrowRight'))).toBe(false);
    });
  });

  /**
   * 我们自己控制条上的按钮必须能被空格激活。
   *
   * 实测：焦点在静音按钮上按空格 → 静音没触发（muted 仍 false），
   * 反而把视频切成了播放；焦点在退出按钮上按空格 → 全屏没关。
   * 根因：我们在 window 捕获阶段 preventDefault 掉了空格。
   */
  describe('焦点在我们自己的控制条上', () => {
    const withTarget = (target: HTMLElement, key: string) => {
      const event = keyEvent(key);
      const host = document.createElement('div');
      host.id = 'vsc-controls';
      host.append(target);
      Object.defineProperty(event, 'target', { value: target });
      Object.defineProperty(event, 'composedPath', { value: () => [target, host, document, window] });
      return event;
    };

    it('空格与 Enter 让给控件自己', () => {
      const button = document.createElement('button');

      expect(controller.handleKeyDown(withTarget(button, ' '))).toBe(false);
      expect(controller.handleKeyDown(withTarget(button, 'Enter'))).toBe(false);
      expect(video?.pause).not.toHaveBeenCalled();
    });

    it('调速键仍然归我们', () => {
      const button = document.createElement('button');

      expect(controller.handleKeyDown(withTarget(button, '='))).toBe(true);
      expect(showSpeedFeedback).toHaveBeenCalled();
    });
  });

  it('直播流上不吞掉快进键（那个键根本没用）', () => {
    if (!video) throw new Error('video missing');

    Object.defineProperty(video, 'duration', { value: Number.POSITIVE_INFINITY, configurable: true });
    Object.defineProperty(video, 'seekable', { value: [], configurable: true });

    // 吞掉键 = 用户看到「按了 → 什么都没发生，页面也没滚动」。
    // 直播流没法 seek，所以把键放回页面。
    expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(false);
  });

  /**
   * 直播 / 不可 seek 的流：判据必须**放宽**，而且要有第二道防线。
   *
   * 早先的判据要求 `duration === Infinity` **且** `seekable` 为空，
   * 两个条件同时成立才算直播 —— 于是两种最常见的直播流都判不出来：
   * - MSE 直播：duration 是 NaN（第一个条件不成立）
   * - 有 DVR 窗口的直播：duration 是 Infinity 但 seekable 有一档（第二个不成立）
   * 判不出来 = 键被吞掉 = 用户看到「按了 → 什么都没发生，页面也没滚动」。
   */
  describe('直播 / 不可 seek 的流', () => {
    it('MSE 直播（duration 是 NaN）不吞快进键', () => {
      if (!video) throw new Error('video missing');

      Object.defineProperty(video, 'duration', { value: Number.NaN, configurable: true });
      Object.defineProperty(video, 'seekable', { value: [], configurable: true });

      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(false);
    });

    it('有 DVR 窗口的直播（duration 是 Infinity 但 seekable 非空）不吞快进键', () => {
      if (!video) throw new Error('video missing');

      Object.defineProperty(video, 'duration', { value: Number.POSITIVE_INFINITY, configurable: true });
      Object.defineProperty(video, 'seekable', { value: seekableRange(0, 60), configurable: true });

      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(false);
    });

    it('DRM 流（seekable 是空的）不吞快进键', () => {
      if (!video) throw new Error('video missing');

      Object.defineProperty(video, 'seekable', { value: [], configurable: true });

      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(false);
    });

    it('判据说能 seek、但位置实际没动 → 放行键，也不播报', () => {
      // 判据只说明「看起来能 seek」：DRM、部分 MSE 流在判据上完全正常
      // （duration 有限、seekable 非空），但 `video.currentTime = x`
      // 会被浏览器**忽略** —— 位置一动不动。
      // 那种情况下吞键 = 用户既没 seek 到、页面也没滚动（键被吃了）。
      const onSeek = vi.fn();
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        onSeek,
        isTrustedEvent: () => true,
      });

      // 造一个「写不进去」的 currentTime（浏览器忽略了这次赋值）。
      Object.defineProperty(video, 'currentTime', {
        get: () => 12,
        set: () => {},
        configurable: true,
      });

      const event = keyEvent('ArrowRight');
      const preventDefault = vi.spyOn(event, 'preventDefault');

      expect(controller.handleKeyDown(event)).toBe(false);
      expect(preventDefault, '没动就不该吞键').not.toHaveBeenCalled();
      expect(onSeek, '动作没发生就不该播报').not.toHaveBeenCalled();
    });

    it('真的 seek 成功了才吞键并播报', () => {
      if (!video) throw new Error('video missing');

      const onSeek = vi.fn();
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        onSeek,
        isTrustedEvent: () => true,
      });

      const event = keyEvent('ArrowRight');
      const preventDefault = vi.spyOn(event, 'preventDefault');

      expect(controller.handleKeyDown(event)).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(onSeek).toHaveBeenCalledWith(17, 5, 'forward');
    });

    it('位置被夹到反方向时不算成功（不能播报一句假话）', () => {
      // 有些流会把位置夹回可 seek 区间的起点 —— 那是往**反方向**动。
      // 按绝对值判断会把它当成「快进成功」，然后播报「快进 5 秒」
      // 而实际往回跳了 30 秒。
      if (!video) throw new Error('video missing');

      const onSeek = vi.fn();
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        onSeek,
        isTrustedEvent: () => true,
      });

      // 浏览器把位置夹回了 0（往回跳）。
      Object.defineProperty(video, 'currentTime', {
        get: () => 0,
        set: () => {},
        configurable: true,
      });

      const event = keyEvent('ArrowRight');
      const preventDefault = vi.spyOn(event, 'preventDefault');

      expect(controller.handleKeyDown(event)).toBe(false);
      expect(preventDefault, '没往目标方向动就不该吞键').not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  /**
   * 「部分接管」：视频可以调速/seek/全屏，但**空格必须还给页面**。
   *
   * 空格在页面上首先是「往下翻页」。用户在一篇长文里按空格，期望的是翻页，
   * 而不是暂停页面里某个预览视频。注册表把这种视频标成 'no-space'，
   * 键盘控制器只对**这一个键**让路 —— 其余键照常归我们。
   */
  describe('部分接管（no-space）', () => {
    /** 造一个「只能吃下除空格以外所有键」的目标。 */
    const useNoSpaceTarget = () => {
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget: () => (video ? { video, permission: 'no-space' } : null),
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        isTrustedEvent: () => true,
      });
    };

    it('空格放行给页面（用户要翻页）', () => {
      useNoSpaceTarget();

      expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
    });

    it('放行空格的**同时**不吞掉长按的重复事件', () => {
      // 放过一次之后，浏览器长按会持续派发 repeat 事件。
      // 如果那时我们把键吞了，页面就滚不动了 —— 那是「让路让一半」。
      useNoSpaceTarget();

      expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
      const repeated = keyEvent(' ');
      Object.defineProperty(repeated, 'repeat', { value: true, configurable: true });
      expect(controller.handleKeyDown(repeated)).toBe(false);
    });

    it('其余键照常归我们（调速、seek、全屏都不放行）', () => {
      useNoSpaceTarget();

      expect(controller.handleKeyDown(keyEvent('='))).toBe(true);
      expect(showSpeedFeedback).toHaveBeenCalled();

      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(true);

      expect(controller.handleKeyDown(keyEvent('f'))).toBe(true);
      expect(lastToggledVideo).toBe(video);
    });
  });

  /**
   * 动作的**语义**回报。
   *
   * 播放/暂停与快进快退在设计上没有任何视觉提示（非全屏时控制条根本不存在），
   * 所以读屏用户按了空格什么也听不到。这两条回调是那条通道的入口：
   * 键盘控制器只负责说「发生了什么」，文案由运行时决定。
   */
  describe('动作语义的回报', () => {
    let onPlaybackStateChange: ReturnType<typeof vi.fn>;
    let onSeek: ReturnType<typeof vi.fn>;

    const useReportingController = () => {
      onPlaybackStateChange = vi.fn();
      onSeek = vi.fn();
      controller = new KeyboardController({
        getSettings: () => settings,
        getWatchedTarget: () => (video ? { video, permission: 'full' } : null),
        isFullscreenActive: () => false,
        canToggleFullscreen,
        toggleFullscreen,
        exitFullscreen,
        showSpeedFeedback,
        notifyTakeoverUnavailable,
        onPlaybackStateChange,
        onSeek,
        isTrustedEvent: () => true,
      });
    };

    it('空格切到播放时报「正在播放」', () => {
      useReportingController();

      // 测试用的视频一开始就是「正在播放」的状态，所以第一下空格是暂停。
      controller.handleKeyDown(keyEvent(' '));
      onPlaybackStateChange.mockClear();

      expect(controller.handleKeyDown(keyEvent(' '))).toBe(true);

      expect(onPlaybackStateChange).toHaveBeenCalledTimes(1);
      expect(onPlaybackStateChange).toHaveBeenCalledWith(true);
    });

    it('空格切到暂停时报「已暂停」', () => {
      useReportingController();

      expect(controller.handleKeyDown(keyEvent(' '))).toBe(true);

      expect(onPlaybackStateChange).toHaveBeenCalledTimes(1);
      expect(onPlaybackStateChange).toHaveBeenCalledWith(false);
    });

    it('快进回报新位置、实际跳过的秒数与方向', () => {
      useReportingController();

      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(true);

      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenCalledWith(17, 5, 'forward');
    });

    it('快退回报新位置、实际跳过的秒数与方向', () => {
      useReportingController();

      expect(controller.handleKeyDown(keyEvent('ArrowLeft'))).toBe(true);

      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenCalledWith(7, -5, 'back');
    });

    it('被时长夹住时回报的是**实际**跳过的秒数', () => {
      // 播到 98 秒时按快进：只跳了 2 秒就到头了。
      // 报「快进 5 秒」是假话 —— 读屏用户会以为视频多出了 3 秒。
      useReportingController();
      if (!video) throw new Error('video missing');
      video.currentTime = 98;

      controller.handleKeyDown(keyEvent('ArrowRight'));

      expect(onSeek).toHaveBeenCalledWith(100, 2, 'forward');
    });

    it('被起点夹住时同样回报实际秒数', () => {
      useReportingController();
      if (!video) throw new Error('video missing');
      video.currentTime = 2;

      controller.handleKeyDown(keyEvent('ArrowLeft'));

      expect(onSeek).toHaveBeenCalledWith(0, -2, 'back');
    });

    it('动作没发生时什么都不回报', () => {
      // 页面上没有视频 / 动作没绑定：
      // 这些情况下动作**没有发生**，回报一句「快进 5 秒」就是撒谎。
      useReportingController();

      // 页面上没有视频。
      video = null;
      expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(false);

      // 动作没绑定（同一个控制器、同一组 spy —— 换控制器会把调用记到别处）。
      video = createVideo();
      settings = createSettings({ togglePlay: '', seekForward: '' });
      expect(controller.handleKeyDown(keyEvent(' '))).toBe(false);
      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(false);

      expect(onPlaybackStateChange).not.toHaveBeenCalled();
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('直播流上不回报 seek（那个动作根本没发生）', () => {
      useReportingController();
      if (!video) throw new Error('video missing');
      Object.defineProperty(video, 'duration', { value: Number.POSITIVE_INFINITY, configurable: true });
      Object.defineProperty(video, 'seekable', { value: [], configurable: true });

      expect(controller.handleKeyDown(keyEvent('ArrowRight'))).toBe(false);
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('长按自动重复不重复回报（动作只发生了一次）', () => {
      useReportingController();

      controller.handleKeyDown(keyEvent(' '));
      controller.handleKeyDown(keyEvent(' ', { repeat: true }));
      controller.handleKeyDown(keyEvent(' ', { repeat: true }));

      expect(onPlaybackStateChange).toHaveBeenCalledTimes(1);
    });
  });
});
