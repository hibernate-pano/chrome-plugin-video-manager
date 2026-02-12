/**
 * AnimatedNumber 动画数字组件
 * 使用 React Spring 实现平滑的数字滚动动画
 * @module content/components/AnimatedNumber
 */

import { memo } from 'react';
import { useSpring, animated } from '@react-spring/web';

/**
 * AnimatedNumber Props
 */
interface AnimatedNumberProps {
  /** 数字值 */
  value: number;
  /** 小数位数 */
  decimals?: number;
  /** CSS 类名 */
  className?: string;
  /** 动画配置 */
  config?: {
    tension?: number;
    friction?: number;
    mass?: number;
    clamp?: boolean;
  };
}

/**
 * AnimatedNumber 组件
 * 实现平滑的数字变化动画
 * 使用 React.memo 优化，仅在 value 变化时重新渲染
 */
function AnimatedNumber({
  value,
  decimals = 2,
  className = '',
  config = {
    tension: 170,
    friction: 26,
    mass: 1,
    clamp: false,
  },
}: AnimatedNumberProps) {
  // 使用 React Spring 实现数字滚动动画
  const springProps = useSpring({
    number: value,
    config,
  });

  return (
    <animated.span className={className}>
      {springProps.number.to((n) => n.toFixed(decimals))}
    </animated.span>
  );
}

// 使用 React.memo 优化组件，仅在 props 变化时重新渲染
export default memo(AnimatedNumber, (prevProps, nextProps) => {
  return (
    prevProps.value === nextProps.value &&
    prevProps.decimals === nextProps.decimals &&
    prevProps.className === nextProps.className
  );
});
