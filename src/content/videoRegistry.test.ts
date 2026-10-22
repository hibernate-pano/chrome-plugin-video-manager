import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** 把一个「正在播」的视频改回暂停（模拟用户按了空格）。 */
const mockPaused = (element: HTMLElement) => {
  Object.defineProperty(element, 'paused', { value: true, configurable: true });
};

/**
 * 建一个注册表，并把「事件可信」判据放宽为恒真。
 *
 * 为什么需要：注册表现在**拒绝合成事件**（页面能伪造 pointerdown/play，
 * 把预览视频伪装成「用户亲手选过的」—— 那正是本轮要修的漏洞）。
 * 但 jsdom 造不出可信事件：`isTrusted` 是实例上的 non-configurable 属性，
 * `Object.defineProperty` 会抛 TypeError，原型上也没有 getter 可覆盖。
 *
 * 所以这条缝是**测试专用**的：生产代码默认读真实的 `event.isTrusted`。
 * 「合成事件被拒绝」这一支另有专门的用例覆盖（用默认判据的注册表）。
 */
const createRegistry = (options: { trusted?: boolean } = {}) =>
  new VideoRegistry(
    options.trusted === false
      ? { isTrustedEvent: () => false }
      : { isTrustedEvent: () => true },
  );

const appendVideo = (id: string, className = '') => {
  const video = document.createElement('video');
  video.id = id;
  if (className) {
    video.className = className;
  }
  document.body.append(video);
  return video;
};

/**
 * 这一份运行时看得见的**全部**候选视频。
 *
 * ⚠️ getAllVideos 是私有的，但「顶层看得见哪些视频」正是 6.1.0 那条契约的
 * 核心：只看 getCurrentVideo() 分不清「另一个视频也在候选集里」与
 * 「另一个视频根本不在这个 frame 的地盘里」—— 而这正是要守的分界。
 */
const candidatesOf = (registry: VideoRegistry): HTMLVideoElement[] =>
  (registry as unknown as { getAllVideos: () => HTMLVideoElement[] }).getAllVideos();

describe('VideoRegistry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
  });

  it('prefers the video the user just interacted with', () => {
    const registry = createRegistry();
    registry.start();

    const first = document.createElement('video');
    const second = document.createElement('video');
    first.id = 'first';
    second.id = 'second';
    document.body.append(first, second);
    mockRect(first, 600, 400, 0, 0);
    mockRect(second, 300, 200, 0, 0);

    // 用户点了第二个视频 —— 这是**用户的行为**，必须被记住。
    second.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(registry.getCurrentVideo()?.id).toBe('second');

    registry.stop();
  });

  it('a bare play event does not count as the user picking that video', () => {
    // ⚠️ 这是本轮修掉的一个真实缺陷。
    //
    // 曾经只要收到 play 事件就把它记成「用户选过这个视频」——
    // 于是站点一播它的预览视频，那个预览就抢走了 +10000 的最高权重。
    // 实测（真实 Chromium）：1600×900 暂停的主播放器 + 320×180 正在播的预览，
    // 按 `=` 改的是主视频（对），点工具栏图标进全屏进的却是那个小预览（错）。
    // 用户看到的现象是「图标和快捷键表现不一致」。
    //
    // 修法：play 事件只有**紧跟在一次指向它的真实手势之后**才算数。
    // 孤零零的 play = 站点自己开的，不是用户选的。
    const registry = createRegistry();
    registry.start();

    const main = document.createElement('video');
    main.id = 'main';
    const preview = document.createElement('video');
    preview.id = 'preview';
    document.body.append(main, preview);
    mockRect(main, 1600, 900, 0, 0);
    mockRect(preview, 320, 180, 0, 0);

    // 站点让预览视频播起来 —— 没有任何用户手势做背景。
    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(
      registry.getCurrentVideo()?.id,
      '自动播放不该抢走「用户选过」的权重',
    ).toBe('main');

    registry.stop();
  });

  it('the toolbar icon and the keyboard shortcut target the SAME video', () => {
    // ⚠️ 本轮修掉的一个真实缺陷（也是本轮最要紧的一个）。
    //
    // 两条契约（「图标=显式操作」「快捷键=隐式操作」）**必须**共用同一套
    // 候选过滤与打分。此前它们各写一份打分代码，只差一个 filter ——
    // 于是两份逻辑开始漂移：图标路径完全没有「装饰性自动播放视频」的概念。
    //
    // 实测（真实 Chromium）：1600×900 暂停的主播放器 + 320×180 正在播的预览，
    // 按 `=` 改的是主视频，点工具栏图标进全屏进的却是那个小预览。
    // 用户看到的现象是「图标和快捷键表现不一致」—— 比「两者都错」更让人困惑。
    //
    // 这条用例守的就是「两条路径指向同一个视频」。
    //
    // ⚠️ 场景设计要点：预览视频必须**比主视频得分更高**（靠「正在播」那 600 分
    // 加上更大的面积），否则即使图标路径完全不筛装饰性视频，它也会选主视频 ——
    // 那这条用例就成了恒真的假守卫（实测：换成小预览时，删掉共用逻辑照样全绿）。
    const registry = createRegistry();
    registry.start();

    const main = document.createElement('video');
    main.id = 'main';
    const preview = document.createElement('video');
    preview.id = 'preview';
    // 装饰性自动播放视频的形状：autoplay + 没有原生 controls。
    preview.setAttribute('autoplay', '');
    document.body.append(main, preview);
    mockRect(main, 1600, 900, 0, 0);
    mockRect(preview, 1920, 1080, 0, 0);
    mockPlaying(preview);

    // 站点让预览视频播起来（自动播放）。
    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(
      registry.getWatchedVideo()?.id,
      '快捷键路径应该选主视频（装饰性预览被排除）',
    ).toBe('main');

    expect(
      registry.getCurrentVideo()?.id,
      '工具栏图标路径必须与快捷键路径指向同一个视频',
    ).toBe('main');

    registry.stop();
  });

  it('a page-initiated focus() does not hand the video the top priority', () => {
    // ⚠️ 页面伪造的第三种形态。
    //
    // 页面脚本调 `video.focus()` 会让浏览器派发一个 focusin，
    // 而它的 **isTrusted 是 true**（这个事件是**浏览器**生成的）——
    // isTrusted 那道防线挡不住它。
    //
    // 实测（真实 Chromium）：文章页里那个小小的预览视频，页面加载后 focus 一下
    // 自己，lastInteractedVideo 就被抢走了 —— 而它带 +10000 分（全场最高），
    // 于是图标路径接管了那个预览视频。
    //
    // 修法：focusin 必须有「用户刚动过手」做背景才算数
    // （真实用户按 Tab 会有 keydown 在前；页面自己 focus() 什么都没有）。
    const registry = createRegistry();
    registry.start();

    const main = document.createElement('video');
    main.id = 'main';
    const other = document.createElement('video');
    other.id = 'other';
    document.body.append(main, other);
    mockRect(main, 1600, 900, 0, 0);
    mockRect(other, 640, 360, 0, 0);

    // 页面自己 focus 了另一个视频 —— 没有任何用户手势做背景。
    other.dispatchEvent(new Event('focusin', { bubbles: true }));

    expect(
      registry.getCurrentVideo()?.id,
      '页面自己 focus 出来的视频不该抢走最高优先级',
    ).toBe('main');

    registry.stop();
  });

  it('a focus() that follows a real Tab keypress IS trusted', () => {
    // 上面那条的**反向守卫**：不能把 focusin 一律不信。
    //
    // 真实用户按 Tab 把焦点移进视频时，**只有** focusin 能告诉我们
    // 「用户此刻在操作哪个视频」。把它一并不信，键盘用户就完全失去了
    // 「我正在操作哪个视频」这条线索。
    const registry = createRegistry();
    registry.start();

    const main = document.createElement('video');
    main.id = 'main';
    const other = document.createElement('video');
    other.id = 'other';
    document.body.append(main, other);
    mockRect(main, 1600, 900, 0, 0);
    mockRect(other, 640, 360, 0, 0);

    // 用户按了 Tab（真实手势），随后焦点移进了 other。
    document.dispatchEvent(new Event('keydown', { bubbles: true }));
    other.dispatchEvent(new Event('focusin', { bubbles: true }));

    expect(
      registry.getCurrentVideo()?.id,
      '用户按 Tab 之后的 focus 应该被采信',
    ).toBe('other');

    registry.stop();
  });

  it('the icon path falls back to a target when the keyboard path has none', () => {
    // 两条契约的**合法差异**。
    //
    // 快捷键是**隐式**操作：没有明确目标就必须穿透，否则用户按空格翻页
    // 结果视频跳了 —— 那是唯一会让人直接卸载的问题。
    //
    // 工具栏图标是**显式**操作：用户点的是扩展唯一看得见的入口，
    // 点了却毫无反应，用户能得出的唯一结论就是「扩展坏了」。
    // 所以这里**允许**回退到「最大的可见候选」。
    //
    // ⚠️ 两种操作的「危害模型」本来就不同，所以「装饰性预览要不要排除」
    // 在两条路径上可以有不同答案：
    // - 快捷键路径：排除装饰性预览 —— 因为它会**偷走按键**（空格翻页失效）。
    // - 图标路径：不必排除 —— 用户明确点了扩展图标，不存在抢按键的问题。
    //
    // 这条守住的就是这个**有意的**差异，防止有人「顺手统一」掉它。
    const registry = createRegistry();
    registry.start();

    // 页面上只有一个装饰性自动播放预览视频。
    const preview = document.createElement('video');
    preview.id = 'preview';
    preview.setAttribute('autoplay', '');
    document.body.append(preview);
    mockRect(preview, 1920, 1080, 0, 0);
    mockPlaying(preview);

    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(
      registry.getWatchedVideo(),
      '快捷键路径必须排除装饰性预览（否则会偷走按键）',
    ).toBeNull();

    expect(
      registry.getCurrentVideo()?.id,
      '图标路径是显式操作，必须给用户一个目标',
    ).toBe('preview');

    registry.stop();
  });

  it('prefers the playing visible largest video when there is no recent interaction', () => {
    const registry = createRegistry();
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
    const registry = createRegistry();
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
    const registry = createRegistry();
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
    const registry = createRegistry();
    const video = appendVideo('only');
    mockRect(video, 640, 360, 0, 0);

    expect(registry.getCurrentVideo()).toBe(video);

    video.remove();

    expect(registry.getCurrentVideo()).toBeNull();
  });

  it('recomputes once the page adds a video', async () => {
    const registry = createRegistry();
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
    const registry = createRegistry();

    const main = appendVideo('main', 'html5-main-video');
    const teaser = appendVideo('teaser');
    mockRect(main, 240, 120, 0, 0);
    mockRect(teaser, 800, 450, 0, 0);

    // 改动前 preferred 只加 50，被 可见300+在视口200+面积360 盖过。
    expect(registry.getCurrentVideo()).toBe(main);
  });

  it('does not reach into a same-origin iframe (each frame manages its own document)', () => {
    // 6.1.0 之前注册表会**下钻同源 iframe** 去找站点主播放器。那在内容脚本
    // 注入到所有 frame（all_frames）之后从「必要」变成了「有害」——
    //
    // 顶层 registry 下钻到 iframe 里的视频，而 **iframe 里另有一份 registry**
    // （同一个 <video> 节点，两份独立的运行时状态）。于是：
    // 1. 同一个视频被两个 runtime 各管一半：顶层把它的倍速改了、iframe 里那份
    //    又改一次 —— 角标显示的倍率与视频实际倍率互相矛盾；
    // 2. 顶层能改它却报不了倍速（reportSpeed 只让焦点所在的那个 frame 说话），
    //    工具栏标题因此停在别的 frame 的读数上（在说谎）。
    //
    // 修法：**每个 frame 只管自己 document 里的视频**。
    // 跨 frame 的意图（点工具栏图标）由 background 路由到「用户此刻聚焦的
    // 那个 frame」—— 那一份 registry 里就有那个视频。
    adapterHost.hostname = 'www.youtube.com';
    const registry = createRegistry();

    const top = appendVideo('top');
    mockRect(top, 640, 360, 0, 0);

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

    // 顶层拿到的是**顶层那个**视频。
    expect(registry.getCurrentVideo()).toBe(top);
    // iframe 里那个视频不在顶层这一份的候选集里 —— 它归 iframe 自己那份管。
    expect(candidatesOf(registry)).toContain(top);
    expect(candidatesOf(registry)).not.toContain(frameVideo);
  });

  it('顶层自己没有视频时，也不会把 iframe 里的视频捡回来', () => {
    // 上一条的推论：顶层看不见 iframe 里的视频，于是顶层点工具栏图标时
    // 得到的答案是「这个页面里没有视频」—— 而不是「接管不了」。
    // 那个视频由 iframe 自己那份运行时接管（它在**自己的** document 里）。
    const registry = createRegistry();

    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      throw new Error('same-origin iframe document is required for this case');
    }
    const frameVideo = frameDocument.createElement('video');
    frameVideo.id = 'framed-main';
    frameDocument.body.append(frameVideo);
    mockRect(frameVideo, 240, 120, 0, 0);

    expect(registry.getCurrentVideo()).toBeNull();
    expect(candidatesOf(registry)).toEqual([]);
  });

  it('keeps the preferred video ahead of a bigger paused one', () => {
    adapterHost.hostname = 'www.youtube.com';
    const registry = createRegistry();

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
    const registry = createRegistry();

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

  it('prefers the video the user just interacted with over the preferred and the playing one', () => {
    adapterHost.hostname = 'www.youtube.com';
    const registry = createRegistry();
    registry.start();

    const main = appendVideo('main', 'html5-main-video');
    mockPlaying(main);
    mockRect(main, 1280, 720, 0, 0);

    const teaser = appendVideo('teaser');
    teaser.style.display = 'none';
    mockRect(teaser, 160, 90, 5000, 0);

    // 用户点了它 —— 这才是「用户选过」。单纯的 play 事件不算（见上面那条）。
    teaser.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(registry.getCurrentVideo()).toBe(teaser);

    registry.stop();
  });

  it('returns null when the only video on the page is invisible', () => {
    const registry = createRegistry();
    const hidden = appendVideo('hidden');
    hidden.style.display = 'none';
    mockRect(hidden, 160, 90, 0, 0);

    // 改动前单候选不可见视频会以最高分胜出，速度被改在看不见的视频上。
    expect(registry.getCurrentVideo()).toBeNull();
  });

  it('still returns an invisible video the user explicitly interacted with', () => {
    // 防回归：过滤不可见候选时必须豁免「用户亲手选过」的那条 ——
    // 用户明确点过它，即使站点把它藏起来也仍是他的选择。
    const registry = createRegistry();
    registry.start();

    const hidden = appendVideo('hidden');
    hidden.style.display = 'none';
    mockRect(hidden, 160, 90, 5000, 0);

    hidden.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(registry.getCurrentVideo()).toBe(hidden);

    registry.stop();
  });

  it('does NOT return a video the site hid after the user touched it long ago', async () => {
    // ⚠️ 本轮修掉的第二个真实缺陷。
    //
    // 豁免可见性过滤时用的曾是 lastInteractedVideo —— 那个字段**永不过期**。
    // 于是：用户点过视频 → 一段时间后站点把它 display:none →
    // 工具栏图标仍然接管它。
    //
    // 实测（真实 Chromium）：overlay 起来了，里面却是空的 ——
    // 视频甚至没被搬进 stage（因为它 display:none，搬不动）。
    //
    // 修法：豁免改用 lastChoiceVideo（带 10 秒窗口）。
    const registry = createRegistry();
    registry.start();

    const hidden = appendVideo('hidden');
    mockRect(hidden, 160, 90, 5000, 0);

    const base = Date.now();
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(base);
      // 用户点了它。
      hidden.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      // 站点随后把它藏起来。
      hidden.style.display = 'none';

      // 10 秒窗口内：用户刚选过，豁免仍然成立。
      now.mockReturnValue(base + 5_000);
      expect(
        registry.getCurrentVideo()?.id,
        '用户刚选过、只是刚被藏起来 —— 仍应尊重用户的选择',
      ).toBe('hidden');

      // 10 秒之后：那次选择已经过期，豁免不再成立。
      //
      // ⚠️ 必须跨过一帧：getCurrentVideo() 有「同一帧内复用」的快照，
      // 而帧号由 rAF 推进。同一帧内它会直接返回上一次的结果 ——
      // 那样这条用例就测不到「窗口过期」这件事了。
      now.mockReturnValue(base + 11_000);
      await new Promise((resolve) => setTimeout(resolve, 40));

      expect(
        registry.getCurrentVideo(),
        '被站点藏起来的视频不该被接管（overlay 会是空的）',
      ).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }

    registry.stop();
  });
});

/**
 * 「用户正在看的视频」判定。
 *
 * 这组用例守的是 6.0.9 最重要的一条行为变更：以前快捷键只看「页面上有没有
 * <video>」，于是用户在读长文（页面里嵌了个自动播放的静音预览视频）时，
 * 按空格翻页结果视频跳了。这是唯一会让人直接卸载的问题。
 *
 * 判定规则（见 videoRegistry.ts 的 isWatchedVideo）：
 *   可见 + 在视口内 + 不是「装饰性自动播放视频」+ 够大
 *   —— 或：10 秒内用户亲手选过它 / 站点点名的主播放器
 *
 * ⚠️ jsdom 没有布局引擎：`getBoundingClientRect()` 恒为 0，
 * `documentElement.clientWidth` 恒为 0。生产代码用后者判断「这个文档有没有
 * 布局几何」（见 hasReliableLayout 的注释：不能用元素的 computed display，
 * 那会被我们自己注入的 runtimeStyles 翻转）。
 * 所以这些用例必须**模拟一个浏览器**：把根元素的 clientWidth/clientHeight
 * 设成真实视口大小，再 mock 掉 rect。否则尺寸相关的断言会走早退分支，
 * 变成**恒真**的假守卫 —— 测了等于没测。
 */
describe('VideoRegistry：用户正在看的视频', () => {
  const VIEWPORT_WIDTH = 1024;
  const VIEWPORT_HEIGHT = 768;

  /**
   * 模拟一个「有布局引擎、视口是 W×H」的文档。
   *
   * 生产代码用**两个**信号判断布局与视口：
   * - `documentElement.clientWidth` —— 判「这个文档有没有布局几何」；
   * - `view.innerWidth/innerHeight` —— 算面积占比、判是否在视口内。
   *
   * ⚠️ 两个都得改。jsdom 的 `window.innerWidth` 默认 1024×768，
   * 而 `documentElement.clientWidth` 恒为 0。只改一个的话，
   * 生产代码会读到**另一套**视口尺寸 —— 实测：我只把 clientWidth 改成 2560
   * 而 innerWidth 还是 1024 时，640×360 的占比按 1024×768 算成了 29%，
   * 比例线直接放行，绝对尺寸线根本没被触到，于是那条用例变成了**恒真的假守卫**
   * （把绝对尺寸线整个删掉，23 条用例照样全绿）。
   */
  const simulateViewport = (width: number, height: number) => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: height,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    simulateViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  });

  afterEach(() => {
    // 还原：这些是 own property，不会随 body.innerHTML 一起消失。
    delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  });

  /** 让这个视频看起来有尺寸（配合 mockRect 一起用）。 */
  const withLayout = (video: HTMLVideoElement) => {
    video.style.display = 'block';
    return video;
  };

  it('够大、可见、在视口里的视频就是「正在看的」', () => {
    const registry = createRegistry();
    const video = withLayout(appendVideo('main'));
    mockPlaying(video);
    mockRect(video, 800, 450, 0, 0);

    expect(registry.getWatchedVideo()?.id).toBe('main');

    registry.stop();
  });

  it('太小、又在播的视频不算「正在看的」', () => {
    // 文章页里嵌的小预览：240×135 在 1024×768 的视口里占 4%，
    // 既不够绝对尺寸、也不够面积比例。用户读的是字，不是那个小视频。
    const registry = createRegistry();
    const preview = withLayout(appendVideo('preview'));
    mockPlaying(preview);
    mockRect(preview, 240, 135, 0, 0);

    expect(registry.getWatchedVideo(), '小块预览视频不该被接管').toBeNull();

    registry.stop();
  });

  it('装饰性自动播放视频（autoplay + 静音 + 无 controls）不算「正在看的」', () => {
    // 这就是「文章里嵌的静音预览」的形状：浏览器只允许静音自动播，
    // 所以它一定静音；站点没给它 controls，说明没打算让用户操作它。
    //
    // ⚠️ 尺寸为什么是 480×270（占 1024×768 视口的 14%）：
    // 「装饰」这条判据现在还要求**它不是页面主角**（占视口 < 60%）。
    // 曾经这条用例把预览做成 1920×1080（比整个视口还大），断言
    // 「哪怕铺满视口也不该被接管」—— 那条断言本身是错的：
    // 站点的**主播放器**常常正是「autoplay + 无 controls + 占满大半个视口」
    // 的形状（实测 iQiyi 首页：1353×671 / 1440×900 = 70.1%），
    // 按那条断言，iQiyi 上整个扩展等于没装（按 = / Space / f 全部无反应）。
    // 「占满大半个视口 = 页面主角」这条豁免另有用例守着。
    const registry = createRegistry();
    const preview = withLayout(appendVideo('preview'));
    preview.setAttribute('autoplay', '');
    preview.setAttribute('muted', '');
    mockPlaying(preview);
    mockRect(preview, 480, 270, 0, 0);

    expect(registry.getWatchedVideo(), '装饰性自动播放视频不该被接管').toBeNull();

    registry.stop();
  });

  it('页面伪造的 pointerdown 不能把视频伪装成「用户选过」', () => {
    // 安全边界：扩展在 document_start 抢注捕获阶段监听器，页面脚本能
    // dispatchEvent(new PointerEvent('pointerdown')) 打在自己的 video 上。
    // 若不挡这一条，文章页里那个装饰性自动播放视频就成了「用户亲手选过的」，
    // 快捷键照旧被接管 —— 正是本轮要修的那个问题。
    const registry = createRegistry({ trusted: false });
    registry.start();

    const preview = withLayout(appendVideo('preview'));
    preview.setAttribute('autoplay', '');
    mockPlaying(preview);
    mockRect(preview, 240, 135, 0, 0);

    preview.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(registry.getWatchedVideo(), '伪造的 pointerdown 不该让预览视频被接管').toBeNull();

    registry.stop();
  });

  it('用户按了任意键之后，预览视频自动播也不该被当成「用户选过」', () => {
    // 「最近一次手势」当中介有个洞：页面只要在用户按任意键后的 2 秒内
    // 让自己的预览视频播起来，就能把它伪装成「用户按了播放」。
    // 修法是让手势**指向**具体的视频 —— 用户按空格时看着的那条。
    const registry = createRegistry();
    registry.start();

    const preview = withLayout(appendVideo('preview'));
    preview.setAttribute('autoplay', '');
    mockPlaying(preview);
    mockRect(preview, 240, 135, 0, 0);

    // 用户在页面空白处按了个键（没有落在任何 video 上）。
    document.dispatchEvent(new Event('keydown', { bubbles: true }));

    // 站点此时让预览视频开始播。
    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(registry.getWatchedVideo(), '无关按键后的自动播不该算「用户选过」').toBeNull();

    registry.stop();
  });

  it('用户点了视频 A 之后，预览视频 B 自动播不该继承 A 的「新鲜度」', () => {
    // 时间戳与视频必须绑定。否则：用户点了 A（lastChoiceAt = 现在），
    // 随后站点让预览 B 自动播 → B 继承了 A 的新鲜度，被判成「用户选过」。
    const registry = createRegistry();
    registry.start();

    const chosen = withLayout(appendVideo('chosen'));
    mockRect(chosen, 320, 180, 0, 0);
    chosen.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    const preview = withLayout(appendVideo('preview'));
    preview.setAttribute('autoplay', '');
    mockPlaying(preview);
    mockRect(preview, 240, 135, 0, 0);
    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(
      registry.getWatchedVideo()?.id,
      '预览视频不该继承另一个视频的「用户选过」',
    ).not.toBe('preview');

    registry.stop();
  });

  it('竖屏短视频（9:16）在宽屏上也算「正在看的」', () => {
    // 竖屏视频的宽天然小（405px），比例线在 2560×1440 上只有 7.7% ——
    // 只看比例的话，用户看竖屏视频时快捷键完全失灵。
    // 现在靠的是**绝对线**：405 ≥ 400、720 ≥ 225 → 够格。
    //
    // ⚠️ 曾经还有一条独立的「竖屏短边 ≥ 400」规则专门管这件事；
    // 绝对线降到 400×225 之后它变成了恒被覆盖的重复规则，已删除。
    // 这条用例现在守的是「竖屏视频在宽屏上照样被接管」这个**结果**。
    const registry = createRegistry();
    simulateViewport(2560, 1440);

    const vertical = withLayout(appendVideo('vertical'));
    mockRect(vertical, 405, 720, 0, 0);

    // 前置条件：比例线单独不够（绝对线才是它过线的原因）。
    expect(
      (405 * 720) / (2560 * 1440),
      '前置条件：405×720 在 2560×1440 里占 7.7%，低于相对线 10%',
    ).toBeLessThan(0.1);

    expect(registry.getWatchedVideo()?.id).toBe('vertical');

    registry.stop();
  });

  it('有 controls 的自动播放视频仍算「正在看的」', () => {
    // 有 controls = 站点把它当成一个正经播放器给人用。
    // 这类视频在 YouTube 之类的地方很常见（主播放器就是静音自动播的）。
    const registry = createRegistry();
    const player = withLayout(appendVideo('player'));
    player.setAttribute('autoplay', '');
    player.setAttribute('muted', '');
    player.setAttribute('controls', '');
    mockPlaying(player);
    mockRect(player, 800, 450, 0, 0);

    expect(registry.getWatchedVideo()?.id).toBe('player');

    registry.stop();
  });

  it('暂停着的够大视频也算「正在看的」', () => {
    // 「先调速再播放」是最常见的用法之一：打开网课页面、视频还暂停着，
    // 用户想先设成 1.5x 再按播放。若要求在播，这条用法直接失效。
    const registry = createRegistry();
    const paused = withLayout(appendVideo('paused'));
    mockRect(paused, 800, 450, 0, 0);

    expect(registry.getWatchedVideo()?.id).toBe('paused');

    registry.stop();
  });

  it('用户 10 秒内点过的视频，即使暂停、面积小也算「正在看的」', () => {
    // 用户点了一个暂停的小视频然后想按 f 进全屏 —— 那是他的明确目标。
    const registry = createRegistry();
    registry.start();

    const small = withLayout(appendVideo('small'));
    mockRect(small, 320, 180, 0, 0);

    small.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(registry.getWatchedVideo()?.id).toBe('small');

    registry.stop();
  });

  it('自动播放的 play 事件不算「用户选过」', () => {
    // 站点自己播的预览视频也会触发 play。那不是用户的选择 ——
    // 若把它算成"用户选过"，那块小预览就又变成受控对象了。
    const registry = createRegistry();
    registry.start();

    const preview = withLayout(appendVideo('preview'));
    mockPlaying(preview);
    mockRect(preview, 240, 135, 0, 0);

    // 没有手势，直接来一个 play（自动播放）。
    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(registry.getWatchedVideo(), '自动播放不该让预览视频变成受控对象').toBeNull();

    registry.stop();
  });

  it('页面上一个视频都没有时返回 null', () => {
    const registry = createRegistry();

    expect(registry.getWatchedVideo()).toBeNull();

    registry.stop();
  });

  it('不在视口里的视频不算「正在看的」', () => {
    const registry = createRegistry();
    const offscreen = withLayout(appendVideo('offscreen'));
    mockPlaying(offscreen);
    // 整个视频在视口下方。
    mockRect(offscreen, 800, 450, 5000, 0);

    expect(registry.getWatchedVideo(), '视口外的视频不该被接管').toBeNull();

    registry.stop();
  });

  it('站点点名的主播放器即使静音自动播、且不够大，也算「正在看的」', () => {
    // YouTube 的主播放器恰恰就是静音自动播的（浏览器只允许静音自动播）。
    // 若没有「站点点名」这一档，扩展在 YouTube 上会完全失灵 ——
    // 而那正是这个扩展最该工作的场景。
    //
    // 这条主播放器在本站（localhost）没有对应的选择器，所以这里切到
    // YouTube 的 hostname 来验证站点适配器那条路。
    adapterHost.hostname = 'www.youtube.com';

    const registry = createRegistry();
    const main = withLayout(appendVideo('main', 'html5-main-video'));
    main.setAttribute('autoplay', '');
    main.setAttribute('muted', '');
    // 故意不给 controls —— 于是它同时是「装饰性自动播放视频」的形状，
    // 而且尺寸故意做小：这样**只有**「站点点名的主播放器」这一档能放行它。
    // 若这条视频又大又有 controls，删掉那一档用例照样会通过（实测过），
    // 那就成了一条恒真的假守卫。
    mockPlaying(main);
    mockRect(main, 240, 135, 0, 0);

    expect(registry.getWatchedVideo()?.id).toBe('main');

    registry.stop();
  });

  it('CSS 隐藏（display:none）的视频不算「正在看的」', () => {
    const registry = createRegistry();
    const hidden = withLayout(appendVideo('hidden'));
    hidden.style.setProperty('display', 'none', 'important');
    mockPlaying(hidden);
    mockRect(hidden, 800, 450, 0, 0);

    expect(registry.getWatchedVideo(), '隐藏的视频不该被接管').toBeNull();

    registry.stop();
  });

  it('没有布局几何的文档：不能因此把候选全判成「没在看」', () => {
    // 无布局引擎的环境（jsdom）里 rect 恒为 0、clientWidth 恒为 0。
    // 若没有这条早退，尺寸与视口判定会把所有候选误杀 ——
    // 极端情况下，**页面上的视频一个都接管不了**。
    //
    // 这条把 clientWidth 归零来复现那个环境。
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 0,
      configurable: true,
    });

    const registry = createRegistry();
    const video = appendVideo('only');
    mockRect(video, 0, 0, 0, 0);

    expect(registry.getWatchedVideo()?.id).toBe('only');

    registry.stop();
  });

  it('大屏上占比变小但尺寸够大的视频仍算「正在看的」', () => {
    // 纯面积阈值最致命的毛病：同一段 640×360 的内容视频，
    // 在 1280×720 上占 25%，在 2560×1440 上只占 6.25%。
    // 若只按比例判，大屏用户反而用不了。
    //
    // ⚠️ 这条用例必须**真的**用大视口。若沿用上面 1024×768 的视口，
    // 640×360 占 29%，比例线已经放行，绝对尺寸线根本轮不到 ——
    // 那时把绝对尺寸线删掉，用例照样通过（实测：变异后 23 条全绿）。
    // 守卫必须能失败，否则它什么也没守。
    const registry = createRegistry();
    simulateViewport(2560, 1440);

    const video = withLayout(appendVideo('main'));
    mockRect(video, 640, 360, 0, 0);

    // 前置条件：比例线**确实**不够，绝对尺寸线**确实**够。
    const ratio = (640 * 360) / (2560 * 1440);
    expect(ratio, '前置条件：640×360 在 2560×1440 里只占 6.25%').toBeLessThan(0.1);
    expect(640 >= 480 && 360 >= 270, '前置条件：绝对尺寸够大').toBe(true);

    expect(registry.getWatchedVideo()?.id).toBe('main');

    registry.stop();
  });

  it('用户点开的小卡片视频：10 秒窗口过了也仍然算「正在看的」', () => {
    // ⚠️ 本轮修掉的第三个真实缺陷（短视频信息流场景）。
    //
    // 信息流里的卡片视频只有 320×180 —— 过不了绝对尺寸线（480×270），
    // 也过不了比例线（320×180 在 1280×720 里只占 6.25%）。
    // 用户点开它、它开始播，10 秒窗口一过，它就彻底掉出所有规则 ——
    // 于是「按 `=` 没反应」，而视频明明还在播、用户明明在看它。
    //
    // 实测（真实 Chromium）：点开后 11 秒按 `=`，速度纹丝不动。
    //
    // 修法：加一档「用户选过它 **且** 它还在播」，窗口放宽到 60 秒。
    // ⚠️ 关键在「用户选过」这个前提 —— 不能简化成「正在播就接管」，
    // 那等于把文章页里「站点用 JS 调 play() 播的静音预览」重新请回来。
    const registry = createRegistry();
    registry.start();

    const card = withLayout(appendVideo('card'));
    mockPlaying(card);
    mockRect(card, 320, 180, 0, 0);

    // 前置条件：尺寸线**确实**都不过 —— 否则这条用例是恒真的假守卫。
    expect(320 >= 480, '前置条件：绝对尺寸线应该不过').toBe(false);
    expect((320 * 180) / (VIEWPORT_WIDTH * VIEWPORT_HEIGHT)).toBeLessThan(0.1);

    // 时间要**往前**推，不能往回推（往回推会让「距上次选择」变成负数，
    // 窗口判定反而成立）。先钉住一个基准时刻，再一步步往前推。
    const base = Date.now();
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(base);
      // 用户点开它。
      card.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      // 10 秒窗口内：靠「用户选过」这一档就够。
      now.mockReturnValue(base + 9_000);
      expect(registry.getWatchedVideo()?.id).toBe('card');

      // 10 秒窗口刚过 —— 「用户选过」这一档失效，
      // 但「选过且还在播」这一档接手，视频仍然是受控对象。
      now.mockReturnValue(base + 11_000);
      expect(
        registry.getWatchedVideo()?.id,
        '用户选过且还在播的小卡片视频必须仍然是受控对象',
      ).toBe('card');

      // 60 秒窗口也过了 —— 它彻底掉出所有规则。
      now.mockReturnValue(base + 61_000);
      expect(
        registry.getWatchedVideo(),
        '60 秒之后不该再靠「用户选过」这一档',
      ).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }

    registry.stop();
  });

  it('用户显式点过、但已经暂停的小视频：60 秒内仍然算「正在看的」', () => {
    // 「被选过」的新鲜度**独立于播放状态**。
    //
    // 实测（课程页）：点侧边那个 320×180 的小窗 → `=` 命中小窗 ✓；
    // 11 秒后再按 `=` → 目标却跳回了大播放器 ✗。
    //
    // 根因：原来只有两档 —— 「10 秒内选过」与「选过且还在播（60 秒）」。
    // 被暂停的小窗**永远**不满足后者，于是 10 秒一过就彻底失灵。
    // 现在多了一档「用户显式选过它（60 秒内，暂停也算）」。
    const registry = createRegistry();
    registry.start();

    const paused = withLayout(appendVideo('paused'));
    mockRect(paused, 320, 180, 0, 0);

    const base = Date.now();
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(base);
      paused.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      now.mockReturnValue(base + 9_000);
      expect(registry.getWatchedVideo()?.id).toBe('paused');

      // 16 秒：10 秒那一档已经过期，但「显式选过（60 秒）」这一档接手。
      //
      // ⚠️ 为什么不是 11 秒：快捷键路径的缓存有 5 秒有效期，
      // +9 秒那次查询把结果缓存住了 —— 再往后 5 秒内的查询**直接返回缓存**，
      // 根本没重新走判定。于是「11 秒」这个断言是**恒真的假守卫**
      // （把 60 秒窗口改成 10 秒它照样绿）。
      // +16 秒已经过了缓存期，判定真的重跑一遍。
      // 真实浏览器里「11 秒」那个场景由 E2E 用例守。
      now.mockReturnValue(base + 16_000);
      expect(
        registry.getWatchedVideo()?.id,
        '用户显式点过、暂停着的小视频，十几秒后仍必须是被接管的目标',
      ).toBe('paused');

      // 60 秒窗口也过了 —— 它彻底掉出所有规则。
      now.mockReturnValue(base + 61_000);
      expect(
        registry.getWatchedVideo(),
        '60 秒之后不该再靠「用户选过」这一档',
      ).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }

    registry.stop();
  });

  it('只是「正在播」的小预览视频（用户没选过）仍然不算「正在看的」', () => {
    // 上面那条的**反向守卫**：确保新加的那一档没有放宽过头。
    //
    // 如果实现写成「正在播就接管」，那文章页里那种「站点用 JS 调 play()
    // 播的静音预览」会立刻回来 —— 本轮要修的问题原样返场。
    // 这里模拟那个形状：autoplay + 无 controls + 在播，但**没有用户手势**。
    const registry = createRegistry();

    const preview = withLayout(appendVideo('preview'));
    preview.setAttribute('autoplay', '');
    mockPlaying(preview);
    mockRect(preview, 320, 180, 0, 0);

    expect(
      registry.getWatchedVideo(),
      '用户没选过的自动播放小视频不该被接管',
    ).toBeNull();

    registry.stop();
  });

  it('被我们接管的全屏视频：即便 controls 被我们自己弄掉也不算「装饰视频」', () => {
    // ⚠️ 判据必须对「我们自己造成的变化」免疫。
    //
    // 进网页全屏时我们把 `video.controls = false`（用自制控制条取代原生控件），
    // 而这会**反射性地移除 `controls` 属性**。于是：
    //   进全屏前：`<video controls autoplay>` → 有 controls → 不是装饰视频 → 接管
    //   进全屏后：controls 属性没了        → 变成「装饰视频」 → **快捷键彻底失灵**
    //
    // 实测（真实浏览器）：进全屏后按 `=` 速度纹丝不动，退出全屏后又好了。
    //
    // 修法：让 VideoRegistry 自己知道哪些视频是它接管的（setFullscreenVideo），
    // 而不是去猜 DOM 位置（曾经用 `closest('#vsc-page-fullscreen-stage')`，
    // 那把 fullscreenController 的内部 id 抄了一份到另一个模块，
    // 而且 css-cover 回退模式下视频根本不在 stage 里，那条路径上豁免不生效）。
    const registry = createRegistry();

    const player = withLayout(appendVideo('player'));
    player.setAttribute('autoplay', '');
    player.setAttribute('controls', '');
    mockPlaying(player);
    mockRect(player, 800, 450, 0, 0);

    // 前置条件：进全屏前它是被接管的。
    expect(registry.getWatchedVideo()?.id).toBe('player');

    // 进全屏：controls 被我们弄掉，同时 registry 知道了这件事。
    player.removeAttribute('controls');
    registry.setFullscreenVideo(player);

    expect(
      registry.getWatchedVideo()?.id,
      '我们接管的全屏视频不该被误判成装饰视频',
    ).toBe('player');

    registry.setFullscreenVideo(null);
    registry.stop();
  });
});

/**
 * 6.0.9 审计第二轮的接管规则修复。
 *
 * 这一组用例守的是「什么时候可以接管一个视频」这套判定本身。
 * 上一轮把它写成了「autoplay 属性 + 没有 controls → 装饰」，
 * 于是 iQiyi 首页的主播放器（实测 1353×671 / 1440×900 = 70.1%，
 * autoplay + 无 controls）被判成装饰，**整页放弃接管** ——
 * 实测按 `=` / `Space` / `f` 全部无反应，扩展等于没装。
 *
 * 现在的判据是**证据**而不是属性：
 *   站点点名的主播放器 / 用户碰过它 / 它有原生 controls / 它不是页面主角
 * —— 四条都不成立才判装饰。
 */
describe('VideoRegistry：接管规则（证据分层）', () => {
  const VIEWPORT_WIDTH = 1024;
  const VIEWPORT_HEIGHT = 768;

  const simulateViewport = (width: number, height: number) => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: height,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    simulateViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  });

  afterEach(() => {
    delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    vi.restoreAllMocks();
  });

  const withLayout = (video: HTMLVideoElement) => {
    video.style.display = 'block';
    return video;
  };

  it('P0-1：占满大半个视口的 autoplay 无 controls 视频：那是页面主角，必须接管', () => {
    // iQiyi 首页主播放器的真实形状（实测，真实 Chromium）：
    //   <video class="full" autoplay muted>，1353×671，视口 1440×900 → 70.1%。
    // 它与文章页里的装饰性预览在 DOM 上**一模一样**（autoplay + 无 controls），
    // 唯一的区别就是它占满了大半个屏幕 —— 装饰性预览从来不会那样。
    simulateViewport(1440, 900);

    const registry = createRegistry();
    const main = withLayout(appendVideo('main'));
    main.setAttribute('autoplay', '');
    main.setAttribute('muted', '');
    mockPlaying(main);
    mockRect(main, 1353, 671, 0, 0);

    // 前置条件：确实过了「页面主角」那条线。
    expect(
      (1353 * 671) / (1440 * 900),
      '前置条件：主播放器占视口 70.1%，应 ≥ 60%',
    ).toBeGreaterThanOrEqual(0.6);

    expect(
      registry.getWatchedVideo()?.id,
      'iQiyi 主播放器的形状必须被接管，否则扩展等于没装',
    ).toBe('main');

    registry.stop();
  });

  it('P0-1：站点点名的主播放器（爱奇艺）：又小又是 autoplay 无 controls 也要接管', () => {
    // 上一条靠的是「占满视口」；这条靠的是**站点自己点名** ——
    // 后者与尺寸无关，所以小尺寸也照样接管。
    adapterHost.hostname = 'www.iqiyi.com';

    const registry = createRegistry();
    const container = document.createElement('div');
    container.className = 'iq-player-cont';
    const main = document.createElement('video');
    main.id = 'main';
    container.append(main);
    document.body.append(container);

    main.setAttribute('autoplay', '');
    mockPlaying(main);
    mockRect(main, 320, 180, 0, 0);

    expect(
      registry.getWatchedVideo()?.id,
      '站点点名的主播放器不该被当成装饰视频',
    ).toBe('main');

    registry.stop();
  });

  it('P0-2：shadow DOM 里的播放器必须被接管', () => {
    // `Document.contains()` **不穿透 shadow tree** —— 用它判「还挂在文档里」
    // 会把 shadow DOM 里的每一个 <video> 都判成「已从文档移除」。
    //
    // 实测（真实 Chromium）：960×540、带 controls 的 shadow-DOM 播放器 →
    // 按 `=` / `ArrowRight` / `f` 三个键全部无效。
    const registry = createRegistry();
    registry.start();

    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const video = document.createElement('video');
    video.id = 'shadow-player';
    shadow.append(video);
    withLayout(video);
    video.setAttribute('controls', '');
    mockRect(video, 960, 540, 0, 0);

    // 前置条件：旧判据（ownerDocument.contains）会把它误杀。
    expect(
      document.contains(video),
      '前置条件：Document.contains 不穿透 shadow tree',
    ).toBe(false);
    expect(video.isConnected, '前置条件：原生 isConnected 对 shadow DOM 是对的').toBe(true);

    expect(
      registry.getWatchedVideo()?.id,
      'shadow DOM 里的播放器必须能被接管',
    ).toBe('shadow-player');

    registry.stop();
  });

  it('P1-1：站点用 JS 启动的预览视频（没有 autoplay 属性）仍然不被接管', () => {
    // 文章页里那种预览是站点用 `video.play()` 起的 —— DOM 上**没有**
    // `autoplay` 属性。老判据把「有 autoplay 属性」当硬前提，于是它绕过了
    // 装饰性判定，靠「可见 + 在视口 + 够大」被接管：
    // 实测按 Space 键被吞（页面完全没收到，翻不了页），按 `=` 改成 1.1x，
    // 按 `f` 被拉进全屏。
    //
    // 现在「站点自己开的」有两条证据：autoplay 属性，或**站点调 play()**。
    const registry = createRegistry();
    registry.start();

    const preview = withLayout(appendVideo('preview'));
    mockRect(preview, 900, 506, 0, 0);

    // 站点自己把预览播起来了（没有任何用户手势做背景）。
    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(
      registry.getWatchedVideo(),
      '站点用 JS 启动的预览视频不该被接管',
    ).toBeNull();

    registry.stop();
  });

  it('P1-1：空格许可 —— 暂停着、没人开过、没有 controls 的视频，空格放行给页面', () => {
    // 空格在页面上首先是「往下翻页」。用户在一篇长文里按空格，
    // 期望的是翻页而不是暂停页面里某个预览视频。
    const registry = createRegistry();
    registry.start();

    const preview = withLayout(appendVideo('preview'));
    mockRect(preview, 900, 506, 0, 0);

    const target = registry.getWatchedTarget();
    expect(target?.video.id).toBe('preview');
    expect(
      target?.permission,
      '暂停着、没人开过、无 controls 的视频不该抢空格键',
    ).toBe('no-space');

    registry.stop();
  });

  it('P0 边界：键盘碰过一次**不等于**空格归我们（判据 11 不许被修法放宽）', () => {
    // 这条守的是 P0 修复的**边界**。
    //
    // P0 的修法是：扩展自己的快捷键把视频按停之后，权限不能掉到 'no-space'，
    // 否则「空格暂停 → 空格恢复」的第二下会被还给页面。
    //
    // ⚠️ 修法**不能**放宽成「键盘刚命中过的视频都算 'full'」——
    // `getWatchedTarget()` 对**任何**解析出的目标都会调
    // `rememberKeyboardTarget`，包括权限本来就是 'no-space' 的那些。
    // 于是文章页里那个「暂停着、没人开过、无 controls」的视频，
    // 只要用户按过一次 `=`（调速本来就允许作用在 no-space 视频上），
    // 下一次按键它就会被升级成能吃空格的 'full' —— 文章再也翻不了页。
    //
    // 这正是本轮要守住的判据 11。变异验证：把 resolvePermission 里那条
    // `pausedByShortcut` 换成 `wasTargetedByKeyboard`，这条用例翻红。
    const registry = createRegistry();
    registry.start();
    try {
      const preview = withLayout(appendVideo('preview'));
      mockRect(preview, 900, 506, 0, 0);

      // 第一次解析：它是一个合法的目标，但空格不归我们。
      expect(registry.getWatchedTarget()?.permission).toBe('no-space');

      // 用户按了 `=`（键被我们接管了，但**播放状态没变**）。
      // 跨过缓存有效期，逼它重新解析一次。
      const base = Date.now();
      const now = vi.spyOn(Date, 'now');
      try {
        now.mockReturnValue(base + 6_000);
        expect(
          registry.getWatchedTarget()?.permission,
          '键盘碰过它，不代表它就能抢走文章页的空格',
        ).toBe('no-space');
      } finally {
        vi.restoreAllMocks();
      }
    } finally {
      registry.stop();
    }
  });

  it('P0：我们自己的快捷键按停的视频，下一次解析仍然是 full（否则空格按不回来）', () => {
    // 缺陷本体：`isRunning` 是 'full' 的条件之一，而**扩展自己**按空格
    // 把视频暂停之后它立刻变 false → 权限掉到 'no-space' →
    // 键盘控制器把空格还给页面 → 视频不动，页面往下翻页。
    //
    // 用户看到的是「空格把视频暂停了，再按空格什么都没发生，页面却滚动」。
    const registry = createRegistry();
    registry.start();
    try {
      const custom = withLayout(appendVideo('custom'));
      mockRect(custom, 1024, 576, 0, 0);
      mockPlaying(custom);

      // 前置条件：正在播 → 空格归我们。
      expect(registry.getWatchedTarget()?.permission).toBe('full');

      // 用户按空格把它暂停了 —— 这一次是我们自己干的。
      mockPaused(custom);
      registry.noteShortcutPlaybackChange(false);

      const base = Date.now();
      const now = vi.spyOn(Date, 'now');
      try {
        now.mockReturnValue(base + 6_000);
        expect(
          registry.getWatchedTarget()?.permission,
          '我们自己按停的视频必须还能吃下第二次空格',
        ).toBe('full');
      } finally {
        vi.restoreAllMocks();
      }

      // 它又开始播了（站点恢复 / 用户点播放）→ 豁免的使命结束。
      //
      // ⚠️ 这一步不能只看权限：此刻 `isRunning` 成立，权限**本来就**是 'full'，
      // 看不出证据有没有被清掉。所以要接着再暂停一次 —— 这一次**不是**我们干的
      // （不调 noteShortcutPlaybackChange），权限必须掉回 'no-space'。
      // 如果旧证据还留着，这里会错误地停在 'full'。
      mockPlaying(custom);
      custom.dispatchEvent(new Event('play', { bubbles: true }));
      mockPaused(custom);

      const base2 = Date.now();
      const now2 = vi.spyOn(Date, 'now');
      try {
        now2.mockReturnValue(base2 + 12_000);
        expect(
          registry.getWatchedTarget()?.permission,
          '它重新播过之后，「我们按停的」这条证据必须已经失效',
        ).toBe('no-space');
      } finally {
        vi.restoreAllMocks();
      }
    } finally {
      registry.stop();
    }
  });

  it('P1-1：空格许可 —— 站点主播放器 / 有 controls / 正在播 → 空格归我们', () => {
    const registry = createRegistry();
    registry.start();

    const playing = withLayout(appendVideo('playing'));
    mockPlaying(playing);
    mockRect(playing, 900, 506, 0, 0);
    expect(
      registry.getWatchedTarget()?.permission,
      '正在播的视频可以由空格接管',
    ).toBe('full');

    const withControls = withLayout(appendVideo('with-controls'));
    withControls.setAttribute('controls', '');
    mockRect(withControls, 900, 506, 0, 0);
    expect(
      registry.getWatchedTarget()?.permission,
      '有原生 controls 的播放器可以由空格接管',
    ).toBe('full');

    registry.stop();
  });

  it('P1-3：键盘命中一个视频后，后续按键跟着它走', () => {
    // 「正在播 +600」这一档会让目标**漂移**：用户刚用空格暂停了 A，
    // A 立刻失去 600 分，还在播的 B 变成最高分，下一次按键就打到 B 身上。
    //
    // 实测：两个 600×338 同时在播 → `=` 命中 cam1 → 空格暂停 cam1 →
    // `f` 却把 cam2 搬进了全屏；四个同时在播 → 连按 4 次空格依次暂停了四个。
    const registry = createRegistry();
    registry.start();

    const cam1 = withLayout(appendVideo('cam1'));
    const cam2 = withLayout(appendVideo('cam2'));
    mockRect(cam1, 600, 338, 0, 0);
    mockRect(cam2, 600, 338, 0, 400);
    mockPlaying(cam1);
    mockPlaying(cam2);

    const base = Date.now();
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(base);
      expect(registry.getWatchedVideo()?.id, '第一下应命中 cam1').toBe('cam1');

      // 用户按空格把 cam1 暂停了 → 它失去「正在播 +600」。
      mockPaused(cam1);

      // 缓存有 5 秒有效期；时间往前推，让它过期后重新计算。
      now.mockReturnValue(base + 6_000);
      expect(
        registry.getWatchedVideo()?.id,
        '键盘刚命中过的视频必须继续当目标，不能漂到 cam2',
      ).toBe('cam1');
    } finally {
      vi.restoreAllMocks();
    }

    registry.stop();
  });

  it('P1-4：用户选过、但已经滚走的视频不再被接管', () => {
    // 竖屏 feed：点第 1 条 → 滚到第 2 条（第 1 条仍在后台播放、
    // 可见度 0）。老规则里「选过 + 还在播（60 秒）」让旧视频长期霸占
    // 「用户正在看的」身份，快捷键继续打在已经滚走的视频上。
    const registry = createRegistry();
    registry.start();

    const first = withLayout(appendVideo('first'));
    mockRect(first, 405, 720, 0, 0);
    first.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    // 用户滚到了下一条。
    mockRect(first, 405, 720, 5000, 0);
    const second = withLayout(appendVideo('second'));
    mockRect(second, 405, 720, 0, 0);

    expect(
      registry.getWatchedVideo()?.id,
      '快捷键必须落在当前在视口里的那条视频上',
    ).toBe('second');

    registry.stop();
  });

  it('P2-1：站点主播放器完全滚出视口后，不再独占全部按键', () => {
    // YouTube watch 页滚到 4000px（播放器 top = -1750）→ 按 `=` 改的是
    // 看不见的主播放器。老规则第 2 层「站点点名的主播放器 → 直接短路」，
    // 排在所有可见性判据之前。
    adapterHost.hostname = 'www.youtube.com';

    const registry = createRegistry();
    const main = withLayout(appendVideo('main', 'html5-main-video'));
    main.setAttribute('autoplay', '');
    mockPlaying(main);
    mockRect(main, 1280, 720, -1750, 0);

    expect(
      registry.getWatchedVideo(),
      '主播放器滚出视口后不该再被接管',
    ).toBeNull();

    registry.stop();
  });

  it('P2-2：站点自己播的小预览窗（占视口 15%）不被接管', () => {
    // 真实 YouTube 搜索页 hover 出来的 YTD-VIDEO-PREVIEW（504×283），
    // 老规则按「宽 ≥ 480 且高 ≥ 270」放行，于是它被接管并被拉进全屏，
    // 真正的（0×0 的）主播放器被忽略。
    const registry = createRegistry();
    registry.start();

    const preview = withLayout(appendVideo('preview'));
    mockRect(preview, 504, 283, 0, 0);
    preview.dispatchEvent(new Event('play', { bubbles: true }));

    expect(
      registry.getWatchedVideo(),
      'hover 预览这种小窗不该被接管',
    ).toBeNull();

    registry.stop();
  });

  it('P2-3：铺满全屏的竖屏 feed（autoplay + 无 controls）必须被接管', () => {
    // 405×720 的竖屏短视频铺满整个视口（实测：按 = / ArrowRight / Space /
    // f / 0 全部穿透给页面，倍速不变、无全屏）。
    //
    // 修法与 P0-1 同源：装饰性预览永远不会占满整屏。
    simulateViewport(405, 720);

    const registry = createRegistry();
    const feed = withLayout(appendVideo('feed'));
    feed.setAttribute('autoplay', '');
    mockPlaying(feed);
    mockRect(feed, 405, 720, 0, 0);

    expect(
      registry.getWatchedVideo()?.id,
      '铺满全屏的竖屏短视频必须被接管',
    ).toBe('feed');

    registry.stop();
  });

  it('P2-7：400×225 的小播放器够格被接管', () => {
    // 站点自己的迷你播放器常常正好 400×225：绝对线（480×270）差得远，
    // 相对线（10%）在 1280×720 里只占 9.8% —— 就差一点点，两条线都不过。
    //
    // ⚠️ 视口必须是 1280×720：换成 1024×768 的话 400×225 占 11.4%，
    // 相对线单独就放行了，这条用例就**不再守绝对线** —— 把绝对线改回
    // 480×270 它照样绿（守卫生了壳）。9.8% < 10% 时，只有绝对线能救它。
    simulateViewport(1280, 720);
    const registry = createRegistry();
    const mini = withLayout(appendVideo('mini'));
    mini.setAttribute('controls', '');
    mockRect(mini, 400, 225, 0, 0);

    // 前置条件：相对线单独不够，绝对线才是它过线的原因。
    expect(
      (400 * 225) / (1280 * 720),
      '前置条件：400×225 在 1280×720 里占 9.8%，低于相对线 10%',
    ).toBeLessThan(0.1);

    expect(
      registry.getWatchedVideo()?.id,
      '400×225 的播放器不该被尺寸线挡下来',
    ).toBe('mini');

    registry.stop();
  });

  it('P2-8：不是 YouTube 的域名拿不到 YouTube 的主播放器豁免', () => {
    // siteAdapters 曾经用 `hostname.includes('youtube.com')` ——
    // 于是 notyoutube.com 这类域名也拿到了 mainSelectors 豁免。
    // 键盘控制器那边用的是严格后缀正则，两处不一致。
    adapterHost.hostname = 'notyoutube.com';

    const registry = createRegistry();
    const video = withLayout(appendVideo('video', 'html5-main-video'));
    video.setAttribute('autoplay', '');
    mockPlaying(video);
    mockRect(video, 240, 135, 0, 0);

    expect(
      registry.getWatchedVideo(),
      '伪装成 YouTube 的域名不该拿到主播放器豁免',
    ).toBeNull();

    registry.stop();
  });

  it('站点有多个 mainSelectors 时，站在后面那条选择器里的视频不该被当成装饰物', () => {
    // ⚠️ 本模块内部曾经有**两条**「主播放器」判据，它们**不等价**：
    // - 「唯一性」版：站点有多个 mainSelectors 时，命中第一个有候选的
    //   选择器就停（那个函数已删除）；
    // - 「是不是站点点名的」版（isSiteMainPlayerVideo）：任何一条命中都算。
    //
    // 页面上同时存在「video.html5-main-video」与「.html5-video-player video」
    // 时，站在后者里的那条视频在唯一性版里**不算**主播放器
    // （前面的选择器已经有候选了）。
    //
    // 而「装饰性预览」这条判定问的是「这个视频是不是站点点名的」——
    // 于是它**必须**用「任何一条命中都算」那一版。
    //
    // ⚠️ 用错版本的后果：本模块**内部**对同一条视频给出两个相反的结论 ——
    // 「要不要接管它」说它是装饰物（被排除掉），
    // 「要不要给它弹引导」说它不是（引导会为一条我们压根不接管它的视频弹出）。
    // 那正是本轮要消灭的那类 bug。
    //
    // ⚠️ 现在两条路径都调**同一个**函数（ambientPreview.ts 的
    // isSiteMainPlayerVideo）——「唯一性」那份已经删掉。
    adapterHost.hostname = 'www.youtube.com';

    const registry = createRegistry();
    registry.start();

    // 站点点名的**第一个**主播放器 —— 唯一性版就是停在这里。
    const main = withLayout(appendVideo('main'));
    main.className = 'html5-main-video';
    mockRect(main, 0, 0, 0, 0);

    // 站在**第二条** mainSelector 里的那条视频。
    const wrapper = document.createElement('div');
    wrapper.className = 'html5-video-player';
    document.body.appendChild(wrapper);
    const secondary = document.createElement('video');
    secondary.id = 'secondary';
    // autoplay + 无原生 controls：除了主播放器豁免以外，它就是装饰物的形状。
    secondary.setAttribute('autoplay', '');
    wrapper.appendChild(secondary);
    // ⚠️ 尺寸必须**小于大半个视口** ——
    // 否则豁免它的是第 6 条（「占满大半个视口 = 页面主角」），而不是第 1 条
    // （站点点名它是主播放器）。那样这条用例就成了**恒真的假守卫**：
    // 把第 1 条改坏（改成永远 false）它照样绿（实测：1000×1000 在
    // 1024×768 里占 127%，第 6 条直接放行）。
    mockRect(secondary, 640, 360, 0, 0);
    mockPlaying(secondary);

    // 前置条件：这条视频**不能**靠第 6 条脱身（见上面的注释）。
    // 把这条前置条件写出来，是为了以后有人把尺寸调大时**立刻看见**
    // 这条用例失去了什么，而不是等到它悄悄变成假守卫。
    const viewportArea = window.innerWidth * window.innerHeight;
    expect(
      (640 * 360) / viewportArea,
      '前置条件：这条视频不能占满大半个视口 —— 否则豁免的是第 6 条而不是第 1 条',
    ).toBeLessThan(0.6);

    expect(
      registry.isAmbientPreview(secondary),
      '站点点名的视频不该是装饰物（公开判定）',
    ).toBe(false);

    // 接管路径也必须不把它当装饰物排除掉 —— 两条路径必须同向。
    expect(
      registry.getWatchedVideo()?.id,
      '接管路径与公开判定必须一致：这条视频不该被当成装饰物排除掉',
    ).toBe('secondary');

    registry.stop();
  });

  it('站点点名的视频（站在第二条 mainSelector 里的）：接管路径也必须认它', () => {
    // ⚠️ 上一条用的尺寸（640×360）**过大半个视口不够，但过了「够不够大」**
    // —— 于是接管它靠的是第 6 档（占视口 ≥ 10%），不是「站点点名」。
    // 那样这条用例就分不出「接管路径用的是哪一版主播放器判据」。
    //
    // 这条把尺寸压到 240×135（占 1024×768 的 4.1%，过不了第 6 档），
    // 于是接管它的**唯一**可能就是第 2 档「站点点名它是主播放器」。
    //
    // ⚠️ 而第 2 档必须与装饰路径（第 1 条）**同一条判据**：
    // 「唯一性」版（命中第一个有候选的选择器就停）会说「它不是主播放器」，
    // 于是接管路径不认它、装饰路径却认它 ——
    // 结果是扩展不接管这条视频，引导却为它弹出（多打扰一次）。
    adapterHost.hostname = 'www.youtube.com';

    const registry = createRegistry();
    registry.start();

    // 站点点名的**第一个**主播放器 —— 「唯一性」版就是停在这里。
    const main = withLayout(appendVideo('main'));
    main.className = 'html5-main-video';
    mockRect(main, 0, 0, 0, 0);

    const wrapper = document.createElement('div');
    wrapper.className = 'html5-video-player';
    document.body.appendChild(wrapper);
    const secondary = document.createElement('video');
    secondary.id = 'secondary';
    secondary.setAttribute('autoplay', '');
    wrapper.appendChild(secondary);
    mockRect(secondary, 240, 135, 0, 0);
    mockPlaying(secondary);

    // 前置条件：它过不了「够不够大」那条线 —— 否则接管它的理由
    // 可能来自第 6 档，这条用例就分不出第 2 档有没有生效。
    expect(
      (240 * 135) / (window.innerWidth * window.innerHeight),
      '前置条件：这条视频过不了「占视口 ≥ 10%」那条线',
    ).toBeLessThan(0.1);

    expect(
      registry.isAmbientPreview(secondary),
      '站点点名的视频不该是装饰物（公开判定）',
    ).toBe(false);

    expect(
      registry.getWatchedVideo()?.id,
      '接管路径必须与装饰路径用同一份「站点点名」判据',
    ).toBe('secondary');

    registry.stop();
  });

  it('页面把 matches 改坏时：判定退化，而不是整条候选扫描抛掉', () => {
    // ⚠️ 页面可以把 `Element.prototype.matches` 换成会抛异常的版本。
    //
    // 这条判定在「装饰性预览」的**核心路径**上：它一抛，
    // computeAmbientPreview 抛 → 整条候选扫描抛 → 快捷键彻底失灵
    // （整个扩展等于没装）。
    //
    // 所以两条路径（接管 / 装饰）现在都走**同一份**带 try/catch 的匹配器：
    // 判不出来就当「不匹配」——只少一条豁免，不会把整条链路带崩。
    adapterHost.hostname = 'www.youtube.com';

    const registry = createRegistry();
    registry.start();

    const video = withLayout(appendVideo('video'));
    video.setAttribute('autoplay', '');
    mockPlaying(video);
    mockRect(video, 800, 450, 0, 0);

    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'matches');
    Object.defineProperty(Element.prototype, 'matches', {
      value: () => {
        throw new Error('页面把 matches 改坏了');
      },
      configurable: true,
      writable: true,
    });

    try {
      expect(() => registry.getWatchedVideo()).not.toThrow();
      expect(() => registry.isAmbientPreview(video)).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, 'matches', original);
      }
    }

    registry.stop();
  });

  it('被我们接管的全屏视频（键盘还没碰过它）：controls 被我们自己弄掉也不算「装饰视频」', () => {
    // 上一条走的是**键盘**路径（视频已经是键盘目标，于是「键盘命中过」
    // 那条证据先把它保住了）。这条走**工具栏图标**那条路径 ——
    // 用户点图标进全屏，键盘从来没碰过它。
    //
    // 于是「我们接管着的」这条豁免是**唯一**能救它的东西：
    // 进全屏时我们把 video.controls = false（换成自制控制条），
    // controls 属性被摘掉之后，它在 DOM 上就长得跟装饰性预览一模一样了。
    // 没有这条豁免：进全屏后按 `=` 速度纹丝不动。
    const registry = createRegistry();

    const player = withLayout(appendVideo('player'));
    player.setAttribute('autoplay', '');
    mockPlaying(player);
    mockRect(player, 800, 450, 0, 0);

    // 我们接管它 → controls 属性被我们自己弄掉。
    player.removeAttribute('controls');
    registry.setFullscreenVideo(player);

    expect(
      registry.getWatchedVideo()?.id,
      '我们接管着的视频不该被误判成装饰视频（哪怕键盘还没碰过它）',
    ).toBe('player');

    registry.setFullscreenVideo(null);
    registry.stop();
  });

  it('P1-3：键盘命中过的视频不会被当成装饰（站点后来自己播了它也一样）', () => {
    // 没有原生 controls 的自定义播放器（不少站点自己画控制条），
    // 站点一旦调 play() 把它播起来，「站点自己开的」那条证据就成立 ——
    // 它会被判成「装饰性预览」而丢掉，可用户明明正在用快捷键调它。
    //
    // 这条证据必须单独记（keyboardTargetVideo），不能靠 userTouchedVideos
    // 顺带提供 —— 后者的语义是「用户的手碰过它」。
    const registry = createRegistry();
    registry.start();

    const custom = withLayout(appendVideo('custom'));
    mockRect(custom, 800, 450, 0, 0);

    // 用户按了 `=`：键盘命中它（此刻它暂停着、没人开过）。
    expect(registry.getWatchedTarget()?.video.id).toBe('custom');

    // 随后站点自己把它播了起来（没有任何用户手势做背景）。
    custom.dispatchEvent(new Event('play', { bubbles: true }));

    // ⚠️ 必须越过缓存有效期（5 秒）才会真的重新判定 ——
    // 否则读到的是上一次查询的缓存，这条用例就成了恒真的假守卫。
    const base = Date.now();
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(base + 6_000);
      expect(
        registry.getWatchedTarget()?.video.id,
        '用户正在用快捷键操作的视频，不能因为站点自己播了它就被当成装饰丢掉',
      ).toBe('custom');
    } finally {
      vi.restoreAllMocks();
    }

    registry.stop();
  });

  it('性能：连续调用只扫一次页面（缓存命中）', () => {
    // 每次按键都全页扫一遍 DOM 代价不小（实测 3 万节点的页面单次约 3.2ms，
    // 而扩展注入在 <all_urls>、长按加速时每 120ms 一次）。
    const registry = createRegistry();
    registry.start();

    const video = withLayout(appendVideo('only'));
    mockRect(video, 640, 360, 0, 0);

    const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
    expect(registry.getWatchedVideo()?.id).toBe('only');
    const scansAfterFirstCall = querySelectorAll.mock.calls.length;
    expect(scansAfterFirstCall, '前置条件：第一次调用确实扫了页面').toBeGreaterThan(0);

    for (let index = 0; index < 20; index += 1) {
      expect(registry.getWatchedVideo()?.id).toBe('only');
    }

    expect(
      querySelectorAll.mock.calls.length,
      '缓存命中时不该再扫页面',
    ).toBe(scansAfterFirstCall);

    registry.stop();
  });

  it('性能：页面上没有视频时，null 结果也被缓存（不再重复扫描）', () => {
    const registry = createRegistry();
    registry.start();

    const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
    expect(registry.getWatchedVideo()).toBeNull();
    const scansAfterFirstCall = querySelectorAll.mock.calls.length;

    for (let index = 0; index < 20; index += 1) {
      expect(registry.getWatchedVideo()).toBeNull();
    }

    expect(
      querySelectorAll.mock.calls.length,
      '「页面上没有视频」是最常见的情况，必须缓存住',
    ).toBe(scansAfterFirstCall);

    registry.stop();
  });

  it('性能：视频出现之后能及时被发现（缓存必须失效）', async () => {
    const registry = createRegistry();
    registry.start();

    expect(registry.getWatchedVideo()).toBeNull();

    const late = withLayout(appendVideo('late'));
    mockRect(late, 640, 360, 0, 0);

    // MutationObserver 只置脏标记，等它这一轮微任务回调落地。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      registry.getWatchedVideo()?.id,
      '缓存不能把新出现的视频挡住（否则按了键没反应）',
    ).toBe('late');

    registry.stop();
  });

  it('性能：shadow DOM 里的视频被摘掉之后也要及时被发现', async () => {
    // ⚠️ 为什么这条不能省：MutationObserver 挂在 document.body 上、
    // subtree: true —— 但 **shadow tree 是另一棵树**，document 上的观察器
    // 收不到 shadow root 里的增删。于是「DOM 变更代次」不会前进，
    // 缓存也不会失效 —— 唯一能认出「它已经被摘掉了」的是**存活检查**
    // （命中缓存前重新确认目标还挂在文档里）。
    //
    // 少了这条，摘掉 shadow 里的视频之后，快捷键还会打在那个已经不在
    // 页面上的视频上（按 `=` 没反应，因为视频节点已经没了）。
    const registry = createRegistry();
    registry.start();

    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const video = document.createElement('video');
    video.id = 'shadow-video';
    shadow.append(video);
    withLayout(video);
    mockRect(video, 640, 360, 0, 0);

    expect(registry.getWatchedVideo()?.id).toBe('shadow-video');

    video.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      registry.getWatchedVideo(),
      '缓存不能返回一个已经被摘掉的视频',
    ).toBeNull();

    registry.stop();
  });

  it('性能：按住不放的重复按键不重扫整页', () => {
    // 浏览器在用户**按住**某个键期间会持续派发 keydown（event.repeat === true）。
    // 那些事件不带来任何新信息（还是同一个键、还是同一次手势），
    // 但每一条都要重扫整页视频列表 —— 而「按住」恰恰是持续时间最长的手势
    // （长按空格翻页、长按方向键快进）。
    //
    // 实测（真实 Chromium，3 万节点的页面）：单次全页扫描约 3ms。
    // 不挡住重复事件的话，用户按住一秒就是 30 次扫描 = 90ms 白烧的 CPU。
    const registry = createRegistry();
    registry.start();

    const video = withLayout(appendVideo('only'));
    mockRect(video, 640, 360, 0, 0);

    const querySelectorAll = vi.spyOn(document, 'querySelectorAll');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    const scansAfterFirstPress = querySelectorAll.mock.calls.length;
    expect(scansAfterFirstPress, '第一次按键当然要扫一遍').toBeGreaterThan(0);

    for (let index = 0; index < 20; index += 1) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: ' ', repeat: true, bubbles: true, cancelable: true,
      }));
    }

    expect(
      querySelectorAll.mock.calls.length,
      '按住不放的重复事件不该再扫整页',
    ).toBe(scansAfterFirstPress);

    registry.stop();
  });

  it('性能：同一帧内不重复强制排版', () => {
    // getBoundingClientRect() 会**强制排版** —— 它是候选路径里最贵的一次调用。
    // 而一次按键里这条路径要走两遍：注册表记手势（找手势指向哪个视频）
    // 与键盘控制器找接管目标。
    //
    // 所以测量结果按帧复用：同一帧内布局不会变，跨帧必须重测。
    const registry = createRegistry();
    registry.start();

    const video = withLayout(appendVideo('only'));
    mockRect(video, 640, 360, 0, 0);

    const rect = vi.spyOn(video, 'getBoundingClientRect');

    // 手势路径量一次。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(rect, '手势路径要量一次').toHaveBeenCalledTimes(1);

    // 同一帧里的第二条路（找接管目标）必须复用同一份测量结果。
    registry.getWatchedVideo();

    expect(
      rect,
      '同一帧内的第二条路不该再强制排版',
    ).toHaveBeenCalledTimes(1);

    registry.stop();
  });

  it('性能：视频消失之后能及时被发现（缓存必须失效）', async () => {
    const registry = createRegistry();
    registry.start();

    const only = withLayout(appendVideo('only'));
    mockRect(only, 640, 360, 0, 0);
    expect(registry.getWatchedVideo()?.id).toBe('only');

    only.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      registry.getWatchedVideo(),
      '缓存不能返回一个已经被摘掉的视频',
    ).toBeNull();

    registry.stop();
  });
});

/**
 * 工具栏图标路径（**显式**操作）选哪个视频。
 *
 * ⚠️ 这条路径与快捷键路径的**契约**不同：显式操作必须有目标
 * （用户点了图标就是想对某个视频动手），快捷键路径没有目标就必须穿透。
 * 但两者的**候选过滤与打分**必须一致 —— 否则用户会看到
 * 「按 = 改的是 A、点图标进的是 B」。
 *
 * 本组用例守的是 6.2.1 修掉的缺陷：
 * 「很久以前点过、早已滚出屏幕」的小预览，靠着 +10000 的最高权重抢走了
 * 图标路径的目标 —— 而同一时刻按 f 进的却是眼前的大播放器。
 */
describe('VideoRegistry：工具栏图标路径的目标', () => {
  const VIEWPORT_WIDTH = 1024;
  const VIEWPORT_HEIGHT = 768;

  const simulateViewport = (width: number, height: number) => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: height,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    simulateViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  });

  afterEach(() => {
    delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    vi.restoreAllMocks();
  });

  const withLayout = (video: HTMLVideoElement) => {
    video.style.display = 'block';
    return video;
  };

  it('D1：早已滚出视口的旧视频不该抢走图标路径的目标', () => {
    // 场景（实测，真实 Chromium）：
    //   用户几十秒前点过一张 320×180 的卡片预览，之后页面换成大播放器；
    //   点工具栏图标 → 进的全屏却是那个早就滚走的小预览（或一块黑屏），
    //   而同一时刻按 f 进的却是大播放器 —— **图标与快捷键表现不一致**。
    //
    // ⚠️ 场景设计要点：大播放器必须是「装饰性自动播放」的形状 ——
    //    否则快捷键路径本来就有目标，回退分支根本轮不到执行，
    //    那这条用例就成了一条恒真的假守卫。
    const registry = createRegistry();
    registry.start();

    // 早就滚出视口的小卡片：用户点过它。
    const card = withLayout(appendVideo('card'));
    mockRect(card, 320, 180, 5000, 0);
    card.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    // 眼前的大播放器（装饰性自动播放预览 → 快捷键路径**不**接管它）。
    const big = withLayout(appendVideo('big'));
    big.setAttribute('autoplay', '');
    mockPlaying(big);
    mockRect(big, 800, 450, 0, 0);

    // 前置条件：快捷键路径没有目标（所以图标路径会走「回退」分支）。
    expect(
      registry.getWatchedVideo(),
      '前置条件：装饰性预览不该被快捷键接管（否则测不到回退分支）',
    ).toBeNull();

    expect(
      registry.getCurrentVideo()?.id,
      '图标路径必须作用于眼前的那个视频，而不是早就滚走的小卡片',
    ).toBe('big');

    registry.stop();
  });

  it('D1：「用户碰过它」这个权重会过期 —— 很久以前的点击不该一直霸占目标', async () => {
    // ⚠️ 为什么这条与上一条分开：上一条守的是「在视口里的候选优先」，
    //    这条守的是「+10000 有时限」。两条修的是同一个缺陷的两半，
    //    但判据不同 —— 混在一起的话，改坏其中一半另一条仍然绿。
    //
    // 场景：用户点过一张卡片预览，之后继续往下滚 —— 两个视频都滚出了视口。
    // 那次点击只说明「一分钟前用户想动它」，不再说明「用户此刻想动它」。
    const registry = createRegistry();
    registry.start();

    // 用户点过的小卡片（早已滚出视口）。
    const card = withLayout(appendVideo('card'));
    mockRect(card, 320, 180, 5000, 0);

    // 还在播的大视频（同样滚出了视口）。
    const feed = withLayout(appendVideo('feed'));
    mockPlaying(feed);
    mockRect(feed, 800, 450, 5000, 0);

    const base = Date.now();
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(base);
      card.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      // 刚刚碰过 → 它就是目标（+10000 是全场最高）。
      expect(
        registry.getCurrentVideo()?.id,
        '用户刚碰过的视频必须优先当目标',
      ).toBe('card');

      // 60 秒过去 → 那次点击不再说明用户此刻想动哪个视频。
      //
      // ⚠️ 必须跨过一帧：getCurrentVideo() 有「同一帧内复用」的快照，
      // 而帧号由 rAF 推进。同一帧内它会直接返回上一次的结果 ——
      // 那样这条用例就测不到「权重过期」这件事了。
      now.mockReturnValue(base + 61_000);
      await new Promise((resolve) => setTimeout(resolve, 40));

      expect(
        registry.getCurrentVideo()?.id,
        '很久以前的点击不该一直霸占图标路径的目标',
      ).toBe('feed');
    } finally {
      vi.restoreAllMocks();
    }

    registry.stop();
  });

  it('D1：用户刚点过的视频仍然优先（权重没有收得太紧）', () => {
    // ⚠️ 上一条的**反向守卫**：给 +10000 加时限不是为了削弱它。
    //
    // 用户点了一个暂停的小卡片 → 那就是他的目标，此刻点图标就该动它。
    const registry = createRegistry();
    registry.start();

    const card = withLayout(appendVideo('card'));
    mockRect(card, 320, 180, 0, 0);

    // 一个更大的、正在播的邻居（没有用户手势，不该靠「正在播」压过用户的选择）。
    const other = withLayout(appendVideo('other'));
    mockPlaying(other);
    mockRect(other, 800, 450, 0, 0);

    card.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(
      registry.getCurrentVideo()?.id,
      '用户刚点过的视频必须优先于更大的邻居',
    ).toBe('card');

    registry.stop();
  });
});

/**
 * class 变动与缓存：**只改 class** 不该让整页重扫。
 *
 * ⚠️ 这组用例守的是重渲染站点（React / Vue / Next.js）上的开销：
 * 那些站点每次渲染都要重算 class —— 每秒几十次。class 变动如果
 * 一律作废全部缓存，扩展每次按键都要全页重扫一遍（实测 3 万节点的页面
 * 约 3ms），而长按加速时每 120ms 一次 —— 那点开销全烧在这里了。
 *
 * 之所以能降级：可见性判据读的是**计算样式**与**实测矩形**
 * （isCssHidden / isVisible / isInViewport），class 属性本身从头到尾
 * 没有被读过。所以 class 变动只需要让「测量」重做一遍 ——
 * 「候选列表」与「目标缓存」都留着。
 *
 * ⚠️ 但降级不等于不管：class 变动**能**改变可见性（站点把视频
 * `display:none` 藏起来就是改 class）。所以目标缓存命中时必须复核
 * 那一个视频（见 isStillUsable）—— 只复核一个，不重扫全页。
 */
describe('VideoRegistry：class 变动与缓存', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 让「站点用 CSS 把视频藏起来」这件事在 jsdom 里成立。
   *
   * ⚠️ 为什么不用真的 <style> 规则：jsdom 的样式计算对 class 选择器的
   * 支持不完整（`.hide{display:none}` 不保证进 computed style）。而这条
   * 用例要测的是**缓存策略**（class 变动之后可见性判据有没有重算），
   * 不是 CSS 引擎 —— 把 computed style 换掉最稳，也最直指要害。
   */
  const hideByClass = (video: HTMLVideoElement, className: string) => {
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElt) => {
      const style = real(element, pseudoElt);
      if (element !== video) {
        return style;
      }
      return {
        display: video.classList.contains(className) ? 'none' : style.display,
        visibility: style.visibility,
      } as unknown as CSSStyleDeclaration;
    });
  };

  it('D3：只改 class 不该让快捷键路径重扫整页（重渲染站点的热路径）', async () => {
    const registry = createRegistry();
    const video = appendVideo('only');
    // ⚠️ 样式必须在 start() 之前设好 —— 那是一次 style 属性变动，
    //    会走「全量作废」那条路，混进来就测不到「只改 class」了。
    video.style.display = 'block';
    mockRect(video, 640, 360, 0, 0);
    registry.start();

    const querySelectorAll = vi.spyOn(document, 'querySelectorAll');
    const rect = vi.spyOn(video, 'getBoundingClientRect');

    // 先算一次，把目标缓存捂热。
    expect(registry.getWatchedVideo()).toBe(video);
    const scansAfterFirstCall = querySelectorAll.mock.calls.length;
    expect(scansAfterFirstCall).toBeGreaterThan(0);
    rect.mockClear();

    // 站点重渲染 → **只改 class**（React/Vue 每次渲染都这么干）。
    video.className = 'is-playing';
    // MutationObserver 的回调是微任务，等它落地。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(registry.getWatchedVideo()).toBe(video);
    expect(
      querySelectorAll.mock.calls.length,
      '只改 class 不该让快捷键路径重扫整页（重渲染站点上每秒几十次）',
    ).toBe(scansAfterFirstCall);
    expect(
      rect,
      'class 变动之后测量结果必须重做（可见性判据的依据变了）',
    ).toHaveBeenCalled();

    registry.stop();
  });

  it('D3：站点用 class 把视频藏起来 → 候选列表必须是最新的', async () => {
    // ⚠️ 这条守的是「降级之后不能丢的正确性」：class 变动不再作废
    //    目标缓存，那么缓存里的目标有可能已经被站点藏起来了。
    //    没有复核的话，它会继续吃下快捷键最多 5 秒。
    const registry = createRegistry();
    const video = appendVideo('only');
    video.style.display = 'block';
    mockRect(video, 640, 360, 0, 0);
    registry.start();

    hideByClass(video, 'hide');

    // 前置条件：藏起来之前它是目标。
    expect(registry.getWatchedVideo()).toBe(video);

    // 站点把它藏起来（**只改 class**）。
    video.className = 'hide';
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      registry.getWatchedVideo(),
      '被站点藏起来的视频不该继续吃下快捷键',
    ).toBeNull();

    registry.stop();
  });

  it('D3：候选列表永远不缓存 —— 新出现的视频必须被看见', async () => {
    // ⚠️ 为什么这条要单列：DOM 的增删是**同步**可见的，而
    //    MutationObserver 的作废通知是**微任务**。所以「候选列表」
    //    一旦被缓存，同一个同步块里刚加进来的视频就会漏掉。
    //    测量可以缓存，列表不行。
    //
    // ⚠️ 为什么走工具栏路径：快捷键路径有「键盘目标粘性」（+8000、30 秒），
    //    那是**故意**让目标别乱跳的机制 —— 用它来测「列表新不新鲜」会被
    //    粘性盖住，看不出问题。
    const registry = createRegistry();
    registry.start();

    const first = appendVideo('first');
    first.style.display = 'block';
    mockRect(first, 640, 360, 0, 0);

    // 先算一次（收一遍候选）。
    expect(registry.getCurrentVideo()).toBe(first);

    // 站点换了一个更大的视频。
    const second = appendVideo('second');
    second.style.display = 'block';
    mockRect(second, 1920, 1080, 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      registry.getCurrentVideo()?.id,
      '候选列表不能被缓存住（否则新出现的视频永远看不见）',
    ).toBe('second');

    registry.stop();
  });
});

describe('VideoRegistry：body 被整个换掉', () => {
  beforeEach(() => {
    // ⚠️ 这个 describe 块自带清场：上一个块留下的视频还在页面里，
    // 「页面上还没有视频」这个前置条件就不成立了。
    document.body.innerHTML = '';
  });

  it('站点换掉整个 body 之后：快捷键目标必须重新解析', async () => {
    // ⚠️ 这是真实故障的形状：注册表的观察者绑在 document.body 上，
    // 站点 `document.body.replaceWith(newBody)` 之后观察者就成了孤儿 ——
    // 新 body 里的任何变化都看不见，「DOM 变更代次」永远不前进
    // → 快捷键路径缓存里的 `null` 永不过期（null 结果没有 TTL）
    // → **所有快捷键静默失灵**，直到用户碰一下视频
    // （用户手势顺带触发一次作废，于是症状是「点一下就好了」）。
    //
    // 症状之所以自相矛盾（「图标能点、快捷键没反应」）：
    // 工具栏那条路按帧重算，不吃这份缓存（见 getCurrentVideo）。
    const registry = createRegistry();
    registry.start();

    // 页面上还没有视频 → 快捷键路径把「没有目标」缓存下来。
    expect(registry.getWatchedTarget()).toBeNull();

    // 站点换掉整个 body（SPA 重建页面），新 body 里带着视频。
    const next = document.createElement('body');
    const video = document.createElement('video');
    video.id = 'after-swap';
    next.appendChild(video);
    document.body.replaceWith(next);

    // MutationObserver 的回调是微任务，等它落地。
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      registry.getWatchedTarget()?.video.id,
      'body 换人之后，缓存里的 null 必须作废（否则快捷键永远醒不过来）',
    ).toBe('after-swap');

    registry.stop();
  });
});
