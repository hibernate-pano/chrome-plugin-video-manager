import { describe, expect, it } from 'vitest';
import { PlaybackController } from './playbackController';

describe('PlaybackController', () => {
  const controller = new PlaybackController();

  it('clamps speed and resets correctly', () => {
    const media = document.createElement('video');
    media.playbackRate = 15.95;

    expect(controller.setSpeed(media, 'increase')).toBe(16);
    expect(controller.setSpeed(media, 'decrease')).toBe(15.9);
    expect(controller.setSpeed(media, 'reset')).toBe(1);
  });

  it('clamps volume and seek boundaries', () => {
    const media = document.createElement('video');
    Object.defineProperty(media, 'duration', { configurable: true, value: 120 });
    media.volume = 0.95;
    media.currentTime = 119;

    expect(controller.setVolume(media, 'up')).toBe(1);
    expect(controller.setVolume(media, 'down')).toBe(0.9);
    expect(controller.seek(media, 10)).toBe(120);
    expect(controller.seek(media, -200)).toBe(0);
  });
});
