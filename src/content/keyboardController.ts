import {
  resetPlaybackRate,
  seekBy,
  stepPlaybackRate,
  togglePlayback,
} from './playback';
import { matchesShortcut } from '../shared/shortcuts';
import {
  SEEK_STEP_SECONDS,
  type PersistedSettings,
  type ShortcutSettings,
} from '../shared/types';

/**
 * 快捷键动作。**与 ShortcutSettings 的键一一对应** —— 所以
 * `shortcuts[action]` 永远是那条绑定，不用另建映射表。
 */
type ShortcutAction = keyof ShortcutSettings;

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
 * 只认 `data-role="progress" / "volume"` 这两个我们自己的标记。
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
 * 我们自己的全屏控制条的宿主 id。
 *
 * 与 `fullscreenControls.ts` 里的 `CONTROLS_ID` 必须是同一个值 —— 那边在改
 * 标记时这边要跟着改，所以**改那边之前先看这里**（或者干脆把常量导过去）。
 */
const OUR_CONTROLS_ID = 'vsc-controls';

/** 焦点在我们自己的控制条里时，这些键归控件自己。 */
const OUR_CONTROLS_OWNED_KEYS = new Set<string>([' ', 'Enter', ...RANGE_KEYS]);

/**
 * 事件是不是落在**我们自己的**控制条里，且这个键是控件自己要用的。
 *
 * 为什么必须有这条：我们在 window 捕获阶段就 `preventDefault()` 了空格，
 * 浏览器「空格激活按钮」的默认行为因此被取消 —— 我们控制条上的
 * 播放 / 静音 / 退出 / 倍速按钮按空格**全都不响应**（只有 Enter 响应）。
 * 实测：焦点在静音按钮上按空格 → 静音没触发，反而把视频切成了播放；
 * 焦点在退出按钮上按空格 → 全屏没关，也变成了切播放。
 *
 * 让路只给「控件自己会用的键」：空格 / Enter / 方向键 / Home / End。
 * `=`、`-`、`0`、`f` 仍然归我们 —— 那些是浏览器的默认行为里没有的键。
 */
const isOurControlsEvent = (event: KeyboardEvent): boolean => {
  if (!OUR_CONTROLS_OWNED_KEYS.has(event.key)) {
    return false;
  }

  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return path.some((node) => node instanceof HTMLElement && node.id === OUR_CONTROLS_ID);
};

/** 按钮类控件自己会用的键：空格与 Enter（HTML 的标准激活键）。 */
const BUTTON_OWNED_KEYS = new Set<string>([' ', 'Enter']);

/** 滑块类控件自己会用的键：方向键与 Home / End / PageUp / PageDown。 */
const SLIDER_OWNED_KEYS = RANGE_KEYS;

/** ARIA 角色里表示「可激活 / 可切换」的。 */
const ACTIVATABLE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'option',
]);

/**
 * 这个元素是不是「有键盘语义」的控件？它自己会用掉哪些键？
 *
 * 返回 null = 不是这类控件（我们照常接管）。
 *
 * ⚠️ 为什么必须有这条（6.0.9 三审实测）：
 * 焦点落在**站点自己的**控件上时，我们抢键会让那些控件在键盘下**彻底失效**：
 * - 焦点在站点的 range 滑块上按 → → 滑块 value 纹丝不动、`input` 事件 0 次，
 *   而视频 currentTime 从 0 跳到 5（键被视频吃了）；
 * - 焦点在站点的按钮上按空格 → 按钮 click 次数 0（没触发），视频反而开始播放。
 *
 * 早先的注释写着「站点滑块本来也不该被我们抢 —— 那个由『用户正在看的视频』
 * 那条判据负责」—— **那是错的**：视频够大成立，与焦点落在哪个控件上是
 * **两条独立的轴**。
 */
const ownedKeysOf = (element: Element): ReadonlySet<string> | null => {
  const tag = element.tagName.toLowerCase();

  if (tag === 'input') {
    const type = (element as HTMLInputElement).type?.toLowerCase() ?? 'text';
    // 文本类由 isEditableTarget 负责（那里直接整体放行）。
    if (type === 'range') return SLIDER_OWNED_KEYS;
    if (type === 'checkbox' || type === 'radio' || type === 'button'
      || type === 'submit' || type === 'reset') {
      return BUTTON_OWNED_KEYS;
    }
    return null;
  }

  if (tag === 'button' || tag === 'summary') {
    return BUTTON_OWNED_KEYS;
  }

  if (tag === 'a' && element.hasAttribute('href')) {
    return BUTTON_OWNED_KEYS;
  }

  const role = element.getAttribute('role')?.toLowerCase();
  if (!role) {
    return null;
  }

  if (role === 'slider' || role === 'spinbutton' || role === 'progressbar') {
    return SLIDER_OWNED_KEYS;
  }

  if (ACTIVATABLE_ROLES.has(role)) {
    return BUTTON_OWNED_KEYS;
  }

  return null;
};

/**
 * 焦点所在控件要用这个键吗？要的话，这个键就归它 —— 我们放行。
 *
 * 只放行「控件自己会用的那几���键」，不是把整个键盘都让出去：
 * 焦点在站点按钮上时按 `=` 仍然是我们调速（浏览器对按钮没有 `=` 的默认行为）。
 */
const yieldsToFocusedControl = (event: KeyboardEvent): boolean => {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  const target = path[0] ?? event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  // 我们自己的控件另有一套规则（见 isOurControlsEvent）。
  if (path.some((node) => node instanceof HTMLElement && node.id === OUR_CONTROLS_ID)) {
    return false;
  }

  const owned = ownedKeysOf(target);
  return owned !== null && owned.has(event.key);
};

/**
 * 这个视频是不是**根本没法 seek**（直播流）。
 *
 * 直播流（MediaStream / 无时长源）的 `duration` 是 Infinity 且 `seekable` 为空，
 * `video.currentTime = x` 什么也不会发生 —— 但我们会把这个键**吞掉**，
 * 于是用户看到的是「按了 → 什么都没发生，页面也没滚动」。
 *
 * 这种情况下不该吞键：让它落到页面上，用户至少还能滚动。
 *
 * 只在「能确定是直播」时才放行（duration 无限 **且** 没有可 seek 区间）：
 * 别的情形（媒体还没加载完、时长还没算出来）保持原样，免得漏掉正常的快进。
 */
const isUnseekableLiveStream = (video: HTMLVideoElement): boolean =>
  video.duration === Number.POSITIVE_INFINITY && video.seekable.length === 0;

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
  /**
   * 当前这次「按住」我们是否拥有这个键。
   *
   * 物理按键按住期间，浏览器会持续派发 keydown（`event.repeat === true`）。
   * 这些重复事件**不能重复执行动作**（详见 handleKeyDown 里的说明），
   * 但**要不要吞掉**它们，必须跟第一次按下保持一致：
   * - 第一次按下时页面上没有视频 → 键本来就该给页面（长按 = 滚动页面）；
   * - 第一次按下时我们接管了 → 长按期间页面不该动。
   *
   * 所以判据是「上一次我们接管的是哪个动作」，而不是「这次页面上有没有视频」。
   */
  private holdOwner: ShortcutAction | null = null;
  private readonly boundHandleKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly boundHandleKeyUp = (event: KeyboardEvent) => this.handleKeyUp(event);
  /**
   * 窗口失焦（切走标签页/应用）或页面转入后台时，keyup 不会到达本窗口，
   * 长按加速留下的重复定时器必须在这里被终止，否则会一直跑到页面销毁。
   */
  private readonly boundHandleFocusLoss = () => {
    this.clearRepeat();
    // keyup 不会来了，「按住」的归属也就无从解除 —— 只能在这儿清掉。
    this.holdOwner = null;
  };

  constructor(options: KeyboardControllerOptions) {
    this.options = options;
    this.isTrustedEvent = options.isTrustedEvent ?? ((event) => event.isTrusted);
  }

  /**
   * 吞掉这个键。
   *
   * @param action 我们接管的是哪个动作。传了它就意味着「这个键归我们了」，
   *   长按期间的重复事件会被一并吞掉（见 handleKeyDown）。
   */
  private intercept(event: KeyboardEvent, action?: ShortcutAction) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (action) {
      this.holdOwner = action;
    }
  }

  /**
   * 这个键对应哪个动作；不是我们的键就返回 null。
   *
   * ⚠️ 顺序必须与 handleKeyDown 里原来那条 if 链**逐行一致** ——
   * 同一个键被绑到多个动作时，先匹配到的赢。改顺序 = 改行为。
   */
  private matchAction(event: KeyboardEvent, shortcuts: ShortcutSettings): ShortcutAction | null {
    if (matchesShortcut(event, shortcuts.seekBack)) return 'seekBack';
    if (matchesShortcut(event, shortcuts.seekForward)) return 'seekForward';
    if (matchesShortcut(event, shortcuts.togglePlay)) return 'togglePlay';
    if (matchesShortcut(event, shortcuts.increaseSpeed)) return 'increaseSpeed';
    if (matchesShortcut(event, shortcuts.decreaseSpeed)) return 'decreaseSpeed';
    if (matchesShortcut(event, shortcuts.resetSpeed)) return 'resetSpeed';
    if (matchesShortcut(event, shortcuts.fullscreen)) return 'fullscreen';
    return null;
  }

  /** 松手了就不再拥有这个键。 */
  private releaseHold(event: KeyboardEvent) {
    if (!this.holdOwner) {
      return;
    }

    const shortcuts = this.options.getSettings().shortcuts;
    if (matchesShortcut(event, shortcuts[this.holdOwner])) {
      this.holdOwner = null;
    }
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

    // 焦点在我们自己的控制条里时，空格/Enter/方向键归控件自己 ——
    // 否则我们在捕获阶段 preventDefault 掉的空格会让「空格激活按钮」失效
    // （实测：焦点在静音按钮上按空格 → 静音没触发，反而把视频切成了播放）。
    if (isOurControlsEvent(event)) {
      return false;
    }

    // 焦点在**站点自己的**控件上时，那个控件的键归它自己。
    // 否则站点的滑块在键盘下彻底失效（方向键被视频吃掉，滑块纹丝不动），
    // 站点的按钮按空格也不会触发（空格被视频吃去切换播放了）。
    if (yieldsToFocusedControl(event)) {
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

    // ⚠️ 先判定这个键是不是我们关心的 —— 不是就**直接放行，不查视频**。
    //
    // 「查视频」不是一次轻量判断：它要扫遍全页的 DOM 节点（还要顺带钻进
    // 每个 shadow root 与同源 iframe 找里面的 <video>），再对每个候选强制
    // 算一次样式和布局。实测（真实 Chromium，3 万节点的页面）单次约 3ms。
    //
    // 扩展注入在 <all_urls>，**每一个按键**都会走到这里；而用户按的绝大多数键
    // （字母、数字、功能键、Ctrl 组合…）根本不是我们的快捷键。
    // 为这些键付一次全页扫描的代价，是纯浪费。
    const action = this.matchAction(event, shortcuts);
    if (!action) {
      return false;
    }

    // ⚠️ 物理按键按住期间，浏览器会持续派发 keydown（`event.repeat === true`）。
    //
    // 这些重复事件**不能重复执行动作**：
    // - 空格是「切换播放/暂停」→ 重复执行 = 视频每 120ms 闪一次；
    // - 方向键是「跳 5 秒」→ 重复执行 = 按住一秒跳过 150 秒；
    // - f 是「进出全屏」→ 重复执行 = 全屏来回闪。
    //
    // 实测（真实 Chromium + 真实扩展 + CDP autoRepeat 按键）：
    //   空格：按 1 次 + 自动重复 3 次 → 播放状态被切了 4 次
    //   →  ：按 1 次 + 自动重复 3 次 → 进度从 0.2s 跳到 10.2s（多跳了 15 秒）
    //   f  ：按 1 次 + 自动重复 3 次 → 全屏被退出了
    //
    // 但**要不要吞掉**这些重复事件，必须跟第一次按下保持一致：
    // 第一次按下时页面上没有视频 → 键本来就该给页面（长按 = 滚动页面）；
    // 第一次按下时我们接管了 → 长按期间页面不该动。
    // 所以判据是 holdOwner（上次我们接管的是哪个动作），而不是「这次有没有视频」。
    //
    // 加/减速是例外：它们本来就有刻意的连发机制（延迟 280ms + 每 120ms 一次），
    // 由 startRepeat 驱动，与浏览器自己的按键重复无关。
    if (event.repeat && action !== 'increaseSpeed' && action !== 'decreaseSpeed') {
      if (this.holdOwner !== action) {
        return false;
      }

      // 吞掉但不执行：页面在长按期间不会滚动/触发别的默认行为。
      this.intercept(event);
      return true;
    }

    // 快捷键只作用于「用户此刻正在看的视频」。
    // 没有明确目标就**完全穿透**给页面 —— 宁可不接管，也不要接管错对象。
    const video = this.options.getWatchedVideo();
    if (!video) {
      this.holdOwner = null;
      return false;
    }

    if (action === 'seekBack') {
      // 直播流根本没法 seek：吞掉键只会让用户看到「按了 → 什么都没发生」。
      // 这种时候把键放回页面，用户至少还能滚动。
      if (isUnseekableLiveStream(video)) {
        this.holdOwner = null;
        return false;
      }

      this.intercept(event, action);
      this.clearRepeat();
      seekBy(video, -SEEK_STEP_SECONDS);
      return true;
    }

    if (action === 'seekForward') {
      if (isUnseekableLiveStream(video)) {
        this.holdOwner = null;
        return false;
      }

      this.intercept(event, action);
      this.clearRepeat();
      seekBy(video, SEEK_STEP_SECONDS);
      return true;
    }

    if (action === 'togglePlay') {
      // 裸空格 + YouTube：放行给站点原生处理，避免双重切换。
      if (isYouTube() && shortcuts.togglePlay === ' ') {
        this.holdOwner = null;
        return false;
      }

      this.intercept(event, action);
      this.clearRepeat();
      togglePlayback(video);
      return true;
    }

    if (action === 'increaseSpeed') {
      this.intercept(event, action);
      if (event.repeat && this.repeatingShortcut === 'increaseSpeed') {
        return true;
      }

      this.runSpeedChange(0.1, video);
      this.startRepeat('increaseSpeed', 0.1, video);
      return true;
    }

    if (action === 'decreaseSpeed') {
      this.intercept(event, action);
      if (event.repeat && this.repeatingShortcut === 'decreaseSpeed') {
        return true;
      }

      this.runSpeedChange(-0.1, video);
      this.startRepeat('decreaseSpeed', -0.1, video);
      return true;
    }

    if (action === 'resetSpeed') {
      this.intercept(event, action);
      this.clearRepeat();
      this.runSpeedChange(0, video);
      return true;
    }

    // action === 'fullscreen'
    // 已激活时按 f 是「退出」：canEnter 只描述「能否进入」，这里必须
    // 独立成一支，否则全屏里按 f 会因为 canEnter=false 而退不出去。
    if (this.options.isFullscreenActive()) {
      this.intercept(event, action);
      this.clearRepeat();
      this.options.exitFullscreen();
      return true;
    }

    // 未激活：先问 canEnter，进不去（跨 document 的视频）就不吞键，
    // 让页面自己处理，避免静默丢键。但放行必须配一句解释——否则在用户
    // 眼里「不吞键」和「扩展坏了」是同一件事。
    if (!this.options.canToggleFullscreen(video)) {
      this.holdOwner = null;
      this.options.notifyTakeoverUnavailable(video);
      return false;
    }

    this.intercept(event, action);
    this.clearRepeat();
    this.options.toggleFullscreen(video);
    return true;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    // 同 keydown：合成事件一律不处理。页面能派发一个假 keyup 来掐断
    // 用户的「长按连续加速」——那也是页面在遥控用户的视频。
    if (!this.isTrustedEvent(event)) {
      return false;
    }

    // 松手了就不再拥有这个键：之后的长按重复不该再被我们吞掉。
    this.releaseHold(event);

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
    // 绑定变了，「按住」的归属也作废：holdOwner 记的是动作名，
    // 而动作名对应的绑定可能已经不是刚才那条了。
    this.holdOwner = null;
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
    this.holdOwner = null;
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
