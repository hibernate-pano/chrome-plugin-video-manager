/**
 * useMediaDetector Hook
 * 将 MediaDetector 原生 JS 模块桥接到 React 组件
 * @module content/hooks/useMediaDetector
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { MediaDetector } from '../../shared/modules/mediaDetector';
import { useMediaStore } from '../../shared/stores/mediaStore';

/**
 * useMediaDetector Hook 配置
 */
export interface UseMediaDetectorOptions {
  /** 是否自动初始化 */
  autoInit?: boolean;
  /** 缓存过期时间（毫秒） */
  cacheExpiryMs?: number;
  /** 检查间隔数组 */
  checkIntervals?: number[];
  /** 是否在 Lightbox 模式下 */
  lightboxActive?: boolean;
}

/**
 * useMediaDetector Hook 返回值
 */
export interface UseMediaDetectorReturn {
  /** MediaDetector 实例 */
  detector: MediaDetector | null;
  /** 当前目标媒体元素 */
  targetMedia: HTMLMediaElement | null;
  /** 所有媒体元素 */
  allMedia: HTMLMediaElement[];
  /** 刷新媒体元素列表 */
  refresh: () => void;
  /** 使缓存失效 */
  invalidateCache: () => void;
  /** 是否已初始化 */
  isInitialized: boolean;
}

/**
 * useMediaDetector Hook
 *
 * 将 MediaDetector 原生 JS 模块桥接到 React 组件，提供：
 * - 自动初始化和清理
 * - 媒体元素检测
 * - 与 mediaStore 的集成
 * - 响应式的媒体元素列表
 *
 * @param options 配置选项
 * @returns Hook 返回值
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { targetMedia, allMedia, refresh } = useMediaDetector({
 *     autoInit: true,
 *   });
 *
 *   useEffect(() => {
 *     if (targetMedia) {
 *       console.log('当前目标媒体:', targetMedia);
 *     }
 *   }, [targetMedia]);
 *
 *   return (
 *     <div>
 *       <p>找到 {allMedia.length} 个媒体元素</p>
 *       <button onClick={refresh}>刷新</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useMediaDetector(
  options: UseMediaDetectorOptions = {}
): UseMediaDetectorReturn {
  const {
    autoInit = true,
    cacheExpiryMs,
    checkIntervals,
    lightboxActive = false,
  } = options;

  // MediaDetector 实例引用
  const detectorRef = useRef<MediaDetector | null>(null);

  // 状态
  const [targetMedia, setTargetMedia] = useState<HTMLMediaElement | null>(null);
  const [allMedia, setAllMedia] = useState<HTMLMediaElement[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // 从 mediaStore 获取 setCurrentMedia 方法
  const setCurrentMedia = useMediaStore((state) => state.setCurrentMedia);

  /**
   * 初始化 MediaDetector
   */
  const initDetector = useCallback(() => {
    if (detectorRef.current) {
      return; // 已经初始化
    }

    try {
      // 创建 MediaDetector 实例
      detectorRef.current = new MediaDetector({
        cacheExpiryMs,
        checkIntervals,
      });

      // 设置媒体元素检测
      detectorRef.current.setupMediaElementDetection();

      // 设置媒体事件委托
      detectorRef.current.setupMediaEventDelegation();

      setIsInitialized(true);

      console.log('[useMediaDetector] MediaDetector 已初始化');
    } catch (error) {
      console.error('[useMediaDetector] 初始化失败:', error);
    }
  }, [cacheExpiryMs, checkIntervals]);

  /**
   * 刷新媒体元素列表
   */
  const refresh = useCallback(() => {
    if (!detectorRef.current) {
      return;
    }

    try {
      // 使缓存失效
      detectorRef.current.invalidateCache();

      // 获取所有媒体元素
      const media = detectorRef.current.getAllMediaElements();
      setAllMedia(media);

      // 获取目标媒体元素
      const target = detectorRef.current.getTargetMedia(lightboxActive);
      setTargetMedia(target);

      // 更新 mediaStore
      if (target) {
        setCurrentMedia(target);
      }

      console.log('[useMediaDetector] 刷新完成:', {
        allMediaCount: media.length,
        targetMedia: target?.tagName,
      });
    } catch (error) {
      console.error('[useMediaDetector] 刷新失败:', error);
    }
  }, [lightboxActive, setCurrentMedia]);

  /**
   * 使缓存失效
   */
  const invalidateCache = useCallback(() => {
    if (!detectorRef.current) {
      return;
    }

    try {
      detectorRef.current.invalidateCache();
      console.log('[useMediaDetector] 缓存已失效');
    } catch (error) {
      console.error('[useMediaDetector] 使缓存失效失败:', error);
    }
  }, []);

  /**
   * 初始化效果
   */
  useEffect(() => {
    if (autoInit) {
      initDetector();
    }

    return () => {
      // 清理
      if (detectorRef.current) {
        detectorRef.current.destroy();
        detectorRef.current = null;
        setIsInitialized(false);
        console.log('[useMediaDetector] MediaDetector 已销毁');
      }
    };
  }, [autoInit, initDetector]);

  /**
   * 定期刷新媒体元素列表
   */
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    // 初始刷新
    refresh();

    // 设置定期刷新（每秒一次）
    const intervalId = setInterval(() => {
      refresh();
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isInitialized, refresh]);

  /**
   * 监听 lightboxActive 变化
   */
  useEffect(() => {
    if (isInitialized) {
      refresh();
    }
  }, [lightboxActive, isInitialized, refresh]);

  return {
    detector: detectorRef.current,
    targetMedia,
    allMedia,
    refresh,
    invalidateCache,
    isInitialized,
  };
}

/**
 * 便捷 Hook：仅获取目标媒体元素
 *
 * @param lightboxActive 是否在 Lightbox 模式下
 * @returns 目标媒体元素
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const targetMedia = useTargetMedia();
 *
 *   if (!targetMedia) {
 *     return <div>未找到媒体元素</div>;
 *   }
 *
 *   return <div>当前媒体: {targetMedia.tagName}</div>;
 * }
 * ```
 */
export function useTargetMedia(lightboxActive = false): HTMLMediaElement | null {
  const { targetMedia } = useMediaDetector({ lightboxActive });
  return targetMedia;
}

/**
 * 便捷 Hook：仅获取所有媒体元素
 *
 * @returns 所有媒体元素数组
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const allMedia = useAllMedia();
 *
 *   return (
 *     <div>
 *       <p>找到 {allMedia.length} 个媒体元素</p>
 *       <ul>
 *         {allMedia.map((media, index) => (
 *           <li key={index}>{media.tagName}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAllMedia(): HTMLMediaElement[] {
  const { allMedia } = useMediaDetector();
  return allMedia;
}
