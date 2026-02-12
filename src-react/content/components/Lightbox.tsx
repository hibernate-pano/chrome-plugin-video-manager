/**
 * Lightbox 全屏模式组件
 * 使用 React Portal 和 Shadow DOM 渲染，提供沉浸式的视频观看体验
 * @module content/components/Lightbox
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useMediaStore } from '../../shared/stores/mediaStore';
import VideoContainer from './VideoContainer';
import LightboxControls from './LightboxControls';

/**
 * Lightbox 内容组件
 * 包含视频容器和控制条
 * 使用 React.memo 优化，避免不必要的重新渲染
 */
const LightboxContent = memo(function LightboxContent() {
  const { currentMedia, isFullscreen, toggleFullscreen } = useMediaStore((state) => ({
    currentMedia: state.currentMedia,
    isFullscreen: state.isFullscreen,
    toggleFullscreen: state.toggleFullscreen,
  }));

  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<number | null>(null);

  // 处理鼠标移动，显示控制条
  const handleMouseMove = useCallback(() => {
    setShowControls(true);

    // 清除之前的定时器
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }

    // 3秒后自动隐藏控制条
    hideControlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  // 处理关闭 Lightbox
  const handleClose = useCallback(() => {
    if (isFullscreen) {
      toggleFullscreen();
    }
  }, [isFullscreen, toggleFullscreen]);

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 键退出全屏
      if (e.key === 'Escape' && isFullscreen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, handleClose]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  // 如果不在全屏模式或没有媒体元素，不渲染
  if (!isFullscreen || !currentMedia) {
    return null;
  }

  return (
    <div
      className="lightbox-overlay"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* 视频容器 */}
      <VideoContainer media={currentMedia} />

      {/* 控制条 */}
      <LightboxControls
        media={currentMedia}
        visible={showControls}
        onClose={handleClose}
      />

      {/* 关闭按钮 */}
      <button
        className={`close-button ${showControls ? 'visible' : 'hidden'}`}
        onClick={handleClose}
        aria-label="关闭全屏"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
});

/**
 * Lightbox 主组件
 * 使用 React Portal 渲染到 Shadow DOM 中
 */
export default function Lightbox() {
  const shadowHostRef = useRef<HTMLDivElement | null>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const portalContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 创建 Shadow DOM 容器
    const shadowHost = document.createElement('div');
    shadowHost.id = 'vsc-lightbox-shadow-host';
    shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 999998;';
    document.body.appendChild(shadowHost);
    shadowHostRef.current = shadowHost;

    // 创建 Shadow Root
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    shadowRootRef.current = shadowRoot;

    // 在 Shadow DOM 中创建容器
    const portalContainer = document.createElement('div');
    portalContainer.id = 'vsc-lightbox-portal-container';
    shadowRoot.appendChild(portalContainer);
    portalContainerRef.current = portalContainer;

    // 注入样式到 Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      /* 基础样式重置 */
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

      /* Lightbox 容器样式 */
      #vsc-lightbox-portal-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      /* Lightbox 覆盖层 */
      .lightbox-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.95);
        z-index: 999998;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: none;
      }

      /* 关闭按钮 */
      .close-button {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
        background-color: rgba(0, 0, 0, 0.6);
        border: none;
        border-radius: 50%;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        z-index: 999999;
        backdrop-filter: blur(10px);
      }

      .close-button:hover {
        background-color: rgba(0, 0, 0, 0.8);
        transform: scale(1.1);
      }

      .close-button.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .close-button.hidden {
        opacity: 0;
        pointer-events: none;
      }

      /* 动画 */
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .lightbox-overlay {
        animation: fadeIn 0.3s ease-out;
      }

      /* Lightbox Controls 样式 */
      .lightbox-controls {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 20px 40px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
        z-index: 999999;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      .progress-section {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .time-display {
        color: white;
        font-size: 14px;
        font-weight: 500;
        min-width: 50px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .progress-bar {
        flex: 1;
        height: 32px;
        display: flex;
        align-items: center;
        cursor: pointer;
        padding: 8px 0;
      }

      .progress-track {
        position: relative;
        width: 100%;
        height: 6px;
        background-color: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
        overflow: visible;
      }

      .progress-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background-color: rgb(59, 130, 246);
        border-radius: 3px;
        transition: width 0.1s ease;
      }

      .progress-thumb {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 16px;
        height: 16px;
        background-color: white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        transition: left 0.1s ease;
      }

      .progress-bar:hover .progress-thumb {
        transform: translate(-50%, -50%) scale(1.2);
      }

      .controls-section {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .control-button {
        width: 40px;
        height: 40px;
        background-color: transparent;
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s ease;
      }

      .control-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
        transform: scale(1.1);
      }

      .volume-control {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .volume-slider {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 8px;
        padding: 12px 8px;
        background-color: rgba(0, 0, 0, 0.9);
        border-radius: 8px;
        backdrop-filter: blur(10px);
      }

      .volume-bar {
        width: 100px;
        height: 32px;
        display: flex;
        align-items: center;
        cursor: pointer;
        padding: 8px 0;
      }

      .volume-track {
        position: relative;
        width: 100%;
        height: 6px;
        background-color: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
        overflow: visible;
      }

      .volume-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background-color: white;
        border-radius: 3px;
        transition: width 0.1s ease;
      }

      .volume-thumb {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 14px;
        height: 14px;
        background-color: white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        transition: left 0.1s ease;
      }

      .volume-bar:hover .volume-thumb {
        transform: translate(-50%, -50%) scale(1.2);
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
  return createPortal(<LightboxContent />, portalContainerRef.current);
}
