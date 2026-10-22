import { t } from '../shared/i18n';
import {
  loadSettings,
  purgeLegacySiteSpeeds,
  subscribeToSettings,
} from '../shared/settings';
import {
  DEFAULT_SHORTCUTS,
  FrameFocusMessage,
  FRAME_FOCUS_MESSAGE,
  PersistedSettings,
  SPEED_CHANGE_EVENT,
  SPEED_REPORT_MESSAGE,
  SpeedReportMessage,
  TOGGLE_FULLSCREEN_MESSAGE,
  VIDEO_OWNER_ASK_MESSAGE,
  VIDEO_OWNER_QUERY_MESSAGE,
  VIDEO_OWNER_REPORT_MESSAGE,
  VideoOwnerReportMessage,
} from '../shared/types';
import { FullscreenController } from './fullscreenController';
import { ownsUserFocus } from './frameScope';
import { createFirstRunHint, FirstRunHint } from './firstRunHint';
import { KeyboardController } from './keyboardController';
import { announce, destroyLiveRegion, prepareLiveRegion } from './liveRegion';
import {
  EXTENSION_STALE_NOTICE_ID,
  installRuntimeStyles,
  isolateNotice,
  NOTICE_STALE_TOKENS,
  showNotice,
  uninstallRuntimeStyles,
} from './runtimeStyles';
import { SpeedToast } from './speedToast';
import { TakeoverNotice } from './takeoverNotice';
import { VideoRegistry } from './videoRegistry';
import { mountViewportRoot } from './viewportRoot';

const createDefaultSettings = (): PersistedSettings => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
});

/**
 * 焦点归属的巡检间隔（毫秒）。
 *
 * 为什么需要巡检：焦点移进**子 iframe** 时，顶层文档收不到 focusout ——
 * 它只是发现自己的 activeElement 变成了那个 <iframe> 元素。于是顶层会一直
 * 以为「焦点还在我这儿」，等焦点回到顶层时就不再上报，
 * background 记着的仍是那个 iframe —— 点工具栏图标就会打到一个
 * 用户根本没在看的 frame 上（「图标点了没反应」）。
 *
 * 巡检只读 document.hasFocus() 与 document.activeElement（不触发布局），
 * 一秒一次的开销可以忽略；而它只在我们**以为自己拥有焦点**的时候才跑。
 */
const FOCUS_WATCH_INTERVAL_MS = 1000;

/**
 * 「扩展已更新，请刷新本页」这条提示的外观。
 *
 * ⚠️ 它的 DOM id（`EXTENSION_STALE_NOTICE_ID`）住在 runtimeStyles.ts：
 * 那个 id 同时是那段 `prefers-reduced-motion` 媒体查询里的选择器 ——
 * 两处各写一份字面量的话，改了一处忘了另一处 = 「减少动效」
 * 对这条提示静默失效。
 *
 * ⚠️ 排版**不再自己写**：它用第三套 token（`NOTICE_STALE_TOKENS`）——
 * 字号 / 字重 / 行高 / 字体族与胶囊、引导**逐项相同**，
 * 形状（底色 / 圆角 / 内边距 / 淡入时长）是它自己的
 * （为什么它是第三档，见 runtimeStyles.ts 的注释）。
 *
 * ⚠️ 全部走内联样式：提示挂在页面里，站点的 `div { ... !important }`
 * 会打穿样式表里的任何普通声明（见 runtimeStyles.ts 的「页面级提示的样式隔离」）。
 *
 * 这里只补这条提示**自己的**东西：它不锚在视频上（它是页面级的系统消息），
 * 而是固定在视口左上角，外加一个宽度上限（长文案不至于横穿整屏）。
 *
 * 导出成常量是为了让**跨模块的排版守卫**能直接验它
 * （src/content/noticeTokens.test.ts）——
 * 守卫要问的是「这条提示用的是不是那套 token」，
 * 而这个问题只有拿到**它真正写下去的那份样式**才答得准。
 */
export const EXTENSION_STALE_NOTICE_STYLES: Record<string, string> = {
  ...NOTICE_STALE_TOKENS,
  'max-width': 'min(420px, calc(100vw - 32px))',
  left: '16px',
  top: '16px',
};

/**
 * 「这一层没有视频」的**查询**节流（毫秒）。
 *
 * 查询要跨进程往返（内容脚本 → background → 各 frame → 回来），
 * 连按同一个键不该把这条链路打爆。
 *
 * ⚠️ 这一条与「提示」节流分开：查询很便宜，提示很贵。
 * 「别的 frame 也没有视频」是个**可能错**的答案（那个 frame 的内容脚本
 * 还没就绪时就会这样），所以它不该把接下来的一分钟都闷住 ——
 * 闷住的正是「视频确实在别处」时用户最需要的那句提示。
 */
const NO_VIDEO_QUERY_INTERVAL_MS = 2_000;

/**
 * 「视频在嵌入框里」这条**提示**的节流（毫秒）。
 *
 * 同一句话一分钟之内不重复说：答案在一分钟之内不会变，
 * 而重复的提示会盖住别的提示（胶囊、控制条）。
 */
const NO_VIDEO_HINT_INTERVAL_MS = 60_000;

/**
 * 把「当前在第几秒」写成一句人能听懂的话。
 *
 * 一分钟以内只说秒；超过一分钟才拆成「分 + 秒」——
 * 读屏用户听的是一句话，秒数超过 60 时「75 秒」比「1 分 15 秒」更难听。
 */
const formatPosition = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));

  if (total < 60) {
    return t('positionSeconds', '$1 秒', [String(total)]);
  }

  return t('positionMinutes', '$1 分 $2 秒', [
    String(Math.floor(total / 60)),
    String(total % 60),
  ]);
};

export interface ContentRuntimeOptions {
  /**
   * 这个键盘事件是不是「用户真的按了」。
   *
   * 默认读 `event.isTrusted`。注入它只是为了**测试**：
   * jsdom 造出来的事件 isTrusted 恒为 false，而且 `isTrusted` 在 jsdom 里是
   * 实例上的 non-configurable 属性（实测 `Object.defineProperty` 抛 TypeError），
   * 连原型上的 getter 都没有 —— 所以单测**无法**造出可信事件。
   *
   * 不给这条缝的话，「键盘真的能改倍速」这条链路在单测里根本跑不起来
   * （它会正确地把合成事件当成伪造事件拒掉），于是整条集成链路失去覆盖。
   */
  isTrustedEvent?: (event: KeyboardEvent) => boolean;
}

export class ContentRuntime {
  private readonly registry = new VideoRegistry();
  private readonly fullscreenController = new FullscreenController();
  /**
   * 倍速的**唯一**上报入口在胶囊里：它把「读数变了」这件事统一成一次回调。
   *
   * ⚠️ 运行时自己**不再**另外调 reportSpeed：两处各调一次，同一次调速
   * 就会被记成两次上报（消息翻倍，service worker 白白多醒一次）。
   */
  private readonly speedToast = new SpeedToast({
    onRateChange: (rate) => this.reportSpeed(rate),
  });
  private readonly takeoverNotice = new TakeoverNotice();
  private readonly firstRunHint: FirstRunHint = createFirstRunHint(
    () => this.settings.shortcuts,
    /**
     * 「这条视频是不是装饰物」由 **VideoRegistry** 代答。
     *
     * ⚠️ 这条接缝曾经**存在却从未接上** —— 判定规则只有一份
     * （`src/content/ambientPreview.ts`），而「用户碰过」「站点自己开的」
     * 「键盘刚命中过」这几条证据**只有 registry 知道**（它们靠事件与手势的
     * 时间关系判定，别人算不出来）。
     *
     * 不接这条缝，引导就会退回自己那份**更粗的兜底判据**（只认 autoplay +
     * 无 controls + 站点主播放器 + 用户选过），于是同一条视频，
     * 「要不要接管它」说它不是装饰（接管了，键盘能用），
     * 「要不要给它弹引导」说它是装饰（引导永远不出现）——
     * 用户能调速，却从来不知道这个扩展会做什么，
     * 而引导是这个产品**全部的可见入口**。
     *
     * ⚠️ 回调是**延迟求值**的：registry 字段声明在前面，且真正调用发生在
     * 视频开始播放之后 —— 所以这里不存在初始化顺序问题。
     */
    (video) => this.registry.isAmbientPreview(video),
  );
  private readonly keyboardController: KeyboardController;
  private settings: PersistedSettings = createDefaultSettings();
  /**
   * 启动时 chrome.runtime.id 是不是存在。
   *
   * ⚠️ 它是「上下文失效」判据的**前提**：扩展被更新/重载之后，
   * 老的内容脚本还活着，但 chrome.runtime.id 会变成 undefined。
   * 而测试替身与某些沙箱里 chrome.runtime **本来就没有 id** ——
   * 那不是「刚刚失效」，误判会让整个扩展把自己拆了。
   */
  private readonly hadRuntimeId: boolean;
  /** 扩展上下文是否已经失效（一旦失效就不会恢复）。 */
  private contextInvalidated = false;
  /** 是否已经拆过一次（stop() 幂等）。 */
  private stopped = false;

  constructor(options: ContentRuntimeOptions = {}) {
    this.hadRuntimeId = typeof chrome !== 'undefined'
      && typeof chrome.runtime?.id === 'string'
      && chrome.runtime.id.length > 0;

    this.keyboardController = new KeyboardController({
    getSettings: () => this.settings,
    // 快捷键只作用于「用户此刻正在看的视频」；没有明确目标就完全穿透。
    // 显式操作（点工具栏图标）走 getCurrentVideo()，那是另一套契约。
    //
    // ⚠️ 这里给的是 **target**（视频 + 它能吃下哪些键），不是光一个视频：
    // 注册表会标出「这个视频可以调速，但空格必须还给页面翻页」这类**部分接管**。
    getWatchedTarget: () => this.registry.getWatchedTarget(),
    // 菜单开着时对键盘控制器谎报「不在全屏」。
    // 键盘控制器在 window 捕获阶段处理 Escape 并 stopImmediatePropagation，
    // 菜单根本收不到 —— 谎报一下，它就跳过 Escape 分支，让 Escape 落到菜单上
    // （关菜单，而不是退出全屏）。
    isFullscreenActive: () => this.fullscreenController.isActive() && !this.isSpeedMenuOpen(),
    canToggleFullscreen: (video) => this.fullscreenController.canEnter(video),
    toggleFullscreen: (video) => this.toggleFullscreenFor(video, { focusControls: true }),
    exitFullscreen: () => {
      const wasActive = this.fullscreenController.isActive();
      this.fullscreenController.exit();
      this.registry.setFullscreenVideo(null);
      this.announceFullscreen(this.fullscreenController.isActive(), wasActive);
    },
    // 全屏内外都给一次性提示：控制条鼠标静止 3 秒就隐藏，键盘调速时它
    // 往往不在屏幕上，不能指望它承担反馈。toast 约 1 秒后自行消失。
    //
    // ⚠️ 这里**不再**单独调 reportSpeed：胶囊会把「倍速变了」统一回调回来
    // （onRateChange），两处各调一次就是同一次调速被记成两次上报。
    showSpeedFeedback: (rate, video) => {
      this.speedToast.show(rate, video);
    },
    notifyTakeoverUnavailable: (video) => this.takeoverNotice.show(video),
    // 这一层没有视频时，去问一圈「别的 frame 有吗」——
    // 放行按键之后必须给半句解释，否则用户看到的就是「按了没反应」。
    notifyNoVideoHere: () => {
      void this.notifyNoVideoHere();
    },
    // 播放状态变了：画面上没有任何提示，读屏用户完全无从确认。
    onPlaybackStateChange: (playing) => {
      announce(playing
        ? t('playbackPlaying', '正在播放')
        : t('playbackPaused', '已暂停'));
    },
    // 进度跳了：同样没有任何视觉提示。
    onSeek: (position, delta, direction) => {
      // ⚠️ 跳了多少秒是**一个数字**（"5"），当前位置是**一句话**
      // （"5 秒" / "1 分 20 秒"）—— 两者在文案里的角色不同：
      // 「快进 5 秒，当前 1 分 20 秒」。
      const seconds = String(Math.round(Math.abs(delta)));
      const positionText = formatPosition(position);
      announce(direction === 'forward'
        ? t('seekForward', '快进 $1 秒，当前 $2', [seconds, positionText])
        : t('seekBack', '快退 $1 秒，当前 $2', [seconds, positionText]));
    },
    ...(options.isTrustedEvent ? { isTrustedEvent: options.isTrustedEvent } : {}),
  });
  }
  private unsubscribeSettings: (() => void) | null = null;
  /** 上一次上报给 background 的倍速（去重用，见 reportSpeed）。 */
  private lastReportedRate: number | null = null;
  /**
   * 「焦点在我这儿」这个状态是不是已经上报过。
   *
   * ⚠️ 它是「只在焦点真的换了才写」的判据：焦点事件与 pointerdown 很密，
   * 每次都发一条 = 每次都唤醒一次 service worker 并写一次 storage.session，
   * 而那个写入**有配额上限** —— 配额用满之后写入静默失败，
   * 焦点记录就停在旧 frame 上，点工具栏图标会打偏。
   */
  private focusReported = false;
  /**
   * 上一次焦点消息里带的倍速（null = 那一层此刻没有受控视频）。
   *
   * 它决定「这条消息的内容有没有变」：视频被站点换掉时，焦点 frame 没变，
   * 但消息内容变了（从「1.5x」变成「这一层没有视频」）——
   * 而那条消息正是 background 复位标题的依据（见 background 的焦点消息分支）。
   */
  private lastFocusRate: number | null = null;
  /** background 那边的焦点记录是否可能已经过期（上次上报失败、还没补报）。 */
  private focusRecordStale = false;
  /** 焦点归属的巡检定时器（只在我们以为自己拥有焦点时跑）。 */
  private focusWatchTimer: number | null = null;
  /** 上一次「这一层没有视频」提示的时刻（节流用）。 */
  private lastNoVideoHintAt = 0;
  /** 上一次发起「别的 frame 有没有视频」查询的时刻（节流用）。 */
  private lastNoVideoQueryAt = 0;
  /** 是否有「别的 frame 有没有视频」的查询正在路上。 */
  private noVideoQueryPending = false;
  private readonly boundHandleMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => this.handleMessage(message, sendResponse);
  private readonly boundHandleSpeedChange = (event: Event) => this.handleSpeedChange(event);
  private readonly boundReportFocus = () => this.reportFocus();
  /**
   * 焦点离开了页面（用户点去了浏览器界面）。
   *
   * 两件事一起做：焦点记录作废（下次回到这一页要重新上报），
   * 以及看一眼扩展上下文还活着吗。
   */
  private readonly boundHandleWindowBlur = () => {
    this.releaseFocus();
    this.checkContextAlive();
  };
  private readonly boundPrepareLiveRegion = () => prepareLiveRegion();

  private getCurrentVideo() {
    return this.fullscreenController.getActiveVideo() ?? this.registry.getCurrentVideo();
  }

  /**
   * 倍速档位菜单是否开着。
   *
   * 直接问 DOM 而不是再加一条跨模块事件：菜单的开合本来就是 DOM 状态，
   * 而 `#vsc-controls` 这个 id 已经是全项目公认的约定
   * （overlayLayers.ts 也在用它判断「是不是我们自己的节点」）。
   */
  private isSpeedMenuOpen(): boolean {
    const host = document.getElementById('vsc-controls');
    const menu = host?.shadowRoot?.querySelector('[data-role="speed-menu"]');
    return menu instanceof HTMLElement && !menu.hidden;
  }

  private toggleFullscreenFor(video: HTMLVideoElement | null, options: { focusControls?: boolean } = {}) {
    const wasActive = this.fullscreenController.isActive();
    const next = this.fullscreenController.toggle(video, options);
    this.registry.setFullscreenVideo(this.fullscreenController.getActiveVideo());

    // 进全屏后控制条上就写着倍速，角标是重复信息，先撤掉。
    // 放在这里是为了同时覆盖「键盘 f」和「点工具栏图标」两条进入路径。
    if (this.fullscreenController.isActive()) {
      this.speedToast.dismissBadge();
    }

    this.announceFullscreen(this.fullscreenController.isActive(), wasActive);
    return next;
  }

  /**
   * 播报全屏状态。
   *
   * ⚠️ 只在**画面真的变了**时播报：进不去全屏时（文档挂不上 overlay）
   * 画面一点没变，这时播一句「已进入网页全屏」会让读屏用户以为全屏成功了。
   */
  private announceFullscreen(active: boolean, wasActive = false) {
    if (active) {
      if (!wasActive) {
        announce(t('fullscreenEntered', '已进入网页全屏'));
      }
      return;
    }

    if (wasActive) {
      announce(t('fullscreenExited', '已退出网页全屏'));
    }
  }

  /**
   * 把倍速告诉 background —— 工具栏图标的标题要显示它。
   *
   * 只在值真的变了时发：连按调速每次都会走到这里，但倍率到顶之后就不变了，
   * 重复发只是白白唤醒一次 service worker。
   *
   * ⚠️ 只有**焦点所在的那个 frame** 才该说话：焦点落进 iframe 时，
   * 顶层文档的 activeElement 是那个 <iframe> 元素（浏览器把焦点代理到它身上），
   * 于是顶层自动闭嘴 —— 否则工具栏标题会停在**别的 frame** 的倍速上（在说谎）。
   */
  private reportSpeed(rate: number) {
    if (this.contextInvalidated) {
      // 上下文已经死了：消息发不出去，别再试。
      return;
    }

    if (!ownsUserFocus()) {
      return;
    }

    if (this.lastReportedRate === rate) {
      return;
    }

    try {
      const message: SpeedReportMessage = { type: SPEED_REPORT_MESSAGE, rate };
      void chrome.runtime?.sendMessage?.(message)?.catch?.(
        (error: unknown) => this.handleSendFailure(error, () => {
          // 没报成就不算报过：下一次机会（站点再改速、焦点再动）补报。
          this.lastReportedRate = null;
        }),
      );
      this.lastReportedRate = rate;
    } catch (error) {
      this.lastReportedRate = null;
      this.handleSendFailure(error);
    }
  }

  /**
   * 告诉 background「用户此刻在我这个 frame 里」。
   *
   * 点工具栏图标时，background 靠这条消息知道该把点击发给谁。
   *
   * ⚠️ 焦点在**子 frame** 里时顶层文档也会收到 focusin（焦点代理），
   * 两边都上报的话，后到的那个赢 —— 于是 background 记住的是顶层 frame，
   * 又回到「图标点了没反应」的老问题。判据是 ownsUserFocus()：
   * 顶层文档的 activeElement 是那个 <iframe> 元素时，顶层闭嘴。
   *
   * ⚠️ **只在状态真的变了才发**：焦点事件与 pointerdown 很密（每点一下页面
   * 就来一次），每次都发一条等于每次都唤醒一次 service worker、
   * 让 background 写一次 storage.session —— 那个写入有配额上限，
   * 配额用满之后写入**静默**失败，焦点记录就此停在旧 frame 上，
   * 点工具栏图标会打到一个用户根本没在看的 frame（「图标点了没反应」）。
   *
   * 「变了」有两个含义，缺一不可：
   * - 焦点的归属变了（这一层重新拿到焦点）；
   * - 消息的内容变了（这一层的视频没了/换了/换了倍速）——
   *   background 靠「没有倍速」这条消息复位标题（见 background 的焦点消息分支）。
   */
  private reportFocus() {
    const owns = ownsUserFocus();

    if (!owns) {
      // 焦点不在我这儿：之前那条「焦点在我这儿」的记录作废 ——
      // 下次焦点回到我这儿时必须**重新**上报，否则 background 记的
      // 仍是那个已经失去焦点的 frame。
      this.releaseFocus();
      return;
    }

    const video = this.registry.getCurrentVideo();
    const rate = video ? video.playbackRate : null;

    if (this.focusReported && !this.focusRecordStale && this.lastFocusRate === rate) {
      // 状态没变 → 不写。
      return;
    }

    this.focusReported = true;
    this.focusRecordStale = false;
    this.lastFocusRate = rate;
    this.startFocusWatch();

    try {
      const message: FrameFocusMessage = {
        type: FRAME_FOCUS_MESSAGE,
        // 顺带带上此刻的倍速：焦点在 frame A 与 frame B 之间移动时，
        // 标题该跟着换（少了这个字段，标题会停在上一个 frame 的值上）。
        // 没有视频时是 undefined —— background 据此判断「**这一层**此刻
        // 没有受控视频」，并在与「报出这个倍速的就是这一层」对上时把标题复位。
        // ⚠️ 别写回「background 保留原来的读数」：那是 6.2.0 之前的旧行为，
        // 现在视频没了就该把读数收回去，否则标题会一直挂着上一次的倍速。
        ...(video ? { rate: video.playbackRate } : {}),
      };
      void chrome.runtime?.sendMessage?.(message)?.catch?.((error: unknown) =>
        this.handleSendFailure(error, () => {
          // 没报成就不算报过：下一次机会补报，别让记录停在旧 frame 上。
          this.focusReported = false;
          this.focusRecordStale = true;
        }),
      );
    } catch (error) {
      this.focusReported = false;
      this.focusRecordStale = true;
      this.handleSendFailure(error);
    }
  }

  /**
   * 焦点离开了这个 frame：之前那条记录作废。
   *
   * 什么时候会走到这里：
   * - 焦点移到了浏览器界面上（点工具栏图标）→ window 的 blur；
   * - 焦点移到了子 frame 里 → 顶层文档收不到 focusout，靠巡检发现
   *   （见 FOCUS_WATCH_INTERVAL_MS 的说明）。
   */
  private releaseFocus() {
    this.focusReported = false;
    this.lastFocusRate = null;
    this.stopFocusWatch();
  }

  /**
   * 焦点归属的巡检。
   *
   * 只在我们**以为自己拥有焦点**的时候才跑 —— 巡检要回答的问题是
   * 「我还拥有焦点吗」，而我们不拥有焦点时这件事根本不必问。
   */
  private startFocusWatch() {
    if (this.focusWatchTimer !== null) {
      return;
    }

    this.focusWatchTimer = window.setInterval(() => {
      if (!ownsUserFocus()) {
        this.releaseFocus();
        return;
      }

      // 顺带看一眼上下文还活着吗：扩展被更新/重载之后，
      // 这一层就变成了「消息发不出去、界面还在动」的僵尸。
      this.checkContextAlive();
    }, FOCUS_WATCH_INTERVAL_MS);
  }

  private stopFocusWatch() {
    if (this.focusWatchTimer === null) {
      return;
    }

    window.clearInterval(this.focusWatchTimer);
    this.focusWatchTimer = null;
  }

  /**
   * 一条消息没发出去。
   *
   * @param error 失败的原因
   * @param onRetry 补救动作（把「已经报过」的本地状态退回去，好让下一次机会补报）
   */
  private handleSendFailure(error: unknown, onRetry?: () => void) {
    onRetry?.();

    // ⚠️ 失败不能是静默的：一条没发出去的消息意味着 background 那边的
    // 记录可能是旧的，而「图标点了没反应」是最难查的一类问题。
    console.warn('[Video Speed Controller] 消息发送失败，扩展上下文可能已失效', error);

    // 最常见的原因就是上下文失效（扩展被更新/重载）。
    this.checkContextAlive();
  }

  /**
   * 扩展上下文还活着吗。
   *
   * ⚠️ MV3 的扩展被更新/重载之后，**已经打开的标签页不会重新注入内容脚本**：
   * 老的内容脚本还在跑（DOM 节点、事件监听、按键拦截都还在），
   * 但 chrome.runtime 上下文已经死了 —— 消息发不出去，
   * background 往这个 frame 发消息也无人应答。
   *
   * 于是用户看到的是「点了图标毫无反应」，而他能得出的唯一结论是
   * 「扩展坏了」。这比扩展真的坏还糟：扩展其实好好的，只是这一页没刷新。
   */
  private checkContextAlive() {
    if (this.contextInvalidated) {
      return;
    }

    if (!this.isContextInvalidated()) {
      return;
    }

    this.handleContextInvalidation();
  }

  /**
   * 上下文是否已经失效。
   *
   * 判据是 `chrome.runtime.id` 变成 undefined —— 这是扩展被更新/重载之后
   * 老内容脚本的经典症状（同一个上下文里所有 chrome.* 调用都会抛
   * "Extension context invalidated."）。
   *
   * ⚠️ 必须与「启动时有没有 id」一起看：测试替身与某些沙箱里
   * chrome.runtime **本来就没有 id**，那不是「刚刚失效」。
   */
  private isContextInvalidated(): boolean {
    if (this.contextInvalidated) {
      return true;
    }

    if (!this.hadRuntimeId) {
      return false;
    }

    return typeof chrome === 'undefined' || chrome.runtime?.id === undefined;
  }

  /**
   * 上下文失效了：把这一页上的我们撤干净，并告诉用户真相。
   *
   * ⚠️ 只做一次：同一次失效说两遍 = 用户看到两条一样的提示，
   * 而这层页面可能同时有几十个 frame 在说。
   */
  private handleContextInvalidation() {
    if (this.contextInvalidated) {
      return;
    }

    this.contextInvalidated = true;

    // 1) 撤掉我们注入页面的一切。
    //
    //    它们此刻都是「僵尸 UI」：读数不会再更新（消息发不出去了），
    //    却还占着页面的位置；更糟的是键盘控制器还在拦按键 ——
    //    一个会抢键、却什么反馈都给不了的扩展，比没有扩展更糟。
    this.stop();

    // 2) 给用户一句明确的话。
    this.showExtensionStaleNotice();
  }

  /**
   * 「扩展已更新，请刷新本页」。
   *
   * ⚠️ 它自己就是一个 live region（role=status + aria-live=polite）：
   * 共享的 #vsc-live-region 刚刚被拆掉了，而读屏用户仍然需要听到这句话 ——
   * 否则对他们来说，扩展就是「突然不说话了」，比不提示更糟。
   *
   * ⚠️ 节点先建好、**内容后填**：aria-live 的通行要求是「区域先存在、
   * 内容后变」，带着内容插入的节点有些读屏器不会播报。
   */
  private showExtensionStaleNotice() {
    if (!document.body) {
      return;
    }

    if (document.getElementById(EXTENSION_STALE_NOTICE_ID)) {
      // 同一层页面只说一次。
      return;
    }

    const root = document.createElement('div');
    root.id = EXTENSION_STALE_NOTICE_ID;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    isolateNotice(root, EXTENSION_STALE_NOTICE_STYLES);
    // 挂到 <html>：body 带 transform 时 fixed 会相对 body 的盒子定位，
    // 这条提示就会跑到视口之外（用户滚到页面中间就看不见它了）。
    // 详见 viewportRoot.ts。
    mountViewportRoot(root);
    showNotice(root, 'vsc-visible');

    root.textContent = t('extensionUpdated', '扩展已更新，请刷新本页');
  }

  /**
   * 「我这一层没有可接管的目标」—— 问一圈别的 frame 有没有视频。
   *
   * 实测（真实 Chromium）：页面上唯一的视频在嵌入框里、而焦点在顶层时，
   * 顶层按 `=`/`f` **什么都不会发生** —— 键穿透给了页面，页面没有绑定。
   * 用户能得出的唯一结论是「扩展坏了」。
   *
   * 于是这里去问 background：别的 frame 有视频就说出来（「视频在嵌入框里」）。
   *
   * ⚠️ 只**说明**，不替用户去动别的 frame 的视频：「焦点决定作用对象」
   * 这条规则不能破 —— 抢了就动错了视频。
   */
  private async notifyNoVideoHere() {
    const now = Date.now();
    if (now - this.lastNoVideoQueryAt < NO_VIDEO_QUERY_INTERVAL_MS) {
      return;
    }
    if (now - this.lastNoVideoHintAt < NO_VIDEO_HINT_INTERVAL_MS) {
      // 刚说过「视频在嵌入框里」—— 一分钟之内不重复说。
      return;
    }

    // 已经有一个查询在路上了：并发问没有意义，白白多一次跨进程往返。
    if (this.noVideoQueryPending) {
      return;
    }
    this.noVideoQueryPending = true;
    this.lastNoVideoQueryAt = now;

    try {
      const response = await chrome.runtime?.sendMessage?.({ type: VIDEO_OWNER_QUERY_MESSAGE });

      if (typeof response !== 'object' || response === null) {
        // 没问出结果（background 没答 / 扩展刚被重载）→ 不消耗任何窗口：
        // 一次丢失的查询不该让接下来的一分钟都闷着。
        return;
      }

      const frameId = (response as { frameId?: unknown }).frameId;

      if (typeof frameId !== 'number') {
        // 别的 frame 也没有视频 → 什么都不说（没有话说就别打扰）。
        //
        // ⚠️ 这里**不**消耗提示节流：这个答案可能是错的（那个 frame 的内容
        // 脚本还没就绪），闷住一分钟就等于把「视频确实在别处」时最需要的那句
        // 提示也一起闷掉了。查询节流（2 秒）已经够防刷了。
        return;
      }

      this.lastNoVideoHintAt = Date.now();
      this.takeoverNotice.showVideoElsewhere();
    } catch (error) {
      // 扩展被更新/重载后上下文会失效；问不到就什么都不说。
      this.handleSendFailure(error);
    } finally {
      this.noVideoQueryPending = false;
    }
  }

  /** 控制条选中档位（见 SPEED_CHANGE_EVENT）：走和键盘调速完全相同的反馈链路。 */
  private handleSpeedChange(event: Event) {
    const detail = (event as CustomEvent<{ rate?: unknown; video?: unknown }>).detail;
    const rate = detail?.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      return;
    }

    const video = detail.video instanceof HTMLVideoElement
      ? detail.video
      : this.getCurrentVideo();
    if (!video) {
      return;
    }

    // ⚠️ 不在这里调 reportSpeed：胶囊会把「倍速变了」统一回调回来
    // （onRateChange），两处各调一次就是同一次调速被记成两次上报。
    this.speedToast.show(rate, video);
  }

  async start() {
    installRuntimeStyles();

    // 读屏通道要**先存在、内容后变** —— 这是 aria-live 的通行要求。
    // 惰性创建的话，第一次调速时是「插入一个带内容的节点」，部分读屏器
    // 不会播报首条内容。而那条首条恰恰是整个产品对读屏用户最重要的确认。
    prepareLiveRegion();
    if (document.readyState === 'loading') {
      // document_start 时 body 可能还不存在，DOMContentLoaded 之后再补一次。
      document.addEventListener('DOMContentLoaded', this.boundPrepareLiveRegion, { once: true });
    }

    // ⚠️ 消息监听必须**第一个**注册。
    //
    // 6.1.0 之后每个 frame 各自跑一份运行时，于是「这个标签页的视频在哪儿」
    // 只能靠 background 广播问一圈。而广播是**一发**（chrome.tabs.sendMessage
    // 不会重播）：某个 frame 当时还没注册好监听器，就永远收不到这一次的提问。
    //
    // 之前监听器排在最后（await loadSettings() 与三个 start() 之后），
    // 机器一忙（多标签页同时加载）就答不上来 —— 120ms 的预算耗尽、零份回答，
    // 于是「图标点了没反应」「按了没反应」在慢机器上重新出现。
    //
    // 提前注册之后，监听器只依赖注册表与全屏控制器（两者此刻都已就绪），
    // 不依赖 settings —— 提前注册是安全的。
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(this.boundHandleMessage);
    }

    // 控制条与运行时之间只有这一条线：控制条只管把「倍速变了」派发到
    // document 上，谁关心谁订阅（见 SPEED_CHANGE_EVENT 的说明）。
    document.addEventListener(SPEED_CHANGE_EVENT, this.boundHandleSpeedChange);

    // 焦点在哪 → background 才知道点图标时该发给谁。
    window.addEventListener('focus', this.boundReportFocus);
    document.addEventListener('focusin', this.boundReportFocus, true);
    document.addEventListener('pointerdown', this.boundReportFocus, true);

    // 焦点离开页面（用户点去了浏览器界面）：焦点记录作废，
    // 顺带看一眼扩展上下文还活着吗。
    //
    // ⚠️ 这条检查是为了「点工具栏图标没反应」那个症状准备的：
    // 点图标的那一刻焦点正好离开页面，而扩展若在此之前被更新/重载过，
    // 这一页已经是个发不出消息的僵尸 —— 用户看到的只有「毫无反应」。
    window.addEventListener('blur', this.boundHandleWindowBlur);

    try {
      this.settings = await loadSettings();
    } catch (error) {
      console.error('Video Speed Controller failed to load settings, using defaults', error);
      this.settings = createDefaultSettings();
    }

    // 6.0.7 删掉了站点速度记忆。顺手清掉老用户机器上残留的那份访问记录：
    // 失败无所谓——它只是一份没人再读的历史数据，不该因此打断启动。
    void purgeLegacySiteSpeeds().catch(() => {});

    this.unsubscribeSettings = subscribeToSettings((settings) => {
      this.settings = settings;
      // 绑定变了，正在跑的长按重复必须停掉 —— 否则松开按键时
      // keyup 匹配不上新绑定，重复定时器会一直跑到页面销毁。
      this.keyboardController.onSettingsChanged();
    });
    this.registry.start();
    this.keyboardController.start();
    // 引导的触发完全靠 media 事件，与键盘控制器无关；放在这里是因为它必须
    // 等 settings 落地，否则会照着默认绑定渲染出一条错误的提示。
    this.firstRunHint.start();

    // 启动时就把「我在哪儿」和「我这儿几倍」报上去：
    // 用户点完图标去看别的标签页是很常见的节奏，那时 background 已经
    // 记下了正确的 frame 与倍速。
    this.reportFocus();
    this.reportSpeed(this.getCurrentVideo()?.playbackRate ?? 1);
  }

  stop() {
    // ⚠️ 幂等：上下文失效时我们会先 stop() 一次（撤掉僵尸 UI），
    // 而内容脚本卸载时还会再 stop() 一次 —— 第二次必须是空操作，
    // 否则会把「刚建好的失效提示」也一起拆掉。
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;

    document.removeEventListener(SPEED_CHANGE_EVENT, this.boundHandleSpeedChange);
    document.removeEventListener('DOMContentLoaded', this.boundPrepareLiveRegion);
    window.removeEventListener('focus', this.boundReportFocus);
    document.removeEventListener('focusin', this.boundReportFocus, true);
    document.removeEventListener('pointerdown', this.boundReportFocus, true);
    window.removeEventListener('blur', this.boundHandleWindowBlur);

    this.stopFocusWatch();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.removeListener(this.boundHandleMessage);
    }

    this.keyboardController.stop();
    this.firstRunHint.destroy();
    this.fullscreenController.destroy();
    this.registry.stop();
    this.speedToast.destroy();
    destroyLiveRegion();
    this.takeoverNotice.destroy();

    // ⚠️ 最后才摘样式：上面那些 destroy() 都还在用这些 class 做清理，
    // 提前摘掉会让「撤掉节点」变成一个看不见的瞬时闪动。
    //
    // ⚠️ 而「扩展已更新」提示**不依赖**这段样式 —— 它用自己的 inline
    // `!important` 底座（isolateNotice），所以摘掉不会让那句提示变得不可见。
    uninstallRuntimeStyles();
  }

  /** background 消息：工具栏图标点击 -> 切换当前标签页的网页全屏。 */
  private handleMessage(message: unknown, sendResponse: (response: unknown) => void) {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const { type } = message as { type?: unknown };
    if (type === TOGGLE_FULLSCREEN_MESSAGE) {
      const video = this.getCurrentVideo();

      // 工具栏图标是扩展**唯一**看得见的入口：点了却毫无反应，用户能得出的
      // 唯一结论就是「扩展坏了」。键盘路径有 notifyTakeoverUnavailable 兜底，
      // 图标路径原本什么都没有 —— 这里补上。
      if (!this.fullscreenController.isActive() && !this.fullscreenController.canEnter(video)) {
        if (video) {
          // 视频在，但接管不了（跨 document 等）。
          this.takeoverNotice.show(video);
        } else {
          // 页面上压根没有视频。
          this.takeoverNotice.showNoVideo();
        }

        sendResponse({ ok: false, active: false });
        return;
      }

      this.toggleFullscreenFor(video);
      // toggle() 进入和退出都返回 true，所以这里回报真实状态而不是返回值。
      sendResponse({ ok: true, active: this.fullscreenController.isActive() });
      return;
    }

    if (type === VIDEO_OWNER_ASK_MESSAGE) {
      // background 在问「你们谁有视频？」。如实回答自己这一层的情况。
      //
      // ⚠️ 回答**推迟一个微任务**：注册表的候选列表按 DOM 变更失效，
      // 而失效通知（MutationObserver）也是微任务 —— 站点刚插进来的
      // `<video>` 若在同一个任务里插入，直接回答就会用**上一帧的快照**
      // 说出「我没有视频」。晚一个微任务，答案才是真的。
      void Promise.resolve().then(() => this.reportVideoOwner());
    }
  }

  /**
   * 回答 background 的「你们谁有视频？」。
   *
   * 两个信号都报，因为两条路径的契约不同：显式操作（点图标）用 explicit，
   * 快捷键用 watched —— 后者更严（页面里可能有个小预告视频能接管，
   * 却不是用户正在看的那个）。
   */
  private reportVideoOwner() {
    const current = this.registry.getCurrentVideo();
    const watched = this.registry.getWatchedTarget();
    const video = watched?.video ?? current;

    try {
      const message: VideoOwnerReportMessage = {
        type: VIDEO_OWNER_REPORT_MESSAGE,
        explicit: current !== null,
        watched: watched !== null,
        playing: video ? !video.paused : false,
      };
      void chrome.runtime?.sendMessage?.(message)?.catch?.((error: unknown) =>
        this.handleSendFailure(error),
      );
    } catch (error) {
      // 扩展被重载后上下文会失效，答不上来就算了。
      this.handleSendFailure(error);
    }
  }
}
