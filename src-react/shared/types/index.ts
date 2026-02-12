/**
 * 类型定义统一导出
 * @module shared/types
 */

// 快捷键相关类型
export type {
  ShortcutAction,
  Shortcut,
  SpeedPreset,
  AnimationSpeed,
  ShortcutSettings,
} from './shortcuts';

export {
  DEFAULT_SHORTCUTS,
  DEFAULT_PRESETS,
} from './shortcuts';

// 媒体相关类型
export type {
  MediaState,
  MediaDetectorConfig,
  MediaElementType,
  MediaElementInfo,
} from './media';

export {
  DEFAULT_MEDIA_DETECTOR_CONFIG,
} from './media';

// HUD 相关类型
export type {
  HUDType,
  HUDPosition,
  HUDState,
  HUDConfig,
  HUDShowOptions,
} from './hud';

export {
  DEFAULT_HUD_CONFIG,
} from './hud';

// 存储相关类型
export type {
  StorageData,
  StorageArea,
  StorageChange,
  StorageChanges,
  ChromeStorageAPI,
  StorageOptions,
} from './storage';

export {
  STORAGE_KEYS,
  StorageError,
  StorageErrorCode,
  DEFAULT_STORAGE_OPTIONS,
} from './storage';
