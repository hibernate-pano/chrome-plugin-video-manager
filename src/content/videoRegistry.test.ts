import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoRegistry } from './videoRegistry';

// jsdom 的 location.hostname 是 [LegacyUnforgeable]，无法重定义；
// 这里只把"hostname 从哪来"换成可变变量，选择器链仍走真实的 siteAdapters。
const adapterHost = vi.hoisted(() => ({ hostname: 'localhost' }));
vi.mock('./siteAdapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./siteAdapters')>();
  return { ...actual, getSiteAdapter: () => actual.getSiteAdapter(adapterHost.hostname) };
});

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

const mockPlaying = (element: HTMLElement) => {
  Object.defineProperty(element, 'paused', { value: false, configurable: true });
  Object.defineProperty(element, 'ended', { value: false, configurable: true });
  Object.defineProperty(element, 'readyState', { value: 4, configurable: true });
};

const appendVideo = (id: string, className = '') => {
  const video = document.createElement('video');
  video.id = id;
  if (className) {
    video.className = className;
  }
  document.body.append(video);
  return video;
};

describe('VideoRegistry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
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

    mockPlaying(large);

    document.body.append(small, large);
    mockRect(small, 240, 120, 0, 0);
    mockRect(large, 800, 450, 0, 0);

    expect(registry.getCurrentVideo()?.id).toBe('large');
  });

  it('scans the page once per frame no matter how often it is asked', () => {
    const registry = new VideoRegistry();
    const video = appendVideo('only');
    mockRect(video, 640, 360, 0, 0);
    registry.start();

    const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
    expect(registry.getCurrentVideo()).toBe(video);
    const scansAfterFirstCall = querySelectorAll.mock.calls.length;
    expect(scansAfterFirstCall).toBeGreaterThan(0);

    for (let index = 0; index < 20; index += 1) {
      expect(registry.getCurrentVideo()).toBe(video);
    }

    // 改动前每次调用都会重跑一遍 collectVideos，这里是 20 倍。
    expect(querySelectorAll.mock.calls.length).toBe(scansAfterFirstCall);

    registry.stop();
  });

  it('measures every video with a single getBoundingClientRect per call', () => {
    const registry = new VideoRegistry();
    const first = appendVideo('first');
    const second = appendVideo('second');
    mockRect(first, 640, 360, 0, 0);
    mockRect(second, 320, 180, 0, 0);

    const firstRect = vi.spyOn(first, 'getBoundingClientRect');
    const secondRect = vi.spyOn(second, 'getBoundingClientRect');

    expect(registry.getCurrentVideo()).toBe(first);
    // 改动前是 isVisible/isInViewport/area 各读一次，共 3 次。
    expect(firstRect).toHaveBeenCalledTimes(1);
    expect(secondRect).toHaveBeenCalledTimes(1);
  });

  it('never returns a video removed inside the same frame', () => {
    const registry = new VideoRegistry();
    const video = appendVideo('only');
    mockRect(video, 640, 360, 0, 0);

    expect(registry.getCurrentVideo()).toBe(video);

    video.remove();

    expect(registry.getCurrentVideo()).toBeNull();
  });

  it('recomputes once the page adds a video', async () => {
    const registry = new VideoRegistry();
    const small = appendVideo('small');
    mockRect(small, 640, 360, 0, 0);
    registry.start();

    expect(registry.getCurrentVideo()).toBe(small);

    const large = appendVideo('large');
    mockRect(large, 1920, 1080, 0, 0);

    // MutationObserver 只置脏标记，等它这一轮微任务回调落地。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(registry.getCurrentVideo()).toBe(large);

    registry.stop();
  });

  it('prefers the site main player over a larger visible video', () => {
    adapterHost.hostname = 'www.youtube.com';
    const registry = new VideoRegistry();

    const main = appendVideo('main', 'html5-main-video');
    const teaser = appendVideo('teaser');
    mockRect(main, 240, 120, 0, 0);
    mockRect(teaser, 800, 450, 0, 0);

    // 改动前 preferred 只加 50，被 可见300+在视口200+面积360 盖过。
    expect(registry.getCurrentVideo()).toBe(main);
  });

  it('finds the site main player inside a same-origin iframe', () => {
    adapterHost.hostname = 'www.youtube.com';
    const registry = new VideoRegistry();

    const teaser = appendVideo('teaser');
    mockRect(teaser, 800, 450, 0, 0);

    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      throw new Error('same-origin iframe document is required for this case');
    }
    const frameVideo = frameDocument.createElement('video');
    frameVideo.id = 'framed-main';
    frameVideo.className = 'html5-main-video';
    frameDocument.body.append(frameVideo);
    mockRect(frameVideo, 240, 120, 0, 0);

    // 改动前只在 document 上查一次 preferred，iframe 里的主播放器根本看不见。
    expect(registry.getCurrentVideo()).toBe(frameVideo);
  });

  it('keeps the preferred video ahead of a bigger paused one', () => {
    adapterHost.hostname = 'www.youtube.com';
    const registry = new VideoRegistry();

    const player = document.createElement('div');
    player.className = 'html5-video-player';
    const main = document.createElement('video');
    main.id = 'main';
    player.append(main);
    document.body.append(player);
    const teaser = appendVideo('teaser');
    mockRect(main, 320, 180, 0, 0);
    mockRect(teaser, 1280, 720, 0, 0);

    expect(registry.getCurrentVideo()).toBe(main);
  });

  it('prefers the playing video over a paused preferred one', () => {
    adapterHost.hostname = 'www.youtube.com';
    const registry = new VideoRegistry();

    // 站点主播放器已停播/隐藏：此时正在播的那条必须赢。
    const main = appendVideo('main', 'html5-main-video');
    main.style.display = 'none';
    mockRect(main, 160, 90, 5000, 0);

    const playing = appendVideo('playing');
    mockPlaying(playing);
    mockRect(playing, 1920, 1080, 0, 0);

    // 锁权重：preferred 抬到 5000 时 preferred = 5014.4 会赢，这条就废了。
    expect(registry.getCurrentVideo()).toBe(playing);
  });

  it('prefers the most recently interacted video over the preferred and the playing one', () => {
    adapterHost.hostname = 'www.youtube.com';
    const registry = new VideoRegistry();
    registry.start();

    const main = appendVideo('main', 'html5-main-video');
    mockPlaying(main);
    mockRect(main, 1280, 720, 0, 0);

    const teaser = appendVideo('teaser');
    teaser.style.display = 'none';
    mockRect(teaser, 160, 90, 5000, 0);

    teaser.dispatchEvent(new Event('play', { bubbles: true }));

    expect(registry.getCurrentVideo()).toBe(teaser);

    registry.stop();
  });

  it('returns null when the only video on the page is invisible', () => {
    const registry = new VideoRegistry();
    const hidden = appendVideo('hidden');
    hidden.style.display = 'none';
    mockRect(hidden, 160, 90, 0, 0);

    // 改动前单候选不可见视频会以最高分胜出，速度被改在看不见的视频上。
    expect(registry.getCurrentVideo()).toBeNull();
  });

  it('still returns an invisible video the user explicitly interacted with', () => {
    // 防回归：过滤不可见候选时必须豁免 lastInteractedVideo——
    // 用户明确点过它，即使站点把它藏起来也仍是他的选择。
    const registry = new VideoRegistry();
    registry.start();

    const hidden = appendVideo('hidden');
    hidden.style.display = 'none';
    mockRect(hidden, 160, 90, 5000, 0);

    hidden.dispatchEvent(new Event('play', { bubbles: true }));

    expect(registry.getCurrentVideo()).toBe(hidden);

    registry.stop();
  });
});
