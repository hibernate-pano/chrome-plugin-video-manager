/**
 * useKeyboardHandler Hook
 * 将 KeyboardHandler 原生 JS 模块桥接到 React 组件
 * @module content/hooks/useKeyboardHandler
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  KeyboardHandler,
  type KeyboardHandlerConfig,
  type KeyboardHandlerDependencies,
} from '../../shared/modules/keyboardHandler';
import { useSettingsStore } from '../../shared/stores/settingsStore';

/**
 * useKeyboardHandler Hook 配置
 */
export interface UseKeyboardHandlerOptions {
  /** 是否自动初始化 */
  autoInit?: boolean;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 外部依赖 */
  dependencies: KeyboardHandlerDependencies;
}

/**
 * useKeyboardHandler Hook 返回值
 */
export interface UseKeyboardHandlerReturn {
  /** KeyboardHandler 实例 */
  handler: KeyboardHandler | null;
  /** 是否已初始化 */
  isInitialized: boolean;
  /** 手动初始化 */
  init: () => void;
  /** 手动销毁 */
  destroy: () => void;
}

/**
 * useKeyboardHandler Hook
 *
 * 将 KeyboardHandler 原生 JS 模块桥接到 React 组件，提供：
 * - 自动初始化和清理
 * - 与 settingsStore 的集成（自动同步快捷键和预设）
 * - 键盘事件处理
 * - 响应式的配置更新
 *
 * @param options 配置选项
 * @returns Hook 返回值
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const mediaDetector = useMediaDetector();
 *   const playbackController = usePlaybackController();
 *   const lightboxManager = useLightboxManager();
 *   const keyboardHelp = useKeyboardHelp();
 *
 *   const { handler, isInitialized } = useKeyboardHandler({
 *     autoInit: true,
 *     dependencies: {
 *       mediaDetector: mediaDetector.detector!,
 *       playbackController: {
 *         handleSpeed: (media, action) => {
 *           playbackController.handleSpeed(media, action);
 *         },
 *         handleVolume: (media, direction, step) => {
 *           playbackController.handleVolume(media, direction, step);
 *         },
 *         handleSeek: (media, direction, seconds) => {
 *           playbackController.handleSeek(media, direction, seconds);
 *         },
 *         handlePlayPause: (media) => {
 *           playbackController.handlePlayPause(media);
 *         },
 *       },
 *       lightboxManager,
 *       keyboardHelp,
 *     },
 *   });
 *
 *   return <div>键盘处理器状态: {isInitialized ? '已初始化' : '未初始化'}</div>;
 * }
 * ```
 */
export function useKeyboardHandler(
  options: UseKeyboardHandlerOptions
): UseKeyboardHandlerReturn {
  const { autoInit = true, debug = false, dependencies } = options;

  // KeyboardHandler 实例引用
  const handlerRef = useRef<KeyboardHandler | null>(null);
  const isInitializedRef = useRef(false);

  // 从 settingsStore 获取快捷键和预设
  const shortcuts = useSettingsStore((state) => state.shortcuts);
  const presets = useSettingsStore((state) => state.presets);

  /**
   * 初始化 KeyboardHandler
   */
  const init = useCallback(() => {
    if (handlerRef.current || isInitializedRef.current) {
      return; // 已经初始化
    }

    try {
      // 创建配置对象
      const config: KeyboardHandlerConfig = {
        shortcuts,
        presets,
        debug,
      };

      // 创建 KeyboardHandler 实例
      handlerRef.current = new KeyboardHandler(config, dependencies);

      // 初始化键盘事件监听
      handlerRef.current.init();

      isInitializedRef.current = true;

      console.log('[useKeyboardHandler] KeyboardHandler 已初始化');
    } catch (error) {
      console.error('[useKeyboardHandler] 初始化失败:', error);
    }
  }, [shortcuts, presets, debug, dependencies]);

  /**
   * 销毁 KeyboardHandler
   */
  const destroy = useCallback(() => {
    if (!handlerRef.current) {
      return;
    }

    try {
      handlerRef.current.destroy();
      handlerRef.current = null;
      isInitializedRef.current = false;

      console.log('[useKeyboardHandler] KeyboardHandler 已销毁');
    } catch (error) {
      console.error('[useKeyboardHandler] 销毁失败:', error);
    }
  }, []);

  /**
   * 初始化效果
   */
  useEffect(() => {
    if (autoInit) {
      init();
    }

    return () => {
      destroy();
    };
  }, [autoInit, init, destroy]);

  /**
   * 监听快捷键变化，自动更新配置
   */
  useEffect(() => {
    if (handlerRef.current && isInitializedRef.current) {
      try {
        handlerRef.current.updateShortcuts(shortcuts);
        console.log('[useKeyboardHandler] 快捷键已更新');
      } catch (error) {
        console.error('[useKeyboardHandler] 更新快捷键失败:', error);
      }
    }
  }, [shortcuts]);

  /**
   * 监听预设变化，自动更新配置
   */
  useEffect(() => {
    if (handlerRef.current && isInitializedRef.current) {
      try {
        handlerRef.current.updatePresets(presets);
        console.log('[useKeyboardHandler] 预设已更新');
      } catch (error) {
        console.error('[useKeyboardHandler] 更新预设失败:', error);
      }
    }
  }, [presets]);

  return {
    handler: handlerRef.current,
    isInitialized: isInitializedRef.current,
    init,
    destroy,
  };
}

/**
 * 便捷 Hook：创建键盘处理器依赖对象
 *
 * 这个 Hook 帮助创建 KeyboardHandler 所需的依赖对象，
 * 简化了依赖注入的过程。
 *
 * @param deps 部分依赖对象
 * @returns 完整的依赖对象
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const mediaDetector = useMediaDetector();
 *   const playbackController = usePlaybackController();
 *
 *   const dependencies = useKeyboardHandlerDependencies({
 *     mediaDetector: mediaDetector.detector!,
 *     playbackController: {
 *       handleSpeed: playbackController.handleSpeed,
 *       handleVolume: playbackController.handleVolume,
 *       handleSeek: playbackController.handleSeek,
 *       handlePlayPause: playbackController.handlePlayPause,
 *     },
 *     lightboxManager: {
 *       isActive: () => false,
 *       getVideo: () => null,
 *       toggle: () => {},
 *       exit: () => {},
 *     },
 *     keyboardHelp: {
 *       toggle: () => {},
 *     },
 *   });
 *
 *   const { handler } = useKeyboardHandler({
 *     dependencies,
 *   });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useKeyboardHandlerDependencies(
  deps: Partial<KeyboardHandlerDependencies>
): KeyboardHandlerDependencies {
  return {
    mediaDetector: deps.mediaDetector!,
    playbackController: deps.playbackController || {
      handleSpeed: () => {
        console.warn('[useKeyboardHandlerDependencies] handleSpeed 未实现');
      },
      handleVolume: () => {
        console.warn('[useKeyboardHandlerDependencies] handleVolume 未实现');
      },
      handleSeek: () => {
        console.warn('[useKeyboardHandlerDependencies] handleSeek 未实现');
      },
      handlePlayPause: () => {
        console.warn('[useKeyboardHandlerDependencies] handlePlayPause 未实现');
      },
    },
    lightboxManager: deps.lightboxManager || {
      isActive: () => false,
      getVideo: () => null,
      toggle: () => {
        console.warn('[useKeyboardHandlerDependencies] lightboxManager.toggle 未实现');
      },
      exit: () => {
        console.warn('[useKeyboardHandlerDependencies] lightboxManager.exit 未实现');
      },
    },
    keyboardHelp: deps.keyboardHelp || {
      toggle: () => {
        console.warn('[useKeyboardHandlerDependencies] keyboardHelp.toggle 未实现');
      },
    },
  };
}
