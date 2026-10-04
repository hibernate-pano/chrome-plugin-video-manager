import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TakeoverNotice } from './takeoverNotice';

const NOTICE_ID = 'vsc-takeover-notice';

const mockRect = (element: HTMLElement, width: number, height: number, top = 0, left = 0) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      width,
      height,
      top,
      left,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
};

describe('TakeoverNotice', () => {
  let notice: TakeoverNotice;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    notice = new TakeoverNotice();
  });

  afterEach(() => {
    notice.destroy();
    vi.useRealTimers();
  });

  it('says what will not happen, without guessing a reason', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    mockRect(video, 640, 360, 100, 200);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    expect(root.textContent).toBe('这个视频暂时接管不了');
    expect(root.classList.contains('vsc-visible')).toBe(true);
  });

  it('puts the notice near the video', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    mockRect(video, 640, 360, 100, 200);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    expect(root.style.top).toBe('116px');
    expect(root.style.left).toBe('216px');
  });

  it('adds the iframe offset when the video lives in a same-origin iframe', () => {
    // 这条路径最常见的场景**就是** iframe 里的视频（跨 document 搬不动），
    // 而 iframe 内元素的 rect 用的是 iframe 自己的视口坐标。不换算就会被
    // 钳到屏幕角落——6.0.3 在调速提示上修过同一个坑，这边是同一个坐标系。
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;
    const framedVideo = frameDocument.createElement('video');
    frameDocument.body.appendChild(framedVideo);

    mockRect(frame, 400, 300, 400, 50);
    mockRect(framedVideo, 320, 180, 0, 0);

    notice.show(framedVideo);

    const root = document.getElementById(NOTICE_ID)!;
    // 未换算会是 max(16, 0+16) = 16px，正是"掉到屏幕角落"的表现。
    expect(root.style.top).toBe('416px');
    expect(root.style.left).toBe('66px');
  });

  it('clamps into the viewport when the video is scrolled off', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    mockRect(video, 640, 360, -200, -300);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    expect(root.style.top).toBe('16px');
    expect(root.style.left).toBe('16px');
  });

  it('fades out on its own', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    notice.show(video);
    expect(document.getElementById(NOTICE_ID)!.classList.contains('vsc-visible')).toBe(true);

    vi.advanceTimersByTime(2600);
    expect(document.getElementById(NOTICE_ID)!.classList.contains('vsc-visible')).toBe(false);
  });

  it('shows nothing at all in a document with no body', () => {
    // SVG/foreignObject 这类文档没有可挂载的宿主，裸调 appendChild 会抛 TypeError。
    const video = document.createElement('video');
    document.body.appendChild(video);
    const body = document.body;
    body.remove();

    expect(() => notice.show(video)).not.toThrow();
    expect(document.getElementById(NOTICE_ID)).toBeNull();

    document.documentElement.appendChild(body);
  });

  it('leaves no trace after destroy', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    notice.show(video);
    notice.destroy();

    expect(document.getElementById(NOTICE_ID)).toBeNull();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});
