import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  resetPlaybackRate,
  seekBy,
  stepPlaybackRate,
  togglePlayback,
} from './playback';
import { getSiteAdapter as lookupSiteAdapter, type SiteAdapter } from './siteAdapters';
import { matchesShortcut } from '../shared/shortcuts';
import {
  SEEK_STEP_SECONDS,
  type PersistedSettings,
  type ShortcutSettings,
} from '../shared/types';
import { markFirstRunHintAccepted } from '../shared/settings';
// 判定规则所在的那个模块（只读结论，不碰它的实现细节）。
import { readAmbientPreview } from './ambientPreview';
// 只取类型，不引入运行时依赖：keyboardController 不需要 registry 的任何实现。
import type { WatchedTarget } from './videoRegistry';

/**
 * 快捷键动作。**与 ShortcutSettings 的键一一对应** —— 所以
 * `shortcuts[action]` 永远是那条绑定，不用另建映射表。
 */
type ShortcutAction = keyof ShortcutSettings;

interface KeyboardControllerOptions {
  getSettings: () => PersistedSettings;
  /**
   * 「用户此刻正在看的视频」+ **它能吃下哪些键**——快捷键只对它生效。
   *
   * 与 getCurrentVideo() 的区别是**契约**不同：
   * - getCurrentVideo()：页面上最可能是目标的视频（用于工具栏图标这类显式操作）
   * - getWatchedTarget()：用户此刻正在看的视频；**没有明确目标时返回 null**，
   *   此时快捷键必须完全穿透给页面。
   *
   * 以前两者是同一个函数，于是只要页面上存在任何 <video>，空格/方向键就在
   * **整页**生效 —— 用户在读长文（页面里嵌了个静音预览视频），按空格翻页
   * 结果视频跳了。这是唯一会让人直接卸载的问题。
   *
   * `permission` 是**部分接管**：'no-space' 表示这个视频可以被调速/seek/全屏，
   * 但**空格必须还给页面**（用户要翻页）。判据见 videoRegistry 的 resolvePermission。
   */
  getWatchedTarget: () => WatchedTarget | null;
  isFullscreenActive: () => boolean;
  /** 吞键前的可行性判断：跨 document 的视频进入全屏必然失败，不能吞掉按键。 */
  canToggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  exitFullscreen: () => void;
  showSpeedFeedback: (rate: number, video: HTMLVideoElement) => void;
  /**
   * 播放状态变了。
   *
   * @param playing true = 已经在播放，false = 已经暂停。
   *
   * 为什么必须有这条：播放/暂停**在设计上没有任何视觉提示** ——
   * 控制条只在网页全屏里才有，非全屏时按空格画面上什么都不变。
   * 读屏用户因此完全无法确认自己按的空格生效没有。
   *
   * 这里只报告**发生了什么**（语义），文案由运行时决定。
   */
  onPlaybackStateChange?: (playing: boolean) => void;
  /**
   * 进度跳了。
   *
   * @param positionSeconds 跳完之后视频的播放位置（秒）。
   * @param deltaSeconds 实际跳了多少秒（正数 = 前进，负数 = 后退）。
   * @param direction 动作的方向。被时长夹住时 deltaSeconds 可能是 0，
   *   那时只能靠 direction 知道用户按的是前进还是后退。
   *
   * 为什么必须有这条：快进快退**在设计上没有任何视觉提示** ——
   * 画面只是跳了一下，读屏用户听不到任何东西。
   */
  onSeek?: (
    positionSeconds: number,
    deltaSeconds: number,
    direction: 'forward' | 'back',
  ) => void;
  /**
   * 有视频、但进入全屏必然失败时的反馈。
   *
   * 这一支必须放行按键（不能让用户既丢键又没反应），可放行之后如果什么都不说，
   * 用户看到的就是「按 f 没反应」。放行和反馈要一起做。
   */
  notifyTakeoverUnavailable: (video: HTMLVideoElement | null) => void;
  /**
   * 「我按了快捷键，但这个 frame 里没有可接管的目标」。
   *
   * 键必须**放行**给页面（没有明确目标就不接管，这是原则），
   * 可放行之后如果什么都不说，用户看到的就是「按 f 没反应」。
   * 放行和反馈要一起做 —— 这一条就是那半句反馈。
   *
   * ⚠️ 它只负责**说明**，不负责替用户去动别的 frame 的视频：
   * 「焦点决定作用对象」这条规则不能破。
   */
  notifyNoVideoHere?: () => void;
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
  /**
   * 「这个站点自己会用哪些键」—— 站点适配器。
   *
   * 真实运行时按 `window.location.hostname` 查（见 siteAdapters）。
   *
   * 为什么要抽成依赖：仓库里**没有**一份可信的「各站点键位表」可以当测试夹具 ——
   * 凭空写一个真实站点的键位，等于往产品里塞一条没核实过的事实。
   * 注入之后，机制本身（keydown 与 keyup 一起放行）可以被独立测到，
   * 而「哪个站点有哪些键」这份数据留在 siteAdapters 里单独守。
   */
  getSiteAdapter?: (hostname: string) => SiteAdapter;
}

/**
 * 「这是页面预览」这条解释的最小间隔（毫秒）。
 *
 * 提示本身要挂 2.6 秒，而读屏通道是**排队**播报的 ——
 * 连按三下就是同一句话念三遍。3 秒既盖住了提示的停留时长，
 * 又不至于让用户「再按一次看看」时看不到回应。
 */
const AMBIENT_NOTICE_THROTTLE_MS = 3000;

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
 * 这个视频是不是**根本没法 seek**（直播流 / 不可 seek 的流）。
 *
 * 直播流（MediaStream / MSE / blob:）的 `duration` 常常不是有限数
 * （Infinity = 传统直播，NaN = MSE 直播的常态），`video.currentTime = x`
 * 什么也不会发生 —— 但我们会把这个键**吞掉**，
 * 于是用户看到的是「按了 → 什么都没发生，页面也没滚动」。
 * DRM 站点同理：`seekable` 是空的。
 *
 * 这种情况下不该吞键：让它落到页面上，用户至少还能滚动。
 *
 * ⚠️ 判据必须是「**或**」而不是「**且**」：
 * 早先要求 `duration === Infinity` **且** `seekable` 为空，两个条件同时成立
 * 才判成直播 —— 于是两种最常见的直播流都判不出来：
 * - MSE 直播：`duration` 是 NaN（第一个条件不成立）
 * - 有 DVR 窗口的直播：`duration` 是 Infinity 但 `seekable` 有一档（第二个不成立）
 * 判不出来 = 键被吞掉 = 用户看到「按了 → 什么都没发生，页面也没滚动」。
 *
 * ⚠️ 但 `Infinity` 与 `NaN` 不是一回事，不能一视同仁：
 * - `Infinity` 是浏览器的**明确表态**（这个媒体没有尽头 = 直播流）→ 一定 seek 不了；
 * - `NaN` 只是「还不知道」（元数据没到 / MSE 直播）→ 判不出来，
 *   交给后面「seek 之后 currentTime 是否真的变了」的探测去决定。
 *   一律当成直播会让「视频还没加载完」时的正常快进也失效。
 *
 * ⚠️ 元数据都还没加载（readyState === HAVE_NOTHING）时**不下判断**：
 * 那时候 duration 是 NaN、seekable 是空的，分不清「直播」与「还没加载完」。
 */
const isUnseekableLiveStream = (video: HTMLVideoElement): boolean => {
  // 浏览器明确说了「这个媒体没有尽头」→ 直播流，一定 seek 不了。
  if (video.duration === Number.POSITIVE_INFINITY) {
    return true;
  }

  // HAVE_NOTHING = 0：连元数据都没有，任何关于「能不能 seek」的判断都是猜。
  if (video.readyState === 0) {
    return false;
  }

  // 时长不是有限数（NaN = MSE 直播的常态）或根本没有可 seek 的区间（DRM）。
  return !Number.isFinite(video.duration) || video.seekable.length === 0;
};

/**
 * 这次 seek 到底「动」了没有。
 *
 * 为什么需要它：判据说「能 seek」不等于真能 seek。
 * 有些流（DRM、部分 MSE 流）在判据上完全正常（duration 有限、seekable 非空），
 * 但 `video.currentTime = x` 会被浏览器**忽略** —— 位置一动不动。
 * 那种情况下吞键 = 用户既没 seek 到、页面也没滚动（键被吃了）。
 *
 * ⚠️ 判据是「**朝那个方向**动了」：
 * 浏览器有时会把位置夹到别处（例如夹回可 seek 区间的起点）——
 * 那是往**反方向**动，不是「快进了 5 秒」。
 * 按绝对值判断会把这种反向位移当成成功，然后播报一句假话
 * （「快进 5 秒」而实际往回跳了 30 秒）。
 * 一句话：动了**且方向对**才算这次快进真的发生了；
 * 没动（或方向不对）就**放行键**，让页面自己滚。
 */
const hasActuallyMoved = (
  before: number,
  after: number,
  direction: 'forward' | 'back',
): boolean => {
  const delta = after - before;
  return direction === 'forward' ? delta > 0.001 : delta < -0.001;
};

/**
 * 键盘控制器：只认用户在设置页里绑定的键。没有内置的"顺手按键"，
 * 每个动作都必须先有一条绑定才会生效（留空 = 该动作禁用）。
 */
export class KeyboardController {
  private readonly options: KeyboardControllerOptions;
  private readonly isTrustedEvent: (event: KeyboardEvent) => boolean;
  private readonly resolveSiteAdapter: (hostname: string) => SiteAdapter;
  private repeatDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private repeatingShortcut: 'increaseSpeed' | 'decreaseSpeed' | null = null;
  /**
   * 正在跑的长按重复是**哪个键**发起的。
   *
   * ⚠️ 必须记「按下时那个键」，不能用当前绑定去反查：
   * 绑定一旦被改掉或清空，`matchesShortcut(event, shortcuts[repeatingShortcut])`
   * 就永远匹配不上这个 keyup → `clearRepeat()` 不会被调用 →
   * 那个 120ms 的重复定时器会一直跑到页面销毁。
   * 表现是：用户松手了，速度却还在自己往上飘，而且再也停不下来。
   */
  private repeatKey: string | null = null;
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
  /**
   * 「按住」的那个键**当时**的名字。
   *
   * ⚠️ 同 repeatKey：不能靠当前绑定反查。
   * 绑定被改掉之后，`matchesShortcut(event, shortcuts[holdOwner])` 永远匹配不上，
   * `holdOwner` 就再也清不掉 —— 长按的归属会一直挂着。
   */
  private holdKey: string | null = null;
  /**
   * 上一次解释「这是页面预览」的时间（毫秒时间戳，0 = 从没解释过）。
   *
   * ⚠️ 为什么要节流：那条提示会**跟着视频走**，而且每次按键都会重新播报
   * （读屏通道是排队播报的，连按三下 = 同一句话念三遍）。
   * 而提示本身要挂 2.6 秒 —— 所以这几秒里再按，屏幕上那条还在，
   * 重新弹一遍只是闪一下、念一遍，纯粹是噪音。
   */
  private lastAmbientNoticeAt = 0;
  /**
   * 我们最后一次**自己**写进去的倍速。
   *
   * 用途：长按重复的兜底 —— 发现当前倍速与这个值对不上，
   * 就说明倍速被**外部**改写了（用户拖了速度条、站点自己重置了速度），
   * 「按住」这个前提已经不成立，继续加只会把用户的设置冲掉。
   */
  private lastAppliedRate: number | null = null;
  /** 站点适配器缓存（hostname 在一个文档的生命周期里不会变）。 */
  private adapterCache: { hostname: string; adapter: SiteAdapter } | null = null;
  private readonly boundHandleKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly boundHandleKeyUp = (event: KeyboardEvent) => this.handleKeyUp(event);
  /**
   * 窗口失焦（切走标签页/应用）或页面转入后台时，keyup 不会到达本窗口，
   * 长按加速留下的重复定时器必须在这里被终止，否则会一直跑到页面销毁。
   */
  private readonly boundHandleFocusLoss = () => {
    this.clearRepeat();
    // keyup 不会来了，「按住」的归属也就无从解除 —— 只能在这儿清掉。
    this.clearHold();
  };

  constructor(options: KeyboardControllerOptions) {
    this.options = options;
    this.isTrustedEvent = options.isTrustedEvent ?? ((event) => event.isTrusted);
    this.resolveSiteAdapter = options.getSiteAdapter ?? lookupSiteAdapter;
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
      // 记下**按下时**这个键的名字：之后靠它认「松手的是不是同一个键」，
      // 而不是靠当前绑定（绑定随时可能被改掉）。
      this.holdKey = event.key;
    }
  }

  /**
   * 「这个站点自己会用哪些键」—— 站点适配器（按 hostname 缓存）。
   */
  private getSiteAdapterFor(hostname: string): SiteAdapter {
    if (this.adapterCache?.hostname !== hostname) {
      this.adapterCache = {
        hostname,
        adapter: this.resolveSiteAdapter(hostname),
      };
    }

    return this.adapterCache.adapter;
  }

  /**
   * 这个键是不是「站点自己在 **keyup** 上处理」的。
   *
   * 命中 → **keydown 与 keyup 一起放行**。
   *
   * 为什么必须放行：我们在 keydown 上拦截 = 页面收不到 keydown，
   * 而 keyup 是另一次派发、页面照收不误 —— 于是站点只拿到**半截按键**，
   * 它的「切播放/暂停」照样跑一遍，与我们的那次叠加 = 一次按键两次切换 = 净效果为零。
   * 放行整个键，站点才拿得到完整的一次按键。
   *
   * ⚠️ 判据是「**裸键**」：带修饰键的组合（ctrl+空格）不是站点的那个键 ——
   * 站点监听的是裸空格，ctrl+空格它根本不会处理。
   * 那种组合如果也让路，扩展就会白白丢掉一批快捷键。
   *
   * 站点名单与理由见 siteAdapters 的 `nativeKeyHandling`。
   */
  private isSiteOwnedKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      return false;
    }

    const adapter = this.getSiteAdapterFor(window.location.hostname);
    return adapter.nativeKeyHandling.includes(event.key);
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

  /**
   * 清掉「我们拥有这个按住中的键」的记录。
   *
   * holdOwner 与 holdKey 必须**一起**清：
   * 只清一个会让下一次 keyup 匹配到一个早就放弃的键（或永远匹配不上）。
   */
  private clearHold() {
    this.holdOwner = null;
    this.holdKey = null;
  }

  /**
   * 放行这个键时，只清掉**属于这个动作**的那一份「按住」归属。
   *
   * 为什么不全清：holdOwner 只有一个槽位 —— 用户可能正按着 '='（加速）
   * 又点了 '→'，后者放行不该把 '=' 的归属一起抹掉
   * （抹掉之后 '=' 长按的自动重复就不再被我们吞掉，页面会跟着滚）。
   */
  private releaseOwnership(action: ShortcutAction) {
    if (this.holdOwner === action) {
      this.clearHold();
    }
  }

  /**
   * 松手了就不再拥有这个键。
   *
   * ⚠️ 判据是「**按下时记下的 key**」，不是当前绑定：
   * 绑定被改掉或清空之后，当前绑定永远匹配不上这个 keyup，
   * `holdOwner` 就再也清不掉 —— 长按的归属会一直挂着。
   */
  private releaseHold(event: KeyboardEvent) {
    if (!this.holdOwner) {
      return;
    }

    if (this.holdKey !== null && event.key === this.holdKey) {
      this.clearHold();
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
    this.repeatKey = null;
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

    // 记住「我们自己写进去的倍速」：长按重复的兜底要靠它发现外部改写。
    this.lastAppliedRate = rate;
    this.options.showSpeedFeedback(rate, video);
  }

  /**
   * 长按重复还要继续吗？
   *
   * ⚠️ 这一条是长按加速的**第二道防线**，不能只靠 keyup 与设置变更停下来：
   * - keyup 可能不来（窗口失焦 → 有 blur 兜底，但页面被换掉/标签页被关也有别的洞）；
   * - 设置变更那条路走的是**异步**的 storage 读，读失败时被 `.catch(() => {})`
   *   静默吞掉 → `onSettingsChanged()` 根本不会被调用 → 没人喊停。
   * 一旦停不下来，用户松手了速度却还在自己往上飘，而且再也停不下来。
   *
   * 两种「该停」：
   * 1. 倍速被**外部**改写了（用户拖了速度条、站点自己重置了速度）
   *    → 「按住」这个前提已经不成立，继续加只会把用户的设置冲掉。
   * 2. 倍速已经到上限/下限 → 再加也不会变（stepPlaybackRate 会夹住），
   *    继续跑只是白跑 120ms 的定时器。
   */
  private shouldContinueRepeat(video: HTMLVideoElement, delta: number): boolean {
    const rate = video.playbackRate;

    if (this.lastAppliedRate !== null && Math.abs(rate - this.lastAppliedRate) > 0.001) {
      return false;
    }

    if (delta > 0 && rate >= MAX_PLAYBACK_RATE - 0.001) {
      return false;
    }

    if (delta < 0 && rate <= MIN_PLAYBACK_RATE + 0.001) {
      return false;
    }

    return true;
  }

  private startRepeat(
    shortcutId: 'increaseSpeed' | 'decreaseSpeed',
    delta: number,
    video: HTMLVideoElement,
    key: string,
  ) {
    this.clearRepeat();
    this.repeatingShortcut = shortcutId;
    // 记下发起这次重复的键：松手时靠它认「是不是同一个键」，
    // 而不是靠当前绑定（绑定随时可能被改掉）。
    this.repeatKey = key;
    this.repeatDelayTimer = setTimeout(() => {
      // 守卫：若本轮重复已被别的路径接管（设置中途变更等），
      // 先清干净再退出，避免留下孤儿定时器。
      if (this.repeatingShortcut !== shortcutId) {
        this.clearRepeat();
        return;
      }

      if (!this.shouldContinueRepeat(video, delta)) {
        this.clearRepeat();
        return;
      }

      this.runSpeedChange(delta, video);
      this.repeatIntervalTimer = setInterval(() => {
        // 守卫：若本轮重复已被别的路径接管（设置中途变更等），
        // 先清干净再退出，避免留下孤儿定时器。
        if (this.repeatingShortcut !== shortcutId) {
          this.clearRepeat();
          return;
        }

        // 兜底：自己判断「还该不该继续」（见 shouldContinueRepeat 的说明）。
        if (!this.shouldContinueRepeat(video, delta)) {
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

    // ⚠️ 「用户按下了扩展自己的键」= 他**会用**这个扩展了。
    //
    // 首次引导的落盘判据是「你会用了」，不是「你读过了」——
    // 教一个已经会的人，比不教更糟（那唯一一次教学机会白白占了他的屏幕）。
    // 所以这里**立刻**把「已展示」落盘：引导的 reveal() 在抢到锁之后会
    // 复查这个标记（见 firstRunHint.ts 的 reveal），复查为真就不弹了。
    //
    // ⚠️ 为什么落盘判据改了，这里却不用改 firstRunHint.ts：
    // 那边的 dismiss('accepted') 只在「提示已经显示过」时才落盘 ——
    // 于是「用户先按了键、2.5 秒后引导才弹出」的顺序下，标记始终没落盘，
    // 引导照弹不误（实测：用户已经会用 = 改了倍速，引导还是冒了出来）。
    // 落盘的**判据**归 settings.ts，触发点在这里（唯一能确定
    // 「用户按了扩展的键」的地方），两边不用改同一个文件。
    void markFirstRunHintAccepted().catch(() => {
      // 落盘失败只会导致引导多出现一次，不值得打断用户。
    });

    // ⚠️ 站点自己在 **keyup** 上处理这个键 → **keydown 与 keyup 一起放行**。
    //
    // 我们在 keydown 上拦截 = 页面收不到 keydown；而 keyup 是另一次派发，
    // 页面照收不误 —— 于是站点只拿到**半截按键**，它的处理照样跑一遍。
    // 我们的「切播放/暂停」在 keydown 跑一次、站点的在 keyup 再跑一次
    // = 一次按键两次切换 = 净效果为零（视频闪一下又回到原状，页面也不滚动）。
    //
    // 判据放在这里（而不是某个站点名上）：「站点自己处理哪些键」是**站点的事实**，
    // 归 siteAdapters 管（见 nativeKeyHandling 的说明）。
    //
    // ⚠️ 放行时**不要**动 holdOwner：用户可能正按着别的键（'=' 加速），
    // 这里放行的是另一个键 —— 抹掉 '=' 的归属会让它的长按重复不再被吞掉。
    if (this.isSiteOwnedKey(event)) {
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
    const target = this.options.getWatchedTarget();
    if (!target) {
      this.clearHold();
      // 「没有目标」有**两种**原因，说法必须不一样：
      //
      // 1. 这一层压根没有视频 → 问一圈别的 frame（视频可能在嵌入框里）；
      // 2. 这一层**有**视频，但它被当成「页面预览」，我们**故意**不接管它。
      //
      // ⚠️ 第 2 种以前是**一声不吭**的（键穿透给页面、页面没绑定）：
      // 用户按了 = 什么都没发生，而那条视频**看得见、正在播**——
      // 他能得出的唯一结论是「扩展坏了」。
      // 而这条视频是**页面摆在那儿的预览**（判定见 ambientPreview.ts），
      // 原因**是已知的**，所以完全说得出「为什么」与「下一步做什么」。
      const ambient = readAmbientPreview();
      if (ambient) {
        this.explainAmbientPreview(ambient, action);
      } else {
        // 放行不等于「什么都没发生」：这一层没有视频，不代表整个页面没有。
        // 让运行时去说明原因（见 notifyNoVideoHere 的说明）。
        this.options.notifyNoVideoHere?.();
      }
      return false;
    }

    // 「这个视频能吃下哪些键」不是「一个视频接不接受接管」——它可以是**部分**接受。
    //
    // 空格在页面上首先是「往下翻页」。用户在一篇长文里按空格，期望的是翻页，
    // 而不是暂停页面里某个预览视频。所以注册表会把这种视频标成 'no-space'：
    // 其余键（调速、seek、全屏）照常作用在它身上，**只有空格还给页面**。
    //
    // ⚠️ 必须在这里（解析出目标之后、执行动作之前）判，不能在更早的地方：
    // 早判会把整个视频连同其它键一起放掉，那就退回到「什么都不接管」了。
    if (target.permission === 'no-space' && action === 'togglePlay') {
      // 放行 → holdOwner 保持为空 → 长按空格时后续的 repeat 事件也不会被我们吞掉
      // （repeat 分支要求 holdOwner === action 才拦），页面照常滚动。
      this.clearHold();
      return false;
    }

    const video = target.video;

    if (action === 'seekBack') {
      // 直播流根本没法 seek：吞掉键只会让用户看到「按了 → 什么都没发生」。
      // 这种时候把键放回页面，用户至少还能滚动。
      if (isUnseekableLiveStream(video)) {
        this.releaseOwnership(action);
        return false;
      }

      // ⚠️ 先真的 seek 一次，再决定要不要吞键。
      //
      // 判据说「能 seek」不等于真能 seek：有些流（DRM、部分 MSE 流）
      // 的 duration 有限、seekable 非空，判据完全正常，
      // 但 `video.currentTime = x` 会被浏览器**忽略** —— 位置一动不动。
      // 那种情况下吞键 = 用户既没 seek 到、页面也没滚动（键被吃了）。
      //
      // 所以：动了才吞键并播报；没动就放行键（让页面自己滚），不播报
      // （动作没发生，播报「快进 5 秒」就是撒谎）。
      const before = video.currentTime;
      const position = seekBy(video, -SEEK_STEP_SECONDS);
      if (!hasActuallyMoved(before, position, 'back')) {
        this.releaseOwnership(action);
        return false;
      }

      this.intercept(event, action);
      this.clearRepeat();
      this.options.onSeek?.(position, position - before, 'back');
      return true;
    }

    if (action === 'seekForward') {
      if (isUnseekableLiveStream(video)) {
        this.releaseOwnership(action);
        return false;
      }

      const before = video.currentTime;
      const position = seekBy(video, SEEK_STEP_SECONDS);
      if (!hasActuallyMoved(before, position, 'forward')) {
        this.releaseOwnership(action);
        return false;
      }

      this.intercept(event, action);
      this.clearRepeat();
      this.options.onSeek?.(position, position - before, 'forward');
      return true;
    }

    if (action === 'togglePlay') {
      // 「站点自己在 keyup 上处理这个键」的情况在前面已经整体放行了
      // （见 isSiteOwnedKey）—— 这里不再写某个站点的特判。
      this.intercept(event, action);
      this.clearRepeat();
      const playing = togglePlayback(video);
      this.options.onPlaybackStateChange?.(playing);
      return true;
    }

    if (action === 'increaseSpeed') {
      this.intercept(event, action);
      if (event.repeat && this.repeatingShortcut === 'increaseSpeed') {
        return true;
      }

      this.runSpeedChange(0.1, video);
      this.startRepeat('increaseSpeed', 0.1, video, event.key);
      return true;
    }

    if (action === 'decreaseSpeed') {
      this.intercept(event, action);
      if (event.repeat && this.repeatingShortcut === 'decreaseSpeed') {
        return true;
      }

      this.runSpeedChange(-0.1, video);
      this.startRepeat('decreaseSpeed', -0.1, video, event.key);
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
      this.clearHold();
      this.options.notifyTakeoverUnavailable(video);
      return false;
    }

    this.intercept(event, action);
    this.clearRepeat();
    this.options.toggleFullscreen(video);
    return true;
  }

  /**
   * 「这是页面预览」—— 把**为什么**与**下一步**一起说出来。
   *
   * ⚠️ 为什么这条提示**不能**说「控制不了」：
   * 工具栏图标那条路径**能**接管页面预览（显式点击是明确意图，
   * 见 videoRegistry.ts 的 resolveCurrentVideo），
   * 所以「控制不了」会与事实矛盾，用户看到的会是「图标能、键盘不能」——
   * 而且是**自相矛盾**的「图标能、键盘不能」。
   * 这句话说的是**这条视频是什么**（页面摆在那儿的预览）
   * 与**下一步做什么**（点一下它 / 点扩展图标），两边对得上。
   *
   * ⚠️ 空格不打扰：空格在页面上首先是「往下翻页」。
   * 用户在读长文时按空格翻页，弹一条「这是页面预览」纯属噪音 ——
   * 他并没有在「想控制视频」，键穿透给页面正是他想要的。
   * 其余键（= / - / 方向键 / f）在页面上本来就没有默认行为，
   * 用户按它们就是冲着视频来的，**不解释**就等于「按了没反应」。
   */
  private explainAmbientPreview(video: HTMLVideoElement, action: ShortcutAction) {
    if (action === 'togglePlay') {
      return;
    }

    const now = Date.now();
    if (now - this.lastAmbientNoticeAt < AMBIENT_NOTICE_THROTTLE_MS) {
      return;
    }
    this.lastAmbientNoticeAt = now;

    // ⚠️ 走的是「接管失败提示」那一条通道：它是这个产品**唯一**会说话的
    // 视觉提示（与首次引导共用同一套胶囊与读屏播报），
    // 而这里没有第二条通道可走 —— 运行时把「说什么」交给了它。
    this.options.notifyTakeoverUnavailable?.(video);
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    // 同 keydown：合成事件一律不处理。页面能派发一个假 keyup 来掐断
    // 用户的「长按连续加速」——那也是页面在遥控用户的视频。
    if (!this.isTrustedEvent(event)) {
      return false;
    }

    // ⚠️ 站点自己在 **keyup** 上处理这个键 → 整个键归它，我们不碰。
    //
    // 放行 keydown 之后，站点要拿到**完整**的一次按键 ——
    // 它的处理本来就挂在 keyup 上，我们不能在这里动它。
    // （我们也不该在这里动我们自己的状态：这个键从头到尾就不是我们的。）
    if (this.isSiteOwnedKey(event)) {
      return false;
    }

    // 松手了就不再拥有这个键：之后的长按重复不该再被我们吞掉。
    this.releaseHold(event);

    const repeatingShortcut = this.repeatingShortcut;
    if (!repeatingShortcut) {
      return false;
    }

    // ⚠️ 判据是「**按下时记下的键**」，不是当前绑定。
    //
    // 原来这里读的是 `matchesShortcut(event, shortcuts[repeatingShortcut])`：
    // 用户按着 `=` 的过程中改了键（设置页在另一个标签页保存，sync 存储变更
    // 会实时推过来），`=` 不再绑在加速上 —— keyup 永远匹配不上，
    // `clearRepeat()` 不会被调用，**那个 120ms 的重复定时器会一直跑到页面销毁**。
    // 表现是：用户松手了，速度却还在自己往上飘，而且再也停不下来。
    //
    // 而那条唯一的止损点（onSettingsChanged）走的是**异步**的 storage 读，
    // 读失败时被 `.catch(() => {})` 静默吞掉 → 根本不会有人喊停。
    // 所以「松手」这件事必须只依赖按键本身，不依赖任何外部状态。
    if (this.repeatKey === null || event.key !== this.repeatKey) {
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
   *
   * ⚠️ 这一条**不是唯一的防线**：
   * 那条 storage 读是异步的，失败时被静默吞掉 → 这个方法根本不会被调用。
   * 所以「松手」改成只认按键本身（见 handleKeyUp），
   * 重复定时器里另有一道兜底（见 shouldContinueRepeat）。
   */
  onSettingsChanged() {
    this.clearRepeat();
    // 绑定变了，「按住」的归属也作废：holdOwner 记的是动作名，
    // 而动作名对应的绑定可能已经不是刚才那条了。
    this.clearHold();
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
    this.clearHold();
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
