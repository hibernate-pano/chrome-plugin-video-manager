export type SpeedAction = 'increase' | 'decrease' | 'reset';

export class PlaybackController {
  setSpeed(media: HTMLMediaElement, action: SpeedAction): number {
    let newSpeed: number;

    switch (action) {
      case 'increase':
        newSpeed = Math.min(media.playbackRate + 0.1, 16);
        break;
      case 'decrease':
        newSpeed = Math.max(media.playbackRate - 0.1, 0.1);
        break;
      case 'reset':
        newSpeed = 1.0;
        break;
    }

    media.playbackRate = newSpeed;
    return newSpeed;
  }

  setVolume(media: HTMLMediaElement, direction: 'up' | 'down', step = 0.1): number {
    const newVolume = direction === 'up'
      ? Math.min(media.volume + step, 1)
      : Math.max(media.volume - step, 0);

    media.volume = newVolume;
    return newVolume;
  }

  toggleMute(media: HTMLMediaElement): boolean {
    media.muted = !media.muted;
    return media.muted;
  }

  async togglePlayPause(media: HTMLMediaElement): Promise<void> {
    if (media.paused) {
      await media.play();
    } else {
      media.pause();
    }
  }

  seek(media: HTMLMediaElement, seconds: number): number {
    const newTime = Math.max(0, Math.min(media.duration, media.currentTime + seconds));
    media.currentTime = newTime;
    return newTime;
  }
}

export const playbackController = new PlaybackController();
