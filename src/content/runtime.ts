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
  private readonly boundHandleRateChange = (event: Event) => this.handleRateChange(event);
  private readonly boundHandlePlay = (event: Event) => this.handlePlay(event);
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

    try {
      await this.siteSpeedMemory.load();
    } catch (error) {
      console.error('Video Speed Controller failed to load site speed memory', error);
    }

    this.unsubscribeSettings = subscribeToSettings((settings) => {
      this.settings = settings;
    });
    // HUD 与悬停胶囊同处视频左上角且内容重叠：HUD 可见期间胶囊让位，消失后恢复。
    this.speedHud.onVisibilityChange = () => this.targetIndicator.refresh();
    this.registry.start();
    this.keyboardController.start();
    this.targetIndicator.start();
    document.addEventListener('ratechange', this.boundHandleRateChange, true);
    document.addEventListener('play', this.boundHandlePlay, true);

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
  private handlePlay(event: Event) {
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    if (!this.settings.siteSpeedMemory || !this.siteSpeedMemory.isLoaded()) {
      return;
    }

    const hostname = window.location.hostname;
    if (this.siteSpeedMemory.isDisabled(hostname)) {
      return;
    }

    const video = event.target;
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
  private handleRateChange(event: Event) {
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    const video = event.target;
    this.reportSpeed(video.playbackRate);

    if (!this.settings.siteSpeedMemory || !this.siteSpeedMemory.isLoaded()) {
      return;
    }

    const hostname = window.location.hostname;
    if (this.siteSpeedMemory.isDisabled(hostname)) {
      return;
    }

    if (video === this.getCurrentVideo()) {
      this.siteSpeedMemory.remember(hostname, video.playbackRate);
    }
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
        this.siteSpeedMemory.remember(window.location.hostname, rate);
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
