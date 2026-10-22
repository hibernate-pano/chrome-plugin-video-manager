import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenController } from './fullscreenController';
import { FrameExpander } from './iframeExpansion';
import { resetExtensionDom } from './testDom';

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
  // 站点把字幕藏起来的状态（插件在视频被搬走时常见的做法）。
  const subtitleState = { hidden: false };
  const originalGetComputedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
    const position = styleTable.get(target as Element);
    const real = originalGetComputedStyle.call(window, target as Element);
    if (position === undefined) {
      return real;
    }
    return {
      ...real,
      position,
      display: subtitleState.hidden ? 'none' : 'block',
      visibility: 'visible',
    } as CSSStyleDeclaration;
  });

  return {
    player,
    video,
    subtitle,
    /** 让站点把字幕藏起来 / 再放出来。 */
    setSubtitleHidden: (hidden: boolean) => {
      subtitleState.hidden = hidden;
    },
  };
};

const SUBTITLE_RECT = {
  top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80,
};

const stage = () => document.getElementById('vsc-page-fullscreen-stage');

/**
 * 一个「正在网页全屏里」的视频（jsdom 没有布局引擎，矩形全是 0，
 * 于是 180ms 的布局探测会把它降级成 css-cover —— 那不是这些用例要验的路径）。
 */
const createFullscreenableVideo = (parent: ParentNode) => {
  const video = document.createElement('video');
  parent.appendChild(video);
  Object.defineProperty(video, 'paused', { value: false, configurable: true });
  Object.defineProperty(video, 'play', {
    value: vi.fn(() => Promise.resolve()),
    configurable: true,
  });
  video.getBoundingClientRect = () => ({
    top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return video;
};

describe('FullscreenController', () => {
  beforeEach(() => {
    resetExtensionDom();
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

  it('isolates the backdrop and the controls host with inline !important (hostile site CSS cannot break through)', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);

    expect(controller.enter(video)).toBe(true);

    // ⚠️ 这条守的是 6.2.0 的回归：挂载点换到了 <html>，而背板与控制条宿主
    // 成了 <html> 的直接子节点 —— 站点一条 `html > div { display: none !important }`
    // 就能打掉它们（实测症状：没有控制条、没有退出按钮，只剩 Escape 能退出）。
    //
    // 挡它的是**内联 !important**（级联里 style 属性高于任何选择器），
    // 所以这里断言的是「我们写下去的那份声明带不带 important」。
    const overlay = document.getElementById('vsc-page-fullscreen-overlay') as HTMLElement;
    expect(overlay, '背板必须存在').not.toBeNull();
    expect(overlay.style.getPropertyValue('display'), '背板必须显形').toBe('block');
    expect(overlay.style.getPropertyPriority('display'), '背板的 display 必须带 !important').toBe(
      'important',
    );
    expect(overlay.style.getPropertyPriority('position'), '背板的 position 必须带 !important').toBe(
      'important',
    );
    expect(overlay.style.getPropertyPriority('inset'), '背板的 inset 必须带 !important').toBe(
      'important',
    );
    expect(overlay.style.getPropertyPriority('z-index'), '背板的 z-index 必须带 !important').toBe(
      'important',
    );

    // 舞台也在背板里面：它是一个 div，站点的 `div { … !important }` 会命中它。
    const stageElement = document.getElementById('vsc-page-fullscreen-stage') as HTMLElement;
    expect(stageElement.style.getPropertyPriority('display'), '舞台的 display 必须带 !important').toBe(
      'important',
    );

    const host = document.getElementById('vsc-controls') as HTMLElement;
    expect(host, '控制条宿主必须存在').not.toBeNull();
    expect(host.style.getPropertyValue('display'), '控制条宿主必须显形').toBe('block');
    expect(host.style.getPropertyPriority('display'), '控制条宿主的 display 必须带 !important').toBe(
      'important',
    );
    expect(host.style.getPropertyPriority('position'), '控制条宿主的 position 必须带 !important').toBe(
      'important',
    );

    controller.exit();
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

  it('returns the video to the page when the health check finds our backdrop detached', () => {
    vi.useFakeTimers();
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    document.body.style.overflow = 'auto';

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'play', { value: play, configurable: true });
    // ⚠️ jsdom 不做布局：getBoundingClientRect 全是 0 → 180ms 的布局探测
    // 会判「画面没了」并降级成 css-cover（视频已经回到站点自己的树里），
    // 那不是本用例要验的路径。桩一个大矩形，让它留在 reparent 模式。
    video.getBoundingClientRect = () => ({
      top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    expect(controller.enter(video)).toBe(true);
    // 先让 180ms 的布局探测窗口过去（否则会走 css-cover 回退，不是本用例的路径）。
    vi.advanceTimersByTime(200);
    play.mockClear();
    expect(video.classList.contains('vsc-page-fullscreen-video--reparent')).toBe(true);

    // 站点把**我们的背板**从文档里摘掉 —— 视频跟着它一起脱了文档。
    const overlay = document.getElementById('vsc-page-fullscreen-overlay');
    expect(overlay).not.toBeNull();
    overlay?.remove();
    expect(video.isConnected).toBe(false);

    // 健康检查（500ms 一次）发现「背板不在文档里了」。
    vi.advanceTimersByTime(600);

    // ⚠️ 关键回归：视频必须回到站点原来的父节点 ——
    // 以前这里是 release()（只清理、不搬运）：用户的视频从此人间蒸发。
    expect(parent.contains(video)).toBe(true);
    expect(video.isConnected).toBe(true);
    expect(controller.isActive()).toBe(false);
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does not resurrect a video the site discarded while our backdrop is still mounted', () => {
    vi.useFakeTimers();
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    document.body.style.overflow = 'auto';

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'play', { value: play, configurable: true });

    expect(controller.enter(video)).toBe(true);
    vi.advanceTimersByTime(200);
    play.mockClear();

    // 站点把**视频自己**丢掉了（背板还在）。
    video.remove();
    expect(video.isConnected).toBe(false);

    vi.advanceTimersByTime(600);

    // ⚠️ 那个节点不能被复活：站点不要它了，我们把它插回原父节点
    // 只会让页面上多一个没人要的幽灵视频。
    expect(parent.contains(video)).toBe(false);
    expect(video.isConnected).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does not resurrect the video when the site discards both it and our backdrop', () => {
    vi.useFakeTimers();
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    document.body.style.overflow = 'auto';

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'play', { value: play, configurable: true });
    video.getBoundingClientRect = () => ({
      top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    expect(controller.enter(video)).toBe(true);
    vi.advanceTimersByTime(200);
    play.mockClear();

    // 站点一口气把**视频**和**我们的背板**都摘掉。
    video.remove();
    document.getElementById('vsc-page-fullscreen-overlay')?.remove();
    expect(video.isConnected).toBe(false);

    vi.advanceTimersByTime(600);

    // ⚠️ 那个节点确实没了 —— 但那是站点干的，不是我们。
    // 我们只负责把界面收干净，绝不把站点丢弃的节点插回页面
    // （插回去 = 页面上多一个没人要的幽灵视频 + 对游离节点调 play()）。
    expect(parent.contains(video)).toBe(false);
    expect(video.isConnected).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('returns the video to the page when the site removes our backdrop and the user exits', () => {
    const controller = new FullscreenController();
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    document.body.style.overflow = 'auto';

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, 'play', { value: play, configurable: true });

    expect(controller.enter(video)).toBe(true);
    play.mockClear();

    // 站点把**我们的背板**从文档里摘掉（视频跟着它一起脱了文档，
    // 但它仍然是我们带走的那个节点 —— 站点并没有丢弃它）。
    const overlay = document.getElementById('vsc-page-fullscreen-overlay');
    expect(overlay).not.toBeNull();
    overlay?.remove();
    expect(video.isConnected).toBe(false);
    expect(overlay?.contains(video)).toBe(true);

    // 用户按 ESC 退出全屏。
    controller.exit();

    // ⚠️ 关键回归：视频必须回到站点原来的父节点 ——
    // 否则用户的视频从此人间蒸发（release() 只做清理，不会把节点插回去）。
    expect(parent.contains(video)).toBe(true);
    expect(video.isConnected).toBe(true);
    // 状态完全复位。
    expect(controller.isActive()).toBe(false);
    expect(controller.getActiveVideo()).toBeNull();
    expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    expect(video.classList.contains('vsc-page-fullscreen-video')).toBe(false);
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
    // ⚠️ display 必须**内联**写成 none：样式表里的 `.vsc-active { display: block }`
    // 只是普通作者声明，撤掉 class 未必能让背板真的消失。
    expect(overlay?.style.getPropertyValue('display')).toBe('none');
    expect(overlay?.style.getPropertyPriority('display')).toBe('important');

    // ⚠️ 必须收尾：这个控制器还「在全屏」（css-cover 模式）。
    // 不退出的话，它会带着 fullscreenchange 监听器活到后面的用例里，
    // 把那时新建的 overlay 按同一个 DOM id 摘掉 —— 那是测试之间的串扰，
    // 不是产品行为。
    controller.exit();
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

  describe('iframe 里的网页全屏', () => {
    /**
     * 撑大与还原必须**成对**：父文档那边被撑大的 iframe 元素若不还原，
     * 用户页面就被永久改成「一个巨大的 iframe」。
     *
     * 这条断言盯的是控制器与撑大机制之间的**契约**（进全屏 → 请求撑大，
     * 退出全屏 → 请求还原），具体的样式与消息协议在 iframeExpansion.test.ts。
     */
    it('进全屏时请求撑大，退出时请求还原', () => {
      const setOwnFullscreen = vi.spyOn(FrameExpander.prototype, 'setOwnFullscreen');
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);

      expect(controller.enter(video)).toBe(true);
      expect(setOwnFullscreen).toHaveBeenCalledWith(true);

      controller.exit();
      expect(setOwnFullscreen).toHaveBeenCalledWith(false);
    });

    it('视频被页面丢弃时也要把撑大撤销掉', () => {
      const setOwnFullscreen = vi.spyOn(FrameExpander.prototype, 'setOwnFullscreen');
      vi.useFakeTimers();
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);

      controller.enter(video);
      // 先让 180ms 的探测窗口过去（它会把视频放回站点 DOM）。
      vi.advanceTimersByTime(200);
      setOwnFullscreen.mockClear();

      // 页面把这个节点从文档里丢掉了 → 健康检查走 release()。
      video.remove();
      vi.advanceTimersByTime(600);

      expect(setOwnFullscreen).toHaveBeenCalledWith(false);
      vi.useRealTimers();
    });

    it('顶层文档自己进全屏时不去麻烦任何父文档', () => {
      // 顶层文档的 parent 就是自己：撑大机制必须直接短路，
      // 顶层自己进全屏的老路径一行都不该变。
      const spy = vi.spyOn(window, 'postMessage');
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);

      controller.enter(video);
      controller.exit();

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
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

  /**
   * B1：页面重渲染后退出全屏 —— 视频与字幕不能被塞回一个**已脱离文档**的容器。
   *
   * ## 要守住的承诺
   *
   * 按 f 进全屏 → 站点重渲染（React/Vue 换清晰度、SPA 虚拟列表把旧的播放器
   * 容器丢掉）→ 按 Esc 退出 → 视频与字幕必须回到**用户看得见**的地方。
   *
   * 旧实现只校验了「sibling 还挂在原父节点下」，没校验**原父节点自己还在不在
   * 文档里** —— 那个容器早已被站点丢掉，于是节点被插进一个没人看得见的地方：
   * 站点播放器变成黑框，字幕从此永久消失。
   */
  describe('页面重渲染后退出全屏', () => {
    it('视频不会被塞进已经脱离文档的旧容器，而是落到看得见的兜底位置', () => {
      const { player, video } = createPlayerWithSubtitle(SUBTITLE_RECT);
      const controller = new FullscreenController();

      expect(controller.enter(video)).toBe(true);
      expect(stage()?.contains(video)).toBe(true);

      // 站点重渲染：旧的播放器容器被整个丢掉（此时视频还在我们的 overlay 里）。
      player.remove();
      expect(player.isConnected, '前置条件：旧容器已经脱离文档').toBe(false);

      expect(() => controller.exit()).not.toThrow();

      // ⚠️ 关键回归：不能把视频插回那个游离容器 —— 站点会变成黑框。
      expect(player.contains(video), '视频不能回到已经脱离文档的旧容器').toBe(false);
      // 落点必须用户看得见：body 是页面里唯一一直可见的容器。
      expect(video.parentElement, '视频必须落到看得见的兜底位置').toBe(document.body);
      expect(video.isConnected, '视频必须还在文档里').toBe(true);

      // 全屏状态必须完全复位。
      expect(controller.isActive()).toBe(false);
      expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
    });

    it('字幕跟着视频一起落到同一个可见落点（不能单独消失）', () => {
      const { player, video, subtitle } = createPlayerWithSubtitle(SUBTITLE_RECT);
      const controller = new FullscreenController();

      controller.enter(video);
      player.remove();

      controller.exit();

      // 字幕原来也在那个被丢掉的容器里 —— 塞回去等于字幕从此消失。
      expect(player.contains(subtitle), '字幕不能回到已经脱离文档的旧容器').toBe(false);
      expect(subtitle.parentElement, '字幕必须与视频落到同一个可见落点').toBe(document.body);
      expect(subtitle.isConnected, '字幕必须还在文档里').toBe(true);
    });

    it('退出流程不抛异常，滚动锁与 overlay 都复位', () => {
      const { player, video } = createPlayerWithSubtitle(SUBTITLE_RECT);
      document.body.style.overflow = 'auto';
      const controller = new FullscreenController();

      controller.enter(video);
      player.remove();

      expect(() => controller.exit()).not.toThrow();

      expect(controller.isActive()).toBe(false);
      expect(controller.getActiveVideo()).toBeNull();
      expect(document.getElementById('vsc-page-fullscreen-overlay')).toBeNull();
      expect(document.getElementById('vsc-controls')).toBeNull();
      expect(document.body.style.overflow, 'body 的滚动锁必须解除').toBe('auto');
    });

    it('兜底落点上被站点藏起来的字幕会被拉回可见', () => {
      // 站点（或字幕插件）在全屏期间把字幕 display:none 掉了。
      // 字幕落到 body 之后它仍然不可见 —— 那与「字幕消失」是同一种故障。
      const { player, video, subtitle, setSubtitleHidden } = createPlayerWithSubtitle(SUBTITLE_RECT);
      const controller = new FullscreenController();

      controller.enter(video);
      // 字幕进全屏时是可见的（所以被搬进了 overlay）……
      expect(stage()?.contains(subtitle)).toBe(true);

      // ……全屏期间站点把它藏了起来。
      setSubtitleHidden(true);
      player.remove();
      controller.exit();

      expect(subtitle.parentElement).toBe(document.body);
      expect(
        subtitle.style.getPropertyValue('display'),
        '兜底落点上的字幕必须被拉回可见',
      ).toBe('block');
    });

    it('站点把视频拿回它的新播放器容器时，我们不再把它拔出来', () => {
      // 站点重渲染时可能把 <video> 节点插回它的新播放器容器 ——
      // 那时视频仍然 connected，但它已经不在我们手上了。
      // 这时候再把它「还原」到原位置，等于把站点刚建好的播放器掏空。
      const { video } = createPlayerWithSubtitle(SUBTITLE_RECT);
      const controller = new FullscreenController();

      controller.enter(video);

      const newPlayer = document.createElement('div');
      document.body.appendChild(newPlayer);
      newPlayer.appendChild(video);
      // 站点给它的新播放器写了尺寸 —— 我们退出时一个字都不许碰它。
      video.style.setProperty('width', '640px');

      controller.exit();

      expect(newPlayer.contains(video), '不能把视频从站点的新播放器里拔出来').toBe(true);
      // 我们写在它身上的全屏样式必须撤掉（否则新播放器里躺着一个满屏大的视频）。
      expect(video.style.getPropertyValue('position')).not.toBe('fixed');
      expect(video.style.getPropertyValue('width')).not.toBe('100vw');
      expect(video.classList.contains('vsc-page-fullscreen-video')).toBe(false);
      // 站点自己写的尺寸必须原样保留（不能被「整个 style 属性还原」抹掉）。
      expect(video.style.getPropertyValue('width'), '站点自己写的样式不能被抹掉').toBe('640px');
    });
  });

  /**
   * B3：扩展的网页全屏与站点的原生全屏不能同时存在。
   *
   * 产品决策（已定）：扩展**保留自己的网页全屏**（干净的全屏 + 字幕跟随 +
   * 统一控制条），不退回站点原生全屏 —— 但两层不能叠着。
   */
  describe('站点原生全屏与网页全屏', () => {
    /** 伪造「文档正处于原生全屏」，并记录我们退原生全屏的次数。 */
    const stubNativeFullscreen = () => {
      const state = { element: null as Element | null };
      const exitFullscreen = vi.fn(() => Promise.resolve());
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => state.element,
      });
      Object.defineProperty(document, 'exitFullscreen', {
        configurable: true,
        value: exitFullscreen,
      });
      return { state, exitFullscreen };
    };

    afterEach(() => {
      delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
      delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
    });

    it('进网页全屏时退掉站点的原生全屏（两层不能同时存在）', () => {
      const { state, exitFullscreen } = stubNativeFullscreen();
      state.element = document.body;

      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);

      controller.enter(video);

      expect(exitFullscreen, '必须先退掉站点的原生全屏').toHaveBeenCalledTimes(1);
      expect(controller.isActive()).toBe(true);
      controller.exit();
    });

    it('退网页全屏时不会把用户踢出别的全屏', () => {
      const { state, exitFullscreen } = stubNativeFullscreen();
      state.element = document.body;

      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);

      controller.enter(video);
      controller.exit();

      // 进全屏时退过一次就**够了**：退出我们的全屏不许再去动原生全屏，
      // 否则用户会被从别的全屏里踢出来。
      expect(exitFullscreen).toHaveBeenCalledTimes(1);
    });

    it('我们自己退掉原生全屏时，不会顺手把自己也退掉', () => {
      const { state, exitFullscreen } = stubNativeFullscreen();
      state.element = document.body;

      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);

      controller.enter(video);
      expect(exitFullscreen).toHaveBeenCalledTimes(1);

      // 浏览器把我们自己的 exitFullscreen 兑现了 → fullscreenchange，
      // 而 fullscreenElement 变回 null。
      state.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(controller.isActive(), '不能把我们自己的全屏退掉').toBe(true);
      controller.exit();
    });

    it('站点在我们的全屏期间进原生全屏时，我们让位退出', () => {
      const { state, exitFullscreen } = stubNativeFullscreen();

      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = document.createElement('video');
      parent.appendChild(video);
      document.body.appendChild(parent);

      controller.enter(video);
      expect(controller.isActive()).toBe(true);

      // 站点点了它自己的全屏按钮 → 原生全屏的 top layer 会压在我们的 overlay 之上。
      state.element = document.body;
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(controller.isActive(), '两层不能叠着：让位退出').toBe(false);
      expect(exitFullscreen, '绝不能把站点的原生全屏退掉').not.toHaveBeenCalled();
      // 视频还给站点，站点的新播放器因此不是空壳。
      expect(parent.contains(video)).toBe(true);
    });
  });

  /**
   * 「会话结束」只有一个出口。
   *
   * ⚠️ 这一整组守的是同一个根因：**全屏会话的结束路径不止一条**
   * （控制条的退出钮、Esc、站点把视频拿回去、站点把背板摘了），
   * 而「我们接管着哪个视频」在注册表那边**也有一份**。
   *
   * 以前只有 Esc 那条路径会去通知注册表 —— 于是从**控制条的退出钮**退出之后，
   * 注册表仍然以为「我们接管着那个视频」：
   * - 点工具栏图标 → 注册表把那个**已经退出全屏**的视频交回去（错的视频）；
   * - 按空格 → 注册表认为那条视频是「我们自己接管的」，于是不再把它当成
   *   页面预览，空格被它吃掉，页面翻不动了。
   *
   * 修法不是「在第二个调用点补一行通知」—— 那是打补丁，下一条退出路径还会漏。
   * 修法是：会话结束的通知由控制器在**唯一**的收尾点发出，谁触发的都不重要。
   */
  describe('会话结束只有一个出口', () => {
    it('从控制条的退出钮退出 → 通知发出一次', () => {
      const onSessionEnd = vi.fn();
      const controller = new FullscreenController({ onSessionEnd });
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      controller.enter(video);
      expect(onSessionEnd, '还没结束时不该通知').not.toHaveBeenCalled();

      // 模拟控制条上的退出钮（它调的正是 controller.exit()）。
      controller.exit();

      expect(
        onSessionEnd,
        '会话结束了必须通知订阅方 —— 否则注册表仍以为「我们接管着那个视频」',
      ).toHaveBeenCalledTimes(1);
    });

    it('Esc 退出 → 通知发出一次（这条路径以前是唯一会通知的）', () => {
      const onSessionEnd = vi.fn();
      const controller = new FullscreenController({ onSessionEnd });
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      controller.enter(video);
      controller.exit();

      expect(onSessionEnd).toHaveBeenCalledTimes(1);
    });

    it('反复退出不会重复通知（通知必须恰好一次）', () => {
      const onSessionEnd = vi.fn();
      const controller = new FullscreenController({ onSessionEnd });
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      controller.enter(video);
      controller.exit();
      controller.exit();
      controller.exit();

      expect(
        onSessionEnd,
        '第二次 release() 会走「state.video 为空」的提前返回路径 —— 那条路径不能重复通知',
      ).toHaveBeenCalledTimes(1);
    });

    it('站点把视频拿回自己的容器 → 通知发出一次（会话确实结束了）', () => {
      vi.useFakeTimers();
      const onSessionEnd = vi.fn();
      const controller = new FullscreenController({ onSessionEnd });
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      controller.enter(video);
      vi.advanceTimersByTime(200);

      // 站点重渲染：把视频插回它的新容器（视频仍 connected，但不在我们手上了）。
      const newParent = document.createElement('div');
      document.body.appendChild(newParent);
      newParent.appendChild(video);

      // 健康检查（500ms 一次）发现「视频已经不在我们的 stage 里」。
      vi.advanceTimersByTime(600);

      expect(controller.isActive(), '会话必须结束').toBe(false);
      expect(
        onSessionEnd,
        '会话结束必须通知 —— 否则注册表仍把那个视频当成「我们接管着的」',
      ).toHaveBeenCalledTimes(1);
    });

    it('没有订阅者时也不该崩（通知是可选的）', () => {
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      controller.enter(video);
      expect(() => controller.exit()).not.toThrow();
    });
  });

  /**
   * 站点在**全屏期间**重渲染时，它写在视频上的样式必须活下来。
   *
   * ⚠️ 以前两条退出路径对同一件事给出**相反**的结果：
   * - 正常退出 → `video.setAttribute('style', originalStyle)`（整块写回），
   *   站点在这期间写下的样式（滤镜、圆角、Video.js 的 width/height/left/top）
   *   **全部被抹掉**；
   * - 「站点把视频拿回自己容器」那条 → 逐属性还原，站点的样式**留着**。
   *
   * 同一个 style 属性、同一件事、两条路径两个结果 —— 那不是两种策略，
   * 是同一个 bug 的两副面孔。修法：两条路径都走**逐属性还原**。
   */
  describe('退出全屏不能抹掉站点自己写的样式', () => {
    it('正常退出：站点在全屏期间写的样式必须留下', () => {
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      const controller = new FullscreenController();
      controller.enter(video);

      // 站点在全屏期间给视频写它自己的样式（Video.js / Plyr 的典型写法）。
      video.style.setProperty('filter', 'brightness(0.8)');
      video.style.setProperty('border-radius', '8px');
      video.style.setProperty('width', '640px');
      video.style.setProperty('left', '12px');

      controller.exit();

      expect(
        video.style.getPropertyValue('filter'),
        '站点自己写的滤镜不能被抹掉',
      ).toBe('brightness(0.8)');
      expect(
        video.style.getPropertyValue('border-radius'),
        '站点自己写的圆角不能被抹掉',
      ).toBe('8px');
      expect(
        video.style.getPropertyValue('width'),
        '站点自己写的宽度不能被抹掉',
      ).toBe('640px');
      expect(
        video.style.getPropertyValue('left'),
        '站点自己写的偏移不能被抹掉',
      ).toBe('12px');
    });

    it('正常退出：我们写的那组全屏属性必须撤掉', () => {
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      const controller = new FullscreenController();
      controller.enter(video);

      expect(video.style.getPropertyValue('position')).toBe('fixed');

      controller.exit();

      expect(
        video.style.getPropertyValue('position'),
        '我们写的全屏定位必须撤掉',
      ).not.toBe('fixed');
      expect(video.style.getPropertyValue('width')).not.toBe('100vw');
      expect(video.style.getPropertyValue('height')).not.toBe('100vh');
      expect(video.style.getPropertyValue('inset')).not.toBe('0px');
    });

    it('正常退出：进全屏前就有的样式必须原样留下', () => {
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      video.style.setProperty('border', '2px solid red');
      video.style.setProperty('width', '640px');
      document.body.appendChild(parent);

      const controller = new FullscreenController();
      controller.enter(video);
      controller.exit();

      expect(video.style.getPropertyValue('border')).toBe('2px solid red');
      expect(video.style.getPropertyValue('width')).toBe('640px');
    });
  });

  /**
   * 站点在**全屏期间**把视频拿回自己的容器 → 扩展必须收摊。
   *
   * ⚠️ 以前健康检查只在「视频不连着文档」时才动手，而「站点把视频插回
   * 它的新容器」时视频仍然 connected —— 于是扩展卡在一个**半脱离**状态：
   * 视频已经不在 stage 里，却仍被钉成视口大小（站点 320×180 的容器里
   * 浮着一个 1280×900 的 position:fixed 元素），不透明背板还盖着整页，
   * body 的滚动锁死没解。页面在用户按 Esc 之前完全不可用。
   */
  describe('站点把视频拿回自己的容器时必须收摊', () => {
    it('视频离开我们的 stage → 收摊：背板撤掉、滚动解锁', () => {
      vi.useFakeTimers();
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);
      document.body.style.overflow = 'auto';

      controller.enter(video);
      vi.advanceTimersByTime(200);
      expect(controller.isActive()).toBe(true);
      expect(document.getElementById('vsc-page-fullscreen-overlay')).not.toBeNull();

      // 站点重渲染（切清晰度 / 换播放列表 / 插广告）：把视频插回新容器。
      const newParent = document.createElement('div');
      document.body.appendChild(newParent);
      newParent.appendChild(video);

      vi.advanceTimersByTime(600);

      expect(
        controller.isActive(),
        '视频已经不在我们手上了，扩展不能还以为自己在全屏里',
      ).toBe(false);
      expect(
        document.getElementById('vsc-page-fullscreen-overlay'),
        '不透明背板必须撤掉 —— 否则整页被盖住',
      ).toBeNull();
      expect(
        document.body.style.overflow,
        'body 的滚动锁必须解除 —— 否则页面完全不可用',
      ).toBe('auto');
      expect(document.getElementById('vsc-controls')).toBeNull();
    });

    it('视频离开我们的 stage → 绝不能把它从站点的新容器里拔出来', () => {
      vi.useFakeTimers();
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      controller.enter(video);
      vi.advanceTimersByTime(200);

      const newParent = document.createElement('div');
      document.body.appendChild(newParent);
      newParent.appendChild(video);

      vi.advanceTimersByTime(600);

      expect(
        newParent.contains(video),
        '站点刚建好的播放器不能被我们掏空',
      ).toBe(true);
    });

    it('视频还在我们的 stage 里 → 绝不能收摊（否则全屏会被莫名其妙地退掉）', () => {
      vi.useFakeTimers();
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);

      controller.enter(video);
      vi.advanceTimersByTime(200);

      vi.advanceTimersByTime(600);

      expect(controller.isActive(), '视频还在我们手上了，全屏必须继续').toBe(true);
      expect(document.getElementById('vsc-page-fullscreen-overlay')).not.toBeNull();
    });

    /**
     * ⚠️ 同一个症状还有**第二扇门**：站点在进全屏后**那 180ms 的探测窗口之内**
     * 就把视频拿回去。
     *
     * 以前这条被并进 `lostLayout`，走的是 fallbackToCssCover()：
     *   - 视频被搬回**原位置**（把站点刚建好的播放器掏空）；
     *   - 降级成 fixed 铺满视口，body 照样锁死；
     *   - 而 css-cover 模式里**没有任何机制**会发现「站点已经把视频拿回去了」
     *     （健康检查的判据只认 reparent 模式）——
     *     于是页面就一直卡到用户按 Esc。
     *
     * 所以「站点把视频拿回去了」必须是**会话结束**，而不是「换个模式继续」。
     */
    it('站点在 180ms 探测窗口内就把视频拿回去 → 收摊，而不是降级成 css-cover', () => {
      vi.useFakeTimers();
      const controller = new FullscreenController();
      const parent = document.createElement('div');
      const video = createFullscreenableVideo(parent);
      document.body.appendChild(parent);
      document.body.style.overflow = 'auto';

      controller.enter(video);
      expect(controller.isActive()).toBe(true);

      // 站点在 180ms 窗口内重渲染：把视频插回它的新容器。
      const newParent = document.createElement('div');
      document.body.appendChild(newParent);
      newParent.appendChild(video);

      vi.advanceTimersByTime(200);

      expect(
        controller.isActive(),
        '站点把视频拿回去了 = 会话结束，不能降级成 css-cover 继续赖着',
      ).toBe(false);
      expect(
        video.classList.contains('vsc-page-fullscreen-video--css-cover'),
        '绝不能降级成 css-cover —— 那一档永远等不到收摊，页面会一直锁死',
      ).toBe(false);
      expect(
        document.getElementById('vsc-page-fullscreen-overlay'),
        '不透明背板必须撤掉 —— 否则整页被盖住',
      ).toBeNull();
      expect(
        document.body.style.overflow,
        'body 的滚动锁必须解除 —— 否则页面完全不可用',
      ).toBe('auto');
      expect(
        newParent.contains(video),
        '视频必须留在站点的新容器里（不能被搬回原位置把站点播放器掏空）',
      ).toBe(true);
    });
  });

  /**
   * 字幕是**异步加载**的：进全屏那一刻它往往还不存在。
   *
   * ⚠️ 以前只在 enter() 里取一次浮层快照（collectLayersToAttach），
   * 于是后来出现的字幕永远留在站点的播放器容器里，被我们的不透明背板
   * 整个盖住 —— 用户看到的是「一按 f 字幕就没了」。
   */
  describe('进全屏之后才出现的字幕也要跟进来', () => {
    /** 造一个「字幕层」，几何与 createPlayerWithSubtitle 的那个一致。 */
    const createLateSubtitle = (player: HTMLElement) => {
      const subtitle = document.createElement('div');
      subtitle.id = 'late-caption';
      subtitle.textContent = '这是后来才出现的字幕';
      player.appendChild(subtitle);

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

      return subtitle;
    };

    it('进全屏之后出现的字幕被搬进 stage', async () => {
      vi.useFakeTimers();
      const player = document.createElement('div');
      const video = createFullscreenableVideo(player);
      document.body.appendChild(player);

      const controller = new FullscreenController();
      controller.enter(video);
      await vi.advanceTimersByTimeAsync(200);

      // 前置条件：进全屏那一刻还没有字幕。
      expect(stage()?.querySelector('#late-caption')).toBeNull();

      // 字幕插件这时才把字幕层放进来。
      const subtitle = createLateSubtitle(player);

      // ⚠️ 必须 await：MutationObserver 的回调是**微任务**，
      // 而重扫还有 50ms 的合并窗口 —— 同步的 advanceTimersByTime
      // 不会让微任务跑起来，断言会在观察器还没醒的时候执行。
      await vi.advanceTimersByTimeAsync(200);

      expect(
        stage()?.contains(subtitle),
        '后来出现的字幕必须跟进全屏 —— 留在原地会被不透明背板整个盖住',
      ).toBe(true);
      expect(
        Number(subtitle.style.getPropertyValue('z-index')),
        '搬进来的字幕必须比视频高，否则一个像素都看不见',
      ).toBeGreaterThan(Number(video.style.zIndex));
    });

    it('退出时后来出现的字幕回到它原来的父节点', async () => {
      vi.useFakeTimers();
      const player = document.createElement('div');
      const video = createFullscreenableVideo(player);
      document.body.appendChild(player);

      const controller = new FullscreenController();
      controller.enter(video);
      await vi.advanceTimersByTimeAsync(200);

      const subtitle = createLateSubtitle(player);
      await vi.advanceTimersByTimeAsync(200);
      expect(stage()?.contains(subtitle)).toBe(true);

      controller.exit();

      expect(
        subtitle.parentElement,
        '字幕是站点自己的节点，退出时必须回到站点播放器里（不能留在马上要删掉的 overlay 里）',
      ).toBe(player);
    });

    it('站点把播放器容器整个换掉之后不再重扫（那个容器里的东西已经不是字幕了）', () => {
      vi.useFakeTimers();
      const player = document.createElement('div');
      const video = createFullscreenableVideo(player);
      document.body.appendChild(player);

      const controller = new FullscreenController();
      controller.enter(video);
      vi.advanceTimersByTime(200);

      // 站点重渲染：播放器容器被整个丢掉。
      player.remove();

      expect(() => vi.advanceTimersByTime(600)).not.toThrow();
    });
  });
});
