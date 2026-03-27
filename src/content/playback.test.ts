import { describe, expect, it } from 'vitest';
import { resetPlaybackRate, seekBy, stepPlaybackRate } from './playback';

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

  it('seeks within media bounds', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      value: 8,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(video, 'duration', {
      value: 12,
      configurable: true,
    });

    expect(seekBy(video, 5)).toBe(12);
    expect(seekBy(video, -20)).toBe(0);
  });
});
