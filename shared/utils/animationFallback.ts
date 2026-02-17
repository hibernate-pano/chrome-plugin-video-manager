/**
 * 动画降级检测和处理模块
 * 检测浏览器对关键动画特性的支持，并提供降级方案
 * @module shared/utils/animationFallback
 */

/**
 * 浏览器动画支持检测结果
 */
export interface AnimationSupport {
  /** 是否支持 CSS 动画 */
  cssAnimations: boolean;
  /** 是否支持 CSS 过渡 */
  cssTransitions: boolean;
  /** 是否支持 CSS Transform */
  cssTransforms: boolean;
  /** 是否支持 backdrop-filter */
  backdropFilter: boolean;
  /** 是否支持 Web Animations API */
  webAnimations: boolean;
  /** 是否需要降级 */
  needsFallback: boolean;
}

/**
 * 检测浏览器对 CSS 动画的支持
 */
function detectCSSAnimations(): boolean {
  const element = document.createElement('div');
  const style = element.style;

  // 检测标准属性和带前缀的属性
  return (
    'animation' in style ||
    'webkitAnimation' in style ||
    'MozAnimation' in style ||
    'OAnimation' in style
  );
}

/**
 * 检测浏览器对 CSS 过渡的支持
 */
function detectCSSTransitions(): boolean {
  const element = document.createElement('div');
  const style = element.style;

  return (
    'transition' in style ||
    'webkitTransition' in style ||
    'MozTransition' in style ||
    'OTransition' in style
  );
}

/**
 * 检测浏览器对 CSS Transform 的支持
 */
function detectCSSTransforms(): boolean {
  const element = document.createElement('div');
  const style = element.style;

  return (
    'transform' in style ||
    'webkitTransform' in style ||
    'MozTransform' in style ||
    'OTransform' in style ||
    'msTransform' in style
  );
}

/**
 * 检测浏览器对 backdrop-filter 的支持
 */
function detectBackdropFilter(): boolean {
  const element = document.createElement('div');
  const style = element.style;

  return (
    'backdropFilter' in style ||
    'webkitBackdropFilter' in style
  );
}

/**
 * 检测浏览器对 Web Animations API 的支持
 */
function detectWebAnimations(): boolean {
  return typeof Element !== 'undefined' && 'animate' in Element.prototype;
}

/**
 * 检测浏览器动画支持情况
 *
 * @returns 动画支持检测结果
 */
export function detectAnimationSupport(): AnimationSupport {
  const cssAnimations = detectCSSAnimations();
  const cssTransitions = detectCSSTransitions();
  const cssTransforms = detectCSSTransforms();
  const backdropFilter = detectBackdropFilter();
  const webAnimations = detectWebAnimations();

  // 如果缺少关键特性，则需要降级
  const needsFallback = !cssAnimations || !cssTransitions || !cssTransforms;

  return {
    cssAnimations,
    cssTransitions,
    cssTransforms,
    backdropFilter,
    webAnimations,
    needsFallback,
  };
}

/**
 * 应用动画降级方案
 *
 * 当浏览器不支持某些动画特性时，应用简单的过渡效果作为降级
 *
 * @param element 目标元素（默认为 document.documentElement）
 * @param support 动画支持检测结果（可选，如果不提供则自动检测）
 */
export function applyAnimationFallback(
  element: HTMLElement = document.documentElement,
  support?: AnimationSupport
): void {
  const animationSupport = support || detectAnimationSupport();

  // 如果不需要降级，直接返回
  if (!animationSupport.needsFallback) {
    return;
  }

  // 添加降级标记
  element.setAttribute('data-animation-fallback', 'true');

  // 如果不支持 CSS 动画，禁用所有动画
  if (!animationSupport.cssAnimations) {
    element.style.setProperty('--vsc-animation-duration', '0ms');
    element.style.setProperty('--vsc-hud-fade-duration', '0ms');
    element.style.setProperty('--vsc-hud-scale-duration', '0ms');
    element.style.setProperty('--vsc-lightbox-fade-duration', '0ms');
    element.style.setProperty('--vsc-lightbox-zoom-duration', '0ms');
    element.style.setProperty('--vsc-controls-fade-duration', '0ms');
    element.style.setProperty('--vsc-controls-slide-duration', '0ms');
  }

  // 如果不支持 CSS Transform，使用简单的 opacity 过渡
  if (!animationSupport.cssTransforms) {
    element.style.setProperty('--vsc-use-transform', '0');
  }

  // 如果不支持 backdrop-filter，使用纯色背景
  if (!animationSupport.backdropFilter) {
    element.style.setProperty('--vsc-use-backdrop-blur', '0');
  }

  console.warn('浏览器不完全支持动画特性，已应用降级方案', animationSupport);
}

/**
 * 获取降级后的动画类名
 *
 * 根据浏览器支持情况，返回适当的 CSS 类名
 *
 * @param normalClass 正常情况下的类名
 * @param fallbackClass 降级情况下的类名
 * @param support 动画支持检测结果（可选）
 * @returns 适当的 CSS 类名
 */
export function getFallbackClassName(
  normalClass: string,
  fallbackClass: string,
  support?: AnimationSupport
): string {
  const animationSupport = support || detectAnimationSupport();
  return animationSupport.needsFallback ? fallbackClass : normalClass;
}

/**
 * 创建降级样式表
 *
 * 生成一个包含降级样式的 style 元素
 *
 * @returns style 元素
 */
export function createFallbackStylesheet(): HTMLStyleElement {
  const style = document.createElement('style');
  style.id = 'vsc-animation-fallback';
  style.textContent = `
    /* 动画降级样式 */
    [data-animation-fallback="true"] {
      /* 禁用复杂动画，使用简单过渡 */
    }

    /* 如果不支持 transform，使用 opacity 过渡 */
    [data-animation-fallback="true"] .animate-fade-in,
    [data-animation-fallback="true"] .animate-fade-out,
    [data-animation-fallback="true"] .animate-scale-in,
    [data-animation-fallback="true"] .animate-scale-out,
    [data-animation-fallback="true"] .animate-zoom-in,
    [data-animation-fallback="true"] .animate-zoom-out {
      animation: none !important;
      transition: opacity 0.3s ease !important;
    }

    /* 如果不支持 backdrop-filter，使用纯色背景 */
    [data-animation-fallback="true"] .backdrop-blur-md {
      backdrop-filter: none !important;
      background-color: rgba(0, 0, 0, 0.9) !important;
    }

    /* HUD 降级样式 */
    [data-animation-fallback="true"] .hud-container {
      animation: none !important;
      transition: opacity 0.2s ease !important;
    }

    /* Lightbox 降级样式 */
    [data-animation-fallback="true"] .lightbox-overlay {
      animation: none !important;
      transition: opacity 0.3s ease !important;
    }

    /* 控制条降级样式 */
    [data-animation-fallback="true"] .lightbox-controls {
      animation: none !important;
      transition: opacity 0.3s ease, transform 0.3s ease !important;
    }

    /* 禁用弹性动画 */
    [data-animation-fallback="true"] .animate-bounce-in,
    [data-animation-fallback="true"] .animate-hud-appear {
      animation: none !important;
      transition: opacity 0.2s ease !important;
    }

    /* 禁用数字滚动动画 */
    [data-animation-fallback="true"] .animate-number-roll {
      animation: none !important;
    }
  `;

  return style;
}

/**
 * 初始化动画降级系统
 *
 * 检测浏览器支持，应用降级方案，并注入降级样式
 *
 * @param element 目标元素（默认为 document.documentElement）
 * @returns 动画支持检测结果
 */
export function initAnimationFallback(
  element: HTMLElement = document.documentElement
): AnimationSupport {
  // 检测浏览器支持
  const support = detectAnimationSupport();

  // 如果需要降级，应用降级方案
  if (support.needsFallback) {
    applyAnimationFallback(element, support);

    // 注入降级样式表
    const existingStyle = document.getElementById('vsc-animation-fallback');
    if (!existingStyle) {
      const style = createFallbackStylesheet();
      document.head.appendChild(style);
    }
  }

  return support;
}

/**
 * 获取动画持续时间
 *
 * 根据浏览器支持情况，返回适当的动画持续时间
 *
 * @param normalDuration 正常情况下的持续时间（毫秒）
 * @param support 动画支持检测结果（可选）
 * @returns 适当的持续时间（毫秒）
 */
export function getAnimationDuration(
  normalDuration: number,
  support?: AnimationSupport
): number {
  const animationSupport = support || detectAnimationSupport();

  // 如果需要降级，使用更短的持续时间或禁用动画
  if (animationSupport.needsFallback) {
    // 如果完全不支持动画，返回 0
    if (!animationSupport.cssAnimations && !animationSupport.cssTransitions) {
      return 0;
    }
    // 如果支持过渡但不支持动画，使用简化的持续时间
    return Math.min(normalDuration, 300);
  }

  return normalDuration;
}

/**
 * 检查是否应该使用降级方案
 *
 * @param support 动画支持检测结果（可选）
 * @returns 是否应该使用降级方案
 */
export function shouldUseFallback(support?: AnimationSupport): boolean {
  const animationSupport = support || detectAnimationSupport();
  return animationSupport.needsFallback;
}
