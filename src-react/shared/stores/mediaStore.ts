/**
 * 媒体状态管理 Store
 * 使用 Zustand 管理媒体元素的状态和控制操作
 * @module shared/stores/mediaStore
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MediaState } from '../types/media';

/**
 * 媒体 Store 接口
 * 定义媒体状态和操作方法
 */
interface MediaStore extends MediaState {
  // Actions
  /**
   * 设置当前活动的媒体元素
   * @param media 媒体元素或 null
   */
  setCurrentMedia: (media: HTMLMediaElement | null) => void;

  /**
   * 设置播放速率
   * @param rate 播放速率（0.25 - 16.0）
   */
  setPlaybackRate: (rate: number) => void;

  /**
   * 增加播放速率
   * @param step 增加的步长，默认 0.25
   */
  increasePlaybackRate: (step?: number) => void;

  /**
   * 降低播放速率
   * @param step 降低的步长，默认 0.25
   */
  decreasePlaybackRate: (step?: number) => void;

  /**
   * 重置播放速率为 1.0
   */
  resetPlaybackRate: () => void;

  /**
   * 设置音量
   * @param volume 音量值（0-1）
   */
  setVolume: (volume: number) => void;

  /**
   * 增加音量
   * @param step 增加的步长，默认 0.1
   */
  increaseVolume: (step?: number) => void;

  /**
   * 降低音量
   * @param step 降低的步长，默认 0.1
   */
  decreaseVolume: (step?: number) => void;

  /**
   * 切换播放/暂停状态
   */
  togglePlayPause: () => void;

  /**
   * 切换全屏状态
   */
  toggleFullscreen: () => void;

  /**
   * 快进
   * @param seconds 快进的秒数，默认 10
   */
  seekForward: (seconds?: number) => void;

  /**
   * 快退
   * @param seconds 快退的秒数，默认 10
   */
  seekBackward: (seconds?: number) => void;

  /**
   * 更新媒体状态
   * 从当前媒体元素同步状态
   */
  updateMediaState: () => void;

  /**
   * 重置 Store 到初始状态
   */
  reset: () => void;
}

/**
 * 初始状态
 */
const initialState: MediaState = {
  currentMedia: null,
  playbackRate: 1.0,
  volume: 1.0,
  isPaused: true,
  currentTime: 0,
  duration: 0,
  isFullscreen: false,
};

/**
 * 限制数值在指定范围内
 * @param value 要限制的值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的值
 */
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * 媒体状态管理 Store
 * 使用 Zustand 的 devtools 中间件支持 Redux DevTools 调试
 */
export const useMediaStore = create<MediaStore>()(
  devtools(
    (set, get) => ({
      // 初始状态
      ...initialState,

      // Actions
      setCurrentMedia: (media) => {
        set({ currentMedia: media }, false, 'setCurrentMedia');

        // 如果设置了新的媒体元素，同步其状态
        if (media) {
          get().updateMediaState();
        } else {
          // 如果清除媒体元素，重置状态
          set({
            playbackRate: 1.0,
            volume: 1.0,
            isPaused: true,
            currentTime: 0,
            duration: 0,
          }, false, 'resetMediaState');
        }
      },

      setPlaybackRate: (rate) => {
        const { currentMedia } = get();
        const clampedRate = clamp(rate, 0.25, 16.0);

        if (currentMedia) {
          currentMedia.playbackRate = clampedRate;
        }

        set({ playbackRate: clampedRate }, false, 'setPlaybackRate');
      },

      increasePlaybackRate: (step = 0.25) => {
        const { playbackRate } = get();
        const newRate = playbackRate + step;
        get().setPlaybackRate(newRate);
      },

      decreasePlaybackRate: (step = 0.25) => {
        const { playbackRate } = get();
        const newRate = playbackRate - step;
        get().setPlaybackRate(newRate);
      },

      resetPlaybackRate: () => {
        get().setPlaybackRate(1.0);
      },

      setVolume: (volume) => {
        const { currentMedia } = get();
        const clampedVolume = clamp(volume, 0, 1);

        if (currentMedia) {
          currentMedia.volume = clampedVolume;
        }

        set({ volume: clampedVolume }, false, 'setVolume');
      },

      increaseVolume: (step = 0.1) => {
        const { volume } = get();
        const newVolume = volume + step;
        get().setVolume(newVolume);
      },

      decreaseVolume: (step = 0.1) => {
        const { volume } = get();
        const newVolume = volume - step;
        get().setVolume(newVolume);
      },

      togglePlayPause: () => {
        const { currentMedia, isPaused } = get();

        if (!currentMedia) {
          return;
        }

        try {
          if (isPaused) {
            currentMedia.play().catch((error) => {
              console.error('播放失败:', error);
            });
          } else {
            currentMedia.pause();
          }

          set({ isPaused: !isPaused }, false, 'togglePlayPause');
        } catch (error) {
          console.error('切换播放状态失败:', error);
        }
      },

      toggleFullscreen: () => {
        const { isFullscreen } = get();

        try {
          if (!isFullscreen) {
            // 进入全屏
            if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen();
            }
          } else {
            // 退出全屏
            if (document.exitFullscreen) {
              document.exitFullscreen();
            }
          }

          set({ isFullscreen: !isFullscreen }, false, 'toggleFullscreen');
        } catch (error) {
          console.error('切换全屏状态失败:', error);
        }
      },

      seekForward: (seconds = 10) => {
        const { currentMedia } = get();

        if (!currentMedia) {
          return;
        }

        try {
          const newTime = Math.min(
            currentMedia.duration,
            currentMedia.currentTime + seconds
          );
          currentMedia.currentTime = newTime;

          set({ currentTime: newTime }, false, 'seekForward');
        } catch (error) {
          console.error('快进失败:', error);
        }
      },

      seekBackward: (seconds = 10) => {
        const { currentMedia } = get();

        if (!currentMedia) {
          return;
        }

        try {
          const newTime = Math.max(
            0,
            currentMedia.currentTime - seconds
          );
          currentMedia.currentTime = newTime;

          set({ currentTime: newTime }, false, 'seekBackward');
        } catch (error) {
          console.error('快退失败:', error);
        }
      },

      updateMediaState: () => {
        const { currentMedia } = get();

        if (!currentMedia) {
          return;
        }

        set({
          playbackRate: currentMedia.playbackRate,
          volume: currentMedia.volume,
          isPaused: currentMedia.paused,
          currentTime: currentMedia.currentTime,
          duration: currentMedia.duration || 0,
        }, false, 'updateMediaState');
      },

      reset: () => {
        set(initialState, false, 'reset');
      },
    }),
    {
      name: 'MediaStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);

/**
 * 选择器 Hooks
 * 提供便捷的状态选择器
 */

/**
 * 获取当前媒体元素
 */
export const useCurrentMedia = () => useMediaStore((state) => state.currentMedia);

/**
 * 获取播放速率
 */
export const usePlaybackRate = () => useMediaStore((state) => state.playbackRate);

/**
 * 获取音量
 */
export const useVolume = () => useMediaStore((state) => state.volume);

/**
 * 获取播放状态
 */
export const useIsPaused = () => useMediaStore((state) => state.isPaused);

/**
 * 获取全屏状态
 */
export const useIsFullscreen = () => useMediaStore((state) => state.isFullscreen);

/**
 * 获取媒体控制操作
 */
export const useMediaActions = () => useMediaStore((state) => ({
  setCurrentMedia: state.setCurrentMedia,
  setPlaybackRate: state.setPlaybackRate,
  increasePlaybackRate: state.increasePlaybackRate,
  decreasePlaybackRate: state.decreasePlaybackRate,
  resetPlaybackRate: state.resetPlaybackRate,
  setVolume: state.setVolume,
  increaseVolume: state.increaseVolume,
  decreaseVolume: state.decreaseVolume,
  togglePlayPause: state.togglePlayPause,
  toggleFullscreen: state.toggleFullscreen,
  seekForward: state.seekForward,
  seekBackward: state.seekBackward,
  updateMediaState: state.updateMediaState,
  reset: state.reset,
}));
