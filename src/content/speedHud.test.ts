import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeedHud } from './speedHud';

const defineVideoRect = (video: HTMLVideoElement, top: number, left: number) => {
  Object.defineProperty(video, 'getBoundingClientRect', {
    value: () => ({
      width: 1280,
      height: 720,
      top,
      left,
      right: left + 1280,
      bottom: top + 720,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
};

describe('SpeedHud', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('moves the HUD to the front every time it shows', () => {
    const hud = new SpeedHud();
    const video = document.createElement('video');
    defineVideoRect(video, 24, 36);

    hud.showRate(1.2, video);

    const hudRoot = document.getElementById('vsc-speed-hud');
    expect(hudRoot).not.toBeNull();
    expect(document.body.lastElementChild).toBe(hudRoot);

    const blocker = document.createElement('div');
    blocker.id = 'blocker';
    document.body.appendChild(blocker);
    expect(document.body.lastElementChild).toBe(blocker);

    hud.showRate(1.4, video);

    expect(document.body.lastElementChild).toBe(hudRoot);
    expect((hudRoot as HTMLElement).style.top).toBe('36px');
    expect((hudRoot as HTMLElement).style.left).toBe('48px');
  });

  it('renders the rate with a trend arrow', () => {
    const hud = new SpeedHud();
    const video = document.createElement('video');
    defineVideoRect(video, 24, 36);

    hud.showRate(1.5, video);

    const hudRoot = document.getElementById('vsc-speed-hud');
    expect(hudRoot?.querySelector('.vsc-hud__rate')?.textContent).toBe('1.5');
    expect(hudRoot?.querySelector('.vsc-hud__trend')?.textContent).toBe('▲');
    expect(hudRoot?.dataset.trend).toBe('up');
    expect(hudRoot?.dataset.mode).toBe('rate');

    hud.showRate(1.25, video);
    expect(hudRoot?.dataset.trend).toBe('down');
    expect(hudRoot?.querySelector('.vsc-hud__trend')?.textContent).toBe('▼');
  });

  it('renders playback state with the current speed', () => {
    const hud = new SpeedHud();
    const video = document.createElement('video');
    video.playbackRate = 1.75;
    defineVideoRect(video, 24, 36);

    hud.showPlayback(false, video);

    const hudRoot = document.getElementById('vsc-speed-hud');
    expect(hudRoot?.dataset.mode).toBe('playback');
    expect(hudRoot?.querySelector('.vsc-hud__glyph')?.textContent).toBe('⏸');
    expect(hudRoot?.querySelector('.vsc-hud__rate')?.textContent).toBe('1.75');

    hud.showPlayback(true, video);
    expect(hudRoot?.querySelector('.vsc-hud__glyph')?.textContent).toBe('▶');
  });

  it('cleans up listeners on destroy', () => {
    const hud = new SpeedHud();
    const video = document.createElement('video');
    defineVideoRect(video, 24, 36);

    hud.showRate(1.2, video);
    hud.destroy();

    expect(document.getElementById('vsc-speed-hud')).toBeNull();
  });
});
