/**
 * 动画配置 Hook
 * 根据用户设置和系统偏好提供动画配置
 * @module shared/hooks/useAnimationConfig
 */

import { useEffect, useState, useMemo } from 'react';
import { useAnimationSpeed } from '../stores/settingsStore';
import type { AnimationSpeed } from '../types/shortcuts';

/**
 * 动画配置接口
 */
export interface AnimationConfig {
  /** 是否启用动画 */
  enabled: boolean;
  /** 动画持续时间（毫秒） */
  duration: number;
  /** 动画持续时间类名 */
  durationClass: string;
  /** 是否因系统偏好而禁用 */
  reducedMotion: boolean;
  /** 原始动画速度设置 */
  speed: AnimationSpeed;
}

/**
 * 动画持续时间映射
 */
const ANIMATION_DURATIONS: Record<AnimationSpeed, number> = {
  normal: 300,
  fast: 150,
  off: 0,
};

/**
 * 动画持续时间类名映射
 */
const ANIMATION_DURATION_CLASSES: Record<AnimationSpeed, string> = {
  normal: 'duration-300',
  fast: 'duration-150',
  off: 'duration-0',
};

/**
 * 使用动画配置 Hook
 *
 * 根据用户设置和系统 prefers-reduced-motion 偏好返回动画配置
 *
 * @returns 动画配置对象
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const animConfig = useAnimationConfig();
 *
 *   return (
 *     <div className={`transition-all ${animConfig.durationClass}`}>
 *       {animConfig.enabled ? '动画启用' : '动画禁用'}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAnimationConfig(): AnimationConfig {
  const speed = useAnimationSpeed();
  const [reducedMotion, setReducedMotion] = useState(false);

  // 检测系统 prefers-reduced-motion 偏好
  useEffect(() => {
    // 创建媒体查询
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // 设置初始值
    setReducedMotion(mediaQuery.matches);

    // 监听变化
    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    // 添加监听器（兼容旧版浏览器）
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // @ts-ignore - 兼容旧版 Safari
      mediaQuery.addListener(handleChange);
    }

    // 清理函数
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        // @ts-ignore - 兼容旧版 Safari
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  // 计算动画配置
  const config = useMemo<AnimationConfig>(() => {
    // 如果系统偏好减少动画，强制禁用
    if (reducedMotion) {
      return {
        enabled: false,
        duration: 0,
        durationClass: 'duration-0',
        reducedMotion: true,
        speed,
      };
    }

    // 根据用户设置返回配置
    const enabled = speed !== 'off';
    const duration = ANIMATION_DURATIONS[speed];
    const durationClass = ANIMATION_DURATION_CLASSES[speed];

    return {
      enabled,
      duration,
      durationClass,
      reducedMotion: false,
      speed,
    };
  }, [speed, reducedMotion]);

  return config;
}

/**
 * 获取动画类名 Hook
 *
 * 根据动画配置返回适当的动画类名
 *
 * @param baseClass 基础类名
 * @param animatedClass 启用动画时的类名
 * @returns 最终类名
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const className = useAnimationClass('opacity-100', 'animate-fade-in');
 *   return <div className={className}>内容</div>;
 * }
 * ```
 */
export function useAnimationClass(
  baseClass: string,
  animatedClass: string
): string {
  const { enabled } = useAnimationConfig();
  return enabled ? `${baseClass} ${animatedClass}` : baseClass;
}

/**
 * 获取过渡类名 Hook
 *
 * 根据动画配置返回适当的过渡类名
 *
 * @param transitionClass 过渡类名
 * @returns 最终类名（如果动画禁用则返回空字符串）
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const transitionClass = useTransitionClass('transition-all duration-300');
 *   return <div className={transitionClass}>内容</div>;
 * }
 * ```
 */
export function useTransitionClass(transitionClass: string): string {
  const { enabled } = useAnimationConfig();
  return enabled ? transitionClass : '';
}
