import { beforeEach, describe, expect, it } from 'vitest';
import { MediaDetector } from './mediaDetector';

const createVideo = (id: string, rect: Partial<DOMRect>, playing = false) => {
  const media = document.createElement('video');
  media.id = id;
  Object.defineProperty(media, 'paused', { configurable: true, value: !playing });
  Object.defineProperty(media, 'ended', { configurable: true, value: false });
  Object.defineProperty(media, 'readyState', { configurable: true, value: 4 });
  media.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: rect.top ?? 0,
    left: rect.left ?? 0,
    bottom: rect.bottom ?? 300,
    right: rect.right ?? 400,
    width: rect.width ?? 400,
    height: rect.height ?? 300,
    toJSON: () => ({}),
  } as DOMRect);
  return media;
};

describe('MediaDetector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers recent interaction over pure size', () => {
    const detector = new MediaDetector();
    const large = createVideo('large', { width: 900, height: 600 }, true);
    const small = createVideo('small', { width: 400, height: 300 }, true);

    document.body.append(large, small);
    detector.start();

    small.dispatchEvent(new Event('play', { bubbles: true }));
    expect(detector.getCurrentMedia()?.id).toBe('small');

    detector.stop();
  });

  it('falls back to the next best media after DOM replacement', () => {
    const detector = new MediaDetector();
    const first = createVideo('first', { width: 800, height: 500 }, true);
    const second = createVideo('second', { width: 500, height: 300 }, true);

    document.body.append(first, second);
    expect(detector.getCurrentMedia()?.id).toBe('first');

    first.remove();
    expect(detector.getCurrentMedia()?.id).toBe('second');
  });
});
