import { describe, expect, it } from 'vitest';
import { resetPlaybackRate, stepPlaybackRate } from './playback';

describe('playback helpers', () => {
  it('clamps stepped playback rate', () => {
    const video = document.createElement('video');
    video.playbackRate = 15.95;

    expect(stepPlaybackRate(video, 0.1)).toBe(16);
    expect(stepPlaybackRate(video, -20)).toBe(0.1);
  });

  it('resets playback rate to 1.0', () => {
    const video = document.createElement('video');
    video.playbackRate = 2.5;

    expect(resetPlaybackRate(video)).toBe(1);
    expect(video.playbackRate).toBe(1);
  });
});
