/**
 * 键盘事件处理模块
 * 将原生 JavaScript 版本转换为 TypeScript，并集成 Zustand Store
 * @module shared/modules/keyboardHandler
 */

import { isTypingInEditable } from '../utils/dom';
import type { ShortcutAction, SpeedPreset } from '../types/shortcuts';
import type { MediaDetector } from './mediaDetector';

/**
 * 键盘处理器配置接口
 */
export interface KeyboardHandlerConfig {
  /** 快捷键映射 */
  shortcuts: Record<ShortcutAction, string>;
  /** 速度预设列表 */
  presets: SpeedPreset[];
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 键盘处理器依赖接口
 * 定义键盘处理器需要的外部依赖
 */
export interface KeyboardHandlerDependencies {
  /** 媒体检测器 */
  mediaDetector: MediaDetector;
  /** 播放控制器回调 */
  playbackController: {
    handleSpeed: (media: HTMLMediaElement, action: string) => void;
    handleVolume: (media: HTMLMediaElement, direction: 'up' | 'down', step: number) => void;
    handleSeek: (media: HTMLMediaElement, direction: 'forward' | 'backward', seconds: number) => void;
    handlePlayPause: (media: HTMLMediaElement) => void;
  };
  /** Lightbox 管理器 */
  lightboxManager: {
    isActive: () => boolean;
    getVideo: () => HTMLVideoElement | null;
    toggle: (media: HTMLMediaElement) => void;
    exit: () => void;
  };
  /** 键盘帮助模态框 */
  keyboardHelp: {
    toggle: () => void;
  };
}

/**
 * 键盘事件处理器类
 * 处理所有键盘快捷键事件，支持速度控制、音量控制、快进快退等功能
 */
export class KeyboardHandler {
  private config: KeyboardHandlerConfig;
  private deps: KeyboardHandlerDependencies;
  private handleKeyDownBound: (e: KeyboardEvent) => void;
  private backupKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * 构造函数
   * @param config 键盘处理器配置
   * @param deps 外部依赖
   */
  constructor(config: KeyboardHandlerConfig, deps: KeyboardHandlerDependencies) {
    this.config = config;
    this.deps = deps;
    this.handleKeyDownBound = this.handleKeyDown.bind(this);
  }

  /**
   * 更新快捷键配置
   * @param shortcuts 新的快捷键配置
   */
  updateShortcuts(shortcuts: Record<ShortcutAction, string>): void {
    this.config.shortcuts = shortcuts;
  }

  /**
   * 更新速度预设
   * @param presets 新的速度预设列表
   */
  updatePresets(presets: SpeedPreset[]): void {
    this.config.presets = presets;
  }

  /**
   * 更新完整配置
   * @param config 部分配置对象
   */
  updateConfig(config: Partial<KeyboardHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 处理速度预设按键
   * @param key 按键
   */
  private handlePresetKey(key: string): void {
    try {
      // 查找匹配的预设
      const preset = this.config.presets.find((p) => p.shortcut === key);
      if (!preset) {
        return;
      }

      // 获取目标媒体元素
      const media = this.deps.mediaDetector.getTargetMedia();
      if (!media) {
        return;
      }

      // 设置播放速率
      media.playbackRate = preset.speed;

      // 显示 HUD（通过播放控制器）
      // 注意：这里假设 playbackController 会处理 HUD 显示
      if (this.config.debug) {
        console.log(`应用速度预设: ${preset.label} (${preset.speed}x)`);
      }
    } catch (error) {
      console.error('处理速度预设失败:', error);
    }
  }

  /**
   * 检测当前网站是否为 YouTube
   * @returns 是否为 YouTube 网站
   */
  private isYouTubeSite(): boolean {
    return (
      window.location.hostname.includes('youtube.com') ||
      window.location.hostname.includes('youtu.be')
    );
  }

  /**
   * 处理全屏模式下的特殊按键
   * @param e 键盘事件
   * @returns 是否已处理
   */
  private handleLightboxKeys(e: KeyboardEvent): boolean {
    const video = this.deps.lightboxManager.getVideo();
    if (!video) {
      return false;
    }

    // ESC 键退出全屏
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.deps.lightboxManager.exit();
      return true;
    }

    // 方向键控制
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();

      switch (e.key) {
        case 'ArrowLeft':
          this.deps.playbackController.handleSeek(video, 'backward', 5);
          break;
        case 'ArrowRight':
          this.deps.playbackController.handleSeek(video, 'forward', 5);
          break;
        case 'ArrowUp':
          this.deps.playbackController.handleVolume(video, 'up', 0.1);
          break;
        case 'ArrowDown':
          this.deps.playbackController.handleVolume(video, 'down', 0.1);
          break;
      }
      return true;
    }

    // 空格键播放/暂停（非 YouTube 网站）
    if (e.key === ' ' && !this.isYouTubeSite()) {
      e.preventDefault();
      e.stopPropagation();
      this.deps.playbackController.handlePlayPause(video);
      return true;
    }

    return false;
  }

  /**
   * 构建快捷键字符串
   * @param e 键盘事件
   * @returns 快捷键字符串（如 "ctrl+a"）
   */
  private buildShortcutString(e: KeyboardEvent): string {
    return (
      (e.ctrlKey ? 'ctrl+' : '') +
      (e.altKey ? 'alt+' : '') +
      (e.shiftKey ? 'shift+' : '') +
      (e.metaKey ? 'meta+' : '') +
      e.key.toLowerCase()
    );
  }

  /**
   * 检查是否应该允许快捷键
   * @param media 目标媒体元素
   * @param e 键盘事件
   * @returns 是否允许快捷键
   */
  private shouldAllowShortcut(media: HTMLMediaElement, e: KeyboardEvent): boolean {
    // 全屏模式下始终允许
    if (this.deps.lightboxManager.isActive()) {
      return true;
    }

    const allMedia = this.deps.mediaDetector.getAllMediaElements();
    const isDirectlyTargetingMedia = media === e.target || media.contains(e.target as Node);
    const mediaHasFocus = document.activeElement === media;
    const isHovering = media.matches && media.matches(':hover');

    // 页面上只有一个媒体元素时，始终允许快捷键
    if (allMedia.length === 1) {
      return true;
    }

    // 直接针对媒体元素、媒体元素有焦点或鼠标悬停时允许
    if (isDirectlyTargetingMedia || mediaHasFocus || isHovering) {
      return true;
    }

    return false;
  }

  /**
   * 处理键盘按下事件
   * @param e 键盘事件
   */
  private handleKeyDown(e: KeyboardEvent): void {
    try {
      // 全屏模式下的特殊处理
      if (this.deps.lightboxManager.isActive()) {
        if (this.handleLightboxKeys(e)) {
          return;
        }
      }

      // 检查是否为数字键（速度预设）
      if (
        ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key) &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        if (!isTypingInEditable(e)) {
          this.handlePresetKey(e.key);
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // 构建快捷键字符串
      const shortcutPressed = this.buildShortcutString(e);

      // YouTube 网站特殊处理：不干预空格键
      if (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        if (this.isYouTubeSite()) {
          return;
        }
        // 非全屏模式下，其他网站也不处理空格键
        if (!this.deps.lightboxManager.isActive()) {
          return;
        }
      }

      // 检查音量控制快捷键
      if (this.config.shortcuts['volume-up'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        this.deps.playbackController.handleVolume(media, 'up', 0.1);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (this.config.shortcuts['volume-down'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        this.deps.playbackController.handleVolume(media, 'down', 0.1);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 检查快进快退快捷键
      if (this.config.shortcuts['seek-forward'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        this.deps.playbackController.handleSeek(media, 'forward', 5);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (this.config.shortcuts['seek-backward'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        this.deps.playbackController.handleSeek(media, 'backward', 5);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 检查帮助快捷键（不依赖媒体元素）
      if (
        this.config.shortcuts['show-help'] === shortcutPressed &&
        !isTypingInEditable(e)
      ) {
        this.deps.keyboardHelp.toggle();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 查找匹配的动作
      const action = Object.keys(this.config.shortcuts).find(
        (key) => this.config.shortcuts[key as ShortcutAction] === shortcutPressed
      ) as ShortcutAction | undefined;

      if (this.config.debug) {
        console.log('快捷键调试:', {
          shortcutPressed,
          action,
          shortcuts: this.config.shortcuts,
        });
      }

      if (!action) {
        return;
      }

      // 检查是否在可编辑区域
      if (isTypingInEditable(e)) {
        return;
      }

      // 获取目标媒体元素
      const media = this.deps.lightboxManager.isActive()
        ? this.deps.lightboxManager.getVideo()
        : this.deps.mediaDetector.getTargetMedia();

      if (!media) {
        return;
      }

      // 检查是否应该允许快捷键
      if (!this.shouldAllowShortcut(media, e)) {
        if (this.config.debug) {
          console.log('快捷键被阻止:', {
            allMediaCount: this.deps.mediaDetector.getAllMediaElements().length,
            media: media?.tagName,
            lightboxActive: this.deps.lightboxManager.isActive(),
          });
        }
        return;
      }

      // 阻止默认行为
      e.preventDefault();
      e.stopPropagation();

      // 执行对应的动作
      if (action === 'toggle-fullscreen') {
        this.deps.lightboxManager.toggle(media);
      } else {
        this.deps.playbackController.handleSpeed(media, action);
      }
    } catch (error) {
      console.error('处理键盘事件失败:', error);
    }
  }

  /**
   * 初始化键盘事件监听
   */
  init(): void {
    // 全局键盘事件监听（捕获阶段）
    window.addEventListener('keydown', this.handleKeyDownBound, true);

    // 备用监听器，用于全屏模式的特殊按键
    this.backupKeyDownHandler = (e: KeyboardEvent) => {
      if (!this.deps.lightboxManager.isActive()) {
        return;
      }

      if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        this.handleKeyDown(e);
      }
    };
    document.addEventListener('keydown', this.backupKeyDownHandler, true);

    if (this.config.debug) {
      console.log('键盘处理器已初始化');
    }
  }

  /**
   * 清理事件监听
   */
  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDownBound, true);

    if (this.backupKeyDownHandler) {
      document.removeEventListener('keydown', this.backupKeyDownHandler, true);
      this.backupKeyDownHandler = null;
    }

    if (this.config.debug) {
      console.log('键盘处理器已销毁');
    }
  }
}
