import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenController } from './fullscreenController';

/**
 * 造一个"站点播放器 + 字幕层"的真实结构：字幕是 video 的兄弟节点，
 * 绝对定位在视频底部 —— 沉浸式翻译等插件在 YouTube / B站 上的实际形态。
 * jsdom 不做布局，所以几何全部靠 getBoundingClientRect 桩出来。
 */
const createPlayerWithSubtitle = (
  subtitleRect: { top: number; left: number; right: number; bottom: number; width: number; height: number },
) => {
  const player = document.createElement('div');
  const video = document.createElement('video');
  const subtitle = document.createElement('div');
  subtitle.id = 'imt-caption-container';

  player.append(video, subtitle);
  document.body.appendChild(player);

  const videoRect = {
    top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  video.getBoundingClientRect = () => videoRect;
  subtitle.getBoundingClientRect = () => ({
    ...subtitleRect, x: subtitleRect.left, y: subtitleRect.top, toJSON: () => ({}),
  } as DOMRect);

  const styleTable = new Map<Element, string>([[subtitle, 'absolute']]);
  const originalGetComputedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
    const position = styleTable.get(target as Element);
    const real = originalGetComputedStyle.call(window, target as Element);
    if (position === undefined) {
      return real;
    }
    return { ...real, position, display: 'block', visibility: 'visible' } as CSSStyleDeclaration;
  });

  return { player, video, subtitle };
};

const SUBTITLE_RECT = {
  top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80,
};

const stage = () => document.getElementById('vsc-page-fullscreen-stage');

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
    // 用我们自己的控制条，浏览器原生控件必须关掉，否则两套 UI 叠在一起。
    expect(video.controls).toBe(false);
    expect(document.getElementById('vsc-controls')).not.toBeNull();

    controller.exit();

    expect(controller.isActive()).toBe(false);
    expect(parent.contains(video)).toBe(true);
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(video.controls).toBe(false);
    expect(document.getElementById('vsc-controls')).toBeNull();
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

  it('refuses to enter for a video found inside a same-origin iframe without throwing', () => {
    const controller = new FullscreenController();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const innerDocument = iframe.contentDocument;
    if (!innerDocument) throw new Error('iframe contentDocument missing');
    const video = innerDocument.createElement('video');
    innerDocument.body.appendChild(video);

    // 同源 iframe 里的 video 是真实 HTMLVideoElement，registry 能认到它，
    // 但 ownerDocument 不是顶层 document：必须干净地返回 false 而非抛异常，
    // 这样键盘层才能据此不吞键。
    expect(video.ownerDocument).not.toBe(document);
    expect(controller.canEnter(video)).toBe(false);
    expect(() => controller.enter(video)).not.toThrow();
    expect(controller.enter(video)).toBe(false);
    expect(controller.isActive()).toBe(false);
  });

  it('returns false without throwing when the document has no body', () => {
    const controller = new FullscreenController();
    const video = document.createElement('video');
    // 先造好 video 再伪造 body：SVG + foreignObject 文档里 body 为 null，
    // 但 querySelectorAll('video') 仍能找到元素，所以 enter() 会被调到。
    // body 是 Document.prototype 上的 getter，这里用 configurable 的 own
    // 属性遮蔽它，测完 delete 掉即可恢复原型链上的原值。
    try {
      Object.defineProperty(document, 'body', { value: null, configurable: true });

      expect(document.body).toBeNull();
      expect(() => controller.enter(video)).not.toThrow();
      expect(controller.enter(video)).toBe(false);
      expect(controller.isActive()).toBe(false);
    } finally {
      delete (document as unknown as { body?: unknown }).body;
    }
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

  it('falls back to css-cover without throwing when the original next sibling was reordered away', () => {
    vi.useFakeTimers();

    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    const sibling = document.createElement('span');
    parent.append(video, sibling);
    document.body.appendChild(parent);

    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    Object.defineProperty(video, 'play', {
      value: vi.fn(() => Promise.resolve()),
      configurable: true,
    });

    expect(controller.enter(video)).toBe(true);
    // 模拟站点在 180ms 探测窗口内重排 DOM：把 originalNextSibling 移走，
    // video 自己仍被 overlay 持有。回退路径若不做 sibling 校验，
    // insertBefore(video, 已脱离的 sibling) 会在定时器回调里抛 NotFoundError，
    // 其后的 applyCssCover 与 restoreIfLost 全部中断。
    sibling.remove();

    expect(() => vi.advanceTimersByTime(180)).not.toThrow();

    // 视频回到原父节点（sibling 没了就 append 到末尾），模式降级为 css-cover。
    expect(parent.contains(video)).toBe(true);
    expect(video.classList.contains('vsc-page-fullscreen-video--css-cover')).toBe(true);
    expect(document.getElementById('vsc-page-fullscreen-overlay')?.classList.contains('vsc-active')).toBe(false);

    controller.exit();
  });

  it('exits cleanly when only the original next sibling was discarded', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    const sibling = document.createElement('span');
    parent.append(video, sibling);
    document.body.appendChild(parent);

    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    Object.defineProperty(video, 'play', {
      value: vi.fn(() => Promise.resolve()),
      configurable: true,
    });

    expect(controller.enter(video)).toBe(true);
    // 全屏期间页面重排 DOM：只移走 originalNextSibling，video 自己还在文档里。
    sibling.remove();

    // 改动前：insertBefore(video, 已脱离的 sibling) 抛 NotFoundError，
    // 视频卡死在 overlay、body 滚动锁死，全屏退不干净。
    expect(() => controller.exit()).not.toThrow();
    expect(controller.isActive()).toBe(false);
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    // video 回到了原父节点（sibling 没了就 append 到末尾）。
    expect(parent.contains(video)).toBe(true);
  });

  it('does not write back the playback position on enter (no seek, no stutter)', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);

    // 记录对 currentTime 的每一次写入：写 currentTime（哪怕同值）会触发 seek，
    // 正是用户看到的卡顿与进度条跳零的根因。正常搬运不该写一次。
    let writes = 0;
    let currentTime = 42;
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      set: (value: number) => {
        writes += 1;
        currentTime = value;
      },
      configurable: true,
    });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'play', { value: vi.fn(() => Promise.resolve()), configurable: true });

    expect(controller.enter(video)).toBe(true);

    expect(writes).toBe(0);
    expect(currentTime).toBe(42);
    controller.exit();
  });

  it('compensates when the site actually lost the playback position during enter', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);

    // 模拟"搬运后站点把播放位置弄丢了"：一旦视频被搬进 overlay，
    // getter 就返回 0（丢失态）。restoreIfLost 必须检测到并补回 42。
    let writes: number[] = [];
    Object.defineProperty(video, 'currentTime', {
      get: () => (video.parentElement?.id === 'vsc-page-fullscreen-stage' ? 0 : 42),
      set: (value: number) => {
        writes.push(value);
      },
      configurable: true,
    });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'play', { value: vi.fn(() => Promise.resolve()), configurable: true });

    expect(controller.enter(video)).toBe(true);

    expect(writes).toEqual([42]);
    controller.exit();
  });

  it('resumes playback on exit even if the user had paused earlier in the same session', () => {
    // 早先 restoreIfLost 挂着 `!userPaused` 豁免，而 userPaused 一旦置真
    // 就再也不复位。于是「用户在全屏里暂停过 → 站点在归还节点时把媒体弄停
    // → 退出」，退出这步的补偿会被那条陈旧标记永久跳过，视频卡在暂停。
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);

    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'play', { value: play, configurable: true });
    // 一旦离开全屏舞台（= 正在被归还给站点），站点把它弄停了。
    Object.defineProperty(video, 'paused', {
      get: () => video.parentElement?.id !== 'vsc-page-fullscreen-stage',
      configurable: true,
    });

    expect(controller.enter(video)).toBe(true);
    // 用户在全屏里暂停过一次 —— 旧实现就是在这里把 userPaused 永久置真。
    video.dispatchEvent(new Event('pause'));
    play.mockClear();

    controller.exit();

    // 退出时站点把媒体弄停了（快照拍的是「在播」），必须补一次 play。
    expect(play).toHaveBeenCalled();
  });

  describe('字幕等浮层', () => {
    it('进入全屏时把字幕层一起搬进 stage，且排在视频之后', () => {
      const { video, subtitle } = createPlayerWithSubtitle(SUBTITLE_RECT);
      const controller = new FullscreenController();

      expect(controller.enter(video)).toBe(true);

      const container = stage();
      expect(container).not.toBeNull();
      // 字幕必须跟着视频走：留在播放器容器里就等于留在原地、看不见了。
      expect(container?.contains(subtitle)).toBe(true);

      // 字幕住在字幕容器里 —— 它是字幕的定位参照物（bottom:% 相对画面框），
      // 不是直接挂在 stage 上。
      const host = container?.querySelector<HTMLElement>('[data-vsc-caption-host]');
      expect(host).not.toBeNull();
      expect(host?.contains(subtitle)).toBe(true);

      // 层级是关键：视频是 2147483643，字幕必须比它高才不会被整个盖住。
      // 光靠 DOM 顺序不够 —— 顺序只对同一层级的元素决定先后。
      const videoZ = Number(video.style.zIndex);
      const captionZ = Number(subtitle.style.getPropertyValue('z-index'));
      expect(Number.isFinite(videoZ)).toBe(true);
      expect(captionZ).toBeGreaterThan(videoZ);
      controller.exit();
    });

    it('退出全屏时把字幕层放回播放器容器', () => {
      const { player, video, subtitle } = createPlayerWithSubtitle(SUBTITLE_RECT);
      const controller = new FullscreenController();

      controller.enter(video);
      controller.exit();

      // 还原到原来的父容器，而不是留在已删除的 overlay 里。
      expect(subtitle.parentElement).toBe(player);
      expect(player.contains(subtitle)).toBe(true);
      expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    });

    it('退出时字幕回到原来的兄弟位置，而不是被塞到最前面', () => {
      const player = document.createElement('div');
      const video = document.createElement('video');
      const before = document.createElement('span');
      const subtitle = document.createElement('div');
      const after = document.createElement('span');
      player.append(before, video, subtitle, after);
      document.body.appendChild(player);

      video.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      subtitle.getBoundingClientRect = () => ({
        ...SUBTITLE_RECT, x: SUBTITLE_RECT.left, y: SUBTITLE_RECT.top, toJSON: () => ({}),
      } as DOMRect);
      const originalGetComputedStyle = window.getComputedStyle;
      vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
        const real = originalGetComputedStyle.call(window, target as Element);
        return target === subtitle
          ? ({ ...real, position: 'absolute', display: 'block', visibility: 'visible' } as CSSStyleDeclaration)
          : real;
      });

      const controller = new FullscreenController();
      controller.enter(video);
      controller.exit();

      // 视频后面的兄弟节点顺序必须完全恢复，否则页面上会有东西悄悄挪位。
      expect(Array.from(player.children)).toEqual([before, video, subtitle, after]);
    });

    it('弹幕层不搬进全屏（满屏弹幕比没字幕吵得多）', () => {
      const { video, subtitle } = createPlayerWithSubtitle({
        // 宽而高、横跨画面中部 —— 弹幕的形态，不是字幕的形态
        top: 100, left: 20, right: 980, bottom: 500, width: 960, height: 400,
      });
      const controller = new FullscreenController();

      controller.enter(video);

      // 视频正常满屏：只有弹幕不该触发降级。
      expect(stage()?.contains(video)).toBe(true);
      // 弹幕必须留在站点播放器里。搬进来 = 满屏弹幕，比没有字幕糟得多。
      expect(stage()?.contains(subtitle)).toBe(false);
      expect(subtitle.parentElement?.className).not.toBe('vsc-page-fullscreen-stage');
      controller.exit();
    });

    it('字幕参照物与实际画面框等大（不是与视口等大）', () => {
      const { video } = createPlayerWithSubtitle(SUBTITLE_RECT);
      // 4:3 的固有尺寸 —— 与视口比例不同，才会留黑边。
      Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
      const controller = new FullscreenController();

      controller.enter(video);

      const host = stage()?.querySelector<HTMLElement>('[data-vsc-caption-host]');
      expect(host).not.toBeNull();
      // contain 之后：min(视口宽/640, 视口高/480)。
      // jsdom 的 innerWidth/innerHeight 默认是 1024×768 → min(1.6, 1.6) = 1.6
      // → 1024×768，正好铺满视口。用一个非 16:9 的固有比例来区分。
      const expectedWidth = Math.min(1024 / 640, 768 / 480) * 640;
      const expectedHeight = Math.min(1024 / 640, 768 / 480) * 480;
      expect(host?.style.width).toBe(`${expectedWidth}px`);
      expect(host?.style.height).toBe(`${expectedHeight}px`);
      controller.exit();
    });

    it('视口变化后字幕参照物重新对齐', () => {
      const { video } = createPlayerWithSubtitle(SUBTITLE_RECT);
      Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
      const controller = new FullscreenController();

      controller.enter(video);
      const host = stage()?.querySelector<HTMLElement>('[data-vsc-caption-host]');
      const before = host?.style.width;

      // 视口变了 —— 画面框跟着变，参照物必须跟着重新算。
      // ⚠️ 之前这里只有 video 自己的 loadedmetadata/resize（媒体尺寸变化），
      // 视口变化两者都不触发，参照物永远停在旧值上。
      Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      window.dispatchEvent(new Event('resize'));

      const after = host?.style.width;
      expect(after, '视口变化后参照物宽度必须重算').not.toBe(before);
      expect(after).toBe(`${Math.min(800 / 640, 800 / 480) * 640}px`);
      controller.exit();
    });

    it('拿不到固有尺寸时退回铺满视口（而不是保留上一个视频的尺寸）', () => {
      const { video } = createPlayerWithSubtitle(SUBTITLE_RECT);
      Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
      const controller = new FullscreenController();

      controller.enter(video);
      const host = stage()?.querySelector<HTMLElement>('[data-vsc-caption-host]');
      expect(host?.style.width).not.toBe('100%');

      // 换了源、元数据还没到 —— 固有尺寸重新变成 0。
      Object.defineProperty(video, 'videoWidth', { value: 0, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 0, configurable: true });
      video.dispatchEvent(new Event('loadedmetadata'));

      // 关键：不能只是 return —— 参照物会停留在**旧视频**的尺寸上，
      // 那比"按视口算"更糟。
      expect(host?.style.width).toBe('100%');
      expect(host?.style.height).toBe('100%');
      controller.exit();
    });

    it('页面里只有字幕层被识别时不会误降级成 css-cover', () => {
      const { video } = createPlayerWithSubtitle(SUBTITLE_RECT);
      const controller = new FullscreenController();

      controller.enter(video);

      // 字幕搬成功了，就没有任何理由牺牲全屏效果。
      expect(stage()?.contains(video)).toBe(true);
      controller.exit();
    });

    it('识别不出字幕层时也不降级 —— 降级并不能保住字幕', () => {
      // 这条锁住一个曾经存在、后来被删掉的分支。
      //
      // 旧逻辑：字幕层一个都没识别出来就退回 css-cover「保住字幕」。
      // 但这个前提是**假的**：css-cover 模式下视频同样是
      // `position: fixed; z-index: 2147483643`，而站点字幕留在自己的容器里、
      // z-index 是 auto —— 照样被视频整个盖住。降级不但保不住字幕，
      // 还白白牺牲了「视频真的进了全屏」这件事。
      //
      // 更要命的是那个分支**恒不可达**：collectLayersToAttach 与
      // shouldDegradeForOverlays 读的是同一份数据、同一个判据，
      // 前者空 ⟺ 后者 some 为 false。
      const parent = document.createElement('div');
      const video = document.createElement('video');
      const overlay = document.createElement('div');
      parent.append(video, overlay);
      document.body.appendChild(parent);

      video.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      // 一个既不满足字幕判据、也覆盖不到视频的浮层：搬不动，也不该触发降级。
      overlay.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      const controller = new FullscreenController();
      controller.enter(video);

      expect(stage()?.contains(video)).toBe(true);
      expect(video.classList.contains('vsc-page-fullscreen-video--reparent')).toBe(true);
      controller.exit();
    });

    it('没有字幕层的普通页面保持 reparent 行为不变', () => {
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);
      const controller = new FullscreenController();

      controller.enter(video);

      expect(stage()?.contains(video)).toBe(true);
      controller.exit();
    });
  });
});
