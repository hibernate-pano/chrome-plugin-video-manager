/**
 * 键盘事件处理模块
 * @module modules/keyboardHandler
 */

import { isTypingInEditable } from "../utils/dom.js";

/**
 * 键盘事件处理器类
 */
export class KeyboardHandler {
  constructor(shortcuts, mediaDetector, playbackController, lightboxManager) {
    this.shortcuts = shortcuts;
    this.mediaDetector = mediaDetector;
    this.playbackController = playbackController;
    this.lightboxManager = lightboxManager;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleLightboxKeys = this.handleLightboxKeys.bind(this);
  }

  /**
   * 更新快捷键配置
   * @param {Object} newShortcuts - 新的快捷键配置
   */
  updateShortcuts(newShortcuts) {
    this.shortcuts = newShortcuts;
  }

  /**
   * 检测当前网站是否为YouTube
   * @returns {boolean}
   */
  isYouTubeSite() {
    return (
      window.location.hostname.includes("youtube.com") ||
      window.location.hostname.includes("youtu.be")
    );
  }

  /**
   * 处理全屏模式下的特殊按键
   * @param {KeyboardEvent} e - 键盘事件
   * @returns {boolean} 是否已处理
   */
  handleLightboxKeys(e) {
    const video = this.lightboxManager.getVideo();
    if (!video) return false;

    // ESC键退出全屏
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.lightboxManager.exit();
      return true;
    }

    // 方向键控制
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();

      switch (e.key) {
        case "ArrowLeft":
          this.playbackController.handleSeek(video, "backward", 5);
          break;
        case "ArrowRight":
          this.playbackController.handleSeek(video, "forward", 5);
          break;
        case "ArrowUp":
          this.playbackController.handleVolume(video, "up", 0.1);
          break;
        case "ArrowDown":
          this.playbackController.handleVolume(video, "down", 0.1);
          break;
      }
      return true;
    }

    // 空格键播放/暂停（非YouTube网站）
    if (e.key === " " && !this.isYouTubeSite()) {
      e.preventDefault();
      e.stopPropagation();
      this.playbackController.handlePlayPause(video);
      return true;
    }

    return false;
  }

  /**
   * 处理键盘按下事件
   * @param {KeyboardEvent} e - 键盘事件
   */
  handleKeyDown(e) {
    try {
      // 数字键 1-4 快速切换速度配置
      if (['1', '2', '3', '4'].includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (this.handleNumberKeys(e)) {
          return;
        }
      }

      // 全屏模式下的特殊处理
      if (this.lightboxManager.isActive()) {
        if (this.handleLightboxKeys(e)) {
          return;
        }
      }

      // 构建快捷键字符串
      const shortcutPressed =
        (e.ctrlKey ? "ctrl+" : "") +
        (e.altKey ? "alt+" : "") +
        (e.shiftKey ? "shift+" : "") +
        (e.metaKey ? "meta+" : "") +
        e.key.toLowerCase();

      // YouTube网站特殊处理：不干预空格键
      if (
        e.key === " " &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.metaKey
      ) {
        if (this.isYouTubeSite()) {
          return;
        }
        // 非全屏模式下，其他网站也不处理空格键
        if (!this.lightboxManager.isActive()) {
          return;
        }
      }

      // 查找匹配的动作
      const action = Object.keys(this.shortcuts).find(
        (key) => this.shortcuts[key] === shortcutPressed
      );

      if (!action) return;

      // 检查是否在可编辑区域
      if (isTypingInEditable(e)) {
        return;
      }

      // 获取目标媒体元素
      const media = this.lightboxManager.isActive()
        ? this.lightboxManager.getVideo()
        : this.mediaDetector.getTargetMedia();

      if (!media) return;

      // 检查是否应该允许快捷键
      let shouldAllowShortcut = false;
      if (this.lightboxManager.isActive()) {
        shouldAllowShortcut = true;
      } else {
        const isDirectlyTargetingMedia =
          media === e.target || media.contains(e.target);
        const mediaHasFocus = document.activeElement === media;
        const isHovering = media.matches && media.matches(":hover");

        if (isDirectlyTargetingMedia || mediaHasFocus || isHovering) {
          shouldAllowShortcut = true;
        }
      }

      if (!shouldAllowShortcut) return;

      // 阻止默认行为
      e.preventDefault();
      e.stopPropagation();

      // 执行对应的动作
      if (action === "toggle-fullscreen") {
        this.lightboxManager.toggle(media);
      } else {
        this.playbackController.handleSpeed(media, action);
      }
    } catch (e) {
      console.error("处理键盘事件失败:", e);
    }
  }

  /**
   * 处理数字键快速切换速度配置
   * 1 = 学习模式 (1.5x), 2 = 复习模式 (2x), 3 = 浏览模式 (1.25x), 4 = 听力模式 (0.75x)
   */
  handleNumberKeys(e) {
    const numberProfiles = {
      '1': { speed: 1.5, name: '学习模式' },
      '2': { speed: 2.0, name: '复习模式' },
      '3': { speed: 1.25, name: '浏览模式' },
      '4': { speed: 0.75, name: '听力模式' }
    };

    const profile = numberProfiles[e.key];
    if (!profile) return false;

    // 检查是否在可编辑区域
    if (isTypingInEditable(e)) return false;

    // 获取目标媒体元素
    const media = this.lightboxManager.isActive()
      ? this.lightboxManager.getVideo()
      : this.mediaDetector.getTargetMedia();

    if (!media) return false;

    // 设置速度
    media.playbackRate = profile.speed;

    // 显示提示
    this._showSpeedIndicator(profile);

    return true;
  }

  /**
   * 显示速度提示
   */
  _showSpeedIndicator(profile) {
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 20px 40px;
      border-radius: 10px;
      font-size: 24px;
      font-weight: bold;
      z-index: 999999;
      pointer-events: none;
      animation: fadeOut 1s forwards;
    `;
    indicator.textContent = `${profile.name} (${profile.speed}x)`;

    if (!document.getElementById('vs-speed-anim')) {
      const style = document.createElement('style');
      style.id = 'vs-speed-anim';
      style.textContent = `@keyframes fadeOut { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }`;
      document.head.appendChild(style);
    }

    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 1000);
  }

  /**
   * 初始化键盘事件监听
   */
  init() {
    // 全局键盘事件监听（捕获阶段）
    window.addEventListener("keydown", this.handleKeyDown, true);

    // 备用监听器，用于全屏模式的特殊按键
    document.addEventListener(
      "keydown",
      (e) => {
        if (!this.lightboxManager.isActive()) return;

        if (
          [
            "Escape",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
          ].includes(e.key)
        ) {
          this.handleKeyDown(e);
        }
      },
      true
    );
  }

  /**
   * 清理事件监听
   */
  destroy() {
    window.removeEventListener("keydown", this.handleKeyDown, true);
  }
}
