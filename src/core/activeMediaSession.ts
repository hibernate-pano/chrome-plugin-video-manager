import { playbackController } from './playbackController';
import { mediaDetector } from './mediaDetector';
import { lightboxManager } from './lightboxManager';
import { useMediaStore } from '../stores/mediaStore';
import type { ActiveMediaSessionState, HUDType } from './types';

type ActionListener = (type: HUDType, value: number) => void;

const MEDIA_EVENTS: Array<keyof HTMLMediaElementEventMap> = [
  'play',
  'pause',
  'ratechange',
  'volumechange',
  'timeupdate',
  'durationchange',
  'emptied',
  'loadedmetadata',
  'ended',
];

const EMPTY_STATE: ActiveMediaSessionState = {
  mediaKind: null,
  isPlaying: false,
  playbackRate: 1,
  volume: 1,
  muted: false,
  currentTime: 0,
  duration: 0,
  isInLightbox: false,
  canFullscreen: false,
};

export class ActiveMediaSession {
  private currentMedia: HTMLMediaElement | null = null;
  private cleanupDetector: (() => void) | null = null;
  private cleanupLightbox: (() => void) | null = null;
  private actionListener: ActionListener | null = null;
  private boundSync = () => this.syncState();

  start(onAction: ActionListener) {
    this.actionListener = onAction;
    mediaDetector.start();
    this.cleanupDetector = mediaDetector.subscribe(() => this.refreshCurrentMedia());
    this.cleanupLightbox = lightboxManager.subscribe(() => this.syncState());
    this.refreshCurrentMedia();
  }

  stop() {
    this.detachCurrentMedia();
    this.cleanupDetector?.();
    this.cleanupDetector = null;
    this.cleanupLightbox?.();
    this.cleanupLightbox = null;
    mediaDetector.stop();
    useMediaStore.getState().setSessionState(EMPTY_STATE);
  }

  getCurrentMedia(): HTMLMediaElement | null {
    return lightboxManager.getMedia() ?? this.currentMedia;
  }

  private attachMedia(media: HTMLMediaElement) {
    MEDIA_EVENTS.forEach((eventName) => media.addEventListener(eventName, this.boundSync));
  }

  private detachMedia(media = this.currentMedia) {
    if (!media) {
      return;
    }

    MEDIA_EVENTS.forEach((eventName) => media.removeEventListener(eventName, this.boundSync));
  }

  private detachCurrentMedia() {
    this.detachMedia(this.currentMedia);
    this.currentMedia = null;
  }

  refreshCurrentMedia() {
    const nextMedia = lightboxManager.getMedia() ?? mediaDetector.getCurrentMedia();
    if (nextMedia === this.currentMedia) {
      this.syncState();
      return;
    }

    this.detachCurrentMedia();

    if (nextMedia) {
      this.currentMedia = nextMedia;
      this.attachMedia(nextMedia);
    }

    this.syncState();
  }

  private syncState() {
    const media = this.getCurrentMedia();

    if (!media || !media.isConnected) {
      useMediaStore.getState().setCurrentMedia(null);
      useMediaStore.getState().setSessionState(EMPTY_STATE);
      return;
    }

    useMediaStore.getState().setCurrentMedia(media);
    useMediaStore.getState().setSessionState({
      mediaKind: media instanceof HTMLVideoElement ? 'video' : 'audio',
      isPlaying: !media.paused,
      playbackRate: media.playbackRate,
      volume: media.volume,
      muted: media.muted,
      currentTime: media.currentTime,
      duration: media.duration,
      isInLightbox: lightboxManager.isActive(),
      canFullscreen: mediaDetector.canFullscreen(media),
    });
  }

  async togglePlayPause() {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    await playbackController.togglePlayPause(media);
    this.syncState();
  }

  adjustSpeed(direction: 'increase' | 'decrease') {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const rate = playbackController.setSpeed(media, direction);
    this.actionListener?.('speed', rate);
    this.syncState();
  }

  resetSpeed() {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const rate = playbackController.setSpeed(media, 'reset');
    this.actionListener?.('speed', rate);
    this.syncState();
  }

  setPlaybackRate(rate: number) {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const nextRate = playbackController.setPlaybackRate(media, rate);
    this.actionListener?.('speed', nextRate);
    this.syncState();
  }

  seekBy(seconds: number) {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const previous = media.currentTime;
    const next = playbackController.seek(media, seconds);
    this.actionListener?.('seek', Number((next - previous).toFixed(2)));
    this.syncState();
  }

  seekToPercent(percent: number) {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const previous = media.currentTime;
    const next = playbackController.seekToPercent(media, percent);
    this.actionListener?.('seek', Number((next - previous).toFixed(2)));
    this.syncState();
  }

  seekTo(time: number) {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    playbackController.seekTo(media, time);
    this.syncState();
  }

  adjustVolume(direction: 'up' | 'down') {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const volume = playbackController.setVolume(media, direction);
    this.actionListener?.('volume', volume);
    this.syncState();
  }

  setVolume(volume: number) {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const nextVolume = playbackController.setAbsoluteVolume(media, volume);
    this.actionListener?.('volume', nextVolume);
    this.syncState();
  }

  toggleMute() {
    const media = this.getCurrentMedia();
    if (!media) {
      return;
    }

    const muted = playbackController.toggleMute(media);
    this.actionListener?.('mute', muted ? 1 : 0);
    this.syncState();
  }

  toggleLightbox() {
    const media = this.currentMedia;
    if (!media) {
      return;
    }

    const isActive = lightboxManager.toggle(media);
    mediaDetector.setOverlayMedia(isActive ? lightboxManager.getMedia() : null);
    this.actionListener?.('fullscreen', isActive ? 1 : 0);
    this.refreshCurrentMedia();
  }
}

export const activeMediaSession = new ActiveMediaSession();
