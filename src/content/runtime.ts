import { loadSettings, subscribeToSettings } from '../shared/settings';
import {
  DEFAULT_SHORTCUTS,
  PersistedSettings,
  TOGGLE_FULLSCREEN_MESSAGE,
} from '../shared/types';
import { FullscreenController } from './fullscreenController';
import { KeyboardController } from './keyboardController';
import { installRuntimeStyles } from './runtimeStyles';
import { SiteSpeedMemory } from './siteSpeedMemory';
import { SpeedToast } from './speedToast';
import { VideoRegistry } from './videoRegistry';

const createDefaultSettings = (): PersistedSettings => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
});

const logEventHandlerError = (error: unknown) => {
  console.error('Video Speed Controller failed to handle a video event', error);
};

export class ContentRuntime {
  private readonly registry = new VideoRegistry();
  private readonly fullscreenController = new FullscreenController();
  private readonly speedToast = new SpeedToast();
  private readonly siteSpeedMemory = new SiteSpeedMemory();
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
  });
  private settings: PersistedSettings = createDefaultSettings();
  private unsubscribeSettings: (() => void) | null = null;
  /** start() 同步赋值、只会 resolve：启动窗口内触发的事件等它落地再判定，而不是被永久丢弃。 */
  private ready: Promise<void> | null = null;
  private readonly boundHandleRateChange = (event: Event) => {
    void this.handleRateChange(event).catch(logEventHandlerError);
  };
  private readonly boundHandlePlay = (event: Event) => {
    void this.handlePlay(event).catch(logEventHandlerError);
  };
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

    // 同步赋值：两段加载各自 try/catch，ready 只会 resolve。
    this.ready = (async () => {
      try {
        this.settings = await loadSettings();
      } catch (error) {
        console.error('Video Speed Controller failed to load settings, using defaults', error);
        this.settings = createDefaultSettings();
      }

      try {
        await this.siteSpeedMemory.load();
      } catch (error) {
        console.error('Video Speed Controller failed to load site speed memory', error);
      }
    })();

    // 监听器必须先于上面两段 await 注册：content script 在 document_start 注入，
    // 页面可能已经触发 play，等加载完再挂就永久漏掉了。
    document.addEventListener('ratechange', this.boundHandleRateChange, true);
    document.addEventListener('play', this.boundHandlePlay, true);

    await this.ready;

    this.unsubscribeSettings = subscribeToSettings((settings) => {
      this.settings = settings;
    });
    this.registry.start();
    this.keyboardController.start();

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(this.boundHandleMessage);
    }
  }

  stop() {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    document.removeEventListener('ratechange', this.boundHandleRateChange, true);
    document.removeEventListener('play', this.boundHandlePlay, true);

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.removeListener(this.boundHandleMessage);
    }

    this.keyboardController.stop();
    this.fullscreenController.destroy();
    this.registry.stop();
    this.speedToast.destroy();
    this.siteSpeedMemory.destroy();
  }

  /** 视频开始播放时，若站点有记忆速度且当前是 1x，则自动恢复（绝不与用户显式设置冲突）。 */
  private async handlePlay(event: Event) {
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    const video = event.target;
    // 读侧与写侧共用同一套"当前视频"口径：广告位/悬停预览等自动播放的视频不吃记忆速度。
    const current = this.getCurrentVideo();
    if (current && video !== current) {
      return;
    }

    if (!this.siteSpeedMemory.isLoaded()) {
      // 启动窗口内的事件等 ready 落地再判定，不因"还没加载完"被永久丢弃。
      await this.ready;
    }

    if (!this.siteSpeedMemory.isLoaded()) {
      return;
    }

    if (Math.abs(video.playbackRate - 1) > 1e-6) {
      return;
    }

    const remembered = this.siteSpeedMemory.getSpeed(window.location.hostname);
    if (remembered === null || Math.abs(remembered - 1) < 1e-6) {
      return;
    }

    video.playbackRate = remembered;
  }

  /** 任何速度变化：把主视频的速度同步进站点记忆。 */
  private async handleRateChange(event: Event) {
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    const video = event.target;
    // 非当前视频（广告、预览）的速度变化不入库。
    const current = this.getCurrentVideo();
    if (current && video !== current) {
      return;
    }

    if (!this.siteSpeedMemory.isLoaded()) {
      await this.ready;
    }

    if (!this.siteSpeedMemory.isLoaded()) {
      return;
    }

    this.siteSpeedMemory.remember(window.location.hostname, video.playbackRate);
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
