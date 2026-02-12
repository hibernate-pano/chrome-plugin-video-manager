/**
 * 媒体相关类型定义
 * @module shared/types/media
 */

/**
 * 媒体状态接口
 * 定义媒体元素的当前状态
 */
export interface MediaState {
  /** 当前活动的媒体元素 */
  currentMedia: HTMLMediaElement | null;
  /** 播放速率 */
  playbackRate: number;
  /** 音量（0-1） */
  volume: number;
  /** 是否暂停 */
  isPaused: boolean;
  /** 当前播放时间（秒） */
  currentTime: number;
  /** 总时长（秒） */
  duration: number;
  /** 是否全屏 */
  isFullscreen: boolean;
}

/**
 * 媒体检测器配置接口
 * 定义媒体检测器的配置参数
 */
export interface MediaDetectorConfig {
  /** 缓存过期时间（毫秒） */
  cacheExpiryMs: number;
  /** 检测间隔数组（毫秒） */
  checkIntervals: number[];
  /** 是否启用 Shadow DOM 检测 */
  enableShadowDom?: boolean;
  /** 是否启用 iframe 检测 */
  enableIframe?: boolean;
  /** 是否使用 IntersectionObserver */
  useIntersectionObserver?: boolean;
}

/**
 * 默认媒体检测器配置
 */
export const DEFAULT_MEDIA_DETECTOR_CONFIG: MediaDetectorConfig = {
  cacheExpiryMs: 500,
  checkIntervals: [0, 100, 500, 1000, 2000],
  enableShadowDom: true,
  enableIframe: true,
  useIntersectionObserver: true,
};

/**
 * 媒体元素类型
 */
export type MediaElementType = 'video' | 'audio';

/**
 * 媒体元素信息接口
 * 扩展的媒体元素信息，包含额外的元数据
 */
export interface MediaElementInfo {
  /** 媒体元素 */
  element: HTMLMediaElement;
  /** 媒体类型 */
  type: MediaElementType;
  /** 是否在视口中 */
  isInViewport: boolean;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 元素的唯一标识（用于缓存） */
  id: string;
}
