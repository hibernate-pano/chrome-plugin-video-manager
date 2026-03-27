import { activeMediaSession } from './runtime';
import { DEFAULT_SHORTCUTS, ShortcutSettings } from './types';

export class KeyboardHandler {
  private shortcuts: ShortcutSettings;
  private readonly boundHandleKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly boundHandleKeyUp = () => this.handleKeyUp();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPress: { key: string; timestamp: number } | null = null;

  constructor(shortcuts: ShortcutSettings = DEFAULT_SHORTCUTS) {
    this.shortcuts = shortcuts;
  }

  private isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return true;
    }

    return target.isContentEditable;
  }

  private clearTimers() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (this.repeatTimer) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  private scheduleRepeat(action: () => void) {
    this.clearTimers();
    this.longPressTimer = setTimeout(() => {
      action();
      this.repeatTimer = setInterval(action, 120);
    }, 320);
  }

  private matchesShortcut(event: KeyboardEvent, shortcut: string) {
    const parts = shortcut.split('+').filter(Boolean);
    const expectedKey = parts[parts.length - 1];
    const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));

    return event.key === expectedKey
      && event.ctrlKey === modifiers.has('ctrl')
      && event.altKey === modifiers.has('alt')
      && event.shiftKey === modifiers.has('shift')
      && event.metaKey === modifiers.has('meta');
  }

  handleKeyUp(): boolean {
    this.clearTimers();
    return false;
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.isEditableTarget(event.target)) {
      return false;
    }

    const media = activeMediaSession.getCurrentMedia();
    const isLightboxActive = media?.classList.contains('vsc-lightbox-media') ?? false;

    if (!media && !this.matchesShortcut(event, this.shortcuts.fullscreen)) {
      return false;
    }

    if (event.key >= '0' && event.key <= '9' && media) {
      event.preventDefault();
      activeMediaSession.seekToPercent(Number(event.key) / 10);
      return true;
    }

    const now = Date.now();
    const isDoublePress = (shortcut: string) =>
      this.lastPress?.key === shortcut && now - this.lastPress.timestamp < 300;

    if (this.matchesShortcut(event, this.shortcuts.increaseSpeed)) {
      event.preventDefault();
      if (isDoublePress(this.shortcuts.increaseSpeed)) {
        activeMediaSession.resetSpeed();
      } else {
        activeMediaSession.adjustSpeed('increase');
        this.scheduleRepeat(() => activeMediaSession.adjustSpeed('increase'));
      }
      this.lastPress = { key: this.shortcuts.increaseSpeed, timestamp: now };
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.decreaseSpeed)) {
      event.preventDefault();
      if (isDoublePress(this.shortcuts.decreaseSpeed)) {
        activeMediaSession.resetSpeed();
      } else {
        activeMediaSession.adjustSpeed('decrease');
        this.scheduleRepeat(() => activeMediaSession.adjustSpeed('decrease'));
      }
      this.lastPress = { key: this.shortcuts.decreaseSpeed, timestamp: now };
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.resetSpeed)) {
      event.preventDefault();
      activeMediaSession.resetSpeed();
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.playPause) && media) {
      if (isLightboxActive || document.activeElement === document.body || event.target === media) {
        event.preventDefault();
      }
      void activeMediaSession.togglePlayPause();
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.seekForward) && media) {
      event.preventDefault();
      activeMediaSession.seekBy(10);
      this.scheduleRepeat(() => activeMediaSession.seekBy(10));
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.seekBackward) && media) {
      event.preventDefault();
      activeMediaSession.seekBy(-10);
      this.scheduleRepeat(() => activeMediaSession.seekBy(-10));
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.volumeUp) && media) {
      event.preventDefault();
      activeMediaSession.adjustVolume('up');
      this.scheduleRepeat(() => activeMediaSession.adjustVolume('up'));
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.volumeDown) && media) {
      event.preventDefault();
      activeMediaSession.adjustVolume('down');
      this.scheduleRepeat(() => activeMediaSession.adjustVolume('down'));
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.muteToggle) && media) {
      event.preventDefault();
      activeMediaSession.toggleMute();
      return true;
    }

    if (this.matchesShortcut(event, this.shortcuts.fullscreen)) {
      event.preventDefault();
      activeMediaSession.toggleLightbox();
      return true;
    }

    return false;
  }

  init() {
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
  }

  destroy() {
    this.clearTimers();
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
  }

  updateShortcuts(shortcuts: ShortcutSettings) {
    this.shortcuts = shortcuts;
  }
}
