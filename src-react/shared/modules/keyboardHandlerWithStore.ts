/**
 * 键盘事件处理模块（集成 Zustand Store 版本）
 * 直接使用 Zustand Store 进行状态管理和操作
 * @module shared/modules/keyboardHandlerWithStore
 */

import { isTypingInEditable } from '../utils/dom';
import type { ShortcutAction } from '../types/shortcuts';
import type { MediaDetector } from './mediaDetector';
import { useMediaStore } from '../stores/mediaStore';
import { useHUDStore } from '../stores/hudStore';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * 键盘处理器配置接口（Store 集成版本）
 */
export interface KeyboardHandlerWithStoreConfig {
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 键盘处理器依赖接口（Store 集成版本）
 * 简化的依赖，因为大部分功能通过 Store 实现
 */
export interface KeyboardHandlerWithStoreDependencies {
  /** 媒体检测器 */
  mediaDetector: MediaDetector;
  /** Lightbox 管理器（可选，如果未提供则不支持全屏功能） */
  lightboxManager?: {
    isActive: () => boolean;
    getVideo: () => HTMLVideoElement | null;
    toggle: (media: HTMLMediaElement) => void;
    exit: () => void;
  };
  /** 键盘帮助模态框（可选） */
  keyboardHelp?: {
    toggle: () => void;
  };
}

/**
 * 键盘事件处理器类（Store 集成版本）
 * 使用 Zustand Store 进行状态管理，简化了依赖注入
 */
export class KeyboardHandlerWithStore {
  private config: KeyboardHandlerWithStoreConfig;
  private deps: KeyboardHandlerWithStoreDependencies;
  private handleKeyDownBound: (e: KeyboardEvent) => void;
  private backupKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * 构造函数
   * @param config 键盘处理器配置
   * @param deps 外部依赖
   */
  constructor(
    config: KeyboardHandlerWithStoreConfig,
    deps: KeyboardHandlerWithStoreDependencies
  ) {
    this.config = config;
    this.deps = deps;
    this.handleKeyDownBound = this.handleKeyDown.bind(this);
  }

  /**
   * 更新配置
   * @param config 部分配置对象
   */
  updateConfig(config: Partial<KeyboardHandlerWithStoreConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 处理速度预设按键
   * @param key 按键
   */
  private handlePresetKey(key: string): void {
    try {
      // 从 Store 获取预设列表
      const presets = useSettingsStore.getState().presets;
      const preset = presets.find((p) => p.shortcut === key);

      if (!preset) {
        return;
      }

      // 获取目标媒体元素
      const media = this.deps.mediaDetector.getTargetMedia();
      if (!media) {
        return;
      }

      // 使用 Store 设置播放速率
      const mediaStore = useMediaStore.getState();
      mediaStore.setCurrentMedia(media);
      mediaStore.setPlaybackRate(preset.speed);

      // 显示 HUD
      const hudStore = useHUDStore.getState();
      hudStore.show({
        type: 'speed',
        value: preset.speed,
      });

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
    if (!this.deps.lightboxManager) {
      return false;
    }

    const video = this.deps.lightboxManager.getVideo();
    if (!video) {
      return false;
    }

    const mediaStore = useMediaStore.getState();
    const hudStore = useHUDStore.getState();

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

      mediaStore.setCurrentMedia(video);

      switch (e.key) {
        case 'ArrowLeft':
          mediaStore.seekBackward(5);
          hudStore.show({ type: 'seek', value: -5 });
          break;
        case 'ArrowRight':
          mediaStore.seekForward(5);
          hudStore.show({ type: 'seek', value: 5 });
          break;
        case 'ArrowUp':
          mediaStore.increaseVolume(0.1);
          hudStore.show({ type: 'volume', value: mediaStore.volume });
          break;
        case 'ArrowDown':
          mediaStore.decreaseVolume(0.1);
          hudStore.show({ type: 'volume', value: mediaStore.volume });
          break;
      }
      return true;
    }

    // 空格键播放/暂停（非 YouTube 网站）
    if (e.key === ' ' && !this.isYouTubeSite()) {
      e.preventDefault();
      e.stopPropagation();
      mediaStore.setCurrentMedia(video);
      mediaStore.togglePlayPause();
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
    if (this.deps.lightboxManager?.isActive()) {
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
   * 处理速度控制操作
   * @param media 媒体元素
   * @param action 操作类型
   */
  private handleSpeedAction(media: HTMLMediaElement, action: ShortcutAction): void {
    const mediaStore = useMediaStore.getState();
    const hudStore = useHUDStore.getState();

    mediaStore.setCurrentMedia(media);

    switch (action) {
      case 'increase':
        mediaStore.increasePlaybackRate(0.25);
        hudStore.show({ type: 'speed', value: mediaStore.playbackRate });
        break;
      case 'decrease':
        mediaStore.decreasePlaybackRate(0.25);
        hudStore.show({ type: 'speed', value: mediaStore.playbackRate });
        break;
      case 'reset':
        mediaStore.resetPlaybackRate();
        hudStore.show({ type: 'reset', value: 1.0 });
        break;
      case 'play-pause':
        mediaStore.togglePlayPause();
        break;
      default:
        if (this.config.debug) {
          console.warn(`未知的速度操作: ${action}`);
        }
    }
  }

  /**
   * 处理键盘按下事件
   * @param e 键盘事件
   */
  private handleKeyDown(e: KeyboardEvent): void {
    try {
      // 全屏模式下的特殊处理
      if (this.deps.lightboxManager?.isActive()) {
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
        if (!this.deps.lightboxManager?.isActive()) {
          return;
        }
      }

      // 从 Store 获取快捷键配置
      const shortcuts = useSettingsStore.getState().shortcuts;
      const mediaStore = useMediaStore.getState();
      const hudStore = useHUDStore.getState();

      // 检查音量控制快捷键
      if (shortcuts['volume-up'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        mediaStore.setCurrentMedia(media);
        mediaStore.increaseVolume(0.1);
        hudStore.show({ type: 'volume', value: mediaStore.volume });

        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (shortcuts['volume-down'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        mediaStore.setCurrentMedia(media);
        mediaStore.decreaseVolume(0.1);
        hudStore.show({ type: 'volume', value: mediaStore.volume });

        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 检查快进快退快捷键
      if (shortcuts['seek-forward'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        mediaStore.setCurrentMedia(media);
        mediaStore.seekForward(5);
        hudStore.show({ type: 'seek', value: 5 });

        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (shortcuts['seek-backward'] === shortcutPressed) {
        if (isTypingInEditable(e)) return;
        const media = this.deps.mediaDetector.getTargetMedia();
        if (!media) return;

        mediaStore.setCurrentMedia(media);
        mediaStore.seekBackward(5);
        hudStore.show({ type: 'seek', value: -5 });

        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 检查帮助快捷键（不依赖媒体元素）
      if (shortcuts['show-help'] === shortcutPressed && !isTypingInEditable(e)) {
        this.deps.keyboardHelp?.toggle();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 查找匹配的动作
      const action = Object.keys(shortcuts).find(
        (key) => shortcuts[key as ShortcutAction] === shortcutPressed
      ) as ShortcutAction | undefined;

      if (this.config.debug) {
        console.log('快捷键调试:', {
          shortcutPressed,
          action,
          shortcuts,
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
      const media = this.deps.lightboxManager?.isActive()
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
            lightboxActive: this.deps.lightboxManager?.isActive(),
          });
        }
        return;
      }

      // 阻止默认行为
      e.preventDefault();
      e.stopPropagation();

      // 执行对应的动作
      if (action === 'toggle-fullscreen') {
        this.deps.lightboxManager?.toggle(media);
      } else {
        this.handleSpeedAction(media, action);
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
      if (!this.deps.lightboxManager?.isActive()) {
        return;
      }

      if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        this.handleKeyDown(e);
      }
    };
    document.addEventListener('keydown', this.backupKeyDownHandler, true);

    if (this.config.debug) {
      console.log('键盘处理器（Store 集成版）已初始化');
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
      console.log('键盘处理器（Store 集成版）已销毁');
    }
  }
}
