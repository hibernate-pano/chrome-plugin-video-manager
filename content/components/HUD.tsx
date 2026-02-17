/**
 * HUD（抬头显示）主组件
 * 使用 React Portal 和 Shadow DOM 渲染，防止样式冲突
 * @module content/components/HUD
 */

import { useEffect, useRef, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useHUDState, useHUDConfig } from '../../shared/stores/hudStore';
import { useDebounce } from '../hooks/useDebounce';
import SpeedIndicator from './SpeedIndicator';
import VolumeIndicator from './VolumeIndicator';
import SeekIndicator from './SeekIndicator';

/**
 * HUD 容器组件
 * 根据 HUD 类型渲染不同的指示器
 * 使用防抖来防止快速连续更新时的闪烁
 * 使用 React.memo 优化，避免不必要的重新渲染
 */
const HUDContent = memo(function HUDContent() {
  const hudState = useHUDState();
  const config = useHUDConfig();

  // 对 HUD 值进行防抖处理，防止快速连续更新时闪烁
  // 仅在值变化时防抖，不影响显示/隐藏的即时性
  const debouncedValue = useDebounce(hudState.value, 50);

  // 使用防抖后的值，但保持其他状态的即时性
  const { visible, type } = hudState;
  const value = useMemo(() => {
    // 如果 HUD 刚显示，使用即时值以获得更好的响应性
    // 否则使用防抖值以防止闪烁
    return visible ? debouncedValue : hudState.value;
  }, [visible, debouncedValue, hudState.value]);

  // 如果不可见，不渲染任何内容
  if (!visible || !type) {
    return null;
  }

  // 根据位置计算 Tailwind 类名，使用 useMemo 缓存
  const positionClasses: Record<string, string> = useMemo(() => ({
    'top-left': 'top-5 left-5',
    'top-right': 'top-5 right-5',
    'bottom-left': 'bottom-5 left-5',
    'bottom-right': 'bottom-5 right-5',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  }), []);

  // 使用 useMemo 缓存位置类名
  const positionClass = useMemo(() => positionClasses[config.position], [positionClasses, config.position]);

  return (
    <div
      className={`
        fixed z-hud pointer-events-none
        ${positionClass}
        ${config.customClassName || ''}
      `}
    >
      {type === 'speed' && <SpeedIndicator value={value} />}
      {type === 'volume' && <VolumeIndicator value={value} />}
      {type === 'seek' && <SeekIndicator value={value} />}
      {type === 'reset' && <SpeedIndicator value={value} isReset />}
    </div>
  );
});

/**
 * HUD 主组件
 * 使用 React Portal 渲染到 Shadow DOM 中
 */
export default function HUD() {
  const shadowHostRef = useRef<HTMLDivElement | null>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const portalContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 创建 Shadow DOM 容器
    const shadowHost = document.createElement('div');
    shadowHost.id = 'vsc-hud-shadow-host';
    shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 999999;';
    document.body.appendChild(shadowHost);
    shadowHostRef.current = shadowHost;

    // 创建 Shadow Root
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    shadowRootRef.current = shadowRoot;

    // 在 Shadow DOM 中创建容器
    const portalContainer = document.createElement('div');
    portalContainer.id = 'vsc-hud-portal-container';
    shadowRoot.appendChild(portalContainer);
    portalContainerRef.current = portalContainer;

    // 注入 Tailwind CSS 和自定义样式到 Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      /* Tailwind CSS 基础样式 */
      *, ::before, ::after {
        box-sizing: border-box;
        border-width: 0;
        border-style: solid;
        border-color: currentColor;
      }

      * {
        margin: 0;
        padding: 0;
      }

      /* 防止与宿主页面样式冲突 */
      :host {
        all: initial;
      }

      /* HUD 基础样式 */
      #vsc-hud-portal-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      /* Tailwind 实用类 - 布局 */
      .fixed { position: fixed; }
      .flex { display: flex; }
      .flex-col { flex-direction: column; }
      .items-center { align-items: center; }
      .items-baseline { align-items: baseline; }
      .justify-center { justify-content: center; }
      .gap-2 { gap: 0.5rem; }

      /* Tailwind 实用类 - 定位 */
      .top-5 { top: 1.25rem; }
      .right-5 { right: 1.25rem; }
      .bottom-5 { bottom: 1.25rem; }
      .left-5 { left: 1.25rem; }
      .top-1\\/2 { top: 50%; }
      .left-1\\/2 { left: 50%; }
      .-translate-x-1\\/2 { transform: translateX(-50%); }
      .-translate-y-1\\/2 { transform: translateY(-50%); }

      /* Tailwind 实用类 - 尺寸 */
      .min-w-\\[120px\\] { min-width: 120px; }
      .min-w-\\[140px\\] { min-width: 140px; }
      .min-w-\\[200px\\] { min-width: 200px; }
      .w-full { width: 100%; }
      .h-2 { height: 0.5rem; }
      .h-full { height: 100%; }

      /* Tailwind 实用类 - 间距 */
      .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
      .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
      .mb-1 { margin-bottom: 0.25rem; }
      .mb-2 { margin-bottom: 0.5rem; }
      .mt-2 { margin-top: 0.5rem; }
      .ml-1 { margin-left: 0.25rem; }

      /* Tailwind 实用类 - 背景和边框 */
      .bg-black\\/85 { background-color: rgba(0, 0, 0, 0.85); }
      .bg-white\\/20 { background-color: rgba(255, 255, 255, 0.2); }
      .bg-red-500 { background-color: rgb(239, 68, 68); }
      .bg-amber-500 { background-color: rgb(245, 158, 11); }
      .bg-blue-500 { background-color: rgb(59, 130, 246); }
      .bg-emerald-500 { background-color: rgb(16, 185, 129); }
      .rounded { border-radius: 0.25rem; }
      .rounded-hud { border-radius: 12px; }
      .overflow-hidden { overflow: hidden; }

      /* Tailwind 实用类 - 文本 */
      .text-xs { font-size: 0.75rem; line-height: 1rem; }
      .text-base { font-size: 1rem; line-height: 1.5rem; }
      .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
      .text-2xl { font-size: 1.5rem; line-height: 2rem; }
      .text-\\[28px\\] { font-size: 28px; }
      .text-\\[32px\\] { font-size: 32px; }
      .text-white\\/70 { color: rgba(255, 255, 255, 0.7); }
      .text-white\\/80 { color: rgba(255, 255, 255, 0.8); }
      .text-blue-400 { color: rgb(96, 165, 250); }
      .text-green-400 { color: rgb(74, 222, 128); }
      .text-red-500 { color: rgb(239, 68, 68); }
      .text-amber-500 { color: rgb(245, 158, 11); }
      .text-emerald-500 { color: rgb(16, 185, 129); }
      .font-medium { font-weight: 500; }
      .font-semibold { font-weight: 600; }
      .font-bold { font-weight: 700; }
      .uppercase { text-transform: uppercase; }
      .tracking-wide { letter-spacing: 0.025em; }
      .leading-none { line-height: 1; }
      .tabular-nums { font-variant-numeric: tabular-nums; }

      /* Tailwind 实用类 - 效果 */
      .shadow-hud { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2); }
      .backdrop-blur-md { backdrop-filter: blur(12px); }
      .pointer-events-none { pointer-events: none; }
      .relative { position: relative; }
      .z-hud { z-index: 999999; }

      /* Tailwind 实用类 - 过渡 */
      .transition-colors { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; }
      .duration-200 { transition-duration: 200ms; }

      /* Tailwind 动画 */
      @keyframes fadeIn {
        0% { opacity: 0; }
        100% { opacity: 1; }
      }

      .animate-fade-in {
        animation: fadeIn 0.2s ease-out;
      }
    `;
    shadowRoot.appendChild(style);

    // 清理函数
    return () => {
      if (shadowHostRef.current) {
        shadowHostRef.current.remove();
      }
    };
  }, []);

  // 如果 Portal 容器还未创建，返回 null
  if (!portalContainerRef.current) {
    return null;
  }

  // 使用 React Portal 渲染到 Shadow DOM
  return createPortal(<HUDContent />, portalContainerRef.current);
}
