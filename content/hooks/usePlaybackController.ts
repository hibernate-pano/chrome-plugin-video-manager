/**
 * usePlaybackController Hook
 * 将 PlaybackController 原生 JS 模块桥接到 React 组件
 * @module content/hooks/usePlaybackController
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  PlaybackController,
  type PlaybackControllerConfig,
  type SpeedAction,
  type VolumeDirection,
  type SeekDirection,
} from '../../shared/modules/playbackController';
import { useMediaStore } from '../../shared/stores/mediaStore';

/**
 * usePlaybackController Hook 配置
 */
export interface UsePlaybackControllerOptions {
  /** 速度调整步长 */
  speedStep?: number;
  /** 音量调整步长（0-1） */
  volumeStep?: number;
  /** 跳转步长（秒） */
  seekStep?: number;
  /** 最小播放速度 */
  minSpeed?: number;
  /** 最大播放速度 */
  maxSpeed?: number;
}

/**
 * usePlaybackController Hook 返回值
 */
export interface UsePlaybackControllerReturn {
  /** PlaybackController 实例 */
  controller: PlaybackController | null;
  /** 处理播放速度控制 */
  handleSpeed: (media: HTMLMediaElement, action: SpeedAction) => void;
  /** 处理视频快进快退 */
  handleSeek: (video: HTMLVideoElement, direction: SeekDirection, step?: number) => void;
  /** 处理音量控制 */
  handleVolume: (media: HTMLMediaElement, direction: VolumeDirection, step?: number) => void;
  /** 处理播放/暂停切换 */
  handlePlayPause: (media: HTMLMediaElement) => Promise<void>;
  /** 设置指定的播放速度 */
  setSpeed: (media: HTMLMediaElement, speed: number) => void;
  /** 设置指定的音量 */
  setVolume: (media: HTMLMediaElement, volume: number) => void;
  /** 切换静音状态 */
  toggleMute: (media: HTMLMediaElement) => void;
  /** 跳转到指定时间 */
  seekTo: (media: HTMLMediaElement, time: number) => void;
  /** 更新配置 */
  updateConfig: (config: Partial<PlaybackControllerConfig>) => void;
}

/**
 * usePlaybackController Hook
 *
 * 将 PlaybackController 原生 JS 模块桥接到 React 组件，提供：
 * - 播放速度控制
 * - 音量控制
 * - 快进快退
 * - 播放/暂停
 * - 与 mediaStore 和 hudStore 的集成
 *
 * @param options 配置选项
 * @returns Hook 返回值
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const targetMedia = useTargetMedia();
 *   const {
 *     handleSpeed,
 *     handleVolume,
 *     handleSeek,
 *     handlePlayPause,
 *   } = usePlaybackController({
 *     speedStep: 0.25,
 *     volumeStep: 0.1,
 *     seekStep: 10,
 *   });
 *
 *   const handleIncreaseSpeed = () => {
 *     if (targetMedia) {
 *       handleSpeed(targetMedia, 'increase');
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleIncreaseSpeed}>加速</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlaybackController(
  options: UsePlaybackControllerOptions = {}
): UsePlaybackControllerReturn {
  // PlaybackController 实例引用
  const controllerRef = useRef<PlaybackController | null>(null);

  // 从 mediaStore 获取更新方法
  const updateMediaState = useMediaStore((state) => state.updateMediaState);

  /**
   * 初始化 PlaybackController
   */
  useEffect(() => {
    if (!controllerRef.current) {
      const config: PlaybackControllerConfig = {
        speedStep: options.speedStep,
        volumeStep: options.volumeStep,
        seekStep: options.seekStep,
        minSpeed: options.minSpeed,
        maxSpeed: options.maxSpeed,
      };

      controllerRef.current = new PlaybackController(config);

      console.log('[usePlaybackController] PlaybackController 已初始化');
    }

    // 清理函数（PlaybackController 没有需要清理的资源）
    return () => {
      console.log('[usePlaybackController] PlaybackController 清理');
    };
  }, [options.speedStep, options.volumeStep, options.seekStep, options.minSpeed, options.maxSpeed]);

  /**
   * 处理播放速度控制
   */
  const handleSpeed = useCallback(
    (media: HTMLMediaElement, action: SpeedAction) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        controllerRef.current.handleSpeed(media, action);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] handleSpeed 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 处理视频快进快退
   */
  const handleSeek = useCallback(
    (video: HTMLVideoElement, direction: SeekDirection, step?: number) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        controllerRef.current.handleSeek(video, direction, step);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] handleSeek 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 处理音量控制
   */
  const handleVolume = useCallback(
    (media: HTMLMediaElement, direction: VolumeDirection, step?: number) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        controllerRef.current.handleVolume(media, direction, step);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] handleVolume 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 处理播放/暂停切换
   */
  const handlePlayPause = useCallback(
    async (media: HTMLMediaElement) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        await controllerRef.current.handlePlayPause(media);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] handlePlayPause 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 设置指定的播放速度
   */
  const setSpeed = useCallback(
    (media: HTMLMediaElement, speed: number) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        controllerRef.current.setSpeed(media, speed);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] setSpeed 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 设置指定的音量
   */
  const setVolume = useCallback(
    (media: HTMLMediaElement, volume: number) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        controllerRef.current.setVolume(media, volume);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] setVolume 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 切换静音状态
   */
  const toggleMute = useCallback(
    (media: HTMLMediaElement) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        controllerRef.current.toggleMute(media);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] toggleMute 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 跳转到指定时间
   */
  const seekTo = useCallback(
    (media: HTMLMediaElement, time: number) => {
      if (!controllerRef.current) {
        console.warn('[usePlaybackController] Controller 未初始化');
        return;
      }

      try {
        controllerRef.current.seekTo(media, time);

        // 更新 mediaStore
        updateMediaState();
      } catch (error) {
        console.error('[usePlaybackController] seekTo 失败:', error);
      }
    },
    [updateMediaState]
  );

  /**
   * 更新配置
   */
  const updateConfig = useCallback((config: Partial<PlaybackControllerConfig>) => {
    if (!controllerRef.current) {
      console.warn('[usePlaybackController] Controller 未初始化');
      return;
    }

    try {
      controllerRef.current.updateConfig(config);
      console.log('[usePlaybackController] 配置已更新:', config);
    } catch (error) {
      console.error('[usePlaybackController] updateConfig 失败:', error);
    }
  }, []);

  return {
    controller: controllerRef.current,
    handleSpeed,
    handleSeek,
    handleVolume,
    handlePlayPause,
    setSpeed,
    setVolume,
    toggleMute,
    seekTo,
    updateConfig,
  };
}

/**
 * 便捷 Hook：使用当前媒体元素的播放控制
 *
 * 这个 Hook 自动获取当前目标媒体元素，并提供简化的控制方法。
 *
 * @param options 配置选项
 * @returns 简化的控制方法
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     increaseSpeed,
 *     decreaseSpeed,
 *     resetSpeed,
 *     volumeUp,
 *     volumeDown,
 *     seekForward,
 *     seekBackward,
 *     togglePlayPause,
 *   } = useCurrentMediaPlayback();
 *
 *   return (
 *     <div>
 *       <button onClick={increaseSpeed}>加速</button>
 *       <button onClick={decreaseSpeed}>减速</button>
 *       <button onClick={resetSpeed}>重置</button>
 *       <button onClick={volumeUp}>音量+</button>
 *       <button onClick={volumeDown}>音量-</button>
 *       <button onClick={seekForward}>快进</button>
 *       <button onClick={seekBackward}>快退</button>
 *       <button onClick={togglePlayPause}>播放/暂停</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCurrentMediaPlayback(options: UsePlaybackControllerOptions = {}) {
  const currentMedia = useMediaStore((state) => state.currentMedia);
  const {
    handleSpeed,
    handleVolume,
    handleSeek,
    handlePlayPause,
  } = usePlaybackController(options);

  const increaseSpeed = useCallback(() => {
    if (currentMedia) {
      handleSpeed(currentMedia, 'increase');
    }
  }, [currentMedia, handleSpeed]);

  const decreaseSpeed = useCallback(() => {
    if (currentMedia) {
      handleSpeed(currentMedia, 'decrease');
    }
  }, [currentMedia, handleSpeed]);

  const resetSpeed = useCallback(() => {
    if (currentMedia) {
      handleSpeed(currentMedia, 'reset');
    }
  }, [currentMedia, handleSpeed]);

  const volumeUp = useCallback(() => {
    if (currentMedia) {
      handleVolume(currentMedia, 'up');
    }
  }, [currentMedia, handleVolume]);

  const volumeDown = useCallback(() => {
    if (currentMedia) {
      handleVolume(currentMedia, 'down');
    }
  }, [currentMedia, handleVolume]);

  const seekForward = useCallback(() => {
    if (currentMedia && currentMedia instanceof HTMLVideoElement) {
      handleSeek(currentMedia, 'forward');
    }
  }, [currentMedia, handleSeek]);

  const seekBackward = useCallback(() => {
    if (currentMedia && currentMedia instanceof HTMLVideoElement) {
      handleSeek(currentMedia, 'backward');
    }
  }, [currentMedia, handleSeek]);

  const togglePlayPauseAction = useCallback(() => {
    if (currentMedia) {
      handlePlayPause(currentMedia);
    }
  }, [currentMedia, handlePlayPause]);

  return {
    increaseSpeed,
    decreaseSpeed,
    resetSpeed,
    volumeUp,
    volumeDown,
    seekForward,
    seekBackward,
    togglePlayPause: togglePlayPauseAction,
    hasMedia: !!currentMedia,
  };
}
