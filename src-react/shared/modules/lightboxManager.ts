/**
 * Lightbox 全屏管理器
 * 负责管理网页全屏模式，集成 React Lightbox 组件
 * @module shared/modules/lightboxManager
 */

import { useMediaStore } from '../stores/mediaStore';

/**
 * 视频样式备份接口
 */
interface VideoStylesBackup {
  cssText: string;
  controls: boolean;
}

/**
 * 事件监听器集合接口
 */
interface EventListeners {
  pause: () => void;
  play: () => void;
  seeking: () => void;
}

/**
 * Lightbox 全屏管理类
 * 提供进入/退出全屏模式的功能，并与 React Lightbox 组件集成
 */
export class LightboxManager {
  private active: boolean = false;
  private originalVideoStyles: VideoStylesBackup = {
    cssText: '',
    controls: false,
  };
  private controlsInterval: number | null = null;
  private eventListeners: Map<HTMLVideoElement, EventListeners> = new Map();
  private currentVideo: HTMLVideoElement | null = null;

  /**
   * 检查是否处于全屏模式
   * @returns 是否处于全屏模式
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * 确保控制栏在暂停时可见
   * @param video 视频元素
   */
  private ensureControlsVisibleWhenPaused(video: HTMLVideoElement): void {
    if (!video || !this.active) return;

    try {
      if (video.paused) {
        video.controls = true;

        // 模拟鼠标移动以显示控制栏
        const rect = video.getBoundingClientRect();
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: rect.left + rect.width / 2,
          clientY: rect.bottom - 30,
          bubbles: true,
          cancelable: true,
        });
        video.dispatchEvent(mouseEvent);

        video.setAttribute('data-vsc-paused-controls', 'true');
      } else {
        video.removeAttribute('data-vsc-paused-controls');
      }
    } catch (e) {
      console.error('确保控制栏可见失败:', e);
    }
  }

  /**
   * 设置全屏模式下的事件监听器
   * @param video 视频元素
   */
  private setupEventListeners(video: HTMLVideoElement): void {
    if (!video || this.eventListeners.has(video)) return;

    const pauseHandler = () => {
      this.ensureControlsVisibleWhenPaused(video);
    };

    const playHandler = () => {
      video.removeAttribute('data-vsc-paused-controls');
    };

    const seekingHandler = () => {
      this.ensureControlsVisibleWhenPaused(video);
    };

    video.addEventListener('pause', pauseHandler);
    video.addEventListener('play', playHandler);
    video.addEventListener('seeking', seekingHandler);

    this.eventListeners.set(video, {
      pause: pauseHandler,
      play: playHandler,
      seeking: seekingHandler,
    });

    this.ensureControlsVisibleWhenPaused(video);
  }

  /**
   * 清理全屏模式下的事件监听器
   * @param video 视频元素
   */
  private cleanupEventListeners(video: HTMLVideoElement): void {
    if (!video || !this.eventListeners.has(video)) return;

    const listeners = this.eventListeners.get(video);
    if (listeners) {
      video.removeEventListener('pause', listeners.pause);
      video.removeEventListener('play', listeners.play);
      video.removeEventListener('seeking', listeners.seeking);
    }

    this.eventListeners.delete(video);
    video.removeAttribute('data-vsc-paused-controls');
  }

  /**
   * 进入全屏模式
   * @param media 媒体元素
   */
  enter(media: HTMLMediaElement): void {
    // 只支持视频元素
    if (!media || media.tagName !== 'VIDEO') {
      console.warn('Lightbox 只支持视频元素');
      return;
    }

    const video = media as HTMLVideoElement;

    try {
      // 保存原始状态
      this.originalVideoStyles = {
        cssText: video.style.cssText,
        controls: video.controls,
      };

      // 设置当前视频
      this.currentVideo = video;

      // 更新 Zustand store 状态
      const mediaStore = useMediaStore.getState();
      mediaStore.setCurrentMedia(video);
      mediaStore.toggleFullscreen(); // 切换到全屏模式

      // 设置事件监听器
      this.setupEventListeners(video);

      // 定期检查控制栏状态
      this.controlsInterval = window.setInterval(() => {
        this.ensureControlsVisibleWhenPaused(video);
      }, 1000);

      this.active = true;

      console.log('进入 Lightbox 全屏模式');
    } catch (e) {
      console.error('进入全屏模式失败:', e);
    }
  }

  /**
   * 退出全屏模式
   */
  exit(): void {
    if (!this.active || !this.currentVideo) {
      return;
    }

    try {
      const video = this.currentVideo;

      // 清理事件监听器
      this.cleanupEventListeners(video);

      // 清理定时器
      if (this.controlsInterval) {
        clearInterval(this.controlsInterval);
        this.controlsInterval = null;
      }

      // 恢复视频样式
      video.style.cssText = this.originalVideoStyles.cssText;
      video.controls = this.originalVideoStyles.controls;

      // 更新 Zustand store 状态
      const mediaStore = useMediaStore.getState();
      if (mediaStore.isFullscreen) {
        mediaStore.toggleFullscreen(); // 退出全屏模式
      }

      // 重置状态
      this.active = false;
      this.currentVideo = null;

      console.log('退出 Lightbox 全屏模式');
    } catch (e) {
      console.error('退出全屏模式失败:', e);
    }
  }

  /**
   * 切换全屏模式
   * @param media 媒体元素
   */
  toggle(media: HTMLMediaElement): void {
    if (this.active) {
      this.exit();
    } else {
      this.enter(media);
    }
  }

  /**
   * 获取全屏模式下的视频元素
   * @returns 视频元素或 null
   */
  getVideo(): HTMLVideoElement | null {
    return this.active ? this.currentVideo : null;
  }

  /**
   * 清理资源
   * 在页面卸载时调用
   */
  destroy(): void {
    if (this.active) {
      this.exit();
    }

    // 清理所有事件监听器
    this.eventListeners.forEach((_, video) => {
      this.cleanupEventListeners(video);
    });

    this.eventListeners.clear();
  }
}

/**
 * 创建单例实例
 */
let lightboxManagerInstance: LightboxManager | null = null;

/**
 * 获取 LightboxManager 单例实例
 * @returns LightboxManager 实例
 */
export function getLightboxManager(): LightboxManager {
  if (!lightboxManagerInstance) {
    lightboxManagerInstance = new LightboxManager();
  }
  return lightboxManagerInstance;
}

/**
 * 重置 LightboxManager 单例实例
 * 主要用于测试
 */
export function resetLightboxManager(): void {
  if (lightboxManagerInstance) {
    lightboxManagerInstance.destroy();
    lightboxManagerInstance = null;
  }
}
