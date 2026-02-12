/**
 * 快进快退指示器组件
 * 使用 React Spring 实现炫酷的弹性动画效果
 * @module content/components/SeekIndicator
 */

import { memo, useMemo } from 'react';
import { useSpring, animated, config } from '@react-spring/web';

/**
 * 快进快退指示器属性接口
 */
interface SeekIndicatorProps {
  /** 跳转的秒数（正数为快进，负数为快退） */
  value: number;
}

/**
 * 快进快退指示器组件
 * 显示跳转的秒数和方向，带有炫酷的弹性动画效果
 * 使用 React.memo 优化，仅在 value 变化时重新渲染
 */
function SeekIndicator({ value }: SeekIndicatorProps) {
  // 判断是快进还是快退，使用 useMemo 缓存计算结果
  const isForward = useMemo(() => value > 0, [value]);
  const absValue = useMemo(() => Math.abs(value), [value]);

  // 使用 React Spring 实现淡入淡出和弹性缩放动画
  // 使用预设的 wobbly 配置，创造更有弹性的入场效果
  const fadeSpring = useSpring({
    from: {
      opacity: 0,
      scale: 0.5,
      rotate: isForward ? -15 : 15,  // 根据方向旋转
    },
    to: {
      opacity: 1,
      scale: 1,
      rotate: 0,
    },
    config: config.wobbly,
  });

  // 使用 React Spring 实现箭头的弹性动画
  // 增强弹性效果，让箭头有更明显的弹跳
  const arrowConfig = useMemo(() => ({
    tension: 200,
    friction: 12,
    clamp: false,  // 允许过冲
  }), []);

  const arrowSpring = useSpring({
    from: {
      x: isForward ? -30 : 30,  // 增大初始偏移
      scale: 0.5,
    },
    to: {
      x: 0,
      scale: 1,
    },
    config: arrowConfig,
  });

  // 添加箭头的持续脉冲效果
  const pulseSpring = useSpring({
    from: { scale: 1 },
    to: { scale: 1.2 },
    loop: { reverse: true },
    config: {
      tension: 300,
      friction: 10,
    },
  });

  // 根据方向选择颜色，使用 useMemo 缓存
  const colorClass = useMemo(() =>
    isForward ? 'text-emerald-500' : 'text-amber-500',
    [isForward]
  );

  // 使用 useMemo 缓存方向文本
  const directionText = useMemo(() =>
    isForward ? 'Forward' : 'Backward',
    [isForward]
  );

  // 使用 useMemo 缓存箭头符号
  const arrowSymbol = useMemo(() =>
    isForward ? '→' : '←',
    [isForward]
  );

  return (
    <animated.div
      className="
        flex flex-col items-center justify-center
        px-6 py-4 min-w-[140px]
        bg-black/85 backdrop-blur-md
        rounded-hud shadow-hud
      "
      style={{
        opacity: fadeSpring.opacity,
        transform: fadeSpring.scale.to(
          (s) => `scale(${s}) rotate(${fadeSpring.rotate.get()}deg)`
        ),
      }}
    >
      <div className="text-xs text-white/70 mb-1 uppercase tracking-wide font-medium">
        {directionText}
      </div>
      <div className="flex items-center gap-2">
        <animated.div
          className={`text-[28px] font-bold leading-none ${colorClass}`}
          style={{
            transform: arrowSpring.x.to(
              (x) => `translateX(${x}px) scale(${arrowSpring.scale.get() * pulseSpring.scale.get()})`
            ),
          }}
        >
          {arrowSymbol}
        </animated.div>
        <div className="flex items-baseline">
          <animated.span
            className={`text-[32px] font-bold leading-none tabular-nums ${colorClass}`}
            style={{
              transform: pulseSpring.scale.to((s) => `scale(${s})`),
            }}
          >
            {absValue}
          </animated.span>
          <span className="text-base text-white/80 font-semibold">s</span>
        </div>
      </div>
    </animated.div>
  );
}

// 使用 React.memo 优化组件，仅在 value 变化时重新渲染
export default memo(SeekIndicator, (prevProps, nextProps) => {
  return prevProps.value === nextProps.value;
});
