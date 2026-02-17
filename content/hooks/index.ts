/**
 * Content Hooks 导出
 * 集中导出所有内容脚本相关的 React Hooks
 * @module content/hooks
 */

// 媒体检测 Hooks
export {
  useMediaDetector,
  useTargetMedia,
  useAllMedia,
  type UseMediaDetectorOptions,
  type UseMediaDetectorReturn,
} from './useMediaDetector';

// 键盘处理 Hooks
export {
  useKeyboardHandler,
  useKeyboardHandlerDependencies,
  type UseKeyboardHandlerOptions,
  type UseKeyboardHandlerReturn,
} from './useKeyboardHandler';

// 播放控制 Hooks
export {
  usePlaybackController,
  useCurrentMediaPlayback,
  type UsePlaybackControllerOptions,
  type UsePlaybackControllerReturn,
} from './usePlaybackController';

// 防抖 Hook
export { useDebounce } from './useDebounce';
