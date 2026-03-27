import { beforeEach, describe, expect, it } from 'vitest';
import { VideoRegistry } from './videoRegistry';

const mockRect = (element: HTMLElement, width: number, height: number, top = 0, left = 0) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      width,
      height,
      top,
      left,
      right: left + width,
      bottom: top + height,
    }),
    configurable: true,
  });
};

describe('VideoRegistry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers the most recently interacted video', () => {
    const registry = new VideoRegistry();
    registry.start();

    const first = document.createElement('video');
    const second = document.createElement('video');
    first.id = 'first';
    second.id = 'second';
    document.body.append(first, second);
    mockRect(first, 600, 400, 0, 0);
    mockRect(second, 300, 200, 0, 0);

    second.dispatchEvent(new Event('play', { bubbles: true }));
    expect(registry.getCurrentVideo()?.id).toBe('second');

    registry.stop();
  });

  it('prefers the playing visible largest video when there is no recent interaction', () => {
    const registry = new VideoRegistry();
    const small = document.createElement('video');
    const large = document.createElement('video');
    small.id = 'small';
    large.id = 'large';

    Object.defineProperty(large, 'paused', { value: false, configurable: true });
    Object.defineProperty(large, 'ended', { value: false, configurable: true });
    Object.defineProperty(large, 'readyState', { value: 4, configurable: true });

    document.body.append(small, large);
    mockRect(small, 240, 120, 0, 0);
    mockRect(large, 800, 450, 0, 0);

    expect(registry.getCurrentVideo()?.id).toBe('large');
  });
});
