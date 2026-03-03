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
