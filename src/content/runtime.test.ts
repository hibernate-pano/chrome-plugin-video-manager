import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentRuntime } from './runtime';
import { GET_STATE_MESSAGE, RESET_SPEED_MESSAGE, SITE_SPEEDS_KEY } from '../shared/types';

const createVideo = () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'playbackRate', {
    value: 1,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, 'paused', {
    value: true,
    writable: true,
    configurable: true,
  });
  return video;
};

describe('ContentRuntime integration', () => {
  let runtime: ContentRuntime;
  let store: Map<string, unknown>;
  let video: HTMLVideoElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    store = new Map();
    video = createVideo();
    video.id = 'test-video';
    document.body.appendChild(video);

    vi.stubGlobal('chrome', {
      runtime: {
        lastError: null,
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        sync: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        local: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => callback({ [key]: store.get(key) }),
          set: (obj: Record<string, unknown>, callback?: () => void) => {
            Object.entries(obj).forEach(([key, value]) => store.set(key, value));
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            store.delete(key);
            callback?.();
          },
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    runtime = new ContentRuntime();
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
  });

  afterEach(() => {
    runtime.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restores the remembered site speed when a video starts at 1x', async () => {
    store.set(SITE_SPEEDS_KEY, { localhost: 1.75 });

    const instance = new ContentRuntime();
    instance.stop();
    await instance.start();
    await vi.advanceTimersByTimeAsync(0);

    video.dispatchEvent(new Event('play'));
    expect(video.playbackRate).toBe(1.75);
    instance.stop();
  });

  it('does not override a speed the site already set', async () => {
    store.set(SITE_SPEEDS_KEY, { localhost: 2 });
    const instance = new ContentRuntime();
    await instance.start();
    await vi.advanceTimersByTimeAsync(0);

    video.playbackRate = 1.25;
    video.dispatchEvent(new Event('play'));

    expect(video.playbackRate).toBe(1.25);
    instance.stop();
  });

  it('remembers the current video rate and persists it', async () => {
    video.playbackRate = 1.5;
    video.dispatchEvent(new Event('ratechange'));
    await vi.advanceTimersByTimeAsync(900);

    expect(store.get(SITE_SPEEDS_KEY)).toEqual({ localhost: 1.5 });
  });

  it('answers popup state queries', async () => {
    video.playbackRate = 2;
    let response: unknown = null;
    const sendResponse = (value: unknown) => {
      response = value;
    };

    const listener = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0];
    listener({ type: GET_STATE_MESSAGE }, {}, sendResponse);

    expect(response).toEqual({
      speed: 2,
      playing: false,
      hostname: 'localhost',
      hasVideo: true,
    });
  });

  it('resets the current video speed on request', async () => {
    video.playbackRate = 2.5;
    let response: unknown = null;

    const listener = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0];
    listener({ type: RESET_SPEED_MESSAGE }, {}, (value: unknown) => {
      response = value;
    });

    expect(response).toEqual({ ok: true });
    expect(video.playbackRate).toBe(1);
  });
});
