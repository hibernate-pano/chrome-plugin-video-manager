import {
  resetPlaybackRate,
  seekBy,
  stepPlaybackRate,
  togglePlayback,
} from './playback';
import { matchesShortcut } from '../shared/shortcuts';
import { SEEK_STEP_SECONDS, type PersistedSettings } from '../shared/types';

interface KeyboardControllerOptions {
  getSettings: () => PersistedSettings;
  /**
   * 「用户此刻正在看的视频」——快捷键只对它生效。
   *
   * 与 getCurrentVideo() 的区别是**契约**不同：
   * - getCurrentVideo()：页面上最可能是目标的视频（用于工具栏图标这类显式操作）
   * - getWatchedVideo()：用户此刻正在看的视频；**没有明确目标时返回 null**，
   *   此时快捷键必须完全穿透给页面。
   *
   * 以前两者是同一个函数，于是只要页面上存在任何 <video>，空格/方向键就在
   * **整页**生效 —— 用户在读长文（页面里嵌了个静音预览视频），按空格翻页
   * 结果视频跳了。这是唯一会让人直接卸载的问题。
   */
  getWatchedVideo: () => HTMLVideoElement | null;
  isFullscreenActive: () => boolean;
  /** 吞键前的可行性判断：跨 document 的视频进入全屏必然失败，不能吞掉按键。 */
  canToggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  exitFullscreen: () => void;
  showSpeedFeedback: (rate: number, video: HTMLVideoElement) => void;
  /**
   * 有视频、但进入全屏必然失败时的反馈。
   *
   * 这一支必须放行按键（不能让用户既丢键又没反应），可放行之后如果什么都不说，
   * 用户看到的就是「按 f 没反应」。放行和反馈要一起做。
   */
  notifyTakeoverUnavailable: (video: HTMLVideoElement | null) => void;
  /**
   * 这个键盘事件是不是「用户真的按了」。
   *
   * 默认读 `event.isTrusted`（浏览器对用户真实输入为 true、对
   * `dispatchEvent` 造出来的事件为 false）。
   *
   * 为什么要抽成依赖：这是**安全相关**的分支，必须能被单测覆盖到两个方向，
   * 而 jsdom 造不出可信事件 —— `isTrusted` 在 jsdom 里是实例上的
   * non-configurable 属性（实测 `Object.defineProperty` 抛 TypeError），
   * 连原型上的 getter 都覆盖不了。注入之后，两条分支都能测。
   */
  isTrustedEvent?: (event: KeyboardEvent) => boolean;
}

/** 真正接收文本输入的 <input> 类型；其余（range/checkbox/button/color…）不算编辑态。 */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'password', 'email', 'tel', 'url', 'number']);

/**
 * ARIA 角色里表示「用户正在输入」的。
 *
 * 站点常用 `role="textbox"` / `role="searchbox"` 造自己的输入框（尤其是
 * 富文本编辑器、组合框、代码高亮输入区）。它们不是 <input>，也不是
 * contentEditable —— 只认标签类型的话，这些地方打字会被我们吞掉。
 */
const EDITABLE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'listbox', 'spinbutton']);

/**
 * 只有「文本编辑态」才让位给站点：文本框、文本域、下拉、可编辑区。
 * 关键：不能把所有 <input> 都当编辑态——我们自己的全屏进度条/音量条是
 * <input type="range">，点击后焦点会停在它上面；若在此拦下所有快捷键，
 * 方向键就只剩浏览器对 range 的 0.1s 微调、Esc/f/空格也全部失灵
 * （表现为「全屏里快进快退不干脆、点了进度条就再也控制不动」）。
 */
const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true;
  }

  if (target instanceof HTMLInputElement) {
    // 无 type 属性时浏览器按 text 处理。
    return TEXT_INPUT_TYPES.has((target.type || 'text').toLowerCase());
  }

  const role = target.getAttribute('role');
  return role !== null && EDITABLE_ROLES.has(role.toLowerCase());
};

/**
 * 判断事件是否发生在文本编辑态里。
 *
 * 必须看 composedPath() 而不是 event.target：键盘事件跨 shadow 边界时，
 * target 会被重定向为宿主元素（实测：在 shadow 里的 <input> 打字，
 * window 捕获阶段看到的 target 是 DIV#host，而 composedPath()[0] 才是那个 INPUT）。
 * 只认 target 会让 shadow DOM 里的输入框不被当成编辑态，用户打字被吞。
 */
const isEditableEvent = (event: KeyboardEvent) => {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return isEditableTarget(path[0] ?? event.target);
};

/**
 * 原生 range 会用掉的键。
 *
 * 只有这些键在焦点落在滑块上时该让给浏览器 —— 让走方向键是必须的
 * （不然滑块在键盘下完全不可用），但让走 `f` / 空格就是另一回事了：
 * 用户在滑块上按 `f` 显然是想退出全屏，不是想「什么都不发生」。
 */
const RANGE_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * 事件是不是发生在**我们自己的** range 滑块上，且这个键是滑块要用的。
 *
 * 我们的全屏控制条里有两条 range：进度条与音量条。它们住在 shadow root 里，
 * 键盘事件跨 shadow 边界时 target 会被重定向成宿主元素 —— 所以必须用
 * composedPath()[0] 才拿得到真正的滑块。
 *
 * 为什么必须放行：默认绑定里方向键是「快退/快进 5 秒」。焦点落在进度条上时
 * 若仍被我们抢走，滑块在键盘下**完全不可用** —— 读屏用户按了方向键，
 * 滑块一动不动（原生 range 的方向键行为被 preventDefault 吃掉了）。
 * 这正是 6.0.9 承诺的「控制条的滑块在键盘下重新可用」。
 *
 * 只认 `data-role="progress" / "volume"` 这两个我们自己的标记：
 * 站点自己的 range 不该由我们让路（那会让站点滑块在视频全屏里失灵），
 * 但站点滑块本来也不该被我们抢 —— 那个由「用户正在看的视频」那条判据负责。
 */
const isOurRangeSliderEvent = (event: KeyboardEvent): boolean => {
  if (!RANGE_KEYS.has(event.key)) {
    return false;
  }

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const target = path[0] ?? event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const role = target.getAttribute('data-role');
  return role === 'progress' || role === 'volume';
};

/**
 * YouTube 站点例外：它的播放器对空格有完整原生处理，且实现挂在 keyup 上。
 * 我们在 keydown 拦截切换一次、它的 keyup 再切换一次，一次空格就等于两次切换
 * （暂停停不住、或暂停后不放），stopImmediatePropagation 挡不住跨事件的第二次。
 * 所以 YouTube 上把"裸空格"完全放行给站点原生处理；用户若把播放/暂停改绑到
 * 别的键，那个键在 YouTube 上照常工作。
 */
const isYouTube = () => /(^|\.)youtube\.com$/.test(window.location.hostname);

/**
 * 键盘控制器：只认用户在设置页里绑定的键。没有内置的"顺手按键"，
 * 每个动作都必须先有一条绑定才会生效（留空 = 该动作禁用）。
 */
export class KeyboardController {
  private readonly options: KeyboardControllerOptions;
  private readonly isTrustedEvent: (event: KeyboardEvent) => boolean;
  private repeatDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private repeatingShortcut: 'increaseSpeed' | 'decreaseSpeed' | null = null;
  private readonly boundHandleKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly boundHandleKeyUp = (event: KeyboardEvent) => this.handleKeyUp(event);
  /**
   * 窗口失焦（切走标签页/应用）或页面转入后台时，keyup 不会到达本窗口，
   * 长按加速留下的重复定时器必须在这里被终止，否则会一直跑到页面销毁。
   */
  private readonly boundHandleFocusLoss = () => this.clearRepeat();

  constructor(options: KeyboardControllerOptions) {
    this.options = options;
    this.isTrustedEvent = options.isTrustedEvent ?? ((event) => event.isTrusted);
  }

  private intercept(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  private clearRepeat() {
    if (this.repeatDelayTimer) {
      clearTimeout(this.repeatDelayTimer);
      this.repeatDelayTimer = null;
    }

    if (this.repeatIntervalTimer) {
      clearInterval(this.repeatIntervalTimer);
      this.repeatIntervalTimer = null;
    }

    this.repeatingShortcut = null;
  }

  /**
   * 改一次速度。
   *
   * @param video 目标视频。**必须传进来**，不能在这里重新查询 ——
   *   长按连续加速时目标要保持一致：用户按着 `=` 的这 1 秒里如果滚了一下页面，
   *   「正在看的视频」可能变了，重新查询会让长按中途改到另一个视频上。
   */
  private runSpeedChange(delta: number, video: HTMLVideoElement) {
    const rate = delta === 0
      ? resetPlaybackRate(video)
      : stepPlaybackRate(video, delta);

    this.options.showSpeedFeedback(rate, video);
  }

  private startRepeat(
    shortcutId: 'increaseSpeed' | 'decreaseSpeed',
    delta: number,
    video: HTMLVideoElement,
  ) {
    this.clearRepeat();
    this.repeatingShortcut = shortcutId;
    this.repeatDelayTimer = setTimeout(() => {
      this.runSpeedChange(delta, video);
      this.repeatIntervalTimer = setInterval(() => {
        // 守卫：若本轮重复已被别的路径接管（设置中途变更等），
        // 先清干净再退出，避免留下孤儿定时器。
        if (this.repeatingShortcut !== shortcutId) {
          this.clearRepeat();
          return;
        }

        this.runSpeedChange(delta, video);
      }, 120);
    }, 280);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    // ⚠️ 只处理**真实**的键盘输入。
    //
    // 扩展在 document_start 抢注捕获阶段监听器，本来是为了赢过页面脚本 ——
    // 副作用是页面能 `dispatchEvent(new KeyboardEvent('keydown', {key:'='}))`
    // 随意操纵用户的视频：改倍速、触发全屏、劫持进度。
    // 合成事件的 isTrusted 恒为 false，浏览器产生的事件恒为 true，
    // 所以这一条就能把「页面遥控用户视频」这条路彻底堵死。
    //
    // 代价：单测里 `new KeyboardEvent(...)` 造出来的事件全是合成的，
    // 必须显式把 isTrusted 改成 true 才能测（见 keyboardController.test.ts）。
    if (!this.isTrustedEvent(event)) {
      return false;
    }

    if (event.isComposing || isEditableEvent(event)) {
      return false;
    }

    // 焦点在我们自己的滑块上时，方向键/Home/End 归滑块。
    // 焦点落在滑块上却仍被我们抢走方向键，滑块在键盘下就是完全不可用的。
    if (isOurRangeSliderEvent(event)) {
      return false;
    }

    const shortcuts = this.options.getSettings().shortcuts;

    // 退出全屏不需要有视频：全屏状态本身已隐含一个受控对象。
    if (this.options.isFullscreenActive() && event.key === 'Escape') {
      this.intercept(event);
      this.clearRepeat();
      this.options.exitFullscreen();
      return true;
    }

    // 快捷键只作用于「用户此刻正在看的视频」。
    // 没有明确目标就**完全穿透**给页面 —— 宁可不接管，也不要接管错对象。
    const video = this.options.getWatchedVideo();
    if (!video) {
      return false;
    }

    if (matchesShortcut(event, shortcuts.seekBack)) {
      this.intercept(event);
      this.clearRepeat();
      seekBy(video, -SEEK_STEP_SECONDS);
      return true;
    }

    if (matchesShortcut(event, shortcuts.seekForward)) {
      this.intercept(event);
      this.clearRepeat();
      seekBy(video, SEEK_STEP_SECONDS);
      return true;
    }

    if (matchesShortcut(event, shortcuts.togglePlay)) {
      // 裸空格 + YouTube：放行给站点原生处理，避免双重切换。
      if (isYouTube() && shortcuts.togglePlay === ' ') {
        return false;
      }

      this.intercept(event);
      this.clearRepeat();
      togglePlayback(video);
      return true;
    }

    if (matchesShortcut(event, shortcuts.increaseSpeed)) {
      this.intercept(event);
      if (event.repeat && this.repeatingShortcut === 'increaseSpeed') {
        return true;
      }

      this.runSpeedChange(0.1, video);
      this.startRepeat('increaseSpeed', 0.1, video);
      return true;
    }

    if (matchesShortcut(event, shortcuts.decreaseSpeed)) {
      this.intercept(event);
      if (event.repeat && this.repeatingShortcut === 'decreaseSpeed') {
        return true;
      }

      this.runSpeedChange(-0.1, video);
      this.startRepeat('decreaseSpeed', -0.1, video);
      return true;
    }

    if (matchesShortcut(event, shortcuts.resetSpeed)) {
      this.intercept(event);
      this.clearRepeat();
      this.runSpeedChange(0, video);
      return true;
    }

    if (matchesShortcut(event, shortcuts.fullscreen)) {
      // 已激活时按 f 是「退出」：canEnter 只描述「能否进入」，这里必须
      // 独立成一支，否则全屏里按 f 会因为 canEnter=false 而退不出去。
      if (this.options.isFullscreenActive()) {
        this.intercept(event);
        this.clearRepeat();
        this.options.exitFullscreen();
        return true;
      }

      // 未激活：先问 canEnter，进不去（跨 document 的视频）就不吞键，
      // 让页面自己处理，避免静默丢键。但放行必须配一句解释——否则在用户
      // 眼里「不吞键」和「扩展坏了」是同一件事。
      if (!this.options.canToggleFullscreen(video)) {
        this.options.notifyTakeoverUnavailable(video);
        return false;
      }

      this.intercept(event);
      this.clearRepeat();
      this.options.toggleFullscreen(video);
      return true;
    }

    return false;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    // 同 keydown：合成事件一律不处理。页面能派发一个假 keyup 来掐断
    // 用户的「长按连续加速」——那也是页面在遥控用户的视频。
    if (!this.isTrustedEvent(event)) {
      return false;
    }

    const repeatingShortcut = this.repeatingShortcut;
    if (!repeatingShortcut) {
      return false;
    }

    const shortcuts = this.options.getSettings().shortcuts;
    if (!matchesShortcut(event, shortcuts[repeatingShortcut])) {
      return false;
    }

    this.clearRepeat();
    return true;
  }

  /**
   * 设置变了：正在跑的长按重复必须立刻停掉。
   *
   * 为什么必须停：长按重复由两个定时器驱动，而**松开按键**的判定读的是
   * **当前**的绑定。用户按着 `=` 的过程中改了键（设置页在另一个标签页保存，
   * sync 存储变更会实时推过来），`=` 不再绑在加速上 —— 于是 keyup 匹配不上，
   * `clearRepeat()` 不会被调用，**那个 120ms 的重复定时器会一直跑到页面销毁**。
   * 表现是：用户松手了，速度却还在自己往上飘，而且再也停不下来。
   */
  onSettingsChanged() {
    this.clearRepeat();
  }

  start() {
    // 优先挂到 content-loader 在 document_start 同步注册的桥接监听器上：
    // 那是 window 捕获阶段的第一个监听器，先于所有页面脚本，
    // 保证我们的拦截不会被页面脚本抢跑或吞掉。
    const bridgeWindow = window as typeof window & {
      __vscRegisterKeyboard?: (type: 'keydown' | 'keyup', handler: ((event: KeyboardEvent) => void) | null) => void;
    };
    if (bridgeWindow.__vscRegisterKeyboard) {
      bridgeWindow.__vscRegisterKeyboard('keydown', this.boundHandleKeyDown);
      bridgeWindow.__vscRegisterKeyboard('keyup', this.boundHandleKeyUp);
    } else {
      // 桥接不存在（如单元测试环境）时直接注册。
      window.addEventListener('keydown', this.boundHandleKeyDown, true);
      window.addEventListener('keyup', this.boundHandleKeyUp, true);
    }

    // 失焦终止长按重复：keyup 不会到达本窗口，必须靠 blur/visibilitychange 兜底。
    window.addEventListener('blur', this.boundHandleFocusLoss);
    document.addEventListener('visibilitychange', this.boundHandleFocusLoss);
  }

  stop() {
    this.clearRepeat();
    const bridgeWindow = window as typeof window & {
      __vscRegisterKeyboard?: (type: 'keydown' | 'keyup', handler: ((event: KeyboardEvent) => void) | null) => void;
    };
    if (bridgeWindow.__vscRegisterKeyboard) {
      bridgeWindow.__vscRegisterKeyboard('keydown', null);
      bridgeWindow.__vscRegisterKeyboard('keyup', null);
    } else {
      window.removeEventListener('keydown', this.boundHandleKeyDown, true);
      window.removeEventListener('keyup', this.boundHandleKeyUp, true);
    }

    window.removeEventListener('blur', this.boundHandleFocusLoss);
    document.removeEventListener('visibilitychange', this.boundHandleFocusLoss);
  }
}
