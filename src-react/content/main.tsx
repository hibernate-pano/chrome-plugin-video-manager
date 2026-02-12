/**
 * 内容脚本主入口
 * 负责初始化 React root、挂载到 Shadow DOM、初始化核心逻辑模块
 * @module content/main
 */

import { createRoot } from 'react-dom/client';
import ContentApp, { setToggleKeyboardHelpRef } from './ContentApp';
import { MediaDetector } from '../shared/modules/mediaDetector';
import { KeyboardHandlerWithStore } from '../shared/modules/keyboardHandlerWithStore';
import { getLightboxManager } from '../shared/modules/lightboxManager';
import { useSettingsStore } from '../shared/stores/settingsStore';
import { autoMigrate } from '../shared/utils/migration';
import {
  initAnimationVariables,
  updateAnimationSpeed,
  watchReducedMotion,
} from '../shared/utils/animationVariables';
import { initAnimationFallback } from '../shared/utils/animationFallback';
import './styles/index.css';

/**
 * 内容脚本管理器
 * 负责初始化和管理所有内容脚本组件
 */
class ContentScriptManager {
  private reactRoot: ReturnType<typeof createRoot> | null = null;
  private shadowHost: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private mediaDetector: MediaDetector | null = null;
  private keyboardHandler: KeyboardHandlerWithStore | null = null;
  private lightboxManager: ReturnType<typeof getLightboxManager> | null = null;
  private keyboardHelpToggle: (() => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private reducedMotionCleanup: (() => void) | null = null;
  private settingsUnsubscribe: (() => void) | null = null;

  /**
   * 初始化动画系统
   * 设置 CSS 变量并监听设置变化
   */
  private initAnimationSystem(): void {
    try {
      // 1. 初始化动画降级系统（检测浏览器支持）
      const animationSupport = initAnimationFallback();

      if (animationSupport.needsFallback) {
        console.warn('浏览器不完全支持动画特性，已应用降级方案', animationSupport);
      } else {
        console.log('浏览器完全支持动画特性');
      }

      // 2. 初始化动画 CSS 变量
      initAnimationVariables();

      // 3. 监听 prefers-reduced-motion 变化
      this.reducedMotionCleanup = watchReducedMotion((matches) => {
        if (matches) {
          // 系统偏好减少动画，强制禁用
          updateAnimationSpeed('off');
          console.log('检测到系统偏好减少动画，已禁用所有动画');
        } else {
          // 恢复用户设置的动画速度
          const currentSpeed = useSettingsStore.getState().animationSpeed;
          updateAnimationSpeed(currentSpeed);
          console.log('系统偏好允许动画，已恢复动画设置:', currentSpeed);
        }
      });

      // 4. 监听用户动画速度设置变化
      this.settingsUnsubscribe = useSettingsStore.subscribe(
        (state) => {
          // 检查是否有系统偏好
          const prefersReducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)'
          ).matches;

          if (!prefersReducedMotion) {
            // 只有在系统不偏好减少动画时才应用用户设置
            updateAnimationSpeed(state.animationSpeed);
            console.log('动画速度已更新:', state.animationSpeed);
          }
        }
      );

      // 5. 应用初始动画速度
      const initialSpeed = useSettingsStore.getState().animationSpeed;
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      if (prefersReducedMotion) {
        updateAnimationSpeed('off');
        console.log('检测到系统偏好减少动画，已禁用所有动画');
      } else {
        updateAnimationSpeed(initialSpeed);
        console.log('动画系统已初始化，当前速度:', initialSpeed);
      }
    } catch (error) {
      console.error('初始化动画系统失败:', error);
    }
  }

  /**
   * 初始化 React 应用
   * 创建 Shadow DOM 并挂载 React root
   */
  private initReactApp(): void {
    try {
      // 创建 Shadow DOM 容器
      this.shadowHost = document.createElement('div');
      this.shadowHost.id = 'vsc-content-app-shadow-host';
      this.shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 999997;';
      document.body.appendChild(this.shadowHost);

      // 创建 Shadow Root
      this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

      // 在 Shadow DOM 中创建 React 容器
      const reactContainer = document.createElement('div');
      reactContainer.id = 'vsc-content-app-root';
      this.shadowRoot.appendChild(reactContainer);

      // 注入基础样式到 Shadow DOM
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

        /* React 容器样式 */
        #vsc-content-app-root {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
        }
      `;
      this.shadowRoot.appendChild(style);

      // 创建 React root 并渲染应用
      this.reactRoot = createRoot(reactContainer);
      this.reactRoot.render(<ContentApp />);

      console.log('React 应用已初始化并挂载到 Shadow DOM');
    } catch (error) {
      console.error('初始化 React 应用失败:', error);
    }
  }

  /**
   * 初始化核心逻辑模块
   * 包括媒体检测器、键盘处理器、Lightbox 管理器
   */
  private initCoreModules(): void {
    try {
      // 1. 初始化媒体检测器
      this.mediaDetector = new MediaDetector({
        cacheExpiryMs: 500,
        checkIntervals: [200, 400, 800, 1200],
      });

      // 设置媒体元素检测
      this.mediaDetector.setupMediaElementDetection();
      this.mediaDetector.setupMediaEventDelegation();

      console.log('媒体检测器已初始化');

      // 2. 初始化 Lightbox 管理器
      this.lightboxManager = getLightboxManager();

      console.log('Lightbox 管理器已初始化');

      // 3. 设置键盘帮助切换函数引用
      // 这个函数会在 ContentApp 渲染后被设置
      // 我们需要等待一小段时间确保 React 组件已经渲染
      setTimeout(() => {
        // 创建键盘帮助切换函数
        this.keyboardHelpToggle = () => {
          // 触发自定义事件来切换键盘帮助模态框
          const event = new CustomEvent('vsc-toggle-keyboard-help');
          window.dispatchEvent(event);
        };

        // 设置引用
        setToggleKeyboardHelpRef(this.keyboardHelpToggle);

        // 4. 初始化键盘处理器
        this.keyboardHandler = new KeyboardHandlerWithStore(
          {
            debug: process.env.NODE_ENV === 'development',
          },
          {
            mediaDetector: this.mediaDetector!,
            lightboxManager: this.lightboxManager!,
            keyboardHelp: {
              toggle: this.keyboardHelpToggle,
            },
          }
        );

        // 初始化键盘事件监听
        this.keyboardHandler.init();

        console.log('键盘处理器已初始化');
      }, 100);

      // 5. 从 Chrome Storage 加载设置
      // Zustand 的 persist 中间件会自动处理，但我们可以手动触发一次
      useSettingsStore.persist.rehydrate();

      console.log('核心逻辑模块已初始化');
    } catch (error) {
      console.error('初始化核心逻辑模块失败:', error);
    }
  }

  /**
   * 设置资源清理
   * 在页面卸载时清理所有资源
   */
  private setupCleanup(): void {
    this.beforeUnloadHandler = () => {
      this.destroy();
    };

    window.addEventListener('beforeunload', this.beforeUnloadHandler);

    console.log('资源清理已设置');
  }

  /**
   * 初始化内容脚本
   * 这是主入口函数
   */
  async init(): Promise<void> {
    try {
      console.log('开始初始化视频速度控制器（React 版本）...');

      // 0. 执行设置迁移（静默执行，不阻塞 UI）
      autoMigrate()
        .then((result) => {
          if (result.needsMigration) {
            console.log('设置迁移完成:', result);
          }
        })
        .catch((error) => {
          console.error('设置迁移失败:', error);
          // 迁移失败不影响扩展运行，使用默认设置
        });

      // 1. 初始化动画系统
      this.initAnimationSystem();

      // 2. 初始化 React 应用
      this.initReactApp();

      // 3. 初始化核心逻辑模块
      this.initCoreModules();

      // 4. 设置资源清理
      this.setupCleanup();

      console.log('视频速度控制器（React 版本）初始化完成！');
    } catch (error) {
      console.error('初始化内容脚本失败:', error);
    }
  }

  /**
   * 清理所有资源
   * 在页面卸载时调用
   */
  destroy(): void {
    try {
      console.log('开始清理视频速度控制器资源...');

      // 1. 清理键盘处理器
      if (this.keyboardHandler) {
        this.keyboardHandler.destroy();
        this.keyboardHandler = null;
      }

      // 2. 清理 Lightbox 管理器
      if (this.lightboxManager) {
        this.lightboxManager.destroy();
        this.lightboxManager = null;
      }

      // 3. 清理媒体检测器
      if (this.mediaDetector) {
        this.mediaDetector.destroy();
        this.mediaDetector = null;
      }

      // 4. 卸载 React 应用
      if (this.reactRoot) {
        this.reactRoot.unmount();
        this.reactRoot = null;
      }

      // 5. 移除 Shadow DOM 容器
      if (this.shadowHost) {
        this.shadowHost.remove();
        this.shadowHost = null;
      }

      // 6. 清理事件监听器
      if (this.beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }

      // 7. 清理动画系统监听器
      if (this.reducedMotionCleanup) {
        this.reducedMotionCleanup();
        this.reducedMotionCleanup = null;
      }

      if (this.settingsUnsubscribe) {
        this.settingsUnsubscribe();
        this.settingsUnsubscribe = null;
      }

      console.log('视频速度控制器资源清理完成');
    } catch (error) {
      console.error('清理资源失败:', error);
    }
  }
}

/**
 * 创建并初始化内容脚本管理器
 */
const contentScriptManager = new ContentScriptManager();

// 等待 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    contentScriptManager.init();
  });
} else {
  // DOM 已经加载完成，直接初始化
  contentScriptManager.init();
}

/**
 * 导出管理器实例（用于调试和测试）
 */
if (process.env.NODE_ENV === 'development') {
  (window as any).__VSC_CONTENT_SCRIPT_MANAGER__ = contentScriptManager;
}
