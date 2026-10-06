import {
  loadSettings,
  purgeLegacySiteSpeeds,
  subscribeToSettings,
} from '../shared/settings';
import {
  DEFAULT_SHORTCUTS,
  PersistedSettings,
  TOGGLE_FULLSCREEN_MESSAGE,
} from '../shared/types';
import { FullscreenController } from './fullscreenController';
import { createFirstRunHint, FirstRunHint } from './firstRunHint';
import { KeyboardController } from './keyboardController';
import { installRuntimeStyles } from './runtimeStyles';
import { SpeedToast } from './speedToast';
import { TakeoverNotice } from './takeoverNotice';
import { VideoRegistry } from './videoRegistry';

const createDefaultSettings = (): PersistedSettings => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
});

export class ContentRuntime {
  private readonly registry = new VideoRegistry();
  private readonly fullscreenController = new FullscreenController();
  private readonly speedToast = new SpeedToast();
  private readonly takeoverNotice = new TakeoverNotice();
  private readonly firstRunHint: FirstRunHint = createFirstRunHint(() => this.settings.shortcuts);
  private readonly keyboardController = new KeyboardController({
    getSettings: () => this.settings,
    getCurrentVideo: () => this.getCurrentVideo(),
    isFullscreenActive: () => this.fullscreenController.isActive(),
    canToggleFullscreen: (video) => this.fullscreenController.canEnter(video),
    toggleFullscreen: (video) => {
      const next = this.fullscreenController.toggle(video);
      this.registry.setFullscreenVideo(this.fullscreenController.getActiveVideo());
      return next;
    },
    exitFullscreen: () => {
      this.fullscreenController.exit();
      this.registry.setFullscreenVideo(null);
    },
    // 全屏内外都给一次性提示：控制条鼠标静止 3 秒就隐藏，键盘调速时它
    // 往往不在屏幕上，不能指望它承担反馈。toast 约 1 秒后自行消失。
    showSpeedFeedback: (rate, video) => this.speedToast.show(rate, video),
    notifyTakeoverUnavailable: (video) => this.takeoverNotice.show(video),
  });
  private settings: PersistedSettings = createDefaultSettings();
  private unsubscribeSettings: (() => void) | null = null;
  private readonly boundHandleMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => this.handleMessage(message, sendResponse);

  private getCurrentVideo() {
    return this.fullscreenController.getActiveVideo() ?? this.registry.getCurrentVideo();
  }

  async start() {
    installRuntimeStyles();

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

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.removeListener(this.boundHandleMessage);
    }

    this.keyboardController.stop();
    this.firstRunHint.destroy();
    this.fullscreenController.destroy();
    this.registry.stop();
    this.speedToast.destroy();
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
      this.fullscreenController.toggle(video);
      this.registry.setFullscreenVideo(this.fullscreenController.getActiveVideo());
      // toggle() 进入和退出都返回 true，所以这里回报真实状态而不是返回值。
      sendResponse({ ok: true, active: this.fullscreenController.isActive() });
    }
  }
}
