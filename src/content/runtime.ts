import { loadSettings, subscribeToSettings } from '../shared/settings';
import {
  DEFAULT_MAX_SPEED,
  DEFAULT_PRESET_SPEEDS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SITE_SPEED_MEMORY,
  DEFAULT_SPACE_TOGGLE_PLAY,
  GET_STATE_MESSAGE,
  PersistedSettings,
  RESET_SPEED_MESSAGE,
  SPEED_CHANGED_MESSAGE,
} from '../shared/types';
import { FullscreenController } from './fullscreenController';
import { KeyboardController } from './keyboardController';
import { applyPresetSpeed, resetPlaybackRate } from './playback';
import { installRuntimeStyles } from './runtimeStyles';
import { SiteSpeedMemory } from './siteSpeedMemory';
import { SpeedHud } from './speedHud';
import { TargetIndicator } from './targetIndicator';
import { VideoRegistry } from './videoRegistry';

const createDefaultSettings = (): PersistedSettings => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
  presetSpeeds: [...DEFAULT_PRESET_SPEEDS],
  spaceTogglePlay: DEFAULT_SPACE_TOGGLE_PLAY,
  maxSpeed: DEFAULT_MAX_SPEED,
  siteSpeedMemory: DEFAULT_SITE_SPEED_MEMORY,
});

const logEventHandlerError = (error: unknown) => {
  console.error('Video Speed Controller failed to handle a video event', error);
};

export class ContentRuntime {
  private readonly registry = new VideoRegistry();
  private readonly fullscreenController = new FullscreenController();
  private readonly speedHud = new SpeedHud();
  private readonly siteSpeedMemory = new SiteSpeedMemory();
  private readonly keyboardController = new KeyboardController({
    getSettings: () => this.settings,
    getCurrentVideo: () => this.getCurrentVideo(),
    isFullscreenActive: () => this.fullscreenController.isActive(),
    toggleFullscreen: (video) => {
      const next = this.fullscreenController.toggle(video);
      this.registry.setFullscreenVideo(this.fullscreenController.getActiveVideo());
      return next;
    },
    exitFullscreen: () => {
      this.fullscreenController.exit();
      this.registry.setFullscreenVideo(null);
    },
    showSpeedHud: (rate, video) => this.speedHud.showRate(rate, video),
    showPlaybackState: (playing, video) => this.speedHud.showPlayback(playing, video),
  });
  private readonly targetIndicator = new TargetIndicator(
    () => this.getCurrentVideo(),
    () => this.speedHud.isVisible(),
  );
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

  /** 是否可以读写站点速度记忆：功能开启 + 已加载完成 + 该站点未被禁用。 */
  private shouldRecordMemory(hostname: string) {
    return this.settings.siteSpeedMemory
      && this.siteSpeedMemory.isLoaded()
      && !this.siteSpeedMemory.isDisabled(hostname);
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
    // HUD 与悬停胶囊同处视频左上角且内容重叠：HUD 可见期间胶囊让位，消失后恢复。
    this.speedHud.onVisibilityChange = () => this.targetIndicator.refresh();
    this.registry.start();
    this.keyboardController.start();
    this.targetIndicator.start();

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
    this.speedHud.destroy();
    this.targetIndicator.destroy();
    this.siteSpeedMemory.destroy();
  }

  /** 视频开始播放时，若站点有记忆速度且当前是 1x，则自动恢复（绝不与用户显式设置冲突）。 */
  private async handlePlay(event: Event) {
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    const video = event.target;
    // 读侧与写侧共用同一套"当前视频"口径：广告位/悬停预览等自动播放的视频不吃记忆速度。
    // 注意 ratechange/play 不跨 iframe 文档边界，而 getCurrentVideo 会遍历同源 iframe，两者范围本就不一致。
    const current = this.getCurrentVideo();
    if (current && video !== current) {
      return;
    }

    const hostname = window.location.hostname;
    if (!this.siteSpeedMemory.isLoaded()) {
      // 启动窗口内的事件等 ready 落地再判定，不因"还没加载完"被永久丢弃。
      await this.ready;
    }

    if (!this.shouldRecordMemory(hostname)) {
      return;
    }

    if (Math.abs(video.playbackRate - 1) > 1e-6) {
      return;
    }

    const remembered = this.siteSpeedMemory.getSpeed(hostname);
    if (remembered === null || Math.abs(remembered - 1) < 1e-6) {
      return;
    }

    applyPresetSpeed(video, remembered, this.settings.maxSpeed);
    this.reportSpeed(video.playbackRate);
  }

  /** 任何速度变化：更新 badge；主视频的速度变化同步进站点记忆。 */
  private async handleRateChange(event: Event) {
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    const video = event.target;
    // 先判归属再干活：徽章按 tab 覆盖，非当前视频的速度变化既不上报也不入库。
    const current = this.getCurrentVideo();
    if (current && video !== current) {
      return;
    }

    this.reportSpeed(video.playbackRate);

    const hostname = window.location.hostname;
    if (!this.siteSpeedMemory.isLoaded()) {
      await this.ready;
    }

    if (!this.shouldRecordMemory(hostname)) {
      return;
    }

    this.siteSpeedMemory.remember(hostname, video.playbackRate);
  }

  /** popup 消息：查询状态 / 重置速度。 */
  private handleMessage(message: unknown, sendResponse: (response: unknown) => void) {
    if (typeof message !== 'object' || message === null) {
      return;
    }

    const { type } = message as { type?: unknown };

    if (type === GET_STATE_MESSAGE) {
      const video = this.getCurrentVideo();
      sendResponse({
        speed: video ? video.playbackRate : 1,
        playing: video ? !video.paused : false,
        hostname: window.location.hostname,
        hasVideo: video !== null,
      });
      return;
    }

    if (type === RESET_SPEED_MESSAGE) {
      const video = this.getCurrentVideo();
      if (video) {
        const rate = resetPlaybackRate(video);
        this.speedHud.showRate(rate, video);
        this.reportSpeed(rate);
        // 记忆未加载成功时 speeds 是空 Map，remember(1) 走 delete 分支再整表覆盖写回，
        // 会把用户所有站点的记忆一次性清空，所以守卫必须留在 runtime 侧。
        const hostname = window.location.hostname;
        if (this.shouldRecordMemory(hostname)) {
          this.siteSpeedMemory.remember(hostname, rate);
        }
      }
      sendResponse({ ok: true });
    }
  }

  private reportSpeed(rate: number) {
    if (typeof chrome === 'undefined' || chrome.runtime?.sendMessage === undefined) {
      return;
    }

    try {
      void chrome.runtime.sendMessage({ type: SPEED_CHANGED_MESSAGE, speed: rate });
    } catch {
      // Best effort.
    }
  }
}
