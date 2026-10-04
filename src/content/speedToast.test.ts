import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeedToast, formatRate } from './speedToast';

describe('formatRate', () => {
  it('trims trailing zeros', () => {
    expect(formatRate(1)).toBe('1');
    expect(formatRate(1.5)).toBe('1.5');
    expect(formatRate(1.25)).toBe('1.25');
    expect(formatRate(2)).toBe('2');
  });
});

describe('SpeedToast', () => {
  let video: HTMLVideoElement;

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

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    video = document.createElement('video');
    document.body.appendChild(video);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the rate and hides itself after the delay', () => {
    const toast = new SpeedToast();
    toast.show(1.5, video);

    const root = document.getElementById('vsc-speed-toast')!;
    expect(root.textContent).toBe('1.5x');
    expect(root.classList.contains('vsc-visible')).toBe(true);

    vi.advanceTimersByTime(900);
    expect(root.classList.contains('vsc-visible')).toBe(false);
    toast.destroy();
  });

  it('does nothing when the document has no body', () => {
    // 回归：SVG + foreignObject 文档里 document.body 为 null，但 querySelectorAll('video')
    // 仍能找到真实 HTMLVideoElement。旧的裸 appendChild 会抛 TypeError，
    // 而按键已被吞掉 —— 用户既看不到提示也拿不回按键。
    Object.defineProperty(document, 'body', { value: null, configurable: true });

    try {
      const toast = new SpeedToast();
      expect(() => toast.show(1.5, video)).not.toThrow();
      expect(document.getElementById('vsc-speed-toast')).toBeNull();
    } finally {
      // 必须放在 finally：断言失败时若跳过还原，覆盖会泄漏给后面所有用例。
      delete (document as unknown as { body?: unknown }).body;
    }
  });

  it('reuses one element and updates the text on repeat shows', () => {
    const toast = new SpeedToast();
    toast.show(1.1, video);
    toast.show(1.2, video);

    expect(document.querySelectorAll('#vsc-speed-toast').length).toBe(1);
    expect(document.getElementById('vsc-speed-toast')!.textContent).toBe('1.2x');
    toast.destroy();
  });

  it('removes the element on destroy', () => {
    const toast = new SpeedToast();
    toast.show(1.5, video);
    toast.destroy();

    expect(document.getElementById('vsc-speed-toast')).toBeNull();
  });

  it('adds the iframe offset when the video lives in a same-origin iframe', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;
    const framedVideo = frameDocument.createElement('video');
    frameDocument.body.appendChild(framedVideo);

    // iframe 相对顶层视口下移 400px、右移 50px；视频相对 iframe 视口在 (16, 16)。
    mockRect(frame, 400, 300, 400, 50);
    mockRect(framedVideo, 320, 180, 16, 16);

    const toast = new SpeedToast();
    toast.show(1.1, framedVideo);

    const root = document.getElementById('vsc-speed-toast')!;
    // 改动前只读 video 的 rect，toast 落在 top:32px（16+16）；
    // 换算到顶层坐标系后应落在 400+16+16 = 432px / 50+16+16 = 82px。
    expect(root.style.top).toBe('432px');
    expect(root.style.left).toBe('82px');
    toast.destroy();
  });
});
