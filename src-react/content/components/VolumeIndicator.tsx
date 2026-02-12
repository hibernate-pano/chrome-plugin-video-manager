/**
 * 音量指示器组件
 * 使用 React Spring 实现流体音量条动画和炫酷的弹性效果
 * @module content/components/VolumeIndicator
 */

import { memo, useMemo, useCallback } from 'react';
import { useSpring, animated, config } from '@react-spring/web';
import AnimatedNumber from './AnimatedNumber';

/**
 * 音量指示器属性接口
 */
interface VolumeIndicatorProps {
  /** 音量值（0-1） */
  value: number;
}

/**
 * 音量指示器组件
 * 显示当前音量，带有流体动画效果的音量条和炫酷的弹性效果
 * 使用 React.memo 优化，仅在 value 变化时重新渲染
 */
function VolumeIndicator({ value }: VolumeIndicatorProps) {
  // 限制音量值在 0-1 之间，使用 useMemo 缓存计算结果
  const clampedValue = useMemo(() => Math.max(0, Math.min(1, value)), [value]);
  const percentage = useMemo(() => Math.round(clampedValue * 100), [clampedValue]);

  // 使用 React Spring 实现音量条宽度动画
  // 使用更流畅的配置，创造液体般的流动效果
  const barConfig = useMemo(() => ({
    tension: 170,
    friction: 26,
    clamp: false,  // 允许过冲，创造更自然的效果
  }), []);

  const barSpring = useSpring({
    width: `${percentage}%`,
    config: barConfig,
  });

  // 使用 React Spring 实现淡入淡出和弹性缩放动画
  // 使用预设的 gentle 配置，创造柔和的入场效果
  const fadeSpring = useSpring({
    from: {
      opacity: 0,
      scale: 0.5,
      y: 20,  // 从下方滑入
    },
    to: {
      opacity: 1,
      scale: 1,
      y: 0,
    },
    config: config.gentle,
  });

  // 添加音量条的脉冲效果
  const pulseSpring = useSpring({
    from: { scaleY: 1 },
    to: { scaleY: 1.05 },
    reset: true,
    reverse: true,
    config: {
      tension: 300,
      friction: 10,
    },
  });

  // 根据音量值动态改变颜色，使用 useCallback 缓存函数
  const getVolumeColorClass = useCallback((vol: number): string => {
    if (vol === 0) return 'bg-red-500 text-red-500'; // 静音
    if (vol < 0.3) return 'bg-amber-500 text-amber-500'; // 低音量
    if (vol < 0.7) return 'bg-blue-500 text-blue-500'; // 中等音量
    return 'bg-emerald-500 text-emerald-500'; // 高音量
  }, []);

  // 使用 useMemo 缓存颜色类名
  const volumeColorClass = useMemo(() => getVolumeColorClass(clampedValue), [clampedValue, getVolumeColorClass]);
  const [bgColor, textColor] = useMemo(() => volumeColorClass.split(' '), [volumeColorClass]);

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
        px-6 py-4 min-w-[200px]
        bg-black/85 backdrop-blur-md
        rounded-hud shadow-hud
      "
      style={{
        opacity: fadeSpring.opacity,
        transform: fadeSpring.scale.to(
          (s) => `scale(${s}) translateY(${fadeSpring.y.get()}px)`
        ),
      }}
    >
      <div className="text-xs text-white/70 mb-2 uppercase tracking-wide font-medium">
        Volume
      </div>
      <div className="w-full h-2 bg-white/20 rounded overflow-hidden relative">
        <animated.div
          className={`h-full rounded transition-colors duration-200 ${bgColor}`}
          style={{
            width: barSpring.width,
            transform: pulseSpring.scaleY.to((s) => `scaleY(${s})`),
            transformOrigin: 'left center',
          }}
        />
      </div>
      <animated.div
        className={`text-2xl font-bold mt-2 tabular-nums ${textColor}`}
        style={{
          transform: pulseSpring.scaleY.to((s) => `scale(${s})`),
        }}
      >
        <AnimatedNumber
          value={percentage}
          decimals={0}
          className={textColor}
          config={numberConfig}
        />
        %
      </animated.div>
    </animated.div>
  );
}

// 使用 React.memo 优化组件，仅在 value 变化时重新渲染
export default memo(VolumeIndicator, (prevProps, nextProps) => {
  return prevProps.value === nextProps.value;
});
