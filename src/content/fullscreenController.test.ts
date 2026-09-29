import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenController } from './fullscreenController';

describe('FullscreenController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('enters and exits fullscreen while restoring the original parent', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);

    Object.defineProperty(video, 'play', {
      value: vi.fn(() => Promise.resolve()),
      configurable: true,
    });

    expect(controller.enter(video)).toBe(true);
    expect(controller.isActive()).toBe(true);
    expect(document.getElementById('vsc-page-fullscreen-overlay')).not.toBeNull();
    expect(video.classList.contains('vsc-page-fullscreen-video')).toBe(true);
    expect(video.style.position).toBe('fixed');
    expect(video.controls).toBe(true);

    controller.exit();

    expect(controller.isActive()).toBe(false);
    expect(parent.contains(video)).toBe(true);
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(video.controls).toBe(false);
    expect(video.classList.contains('vsc-page-fullscreen-video--css-cover')).toBe(false);
  });

  it('preserves the live playback position when exiting fullscreen', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);

    let currentTime = 12;
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
      configurable: true,
    });

    Object.defineProperty(video, 'playbackRate', {
      value: 1,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(video, 'muted', {
      value: false,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(video, 'paused', {
      value: false,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(video, 'play', {
      value: vi.fn(() => Promise.resolve()),
      configurable: true,
    });

    expect(controller.enter(video)).toBe(true);

    currentTime = 18;

    controller.exit();

    expect(currentTime).toBe(18);
    expect(parent.contains(video)).toBe(true);
  });

  it('refuses to enter fullscreen for videos outside the top document', () => {
    const controller = new FullscreenController();
    const video = document.createElement('video');
    const ownerDocument = document.implementation.createHTMLDocument('frame');
    ownerDocument.body.appendChild(video);
    Object.defineProperty(video, 'ownerDocument', {
      value: ownerDocument,
      configurable: true,
    });

    expect(controller.enter(video)).toBe(false);
  });

  it('does not reinsert a video the page already discarded when exiting', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    document.body.style.overflow = 'auto';

    let currentTime = 12;
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
      configurable: true,
    });
    Object.defineProperty(video, 'playbackRate', { value: 1, writable: true, configurable: true });
    Object.defineProperty(video, 'muted', { value: false, writable: true, configurable: true });
    // paused=false 才会让 applySnapshot 走 video.play()，测试才是有效的。
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'play', { value: play, configurable: true });

    expect(controller.enter(video)).toBe(true);
    // enter() 自己也会 applySnapshot 一次，这里只关心「退出时有没有再 play」。
    play.mockClear();
    // 模拟站点重新渲染：节点被从文档里摘走。
    video.remove();
    expect(video.isConnected).toBe(false);

    controller.exit();

    // 关键回归：不能把页面已经丢弃的节点插回原父节点。
    expect(parent.contains(video)).toBe(false);
    expect(play).not.toHaveBeenCalled();
    // 其余状态必须完全复位。
    expect(controller.isActive()).toBe(false);
    expect(controller.getActiveVideo()).toBeNull();
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(video.classList.contains('vsc-page-fullscreen-video')).toBe(false);
    expect(video.controls).toBe(false);
  });

  it('exits cleanly when both the video and its original next sibling were discarded', () => {
    vi.useFakeTimers();

    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    const sibling = document.createElement('span');
    parent.append(video, sibling);
    document.body.appendChild(parent);
    document.body.style.overflow = 'auto';

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'play', { value: play, configurable: true });

    expect(controller.enter(video)).toBe(true);
    play.mockClear();
    // originalNextSibling 就是那个 span。节点一起被丢弃时，insertBefore 会抛
    // NotFoundError 把整个退出流程打断（overlay 残留、overflow 残留、isActive 卡 true）。
    video.remove();
    sibling.remove();

    const pendingTimersBeforeExit = vi.getTimerCount();
    expect(() => controller.exit()).not.toThrow();

    expect(vi.getTimerCount()).toBeLessThan(pendingTimersBeforeExit);
    expect(controller.isActive()).toBe(false);
    expect(controller.getActiveVideo()).toBeNull();
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(parent.contains(video)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('drops the overlay backdrop when falling back to css-cover so the video stays visible', () => {
    vi.useFakeTimers();

    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);

    expect(controller.enter(video)).toBe(true);
    // jsdom 不做布局，getBoundingClientRect 全为 0 → lostLayout 必然成立，
    // 180ms 探测必然触发 reparent → css-cover 回退。
    vi.advanceTimersByTime(180);

    expect(video.classList.contains('vsc-page-fullscreen-video--css-cover')).toBe(true);
    expect(parent.contains(video)).toBe(true);

    const overlay = document.getElementById('vsc-page-fullscreen-overlay');
    expect(overlay).not.toBeNull();
    // 背板必须撤掉：css-cover 跨不过页面祖先的层叠上下文，留着只会盖住视频。
    expect(overlay?.classList.contains('vsc-active')).toBe(false);
  });
});
