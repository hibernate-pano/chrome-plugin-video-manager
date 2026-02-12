/**
 * 内容脚本主应用组件
 * 集成所有 UI 组件（HUD、Lightbox、KeyboardHelpModal）
 * @module content/ContentApp
 */

import { useState, useCallback, useEffect, Suspense, lazy } from 'react';

// 使用 React.lazy 懒加载组件
// HUD 组件较小且经常使用，所以直接导入
import HUD from './components/HUD';

// Lightbox 和 KeyboardHelpModal 较大且不常使用，使用懒加载
const Lightbox = lazy(() => import('./components/Lightbox'));
const KeyboardHelpModal = lazy(() => import('./components/KeyboardHelpModal'));

/**
 * 加载中组件
 * 在懒加载组件加载时显示（对于内容脚本，使用最小化的加载指示器）
 */
function LoadingFallback() {
  return null; // 内容脚本中不显示加载指示器，避免闪烁
}

/**
 * 内容脚本主应用组件
 *
 * 这个组件是内容脚本的 React 根组件，负责：
 * 1. 渲染所有 UI 组件（HUD、Lightbox、KeyboardHelpModal）
 * 2. 管理键盘帮助模态框的显示状态
 * 3. 提供统一的组件集成点
 *
 * 注意：
 * - HUD 和 Lightbox 的状态由各自的 Zustand Store 管理
 * - 键盘帮助模态框的状态由本组件管理（简单的本地状态）
 * - 所有组件都使用 React Portal 和 Shadow DOM 渲染，避免样式冲突
 */
export default function ContentApp() {
  // 键盘帮助模态框的显示状态
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  /**
   * 切换键盘帮助模态框的显示状态
   */
  const toggleKeyboardHelp = useCallback(() => {
    setShowKeyboardHelp((prev) => !prev);
  }, []);

  /**
   * 关闭键盘帮助模态框
   */
  const closeKeyboardHelp = useCallback(() => {
    setShowKeyboardHelp(false);
  }, []);

  /**
   * 监听自定义事件来切换键盘帮助模态框
   * 这允许键盘处理器通过事件触发模态框
   */
  useEffect(() => {
    const handleToggleEvent = () => {
      toggleKeyboardHelp();
    };

    window.addEventListener('vsc-toggle-keyboard-help', handleToggleEvent);

    return () => {
      window.removeEventListener('vsc-toggle-keyboard-help', handleToggleEvent);
    };
  }, [toggleKeyboardHelp]);

  return (
    <>
      {/* HUD 指示器 - 显示速度、音量、跳转等信息 */}
      <HUD />

      {/* Lightbox 全屏模式 - 提供沉浸式视频观看体验 */}
      <Suspense fallback={<LoadingFallback />}>
        <Lightbox />
      </Suspense>

      {/* 键盘帮助模态框 - 显示所有可用的快捷键 */}
      <Suspense fallback={<LoadingFallback />}>
        <KeyboardHelpModal
          visible={showKeyboardHelp}
          onClose={closeKeyboardHelp}
        />
      </Suspense>
    </>
  );
}

/**
 * 导出键盘帮助切换函数的引用
 * 这个函数会在 main.tsx 中被键盘处理器使用
 */
let toggleKeyboardHelpRef: (() => void) | null = null;

/**
 * 设置键盘帮助切换函数的引用
 * @param toggleFn 切换函数
 */
export function setToggleKeyboardHelpRef(toggleFn: () => void) {
  toggleKeyboardHelpRef = toggleFn;
}

/**
 * 获取键盘帮助切换函数的引用
 * @returns 切换函数或 null
 */
export function getToggleKeyboardHelpRef(): (() => void) | null {
  return toggleKeyboardHelpRef;
}
