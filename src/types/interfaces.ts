export interface DOMUtils {
  isElementInViewport: (
    el: HTMLElement,
    visibilityMap?: WeakMap<HTMLElement, boolean>,
    observer?: IntersectionObserver
  ) => boolean;
  isInIframe: (el: HTMLElement) => boolean;
  querySelectorAllIncludingShadowDOM: (
    selector: string,
    shadowElements?: HTMLElement[],
    isStale?: boolean
  ) => HTMLElement[];
  isTypingInEditable: (event: Event) => boolean;
  ensureMatchesPolyfill: () => void;
}

export interface PlaybackControllerInterface {
  handleSpeed: (
    media: HTMLMediaElement,
    action: 'increase' | 'decrease' | 'reset'
  ) => void;
  handleSeek: (
    video: HTMLVideoElement,
    direction: 'forward' | 'backward',
    step?: number
  ) => void;
  handleVolume: (
    media: HTMLMediaElement,
    direction: 'up' | 'down',
    step?: number
  ) => void;
  handlePlayPause: (media: HTMLMediaElement) => Promise<void>;
}

export interface IndicatorInterface {
  show: (speed: number | string, mediaElement: HTMLMediaElement) => void;
  hide: () => void;
  destroy: () => void;
}

export interface LightboxManagerInterface {
  isActive: () => boolean;
  enter: (media: HTMLVideoElement) => void;
  exit: () => void;
  toggle: (media: HTMLVideoElement) => void;
  getVideo: () => HTMLVideoElement | null;
}

export interface MediaDetectorInterface {
  getAllMediaElements: () => HTMLMediaElement[];
  getTargetMedia: (lightboxActive?: boolean) => HTMLMediaElement | null;
  getBiggestMedia: (
    mediaArray: HTMLMediaElement[]
  ) => HTMLMediaElement | null;
  setupMediaElementDetection: () => void;
  setupMediaEventDelegation: () => void;
}

export interface KeyboardHandlerInterface {
  init: () => void;
  destroy: () => void;
  updateShortcuts: (newShortcuts: Record<string, string>) => void;
}

export interface StorageInterface {
  loadShortcutSettings: () => Promise<Record<string, string>>;
  saveShortcutSettings: (shortcuts: Record<string, string>) => Promise<void>;
  onShortcutsChanged: (callback: (shortcuts: Record<string, string>) => void) => void;
}

export interface VideoSpeedControllerOptions {
  autoInit?: boolean;
  debug?: boolean;
}

export interface VideoSpeedControllerInterface {
  init: () => Promise<void>;
  destroy: () => void;
}
