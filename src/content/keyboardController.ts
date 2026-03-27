import { resetPlaybackRate, stepPlaybackRate } from './playback';
import { matchesShortcut } from '../shared/shortcuts';
import type { ShortcutSettings } from '../shared/types';

interface KeyboardControllerOptions {
  getShortcuts: () => ShortcutSettings;
  getCurrentVideo: () => HTMLVideoElement | null;
  isFullscreenActive: () => boolean;
  toggleFullscreen: (video: HTMLVideoElement | null) => boolean;
  exitFullscreen: () => void;
  showSpeedHud: (rate: number, video: HTMLVideoElement) => void;
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
};

export class KeyboardController {
  private readonly options: KeyboardControllerOptions;
  private repeatDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private repeatingShortcut: keyof ShortcutSettings | null = null;
  private readonly boundHandleKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private readonly boundHandleKeyUp = (event: KeyboardEvent) => this.handleKeyUp(event);

  constructor(options: KeyboardControllerOptions) {
    this.options = options;
  }

  private intercept(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  private clearRepeat() {
    if (this.repeatDelayTimer) {
      clearTimeout(this.repeatDelayTimer);
      this.repeatDelayTimer = null;
    }

    if (this.repeatIntervalTimer) {
      clearInterval(this.repeatIntervalTimer);
      this.repeatIntervalTimer = null;
    }

    this.repeatingShortcut = null;
  }

  private runSpeedChange(delta: number) {
    const video = this.options.getCurrentVideo();
    if (!video) {
      return;
    }

    const rate = delta === 0
      ? resetPlaybackRate(video)
      : stepPlaybackRate(video, delta);

    this.options.showSpeedHud(rate, video);
  }

  private startRepeat(shortcutId: keyof ShortcutSettings, delta: number) {
    this.clearRepeat();
    this.repeatingShortcut = shortcutId;
    this.repeatDelayTimer = setTimeout(() => {
      this.runSpeedChange(delta);
      this.repeatIntervalTimer = setInterval(() => this.runSpeedChange(delta), 120);
    }, 280);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (event.isComposing || isEditableTarget(event.target)) {
      return false;
    }

    const shortcuts = this.options.getShortcuts();
    const activeVideo = this.options.getCurrentVideo();
    const fullscreenActive = this.options.isFullscreenActive();

    if (fullscreenActive && event.key === 'Escape') {
      this.intercept(event);
      this.options.exitFullscreen();
      return true;
    }

    if (!activeVideo) {
      return false;
    }

    if (matchesShortcut(event, shortcuts.increaseSpeed)) {
      this.intercept(event);
      if (event.repeat && this.repeatingShortcut === 'increaseSpeed') {
        return true;
      }

      this.runSpeedChange(0.1);
      this.startRepeat('increaseSpeed', 0.1);
      return true;
    }

    if (matchesShortcut(event, shortcuts.decreaseSpeed)) {
      this.intercept(event);
      if (event.repeat && this.repeatingShortcut === 'decreaseSpeed') {
        return true;
      }

      this.runSpeedChange(-0.1);
      this.startRepeat('decreaseSpeed', -0.1);
      return true;
    }

    if (matchesShortcut(event, shortcuts.resetSpeed)) {
      this.intercept(event);
      this.clearRepeat();
      this.runSpeedChange(0);
      return true;
    }

    if (matchesShortcut(event, shortcuts.fullscreen)) {
      this.intercept(event);
      this.clearRepeat();
      this.options.toggleFullscreen(activeVideo);
      return true;
    }

    return false;
  }

  handleKeyUp(event: KeyboardEvent): boolean {
    const repeatingShortcut = this.repeatingShortcut;
    if (!repeatingShortcut) {
      return false;
    }

    const shortcuts = this.options.getShortcuts();
    if (!matchesShortcut(event, shortcuts[repeatingShortcut])) {
      return false;
    }

    this.clearRepeat();
    return true;
  }

  start() {
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
    document.addEventListener('keyup', this.boundHandleKeyUp, true);
  }

  stop() {
    this.clearRepeat();
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
    document.removeEventListener('keyup', this.boundHandleKeyUp, true);
  }
}
