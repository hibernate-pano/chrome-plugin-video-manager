import type { SpeedAction, VolumeAction } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class PlaybackController {
  setSpeed(media: HTMLMediaElement, action: SpeedAction): number {
    const nextRate = action === 'reset'
      ? 1
      : clamp(media.playbackRate + (action === 'increase' ? 0.1 : -0.1), 0.1, 16);

    media.playbackRate = Number(nextRate.toFixed(2));
    return media.playbackRate;
  }

  setPlaybackRate(media: HTMLMediaElement, rate: number): number {
    media.playbackRate = Number(clamp(rate, 0.1, 16).toFixed(2));
    return media.playbackRate;
  }

  setVolume(media: HTMLMediaElement, action: VolumeAction, step = 0.1): number {
    media.volume = Number(clamp(
      media.volume + (action === 'up' ? step : -step),
      0,
      1,
    ).toFixed(2));

    if (media.volume > 0 && media.muted) {
      media.muted = false;
    }

    return media.volume;
  }

  setAbsoluteVolume(media: HTMLMediaElement, volume: number): number {
    media.volume = Number(clamp(volume, 0, 1).toFixed(2));
    if (media.volume > 0 && media.muted) {
      media.muted = false;
    }
    return media.volume;
  }

  toggleMute(media: HTMLMediaElement): boolean {
    media.muted = !media.muted;
    return media.muted;
  }

  async togglePlayPause(media: HTMLMediaElement): Promise<boolean> {
    if (media.paused) {
      await media.play();
      return true;
    }

    media.pause();
    return false;
  }

  seek(media: HTMLMediaElement, seconds: number): number {
    const duration = Number.isFinite(media.duration) ? media.duration : Number.MAX_SAFE_INTEGER;
    media.currentTime = clamp(media.currentTime + seconds, 0, duration);
    return media.currentTime;
  }

  seekTo(media: HTMLMediaElement, time: number): number {
    const duration = Number.isFinite(media.duration) ? media.duration : Number.MAX_SAFE_INTEGER;
    media.currentTime = clamp(time, 0, duration);
    return media.currentTime;
  }

  seekToPercent(media: HTMLMediaElement, percent: number): number {
    if (!Number.isFinite(media.duration) || media.duration <= 0) {
      return media.currentTime;
    }

    media.currentTime = clamp(media.duration * percent, 0, media.duration);
    return media.currentTime;
  }
}

export const playbackController = new PlaybackController();
