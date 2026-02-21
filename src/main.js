/**
 * Video & Audio Speed Controller - 主入口
 * @module main
 */

import { loadShortcutSettings, onShortcutsChanged } from "./utils/storage.js";
import { ensureMatchesPolyfill } from "./utils/dom.js";
import { MediaDetector } from "./modules/mediaDetector.js";
import { SpeedIndicator } from "./modules/indicator.js";
import { LightboxManager } from "./modules/lightbox.js";
import { PlaybackController } from "./modules/playbackController.js";
import { KeyboardHandler } from "./modules/keyboardHandler.js";
import { speedProfileManager } from "./modules/speedProfile.js";
import { playbackHistory } from "./modules/playbackHistory.js";
import { videoPositionMemory } from "./modules/videoPosition.js";

/**
 * 主应用类
 */
class VideoSpeedController {
  constructor() {
    this.shortcuts = {};
    this.mediaDetector = null;
    this.indicator = null;
    this.lightboxManager = null;
    this.playbackController = null;
    this.keyboardHandler = null;
    this.profiles = null;
    this.history = null;
  }

  /**
   * 初始化应用
   */
  async init() {
    try {
      // 确保浏览器兼容性
      ensureMatchesPolyfill();

      // 加载快捷键设置
      this.shortcuts = await loadShortcutSettings();

      // 初始化速度配置模块
      await speedProfileManager.init();
      this.profiles = speedProfileManager;

      // 初始化播放历史模块
      await playbackHistory.init();
      this.history = playbackHistory;

      // 初始化视频位置记忆模块
      await videoPositionMemory.init();

      // 初始化各个模块
      this.indicator = new SpeedIndicator();
      this.lightboxManager = new LightboxManager();
      this.mediaDetector = new MediaDetector();
      this.playbackController = new PlaybackController(this.indicator);
      this.keyboardHandler = new KeyboardHandler(
        this.shortcuts,
        this.mediaDetector,
        this.playbackController,
        this.lightboxManager
      );

      // 设置媒体检测和事件监听
      this.mediaDetector.setupMediaElementDetection();
      this.mediaDetector.setupMediaEventDelegation();

      // 初始化键盘事件处理
      this.keyboardHandler.init();

      // 监听快捷键变更
      onShortcutsChanged((newShortcuts) => {
        this.shortcuts = newShortcuts;
        this.keyboardHandler.updateShortcuts(newShortcuts);
      });

      // 设置播放历史记录（当视频播放时）
      this.setupHistoryTracking();

      // 设置视频位置记忆
      this.setupPositionMemory();

      console.log("Video Speed Controller initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Video Speed Controller:", error);
    }
  }

  /**
   * 设置播放历史记录
   */
  setupHistoryTracking() {
    // 监听视频元素的变化，记录播放历史
    const observeMedia = () => {
      const media = this.mediaDetector.getCurrentMedia();
      if (media) {
        // 尝试获取视频信息
        const videoInfo = {
          url: window.location.href,
          title: document.title,
          speed: media.playbackRate,
          duration: media.duration,
          watchedDuration: media.currentTime
        };
        
        // 记录历史（节流，避免频繁写入）
        if (this._historyThrottle) return;
        this._historyThrottle = true;
        
        playbackHistory.addRecord(videoInfo).finally(() => {
          setTimeout(() => {
            this._historyThrottle = false;
          }, 30000); // 每30秒记录一次
        });
      }
    };

    // 定期检查当前媒体
    setInterval(observeMedia, 10000);
  }

  /**
   * 设置视频位置记忆
   */
  setupPositionMemory() {
    const checkAndRestore = () => {
      const media = this.mediaDetector?.getCurrentMedia();
      if (!media) return;

      const videoId = videoPositionMemory.getVideoId();
      if (videoPositionMemory.hasPosition(videoId)) {
        const pos = videoPositionMemory.getPosition(videoId);
        // 如果视频刚开始播放（进度<5%），自动恢复到上次位置
        if (media.currentTime < 5 && pos && pos.currentTime > 10) {
          const confirmRestore = confirm(`是否恢复到上次观看位置 (${Math.floor(pos.currentTime / 60)}:${Math.floor(pos.currentTime % 60).toString().padStart(2, '0')})?`);
          if (confirmRestore) {
            media.currentTime = pos.currentTime;
          }
        }
      }
    };

    // 视频加载后检查
    setTimeout(checkAndRestore, 2000);

    // 定期保存位置
    setInterval(() => {
      const media = this.mediaDetector?.getCurrentMedia();
      if (media && media.currentTime > 10) {
        const videoId = videoPositionMemory.getVideoId();
        videoPositionMemory.savePosition(videoId, media.currentTime, media.duration);
      }
    }, 10000);
  }

  /**
   * 清理资源
   */
  destroy() {
    if (this.keyboardHandler) {
      this.keyboardHandler.destroy();
    }
    if (this.indicator) {
      this.indicator.destroy();
    }
    if (this.lightboxManager && this.lightboxManager.isActive()) {
      this.lightboxManager.exit();
    }
  }
}

// 使用IIFE避免污染全局作用域
(() => {
  const app = new VideoSpeedController();
  app.init();

  // 监听来自选项页的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getCurrentTime') {
      const media = app.mediaDetector?.getCurrentMedia();
      if (media) {
        sendResponse({ currentTime: media.currentTime });
      } else {
        sendResponse({ currentTime: 0 });
      }
    }
    if (message.action === 'seekTo' && message.timestamp !== undefined) {
      const media = app.mediaDetector?.getCurrentMedia();
      if (media) {
        media.currentTime = message.timestamp;
      }
    }
    return true;
  });

  // 在页面卸载时清理资源
  window.addEventListener("beforeunload", () => {
    app.destroy();
  });
})();
