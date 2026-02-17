/**
 * CSS 动画 Hook
 * 提供轻量级的动画替代方案，替代 @react-spring/web
 * @module content/hooks/useCSSAnimation
 */

import { useState, useEffect, useRef } from 'react';

/**
 * 动画配置选项
 */
interface AnimationOptions {
  /** 动画持续时间（毫秒） */
  duration?: number;
  /** 延迟开始时间（毫秒） */
  delay?: number;
  /** 是否立即开始 */
  immediate?: boolean;
}

/**
 * 滑动淡入配置选项
 */
interface SlideFadeOptions extends AnimationOptions {
  /** 滑动方向 */
  direction?: 'up' | 'down';
}

/**
 * 淡入动画 Hook
 * 替代 useSpring 的 fade 效果
 */
export function useFadeIn(options: AnimationOptions = {}) {
  const { duration = 300, delay = 0, immediate = true } = options;
  const [isVisible, setIsVisible] = useState(!immediate);

  useEffect(() => {
    if (immediate) {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [immediate, delay]);

  return { isVisible, style: { opacity: isVisible ? 1 : 0, transition: `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)` } };
}

/**
 * 缩放动画 Hook
 * 替代 useSpring 的 scale 效果
 */
export function useScale(options: AnimationOptions = {}) {
  const { duration = 300, delay = 0, immediate = true } = options;
  const [isVisible, setIsVisible] = useState(!immediate);

  useEffect(() => {
    if (immediate) {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [immediate, delay]);

  return {
    isVisible,
    style: {
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'scale(1)' : 'scale(0.5)',
      transition: `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55)`,
    },
  };
}

/**
 * 弹性缩放动画 Hook
 * 替代 useSpring 的 wobbly 效果
 */
export function useBouncyScale(options: AnimationOptions = {}) {
  const { duration = 300, delay = 0, immediate = true } = options;
  const [isVisible, setIsVisible] = useState(!immediate);

  useEffect(() => {
    if (immediate) {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [immediate, delay]);

  return {
    isVisible,
    style: {
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'scale(1)' : 'scale(0.5)',
      transition: `opacity ${duration}ms ease-out, transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55)`,
    },
  };
}

/**
 * 滑动 + 淡入动画 Hook
 * 替代 useSpring 的 fade + y 效果
 */
export function useSlideFadeIn(options: SlideFadeOptions = {}) {
  const { duration = 300, delay = 0, immediate = true, direction = 'up' } = options;
  const [isVisible, setIsVisible] = useState(!immediate);

  useEffect(() => {
    if (immediate) {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [immediate, delay]);

  const translateY = direction === 'up' ? '20px' : '-20px';

  return {
    isVisible,
    style: {
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0) scale(1)' : `translateY(${translateY}) scale(0.5)`,
      transition: `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
    },
  };
}

/**
 * 数值动画 Hook
 * 替代 useSpring 的数字滚动效果
 * 使用 requestAnimationFrame 实现平滑过渡
 */
export function useAnimatedNumber(
  targetValue: number,
  options: { duration?: number; decimals?: number } = {}
) {
  const { duration = 300, decimals = 2 } = options;
  const [displayValue, setDisplayValue] = useState(targetValue);
  const animationRef = useRef<number>();
  const startValueRef = useRef(targetValue);
  const startTimeRef = useRef<number>();

  useEffect(() => {
    // 如果值没有变化，不进行动画
    if (targetValue === displayValue) return;

    startValueRef.current = displayValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // 使用 easeOutCubic 缓动函数
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentValue =
        startValueRef.current + (targetValue - startValueRef.current) * eased;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration]);

  return displayValue.toFixed(decimals);
}

/**
 * 百分比动画 Hook
 * 用于进度条等场景
 */
export function useAnimatedPercent(targetPercent: number, duration = 200) {
  const [percent, setPercent] = useState(targetPercent);
  const animationRef = useRef<number>();
  const startValueRef = useRef(targetPercent);
  const startTimeRef = useRef<number>();

  useEffect(() => {
    if (targetPercent === percent) return;

    startValueRef.current = percent;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutQuad
      const eased = 1 - (1 - progress) * (1 - progress);

      const currentValue = startValueRef.current + (targetPercent - startValueRef.current) * eased;

      setPercent(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetPercent, duration]);

  return percent;
}

/**
 * 脉冲动画 Hook
 * 替代 useSpring 的循环脉冲效果
 */
export function usePulse(options: { scale?: number; duration?: number } = {}) {
  const { scale = 1.1, duration = 1000 } = options;
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsPulsing((prev) => !prev);
    }, duration);

    return () => clearInterval(timer);
  }, [duration]);

  return {
    isPulsing,
    style: {
      transform: `scale(${isPulsing ? scale : 1})`,
      transition: `transform ${duration / 2}ms ease-in-out`,
    },
  };
}

/**
 * 条件动画 Hook
 * 根据条件显示/隐藏元素，带动画
 */
export function useConditionalAnimation(
  condition: boolean,
  options: { enterDuration?: number; exitDuration?: number } = {}
) {
  const { enterDuration = 200, exitDuration = 150 } = options;
  const [isAnimating, setIsAnimating] = useState(condition);

  useEffect(() => {
    if (condition) {
      setIsAnimating(true);
    } else {
      const timer = setTimeout(() => setIsAnimating(false), exitDuration);
      return () => clearTimeout(timer);
    }
  }, [condition, exitDuration]);

  const style = condition
    ? {
        opacity: 1,
        transform: 'scale(1) translateY(0)',
        transition: `opacity ${enterDuration}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${enterDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }
    : {
        opacity: 0,
        transform: 'scale(0.9) translateY(10px)',
        transition: `opacity ${exitDuration}ms ease-in, transform ${exitDuration}ms ease-in`,
      };

  return { isAnimating: isAnimating && condition, show: condition, style };
}
