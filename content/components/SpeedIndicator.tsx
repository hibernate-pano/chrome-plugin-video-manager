/**
 * 速度指示器组件
 * 使用 CSS 动画实现平滑的数字滚动动画和炫酷的弹性效果
 * @module content/components/SpeedIndicator
 */

import { memo, useMemo } from 'react';
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

  return (
    <div
      className="
        flex flex-col items-center justify-center
        px-6 py-4 min-w-[120px]
        bg-black/85 backdrop-blur-md
        rounded-hud shadow-hud
        animate-hud-appear
      "
    >
      <div className="text-xs text-white/70 mb-1 uppercase tracking-wide font-medium">
        {title}
      </div>
      <div className="flex items-baseline">
        <div className="animate-pulse-subtle">
          <AnimatedNumber
            value={value}
            decimals={2}
            className={`text-[32px] font-bold leading-none tabular-nums ${colorClass}`}
          />
        </div>
        <span className="text-lg text-white/80 ml-1 font-semibold">×</span>
      </div>
    </div>
  );
}

// 使用 React.memo 优化组件，仅在 props 变化时重新渲染
// 自定义比较函数，只比较 value 和 isReset
export default memo(SpeedIndicator, (prevProps, nextProps) => {
  return prevProps.value === nextProps.value && prevProps.isReset === nextProps.isReset;
});
