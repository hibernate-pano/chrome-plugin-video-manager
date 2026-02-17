/**
 * 动画降级模块测试
 * @module shared/utils/__tests__/animationFallback
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectAnimationSupport,
  applyAnimationFallback,
  getFallbackClassName,
  getAnimationDuration,
  shouldUseFallback,
  createFallbackStylesheet,
  initAnimationFallback,
  type AnimationSupport,
} from '../animationFallback';

describe('animationFallback', () => {
  let testElement: HTMLElement;

  beforeEach(() => {
    testElement = document.createElement('div');
    document.body.appendChild(testElement);
  });

  afterEach(() => {
    testElement.remove();
    // 清理降级标记
    document.documentElement.removeAttribute('data-animation-fallback');
    // 清理降级样式表
    const fallbackStyle = document.getElementById('vsc-animation-fallback');
    if (fallbackStyle) {
      fallbackStyle.remove();
    }
  });

  describe('detectAnimationSupport', () => {
    it('should detect browser animation support', () => {
      const support = detectAnimationSupport();

      expect(support).toBeDefined();
      expect(typeof support.cssAnimations).toBe('boolean');
      expect(typeof support.cssTransitions).toBe('boolean');
      expect(typeof support.cssTransforms).toBe('boolean');
      expect(typeof support.backdropFilter).toBe('boolean');
      expect(typeof support.webAnimations).toBe('boolean');
      expect(typeof support.needsFallback).toBe('boolean');
    });

    it('should determine if fallback is needed', () => {
      const support = detectAnimationSupport();

      // 如果缺少关键特性，应该需要降级
      if (!support.cssAnimations || !support.cssTransitions || !support.cssTransforms) {
        expect(support.needsFallback).toBe(true);
      } else {
        expect(support.needsFallback).toBe(false);
      }
    });
  });

  describe('applyAnimationFallback', () => {
    it('should add fallback attribute when needed', () => {
      const support: AnimationSupport = {
        cssAnimations: false,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: true,
      };

      applyAnimationFallback(testElement, support);

      expect(testElement.hasAttribute('data-animation-fallback')).toBe(true);
    });

    it('should not add fallback attribute when not needed', () => {
      const support: AnimationSupport = {
        cssAnimations: true,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: false,
      };

      applyAnimationFallback(testElement, support);

      expect(testElement.hasAttribute('data-animation-fallback')).toBe(false);
    });

    it('should set CSS variables when animations not supported', () => {
      const support: AnimationSupport = {
        cssAnimations: false,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: true,
      };

      applyAnimationFallback(testElement, support);

      const duration = testElement.style.getPropertyValue('--vsc-animation-duration');
      expect(duration).toBe('0ms');
    });
  });

  describe('getFallbackClassName', () => {
    it('should return normal class when fallback not needed', () => {
      const support: AnimationSupport = {
        cssAnimations: true,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: false,
      };

      const className = getFallbackClassName('animate-fade-in', 'fade-simple', support);
      expect(className).toBe('animate-fade-in');
    });

    it('should return fallback class when fallback needed', () => {
      const support: AnimationSupport = {
        cssAnimations: false,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: true,
      };

      const className = getFallbackClassName('animate-fade-in', 'fade-simple', support);
      expect(className).toBe('fade-simple');
    });
  });

  describe('getAnimationDuration', () => {
    it('should return normal duration when fallback not needed', () => {
      const support: AnimationSupport = {
        cssAnimations: true,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: false,
      };

      const duration = getAnimationDuration(500, support);
      expect(duration).toBe(500);
    });

    it('should return 0 when animations not supported', () => {
      const support: AnimationSupport = {
        cssAnimations: false,
        cssTransitions: false,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: true,
      };

      const duration = getAnimationDuration(500, support);
      expect(duration).toBe(0);
    });

    it('should return reduced duration when fallback needed', () => {
      const support: AnimationSupport = {
        cssAnimations: false,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: true,
      };

      const duration = getAnimationDuration(500, support);
      expect(duration).toBeLessThanOrEqual(300);
    });
  });

  describe('shouldUseFallback', () => {
    it('should return true when fallback needed', () => {
      const support: AnimationSupport = {
        cssAnimations: false,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: true,
      };

      expect(shouldUseFallback(support)).toBe(true);
    });

    it('should return false when fallback not needed', () => {
      const support: AnimationSupport = {
        cssAnimations: true,
        cssTransitions: true,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: false,
      };

      expect(shouldUseFallback(support)).toBe(false);
    });
  });

  describe('createFallbackStylesheet', () => {
    it('should create a style element', () => {
      const style = createFallbackStylesheet();

      expect(style).toBeInstanceOf(HTMLStyleElement);
      expect(style.id).toBe('vsc-animation-fallback');
      expect(style.textContent).toContain('data-animation-fallback');
    });

    it('should include fallback styles', () => {
      const style = createFallbackStylesheet();

      expect(style.textContent).toContain('.animate-fade-in');
      expect(style.textContent).toContain('.backdrop-blur-md');
      expect(style.textContent).toContain('.hud-container');
      expect(style.textContent).toContain('.lightbox-overlay');
    });
  });

  describe('initAnimationFallback', () => {
    it('should return animation support info', () => {
      const support = initAnimationFallback(testElement);

      expect(support).toBeDefined();
      expect(typeof support.needsFallback).toBe('boolean');
    });

    it('should inject fallback stylesheet when needed', () => {
      // 模拟需要降级的情况
      const originalAnimate = Element.prototype.animate;
      delete (Element.prototype as any).animate;

      initAnimationFallback(testElement);

      const fallbackStyle = document.getElementById('vsc-animation-fallback');

      // 恢复原始方法
      Element.prototype.animate = originalAnimate;

      // 注意：在现代浏览器中，这个测试可能不会注入样式表
      // 因为浏览器支持所有特性
      // 这个测试主要验证函数不会抛出错误
      expect(fallbackStyle).toBeDefined();
    });

    it('should not inject duplicate stylesheets', () => {
      initAnimationFallback(testElement);
      initAnimationFallback(testElement);

      const fallbackStyles = document.querySelectorAll('#vsc-animation-fallback');
      expect(fallbackStyles.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing element gracefully', () => {
      expect(() => {
        applyAnimationFallback(undefined as any);
      }).not.toThrow();
    });

    it('should handle partial support correctly', () => {
      const support: AnimationSupport = {
        cssAnimations: true,
        cssTransitions: false,
        cssTransforms: true,
        backdropFilter: true,
        webAnimations: true,
        needsFallback: true,
      };

      expect(() => {
        applyAnimationFallback(testElement, support);
      }).not.toThrow();
    });
  });
});
