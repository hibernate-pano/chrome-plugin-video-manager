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

  /**
   * 直播流不能拿「没有上限」当兜底。
   *
   * 直播的 duration 是 Infinity，用它兜底等于「随便跳」：
   * `currentTime + 5` 会越过 DVR 窗口的末尾 —— 浏览器把它夹到 live edge，
   * 表现为「按了 → 视频突然跳到直播最新画面」，完全不像「快进 5 秒」。
   */
  it('直播流不会越过 DVR 窗口跳到 live edge', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      value: 30,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(video, 'duration', {
      value: Number.POSITIVE_INFINITY,
      configurable: true,
    });
    Object.defineProperty(video, 'seekable', {
      value: {
        length: 1,
        start: () => 0,
        end: () => 32,
      },
      configurable: true,
    });

    // 30 + 5 = 35 越过了窗口末尾（32）→ 夹到 32，不是 live edge。
    expect(seekBy(video, 5)).toBe(32);
  });

  it('直播流不会越过 DVR 窗口的起点', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      value: 10,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(video, 'duration', {
      value: Number.POSITIVE_INFINITY,
      configurable: true,
    });
    Object.defineProperty(video, 'seekable', {
      value: {
        length: 1,
        start: () => 8,
        end: () => 32,
      },
      configurable: true,
    });

    expect(seekBy(video, -5)).toBe(8);
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
