import {
  loadSettings,
  purgeLegacySiteSpeeds,
  subscribeToSettings,
} from '../shared/settings';
import {
  DEFAULT_SHORTCUTS,
  PersistedSettings,
  SPEED_CHANGE_EVENT,
  SPEED_REPORT_MESSAGE,
  TOGGLE_FULLSCREEN_MESSAGE,
} from '../shared/types';
import { FullscreenController } from './fullscreenController';
import { createFirstRunHint, FirstRunHint } from './firstRunHint';
import { KeyboardController } from './keyboardController';
import { destroyLiveRegion } from './liveRegion';
import { installRuntimeStyles } from './runtimeStyles';
import { SpeedToast } from './speedToast';
import { TakeoverNotice } from './takeoverNotice';
import { VideoRegistry } from './videoRegistry';

const createDefaultSettings = (): PersistedSettings => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
});

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
  private readonly speedToast = new SpeedToast();
  private readonly takeoverNotice = new TakeoverNotice();
  private readonly firstRunHint: FirstRunHint = createFirstRunHint(() => this.settings.shortcuts);
  private readonly keyboardController: KeyboardController;
  private settings: PersistedSettings = createDefaultSettings();

  constructor(options: ContentRuntimeOptions = {}) {
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
      this.fullscreenController.exit();
      this.registry.setFullscreenVideo(null);
    },
    // 全屏内外都给一次性提示：控制条鼠标静止 3 秒就隐藏，键盘调速时它
    // 往往不在屏幕上，不能指望它承担反馈。toast 约 1 秒后自行消失。
    showSpeedFeedback: (rate, video) => {
      this.speedToast.show(rate, video);
      this.reportSpeed(rate);
    },
    notifyTakeoverUnavailable: (video) => this.takeoverNotice.show(video),
    ...(options.isTrustedEvent ? { isTrustedEvent: options.isTrustedEvent } : {}),
  });
  }
  private unsubscribeSettings: (() => void) | null = null;
  /** 上一次上报给 background 的倍速（去重用，见 reportSpeed）。 */
  private lastReportedRate: number | null = null;
  private readonly boundHandleMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => this.handleMessage(message, sendResponse);
  private readonly boundHandleSpeedChange = (event: Event) => this.handleSpeedChange(event);

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
    const next = this.fullscreenController.toggle(video, options);
    this.registry.setFullscreenVideo(this.fullscreenController.getActiveVideo());

    // 进全屏后控制条上就写着倍速，角标是重复信息，先撤掉。
    // 放在这里是为了同时覆盖「键盘 f」和「点工具栏图标」两条进入路径。
    if (this.fullscreenController.isActive()) {
      this.speedToast.dismissBadge();
    }

    return next;
  }

  /**
   * 把倍速告诉 background —— 工具栏图标的标题要显示它。
   *
   * 只在值真的变了时发：连按调速每次都会走到这里，但倍率到顶之后就不变了，
   * 重复发只是白白唤醒一次 service worker。
   */
  private reportSpeed(rate: number) {
    if (this.lastReportedRate === rate) {
      return;
    }

    this.lastReportedRate = rate;

    try {
      void chrome.runtime?.sendMessage?.({ type: SPEED_REPORT_MESSAGE, rate })?.catch?.(() => {});
    } catch {
      // 扩展被更新/重载后上下文会失效，此时 sendMessage 直接抛异常。
      // 页面里残留的内容脚本不该因此崩掉。
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

    this.speedToast.show(rate, video);
    this.reportSpeed(rate);
  }

  async start() {
    installRuntimeStyles();

    // 控制条与运行时之间只有这一条线：控制条只管把「倍速变了」派发到
    // document 上，谁关心谁订阅（见 SPEED_CHANGE_EVENT 的说明）。
    document.addEventListener(SPEED_CHANGE_EVENT, this.boundHandleSpeedChange);

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

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(this.boundHandleMessage);
    }
  }

  stop() {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;

    document.removeEventListener(SPEED_CHANGE_EVENT, this.boundHandleSpeedChange);

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
    }
  }
}
