/**
 * 核心逻辑模块导出
 */

export { MediaDetector } from './mediaDetector';
export type { MediaDetectorConfig } from './mediaDetector';

export { KeyboardHandler } from './keyboardHandler';
export type {
  KeyboardHandlerConfig,
  KeyboardHandlerDependencies,
} from './keyboardHandler';

export { KeyboardHandlerWithStore } from './keyboardHandlerWithStore';
export type {
  KeyboardHandlerWithStoreConfig,
  KeyboardHandlerWithStoreDependencies,
} from './keyboardHandlerWithStore';

export { PlaybackController, createPlaybackController, defaultPlaybackController } from './playbackController';
export type {
  PlaybackControllerConfig,
  SpeedAction,
  VolumeDirection,
  SeekDirection,
} from './playbackController';

export { LightboxManager, getLightboxManager, resetLightboxManager } from './lightboxManager';
