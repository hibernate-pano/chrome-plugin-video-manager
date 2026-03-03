import { mediaDetector } from './mediaDetector';
import { playbackController } from './playbackController';
import { ShortcutSettings, DEFAULT_SHORTCUTS } from './types';

export class KeyboardHandler {
  private shortcuts: ShortcutSettings;
  private listeners: Map<string, (media: HTMLMediaElement) => void> = new Map();
  private onAction?: (action: string, value: number) => void;

  constructor(shortcuts: ShortcutSettings = DEFAULT_SHORTCUTS, onAction?: (action: string, value: number) => void) {
    this.shortcuts = shortcuts;
    this.onAction = onAction;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.listeners.set(this.shortcuts.increaseSpeed, (media) => {
      const newSpeed = playbackController.setSpeed(media, 'increase');
      this.onAction?.('speed', newSpeed);
    });
    this.listeners.set(this.shortcuts.decreaseSpeed, (media) => {
      const newSpeed = playbackController.setSpeed(media, 'decrease');
      this.onAction?.('speed', newSpeed);
    });
    this.listeners.set(this.shortcuts.resetSpeed, (media) => {
      const newSpeed = playbackController.setSpeed(media, 'reset');
      this.onAction?.('speed', newSpeed);
    });
    this.listeners.set(this.shortcuts.playPause, (media) => {
      playbackController.togglePlayPause(media);
    });
    this.listeners.set(this.shortcuts.volumeUp, (media) => {
      const newVolume = playbackController.setVolume(media, 'up');
      this.onAction?.('volume', newVolume);
    });
    this.listeners.set(this.shortcuts.volumeDown, (media) => {
      const newVolume = playbackController.setVolume(media, 'down');
      this.onAction?.('volume', newVolume);
    });
    this.listeners.set(this.shortcuts.muteToggle, (media) => {
      const isMuted = playbackController.toggleMute(media);
      this.onAction?.('mute', isMuted ? 1 : 0);
    });
    this.listeners.set(this.shortcuts.seekForward, (media) => {
      playbackController.seek(media, 10);
      this.onAction?.('seek', 10);
    });
    this.listeners.set(this.shortcuts.seekBackward, (media) => {
      playbackController.seek(media, -10);
      this.onAction?.('seek', -10);
    });
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    const media = mediaDetector.getCurrentMedia();
    if (!media) return false;

    // 忽略在输入框中的按键
    if (event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement) {
      return false;
    }

    const handler = this.listeners.get(event.key);
    if (handler) {
      event.preventDefault();
      handler(media);
      return true;
    }

    return false;
  }

  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  updateShortcuts(shortcuts: ShortcutSettings) {
    this.shortcuts = shortcuts;
    this.setupHandlers();
  }
}
