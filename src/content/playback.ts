const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 媒体速率绝对下限。 */
export const MIN_PLAYBACK_RATE = 0.1;

export const stepPlaybackRate = (video: HTMLVideoElement, delta: number, max = 16) => {
  const nextRate = clamp(video.playbackRate + delta, MIN_PLAYBACK_RATE, max);
  video.playbackRate = Number(nextRate.toFixed(2));
  return video.playbackRate;
};

export const resetPlaybackRate = (video: HTMLVideoElement) => {
  video.playbackRate = 1;
  return video.playbackRate;
};

export const applyPresetSpeed = (video: HTMLVideoElement, preset: number, max = 16) => {
  const nextRate = clamp(preset, MIN_PLAYBACK_RATE, max);
  video.playbackRate = Number(nextRate.toFixed(2));
  return video.playbackRate;
};

export const togglePlayback = (video: HTMLVideoElement) => {
  if (video.paused) {
    void video.play().catch(() => {
      // Best effort.
    });
    return true;
  }

  video.pause();
  return false;
};

export const seekBy = (video: HTMLVideoElement, seconds: number) => {
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
  const nextTime = clamp(currentTime + seconds, 0, duration);

  video.currentTime = Number(nextTime.toFixed(2));
  return video.currentTime;
};
