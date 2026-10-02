import { describe, expect, it } from 'vitest';
import { resetPlaybackRate, seekBy, stepPlaybackRate, togglePlayback } from './playback';

describe('playback helpers', () => {
  it('clamps stepped playback rate to the media bounds', () => {
    const video = document.createElement('video');
    video.playbackRate = 15.95;

    expect(stepPlaybackRate(video, 0.1)).toBe(16);
    expect(stepPlaybackRate(video, -20)).toBe(0.1);
  });

  it('rounds stepped rates to two decimals', () => {
    const video = document.createElement('video');
    video.playbackRate = 1;

    expect(stepPlaybackRate(video, 0.1)).toBe(1.1);
    expect(stepPlaybackRate(video, 0.1)).toBe(1.2);
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

  it('seeks forward on a live stream without a known duration', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      value: 30,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(video, 'duration', {
      value: Number.NaN,
      configurable: true,
    });

    expect(seekBy(video, 5)).toBe(35);
  });

  it('toggles play and pause and reports the new state', () => {
    const video = document.createElement('video');
    let paused = true;
    Object.defineProperty(video, 'paused', { get: () => paused, configurable: true });
    Object.defineProperty(video, 'play', {
      value: () => {
        paused = false;
        return Promise.resolve();
      },
      configurable: true,
    });
    Object.defineProperty(video, 'pause', {
      value: () => {
        paused = true;
      },
      configurable: true,
    });

    expect(togglePlayback(video)).toBe(true);
    expect(video.paused).toBe(false);
    expect(togglePlayback(video)).toBe(false);
    expect(video.paused).toBe(true);
  });
});
