/**
 * HUD 状态管理 Store
 * 使用 Zustand 管理 HUD 的显示状态和自动隐藏逻辑
 * @module shared/stores/hudStore
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { HUDState, HUDShowOptions, HUDConfig } from '../types/hud';
import { DEFAULT_HUD_CONFIG } from '../types/hud';

/**
 * HUD Store 接口
 * 定义 HUD 状态和操作方法
 */
interface HUDStore extends HUDState {
  // 配置
  config: HUDConfig;

  // Actions
  /**
   * 显示 HUD
   * @param options 显示选项
   */
  show: (options: HUDShowOptions) => void;

  /**
   * 隐藏 HUD
   */
  hide: () => void;

  /**
   * 更新 HUD 配置
   * @param config 部分配置对象
   */
  updateConfig: (config: Partial<HUDConfig>) => void;

  /**
   * 取消当前的自动隐藏定时器
   */
  cancelTimeout: () => void;

  /**
   * 重置 Store 到初始状态
   */
  reset: () => void;
}

/**
 * 初始状态
 */
const initialState: HUDState = {
  visible: false,
  type: null,
  value: 0,
  timeout: null,
};

/**
 * HUD 状态管理 Store
 * 使用 Zustand 的 devtools 中间件支持 Redux DevTools 调试
 */
export const useHUDStore = create<HUDStore>()(
  devtools(
    (set, get) => ({
      // 初始状态
      ...initialState,
      config: DEFAULT_HUD_CONFIG,

      // Actions
      show: (options: HUDShowOptions) => {
        const { type, value, duration } = options;
        const { config } = get();

        // 取消之前的定时器
        get().cancelTimeout();

        // 计算显示持续时间
        const displayDuration = duration ?? config.displayDuration;

        // 设置新的自动隐藏定时器
        const timeoutId = window.setTimeout(() => {
          get().hide();
        }, displayDuration);

        // 更新状态
        set(
          {
            visible: true,
            type,
            value,
            timeout: timeoutId,
          },
          false,
          'show'
        );
      },

      hide: () => {
        // 取消定时器
        get().cancelTimeout();

        // 隐藏 HUD
        set(
          {
            visible: false,
            type: null,
            timeout: null,
          },
          false,
          'hide'
        );
      },

      updateConfig: (newConfig: Partial<HUDConfig>) => {
        const { config } = get();

        set(
          {
            config: {
              ...config,
              ...newConfig,
            },
          },
          false,
          'updateConfig'
        );
      },

      cancelTimeout: () => {
        const { timeout } = get();

        if (timeout !== null) {
          clearTimeout(timeout);
          set({ timeout: null }, false, 'cancelTimeout');
        }
      },

      reset: () => {
        // 取消定时器
        get().cancelTimeout();

        // 重置状态
        set(
          {
            ...initialState,
            config: DEFAULT_HUD_CONFIG,
          },
          false,
          'reset'
        );
      },
    }),
    {
      name: 'HUDStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);

/**
 * 选择器 Hooks
 * 提供便捷的状态选择器
 */

/**
 * 获取 HUD 可见性
 */
export const useHUDVisible = () => useHUDStore((state) => state.visible);

/**
 * 获取 HUD 类型
 */
export const useHUDType = () => useHUDStore((state) => state.type);

/**
 * 获取 HUD 显示的值
 */
export const useHUDValue = () => useHUDStore((state) => state.value);

/**
 * 获取 HUD 配置
 */
export const useHUDConfig = () => useHUDStore((state) => state.config);

/**
 * 获取 HUD 操作
 */
export const useHUDActions = () => useHUDStore((state) => ({
  show: state.show,
  hide: state.hide,
  updateConfig: state.updateConfig,
  cancelTimeout: state.cancelTimeout,
  reset: state.reset,
}));

/**
 * 获取完整的 HUD 状态（用于需要多个状态值的场景）
 */
export const useHUDState = () => useHUDStore((state) => ({
  visible: state.visible,
  type: state.type,
  value: state.value,
  timeout: state.timeout,
}));

/**
 * 便捷的 Hook：显示速度指示器
 * @param speed 播放速度
 * @param duration 可选的显示持续时间
 */
export const useShowSpeed = () => {
  const show = useHUDStore((state) => state.show);

  return (speed: number, duration?: number) => {
    show({
      type: 'speed',
      value: speed,
      duration,
    });
  };
};

/**
 * 便捷的 Hook：显示音量指示器
 * @param volume 音量值（0-1）
 * @param duration 可选的显示持续时间
 */
export const useShowVolume = () => {
  const show = useHUDStore((state) => state.show);

  return (volume: number, duration?: number) => {
    show({
      type: 'volume',
      value: volume,
      duration,
    });
  };
};

/**
 * 便捷的 Hook：显示跳转指示器
 * @param seconds 跳转的秒数（正数为快进，负数为快退）
 * @param duration 可选的显示持续时间
 */
export const useShowSeek = () => {
  const show = useHUDStore((state) => state.show);

  return (seconds: number, duration?: number) => {
    show({
      type: 'seek',
      value: seconds,
      duration,
    });
  };
};

/**
 * 便捷的 Hook：显示重置指示器
 * @param duration 可选的显示持续时间
 */
export const useShowReset = () => {
  const show = useHUDStore((state) => state.show);

  return (duration?: number) => {
    show({
      type: 'reset',
      value: 1.0,
      duration,
    });
  };
};
