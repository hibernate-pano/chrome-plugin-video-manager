import { describe, expect, it } from 'vitest';
import { applyPresetSpeed, resetPlaybackRate, seekBy, stepPlaybackRate } from './playback';

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

  it('applies a preset speed rounded to two decimals', () => {
    const video = document.createElement('video');
    video.playbackRate = 1;

    expect(applyPresetSpeed(video, 1.5)).toBe(1.5);
    expect(video.playbackRate).toBe(1.5);

    expect(applyPresetSpeed(video, 1.234)).toBe(1.23);
  });

  it('clamps preset speeds to the media rate bounds', () => {
    const video = document.createElement('video');
    video.playbackRate = 1;

    expect(applyPresetSpeed(video, 0.01)).toBe(0.1);
    expect(applyPresetSpeed(video, 99)).toBe(16);
  });

  it('respects a custom max when stepping and applying presets', () => {
    const video = document.createElement('video');
    video.playbackRate = 3.9;

    expect(stepPlaybackRate(video, 0.1, 4)).toBe(4);
    expect(stepPlaybackRate(video, 0.1, 4)).toBe(4);

    expect(applyPresetSpeed(video, 8, 4)).toBe(4);
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
