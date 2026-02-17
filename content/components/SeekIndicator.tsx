/**
 * 快进快退指示器组件
 * 使用 CSS 动画实现炫酷的弹性动画效果
 * @module content/components/SeekIndicator
 */

import { memo, useMemo } from 'react';

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
    <div
      className="
        flex flex-col items-center justify-center
        px-6 py-4 min-w-[140px]
        bg-black/85 backdrop-blur-md
        rounded-hud shadow-hud
        animate-hud-appear
      "
    >
      <div className="text-xs text-white/70 mb-1 uppercase tracking-wide font-medium">
        {directionText}
      </div>
      <div className="flex items-center gap-2">
        <div className={`text-[28px] font-bold leading-none animate-slide-in-${isForward ? 'right' : 'left'} ${colorClass}`}>
          {arrowSymbol}
        </div>
        <div className="flex items-baseline">
          <span className={`text-[32px] font-bold leading-none tabular-nums animate-pulse-subtle ${colorClass}`}>
            {absValue}
          </span>
          <span className="text-base text-white/80 font-semibold">s</span>
        </div>
      </div>
    </div>
  );
}

// 使用 React.memo 优化组件，仅在 value 变化时重新渲染
export default memo(SeekIndicator, (prevProps, nextProps) => {
  return prevProps.value === nextProps.value;
});
