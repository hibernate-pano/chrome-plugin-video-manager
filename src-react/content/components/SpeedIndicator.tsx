/**
 * 速度指示器组件
 * 使用 React Spring 实现平滑的数字滚动动画和炫酷的弹性效果
 * @module content/components/SpeedIndicator
 */

import { memo, useMemo } from 'react';
import { useSpring, animated, config } from '@react-spring/web';
import AnimatedNumber from './AnimatedNumber';

/**
 * 速度指示器属性接口
 */
interface SpeedIndicatorProps {
  /** 播放速度值 */
  value: number;
  /** 是否为重置指示器 */
  isReset?: boolean;
}

/**
 * 速度指示器组件
 * 显示当前播放速度，带有炫酷的弹性动画效果和平滑的数字滚动
 * 使用 React.memo 优化，仅在 value 或 isReset 变化时重新渲染
 */
function SpeedIndicator({ value, isReset = false }: SpeedIndicatorProps) {
  // 使用 React Spring 实现淡入淡出和弹性缩放动画
  // 使用预设的 wobbly 配置，创造更有弹性的入场效果
  const fadeSpring = useSpring({
    from: {
      opacity: 0,
      scale: 0.5,      // 从更小的尺寸开始
      rotate: -10,     // 添加旋转效果
    },
    to: {
      opacity: 1,
      scale: 1,
      rotate: 0,
    },
    config: config.wobbly,  // 使用预设的 wobbly 配置
  });

  // 添加脉冲动画效果，让数字在变化时有轻微的放大效果
  const pulseSpring = useSpring({
    from: { scale: 1 },
    to: { scale: 1.1 },
    reset: true,
    reverse: true,
    config: {
      tension: 300,
      friction: 10,
    },
  });

  // 使用 useMemo 缓存颜色类名，避免每次渲染都计算
  const colorClass = useMemo(() =>
    isReset ? 'text-green-400' : 'text-blue-400',
    [isReset]
  );

  // 使用 useMemo 缓存标题文本
  const title = useMemo(() =>
    isReset ? 'Reset Speed' : 'Playback Speed',
    [isReset]
  );

  // 数字滚动动画配置
  const numberConfig = useMemo(() => ({
    tension: 170,
    friction: 26,
    mass: 1,
    clamp: false,
  }), []);

  return (
    <animated.div
      className="
        flex flex-col items-center justify-center
        px-6 py-4 min-w-[120px]
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
        {title}
      </div>
      <div className="flex items-baseline">
        <animated.div
          style={{
            transform: pulseSpring.scale.to((s) => `scale(${s})`),
          }}
        >
          <AnimatedNumber
            value={value}
            decimals={2}
            className={`text-[32px] font-bold leading-none tabular-nums ${colorClass}`}
            config={numberConfig}
          />
        </animated.div>
        <span className="text-lg text-white/80 ml-1 font-semibold">×</span>
      </div>
    </animated.div>
  );
}

// 使用 React.memo 优化组件，仅在 props 变化时重新渲染
// 自定义比较函数，只比较 value 和 isReset
export default memo(SpeedIndicator, (prevProps, nextProps) => {
  return prevProps.value === nextProps.value && prevProps.isReset === nextProps.isReset;
});
