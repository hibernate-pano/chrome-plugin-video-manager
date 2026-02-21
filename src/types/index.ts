/**
 * Chrome扩展类型定义
 */

export interface ShortcutAction {
  increase: string;
  decrease: string;
  reset: string;
  'toggle-fullscreen': string;
}

export interface ShortcutSettings {
  shortcuts: ShortcutAction;
}

export type MediaType = 'video' | 'audio';

export interface MediaElementInfo {
  element: HTMLMediaElement;
  type: MediaType;
  isInViewport: boolean;
  size: number;
}

export interface LightboxVideoStyles {
  cssText: string;
  controls: boolean;
}

export interface LightboxEventListeners {
  pause: (e: Event) => void;
  play: (e: Event) => void;
  seeking: (e: Event) => void;
}

export interface MediaCache {
  timestamp: number;
  elements: HTMLMediaElement[];
  shadowElements: HTMLMediaElement[];
  isStale: boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

export interface SpeedAction {
  type: 'increase' | 'decrease' | 'reset';
}

export interface SeekAction {
  type: 'forward' | 'backward';
  step?: number;
}

export interface VolumeAction {
  type: 'up' | 'down';
  step?: number;
}

export type PlaybackAction = SpeedAction | SeekAction | VolumeAction;

export interface ExtensionConfig {
  version: string;
  name: string;
  description: string;
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface ChromeStorageChange {
  changes?: Record<string, StorageChange>;
  areaName: string;
}

export type ShortcutCallback = (shortcuts: ShortcutAction) => void;

export interface IndicatorOptions {
  duration?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface LightboxOptions {
  showControls?: boolean;
  autoHideControls?: boolean;
  controlsTimeout?: number;
}

export interface MediaDetectorOptions {
  cacheTimeout?: number;
  checkIntervals?: number[];
}

export interface KeyboardHandlerOptions {
  capturePhase?: boolean;
  preventDefault?: boolean;
}

export interface ModuleDependencies {
  mediaDetector: unknown;
  indicator: unknown;
  playbackController: unknown;
  lightboxManager: unknown;
  keyboardHandler: unknown;
}

export interface ExtensionState {
  isInitialized: boolean;
  isLightboxActive: boolean;
  currentMedia: HTMLMediaElement | null;
  shortcuts: ShortcutAction;
}

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}
