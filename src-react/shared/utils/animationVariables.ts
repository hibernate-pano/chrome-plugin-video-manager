/**
 * 动画 CSS 变量管理器
 * 提供动态设置和管理动画相关 CSS 变量的功能
 * @module shared/utils/animationVariables
 */

import type { AnimationSpeed } from '../types/shortcuts';
import { detectAnimationSupport, applyAnimationFallback, type AnimationSupport } from './animationFallback';

/**
 * 动画 CSS 变量名称
 */
export const ANIMATION_VARIABLES = {
  // 动画持续时间
  DURATION_FAST: '--vsc-animation-duration-fast',
  DURATION_NORMAL: '--vsc-animation-duration-normal',
  DURATION_SLOW: '--vsc-animation-duration-slow',

  // 当前动画持续时间（根据用户设置）
  DURATION_CURRENT: '--vsc-animation-duration',

  // 缓动函数
  EASING_IN: '--vsc-animation-easing-in',
  EASING_OUT: '--vsc-animation-easing-out',
  EASING_IN_OUT: '--vsc-animation-easing-in-out',
  EASING_SPRING: '--vsc-animation-easing-spring',

  // HUD 动画
  HUD_FADE_DURATION: '--vsc-hud-fade-duration',
  HUD_SCALE_DURATION: '--vsc-hud-scale-duration',

  // Lightbox 动画
  LIGHTBOX_FADE_DURATION: '--vsc-lightbox-fade-duration',
  LIGHTBOX_ZOOM_DURATION: '--vsc-lightbox-zoom-duration',

  // 控制条动画
  CONTROLS_FADE_DURATION: '--vsc-controls-fade-duration',
  CONTROLS_SLIDE_DURATION: '--vsc-controls-slide-duration',
} as const;

/**
 * 默认动画变量值
 */
const DEFAULT_ANIMATION_VALUES: Record<string, string> = {
  // 基础持续时间
  [ANIMATION_VARIABLES.DURATION_FAST]: '150ms',
  [ANIMATION_VARIABLES.DURATION_NORMAL]: '300ms',
  [ANIMATION_VARIABLES.DURATION_SLOW]: '500ms',
  [ANIMATION_VARIABLES.DURATION_CURRENT]: '300ms',

  // 缓动函数
  [ANIMATION_VARIABLES.EASING_IN]: 'cubic-bezier(0.4, 0, 1, 1)',
  [ANIMATION_VARIABLES.EASING_OUT]: 'cubic-bezier(0, 0, 0.2, 1)',
  [ANIMATION_VARIABLES.EASING_IN_OUT]: 'cubic-bezier(0.4, 0, 0.2, 1)',
  [ANIMATION_VARIABLES.EASING_SPRING]: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',

  // HUD 动画
  [ANIMATION_VARIABLES.HUD_FADE_DURATION]: '200ms',
  [ANIMATION_VARIABLES.HUD_SCALE_DURATION]: '200ms',

  // Lightbox 动画
  [ANIMATION_VARIABLES.LIGHTBOX_FADE_DURATION]: '300ms',
  [ANIMATION_VARIABLES.LIGHTBOX_ZOOM_DURATION]: '300ms',

  // 控制条动画
  [ANIMATION_VARIABLES.CONTROLS_FADE_DURATION]: '300ms',
  [ANIMATION_VARIABLES.CONTROLS_SLIDE_DURATION]: '300ms',
};

/**
 * 动画速度到持续时间的映射
 */
const SPEED_TO_DURATION: Record<AnimationSpeed, string> = {
  normal: '300ms',
  fast: '150ms',
  off: '0ms',
};

/**
 * 设置 CSS 变量
 *
 * @param element 目标元素（默认为 document.documentElement）
 * @param name 变量名
 * @param value 变量值
 */
function setCSSVariable(
  element: HTMLElement,
  name: string,
  value: string
): void {
  element.style.setProperty(name, value);
}

/**
 * 获取 CSS 变量
 *
 * @param element 目标元素（默认为 document.documentElement）
 * @param name 变量名
 * @returns 变量值
 */
function getCSSVariable(
  element: HTMLElement,
  name: string
): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/**
 * 初始化动画 CSS 变量
 *
 * 在应用启动时调用，设置所有默认的动画变量
 * 同时检测浏览器支持并应用降级方案
 *
 * @param element 目标元素（默认为 document.documentElement）
 * @returns 动画支持检测结果
 */
export function initAnimationVariables(
  element: HTMLElement = document.documentElement
): AnimationSupport {
  // 检测浏览器动画支持
  const support = detectAnimationSupport();

  // 设置默认动画变量
  Object.entries(DEFAULT_ANIMATION_VALUES).forEach(([name, value]) => {
    setCSSVariable(element, name, value);
  });

  // 如果需要降级，应用降级方案
  if (support.needsFallback) {
    applyAnimationFallback(element, support);
  }

  return support;
}

/**
 * 更新动画速度
 *
 * 根据用户设置更新所有动画相关的 CSS 变量
 *
 * @param speed 动画速度设置
 * @param element 目标元素（默认为 document.documentElement）
 */
export function updateAnimationSpeed(
  speed: AnimationSpeed,
  element: HTMLElement = document.documentElement
): void {
  const duration = SPEED_TO_DURATION[speed];

  // 更新当前持续时间
  setCSSVariable(element, ANIMATION_VARIABLES.DURATION_CURRENT, duration);

  // 如果动画关闭，将所有动画持续时间设为 0
  if (speed === 'off') {
    setCSSVariable(element, ANIMATION_VARIABLES.HUD_FADE_DURATION, '0ms');
    setCSSVariable(element, ANIMATION_VARIABLES.HUD_SCALE_DURATION, '0ms');
    setCSSVariable(element, ANIMATION_VARIABLES.LIGHTBOX_FADE_DURATION, '0ms');
    setCSSVariable(element, ANIMATION_VARIABLES.LIGHTBOX_ZOOM_DURATION, '0ms');
    setCSSVariable(element, ANIMATION_VARIABLES.CONTROLS_FADE_DURATION, '0ms');
    setCSSVariable(element, ANIMATION_VARIABLES.CONTROLS_SLIDE_DURATION, '0ms');
  } else {
    // 根据速度调整各个动画的持续时间
    const multiplier = speed === 'fast' ? 0.5 : 1;

    setCSSVariable(
      element,
      ANIMATION_VARIABLES.HUD_FADE_DURATION,
      `${200 * multiplier}ms`
    );
    setCSSVariable(
      element,
      ANIMATION_VARIABLES.HUD_SCALE_DURATION,
      `${200 * multiplier}ms`
    );
    setCSSVariable(
      element,
      ANIMATION_VARIABLES.LIGHTBOX_FADE_DURATION,
      `${300 * multiplier}ms`
    );
    setCSSVariable(
      element,
      ANIMATION_VARIABLES.LIGHTBOX_ZOOM_DURATION,
      `${300 * multiplier}ms`
    );
    setCSSVariable(
      element,
      ANIMATION_VARIABLES.CONTROLS_FADE_DURATION,
      `${300 * multiplier}ms`
    );
    setCSSVariable(
      element,
      ANIMATION_VARIABLES.CONTROLS_SLIDE_DURATION,
      `${300 * multiplier}ms`
    );
  }
}

/**
 * 应用 prefers-reduced-motion 设置
 *
 * 当系统偏好减少动画时，禁用所有动画
 *
 * @param element 目标元素（默认为 document.documentElement）
 */
export function applyReducedMotion(
  element: HTMLElement = document.documentElement
): void {
  // 检测系统偏好
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (prefersReducedMotion) {
    // 禁用所有动画
    updateAnimationSpeed('off', element);

    // 添加数据属性标记
    element.setAttribute('data-reduced-motion', 'true');
  } else {
    // 移除标记
    element.removeAttribute('data-reduced-motion');
  }
}

/**
 * 监听 prefers-reduced-motion 变化
 *
 * @param callback 变化时的回调函数
 * @returns 清理函数
 */
export function watchReducedMotion(
  callback: (matches: boolean) => void
): () => void {
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // 立即执行一次
  callback(mediaQuery.matches);

  // 监听变化
  const handleChange = (e: MediaQueryListEvent) => {
    callback(e.matches);
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleChange);
  } else {
    // @ts-ignore - 兼容旧版 Safari
    mediaQuery.addListener(handleChange);
  }

  // 返回清理函数
  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handleChange);
    } else {
      // @ts-ignore - 兼容旧版 Safari
      mediaQuery.removeListener(handleChange);
    }
  };
}

/**
 * 获取当前动画配置
 *
 * @param element 目标元素（默认为 document.documentElement）
 * @returns 动画配置对象
 */
export function getAnimationConfig(
  element: HTMLElement = document.documentElement
): {
  duration: string;
  hudFadeDuration: string;
  lightboxFadeDuration: string;
  controlsFadeDuration: string;
  reducedMotion: boolean;
} {
  return {
    duration: getCSSVariable(element, ANIMATION_VARIABLES.DURATION_CURRENT),
    hudFadeDuration: getCSSVariable(element, ANIMATION_VARIABLES.HUD_FADE_DURATION),
    lightboxFadeDuration: getCSSVariable(element, ANIMATION_VARIABLES.LIGHTBOX_FADE_DURATION),
    controlsFadeDuration: getCSSVariable(element, ANIMATION_VARIABLES.CONTROLS_FADE_DURATION),
    reducedMotion: element.hasAttribute('data-reduced-motion'),
  };
}
