export interface Shortcut {
  action: string;
  key: string;
  description: string;
}

export interface ShortcutSettings {
  increaseSpeed: string;
  decreaseSpeed: string;
  resetSpeed: string;
  playPause: string;
  fullscreen: string;
  seekForward: string;
  seekBackward: string;
  volumeUp: string;
  volumeDown: string;
  muteToggle: string;
}

export type MediaKind = 'video' | 'audio';
export type HUDType = 'speed' | 'volume' | 'seek' | 'mute' | 'fullscreen' | 'bookmark' | null;
export type SpeedAction = 'increase' | 'decrease' | 'reset';
export type VolumeAction = 'up' | 'down';
export type SeekDirection = 'forward' | 'backward';

export interface SpeedProfile {
  id: string;
  name: string;
  icon: string;
  description: string;
  speed: number;
}

export interface ActiveMediaSessionState {
  mediaKind: MediaKind | null;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  currentTime: number;
  duration: number;
  isInLightbox: boolean;
  canFullscreen: boolean;
}

export interface MediaCandidate {
  element: HTMLMediaElement;
  score: number;
  reason: string[];
}

export interface SiteAdapter {
  match: (hostname: string) => boolean;
  canReparent: (media: HTMLMediaElement) => boolean;
  getPreferredMedia?: (root: Document | ShadowRoot) => HTMLMediaElement | null;
  beforeEnterLightbox?: (media: HTMLVideoElement) => void;
  afterExitLightbox?: (media: HTMLVideoElement) => void;
}

export interface ShortcutDefinition {
  id: keyof ShortcutSettings;
  defaultKey: string;
  displayLabel: string;
  category: 'playback' | 'seek' | 'volume' | 'view';
  preventDefault: boolean;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  increaseSpeed: '=',
  decreaseSpeed: '-',
  resetSpeed: '0',
  playPause: ' ',
  fullscreen: 'f',
  seekForward: 'ArrowRight',
  seekBackward: 'ArrowLeft',
  volumeUp: '[',
  volumeDown: ']',
  muteToggle: 'm',
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'increaseSpeed', defaultKey: DEFAULT_SHORTCUTS.increaseSpeed, displayLabel: '加速', category: 'playback', preventDefault: true },
  { id: 'decreaseSpeed', defaultKey: DEFAULT_SHORTCUTS.decreaseSpeed, displayLabel: '减速', category: 'playback', preventDefault: true },
  { id: 'resetSpeed', defaultKey: DEFAULT_SHORTCUTS.resetSpeed, displayLabel: '重置速度', category: 'playback', preventDefault: true },
  { id: 'playPause', defaultKey: DEFAULT_SHORTCUTS.playPause, displayLabel: '播放/暂停', category: 'playback', preventDefault: true },
  { id: 'fullscreen', defaultKey: DEFAULT_SHORTCUTS.fullscreen, displayLabel: '网页全屏', category: 'view', preventDefault: true },
  { id: 'seekForward', defaultKey: DEFAULT_SHORTCUTS.seekForward, displayLabel: '快进 10s', category: 'seek', preventDefault: true },
  { id: 'seekBackward', defaultKey: DEFAULT_SHORTCUTS.seekBackward, displayLabel: '快退 10s', category: 'seek', preventDefault: true },
  { id: 'volumeUp', defaultKey: DEFAULT_SHORTCUTS.volumeUp, displayLabel: '音量增加', category: 'volume', preventDefault: true },
  { id: 'volumeDown', defaultKey: DEFAULT_SHORTCUTS.volumeDown, displayLabel: '音量减少', category: 'volume', preventDefault: true },
  { id: 'muteToggle', defaultKey: DEFAULT_SHORTCUTS.muteToggle, displayLabel: '静音切换', category: 'volume', preventDefault: true },
];

export const DEFAULT_SPEED_PROFILES: SpeedProfile[] = [
  {
    id: 'learning',
    name: '学习模式',
    icon: 'Focus',
    description: '把新内容稳定推到舒服的理解速度。',
    speed: 1.5,
  },
  {
    id: 'review',
    name: '复习模式',
    icon: 'Loop',
    description: '快速回看已经掌握的内容。',
    speed: 2,
  },
  {
    id: 'browse',
    name: '浏览模式',
    icon: 'Scan',
    description: '高效筛选信息，决定是否深看。',
    speed: 1.25,
  },
  {
    id: 'listening',
    name: '听力模式',
    icon: 'Audio',
    description: '放慢节奏，适合精听和跟读。',
    speed: 0.75,
  },
];
