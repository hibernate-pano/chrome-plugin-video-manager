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
  getCurrentVideo: () => HTMLVideoElement | null;
  isFullscreenActive: () => boolean;
  toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  exitFullscreen: () => void;
  showSpeedFeedback: (rate: number, video: HTMLVideoElement) => void;
  /**
   * 是否把"裸空格"让给站点原生处理（默认 YouTube）。
   * 做成可注入是为了让单元测试在不改 hostname 的前提下覆盖这条分支。
   */
  deferSpaceToSite?: () => boolean;
}

/** 真正接收文本输入的 <input> 类型；其余（range/checkbox/button/color…）不算编辑态。 */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'password', 'email', 'tel', 'url', 'number']);

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

  return false;
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

  private runSpeedChange(delta: number) {
    const video = this.options.getCurrentVideo();
    if (!video) {
      return;
    }

    const rate = delta === 0
      ? resetPlaybackRate(video)
      : stepPlaybackRate(video, delta);

    this.options.showSpeedFeedback(rate, video);
  }

  private startRepeat(shortcutId: 'increaseSpeed' | 'decreaseSpeed', delta: number) {
    this.clearRepeat();
    this.repeatingShortcut = shortcutId;
    this.repeatDelayTimer = setTimeout(() => {
      this.runSpeedChange(delta);
      this.repeatIntervalTimer = setInterval(() => {
        // 守卫：若本轮重复已被别的路径接管（设置中途变更等），
        // 先清干净再退出，避免留下孤儿定时器。
        if (this.repeatingShortcut !== shortcutId) {
          this.clearRepeat();
          return;
        }

        this.runSpeedChange(delta);
      }, 120);
    }, 280);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (event.isComposing || isEditableTarget(event.target)) {
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

    const video = this.options.getCurrentVideo();
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
      const defer = this.options.deferSpaceToSite ?? isYouTube;
      if (defer() && shortcuts.togglePlay === ' ') {
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

      this.runSpeedChange(0.1);
      this.startRepeat('increaseSpeed', 0.1);
      return true;
    }

    if (matchesShortcut(event, shortcuts.decreaseSpeed)) {
      this.intercept(event);
      if (event.repeat && this.repeatingShortcut === 'decreaseSpeed') {
        return true;
      }

      this.runSpeedChange(-0.1);
      this.startRepeat('decreaseSpeed', -0.1);
      return true;
    }

    if (matchesShortcut(event, shortcuts.resetSpeed)) {
      this.intercept(event);
      this.clearRepeat();
      this.runSpeedChange(0);
      return true;
    }

    if (matchesShortcut(event, shortcuts.fullscreen)) {
      this.intercept(event);
      this.clearRepeat();
      this.options.toggleFullscreen(video);
      return true;
    }

    return false;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
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
