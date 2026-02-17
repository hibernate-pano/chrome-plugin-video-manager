/**
 * 音量指示器组件
 * 使用 CSS 动画实现流体音量条动画和炫酷的弹性效果
 * @module content/components/VolumeIndicator
 */

import { memo, useMemo, useCallback } from 'react';
import AnimatedNumber from './AnimatedNumber';
import { useAnimatedPercent } from '../hooks/useCSSAnimation';

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

  // 使用自定义 Hook 实现进度条动画
  const animatedPercent = useAnimatedPercent(percentage, 200);

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

  return (
    <div
      className="
        flex flex-col items-center justify-center
        px-6 py-4 min-w-[200px]
        bg-black/85 backdrop-blur-md
        rounded-hud shadow-hud
        animate-hud-appear
      "
    >
      <div className="text-xs text-white/70 mb-2 uppercase tracking-wide font-medium">
        Volume
      </div>
      <div className="w-full h-2 bg-white/20 rounded overflow-hidden relative">
        <div
          className={`h-full rounded transition-colors duration-200 ${bgColor}`}
          style={{ width: `${animatedPercent}%` }}
        />
      </div>
      <div
        className={`text-2xl font-bold mt-2 tabular-nums animate-pulse-subtle ${textColor}`}
      >
        <AnimatedNumber
          value={Math.round(animatedPercent)}
          decimals={0}
          className={textColor}
        />
        %
      </div>
    </div>
  );
}

// 使用 React.memo 优化组件，仅在 value 变化时重新渲染
export default memo(VolumeIndicator, (prevProps, nextProps) => {
  return prevProps.value === nextProps.value;
});
