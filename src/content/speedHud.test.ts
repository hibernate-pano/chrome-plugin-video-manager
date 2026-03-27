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

    hud.show(1.2, video);

    const hudRoot = document.getElementById('vsc-speed-hud');
    expect(hudRoot).not.toBeNull();
    expect(document.body.lastElementChild).toBe(hudRoot);

    const blocker = document.createElement('div');
    blocker.id = 'blocker';
    document.body.appendChild(blocker);
    expect(document.body.lastElementChild).toBe(blocker);

    hud.show(1.4, video);

    expect(document.body.lastElementChild).toBe(hudRoot);
    expect((hudRoot as HTMLElement).style.top).toBe('36px');
    expect((hudRoot as HTMLElement).style.left).toBe('48px');
  });
});
