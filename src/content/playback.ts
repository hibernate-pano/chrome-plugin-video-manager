const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const stepPlaybackRate = (video: HTMLVideoElement, delta: number) => {
  const nextRate = clamp(video.playbackRate + delta, 0.1, 16);
  video.playbackRate = Number(nextRate.toFixed(2));
  return video.playbackRate;
};

export const resetPlaybackRate = (video: HTMLVideoElement) => {
  video.playbackRate = 1;
  return video.playbackRate;
};
