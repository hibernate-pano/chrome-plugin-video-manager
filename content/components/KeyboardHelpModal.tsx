/**
 * 键盘帮助模态框组件
 * 使用 React Portal 和 Shadow DOM 渲染，显示所有可用的快捷键
 * @module content/components/KeyboardHelpModal
 */

import { useEffect, useRef, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ShortcutList from './ShortcutList';

/**
 * 键盘帮助模态框内容组件
 * 使用 React.memo 优化，避免不必要的重新渲染
 */
interface KeyboardHelpContentProps {
  /** 是否显示模态框 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

const KeyboardHelpContent = memo(function KeyboardHelpContent({ visible, onClose }: KeyboardHelpContentProps) {
  // 处理键盘事件
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 键关闭模态框
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      // ? 键关闭模态框
      if (e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [visible, onClose]);

  // 处理背景点击，使用 useCallback 缓存函数
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!visible) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-container">
        {/* 模态框头部 */}
        <div className="modal-header">
          <h2 className="modal-title">键盘快捷键</h2>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="关闭"
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

        {/* 模态框内容 */}
        <div className="modal-body">
          <ShortcutList />
        </div>

        {/* 模态框底部 */}
        <div className="modal-footer">
          <p className="footer-hint">
            按 <kbd>ESC</kbd> 或 <kbd>?</kbd> 关闭此窗口
          </p>
        </div>
      </div>
    </div>
  );
});

/**
 * 键盘帮助模态框主组件
 * 使用 React Portal 渲染到 Shadow DOM 中
 */
interface KeyboardHelpModalProps {
  /** 是否显示模态框 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

export default function KeyboardHelpModal({ visible, onClose }: KeyboardHelpModalProps) {
  const shadowHostRef = useRef<HTMLDivElement | null>(null);
  const shadowRootRef = useRef<ShadowRoot | null>(null);
  const portalContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 创建 Shadow DOM 容器
    const shadowHost = document.createElement('div');
    shadowHost.id = 'vsc-keyboard-help-shadow-host';
    shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 999999;';
    document.body.appendChild(shadowHost);
    shadowHostRef.current = shadowHost;

    // 创建 Shadow Root
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    shadowRootRef.current = shadowRoot;

    // 在 Shadow DOM 中创建容器
    const portalContainer = document.createElement('div');
    portalContainer.id = 'vsc-keyboard-help-portal-container';
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

      /* 模态框容器样式 */
      #vsc-keyboard-help-portal-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      /* 模态框背景遮罩 */
      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.75);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
        backdrop-filter: blur(4px);
      }

      /* 模态框容器 */
      .modal-container {
        background-color: white;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        animation: slideIn 0.3s ease-out;
      }

      /* 模态框头部 */
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #e5e7eb;
      }

      .modal-title {
        font-size: 20px;
        font-weight: 600;
        color: #111827;
        margin: 0;
      }

      .close-button {
        width: 32px;
        height: 32px;
        background-color: transparent;
        border: none;
        color: #6b7280;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s ease;
      }

      .close-button:hover {
        background-color: #f3f4f6;
        color: #111827;
      }

      /* 模态框内容 */
      .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }

      /* 自定义滚动条 */
      .modal-body::-webkit-scrollbar {
        width: 8px;
      }

      .modal-body::-webkit-scrollbar-track {
        background-color: #f3f4f6;
        border-radius: 4px;
      }

      .modal-body::-webkit-scrollbar-thumb {
        background-color: #d1d5db;
        border-radius: 4px;
      }

      .modal-body::-webkit-scrollbar-thumb:hover {
        background-color: #9ca3af;
      }

      /* 模态框底部 */
      .modal-footer {
        padding: 16px 24px;
        border-top: 1px solid #e5e7eb;
        background-color: #f9fafb;
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
      }

      .footer-hint {
        font-size: 13px;
        color: #6b7280;
        text-align: center;
        margin: 0;
      }

      .footer-hint kbd {
        display: inline-block;
        padding: 2px 6px;
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', 'Source Code Pro', monospace;
        font-size: 12px;
        color: #374151;
        background-color: #e5e7eb;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
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

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* 暗色模式支持 */
      @media (prefers-color-scheme: dark) {
        .modal-container {
          background-color: #1f2937;
        }

        .modal-header {
          border-bottom-color: #374151;
        }

        .modal-title {
          color: #f9fafb;
        }

        .close-button {
          color: #9ca3af;
        }

        .close-button:hover {
          background-color: #374151;
          color: #f9fafb;
        }

        .modal-body::-webkit-scrollbar-track {
          background-color: #374151;
        }

        .modal-body::-webkit-scrollbar-thumb {
          background-color: #4b5563;
        }

        .modal-body::-webkit-scrollbar-thumb:hover {
          background-color: #6b7280;
        }

        .modal-footer {
          border-top-color: #374151;
          background-color: #111827;
        }

        .footer-hint {
          color: #9ca3af;
        }

        .footer-hint kbd {
          color: #e5e7eb;
          background-color: #374151;
          border-color: #4b5563;
        }
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
  return createPortal(
    <KeyboardHelpContent visible={visible} onClose={onClose} />,
    portalContainerRef.current
  );
}
