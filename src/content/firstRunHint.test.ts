import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGuideText, createFirstRunHint, FirstRunHint } from './firstRunHint';
import { DEFAULT_SHORTCUTS, type ShortcutSettings } from '../shared/types';

// jsdom 的 location.hostname 是 [LegacyUnforgeable]，无法重定义；
// 这里只把"hostname 从哪来"换成可变变量，选择器链仍走真实的 siteAdapters。
const adapterHost = vi.hoisted(() => ({ hostname: 'localhost' }));
vi.mock('./siteAdapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./siteAdapters')>();
  return { ...actual, getSiteAdapter: () => actual.getSiteAdapter(adapterHost.hostname) };
});

const HINT_ID = 'vsc-first-run-hint';

/** 提示出现的时间点（播放满 2.5 秒）。 */
const WATCH_DELAY = 2500;
/** 「用户读过了」的判据时长：提示出现后还要再等这么久。 */
const READ_DELAY = 2000;
/** flag 落盘的时间点：出现 + 读完。 */
const SHOWN_AT = WATCH_DELAY + READ_DELAY;

const createShortcuts = (overrides: Partial<ShortcutSettings> = {}): ShortcutSettings => ({
  ...DEFAULT_SHORTCUTS,
  ...overrides,
});

const createVideo = () => document.createElement('video');

/**
 * 建一条「站点摆在那儿的装饰性自动播放视频」。
 *
 * 形状：autoplay + 没有原生 controls。这正是文章里那种边滚动边播的小预览 ——
 * 浏览器允许静音自动播，于是它自己播了起来。
 */
const createDecorativePreview = () => {
  const video = createVideo();
  video.setAttribute('autoplay', '');
  return video;
};

/**
 * 让 jsdom 里的视频「看得见」。
 *
 * ⚠️ jsdom **不做布局**：getClientRects() 永远返回空，getBoundingClientRect()
 * 永远是全 0。生产代码的可见性判据（有没有渲染盒 / 有没有尺寸 / 在不在视口里）
 * 在 jsdom 里因此一律判「看不见」—— 所以单测必须自己把布局结果喂进去，
 * 否则「视频看不见 → 不提示」这条新判据会把所有既有用例都变成假绿/假红。
 */
const makeVisible = (
  video: HTMLVideoElement,
  box: Partial<{ top: number; left: number; right: number; bottom: number; width: number; height: number }> = {},
) => {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 640,
    bottom: 360,
    width: 640,
    height: 360,
    ...box,
  };

  Object.defineProperty(video, 'getClientRects', {
    configurable: true,
    value: () => [rect] as unknown as DOMRectList,
  });
  Object.defineProperty(video, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect as DOMRect,
  });

  return video;
};

/** 让视频「看不见」：没有渲染盒（display:none 的形状）。 */
const makeHidden = (video: HTMLVideoElement) => {
  Object.defineProperty(video, 'getClientRects', {
    configurable: true,
    value: () => [] as unknown as DOMRectList,
  });
  Object.defineProperty(video, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
    }) as DOMRect,
  });

  return video;
};

/** 让视频「看得见但滚出了视口」。 */
const makeOffScreen = (video: HTMLVideoElement) =>
  makeVisible(video, { top: -800, bottom: -440, left: 0, right: 640, width: 640, height: 360 });

const hintNode = () => document.getElementById(HINT_ID);
const isVisible = () => hintNode()?.classList.contains('vsc-visible') ?? false;

/**
 * 等「能不能提示」这个异步判断落地。
 *
 * 判定要读两次异步存储（展示过没有 + 失败次数），所以要排空几轮微任务。
 * 排空之前 `eligible` 还是 null，reveal() 会自己去查 —— 而那次查询排在
 * 计时器之后，断言就永远赶不上提示出现。
 */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
};

/** 用英文 locale 的真实文案驱动 t()，用来断言英文引导读起来成句。 */
const withEnglishMessages = (run: (getMessage: (key: string, substitutions?: string[]) => string) => void) => {
  const previous = (globalThis as Record<string, unknown>).chrome;
  const messages = JSON.parse(
    readFileSync(resolve(process.cwd(), '_locales', 'en', 'messages.json'), 'utf8'),
  ) as Record<string, { message?: string }>;

  const getMessage = (key: string, substitutions?: string[]) => {
    const raw = messages[key]?.message ?? '';
    if (!substitutions) {
      return raw;
    }

    return raw.replace(/\$([1-9])/g, (_, index: string) => substitutions[Number(index) - 1] ?? '');
  };

  (globalThis as Record<string, unknown>).chrome = { i18n: { getMessage } };
  try {
    run(getMessage);
  } finally {
    (globalThis as Record<string, unknown>).chrome = previous;
  }
};

describe('buildGuideText', () => {
  it('lists the fullscreen key and the speed step pair, with real labels', () => {
    const text = buildGuideText(createShortcuts());

    // ⚠️ 断言的是**小写**的 f —— 引导里显示的键名必须"照着按就管用"。
    // 匹配是区分 Shift 的：绑定 f 时按 Shift+F 根本不会触发，
    // 所以显示成大写 F 会教用户按一个不生效的键。
    expect(text).toContain('f');
    expect(text).not.toContain('F');
    expect(text).toContain('= / -');
    // 断言动作名本身：i18n 键名写错时会把**键名**渲染给用户（曾经就把
    // "fullscreen" 当动作名显示了出来），只断言键位是抓不到的。
    expect(text).toContain('网页全屏');
    expect(text).not.toContain('fullscreen');
    expect(text).toContain('调速');
    // 动作名与键之间要有可见的间隔符：「网页全屏 · f」而不是「网页全屏f」。
    expect(text).toContain('·');
  });

  it('renders the user\'s own bindings instead of the defaults', () => {
    const text = buildGuideText(
      createShortcuts({ fullscreen: 'q', increaseSpeed: ']', decreaseSpeed: '[' }),
    );

    // 照默认值写死的提示会教用户按一个已经改掉的键。
    expect(text).toContain('q');
    expect(text).toContain('] / [');
    expect(text).not.toContain('= / -');
  });

  it('omits the speed line when only one of the two step keys is bound', () => {
    const text = buildGuideText(createShortcuts({ decreaseSpeed: '' }));

    expect(text).toContain('f');
    expect(text).not.toContain('=');
  });

  it('returns null when every action it would teach is disabled', () => {
    expect(buildGuideText(createShortcuts({
      fullscreen: '',
      increaseSpeed: '',
      decreaseSpeed: '',
    }))).toBeNull();
  });

  it('never teaches play/pause, which the user just used to start the video', () => {
    expect(buildGuideText(createShortcuts())).not.toContain('Space');
  });

  it('tells the user the two things only README and the store listing knew', () => {
    const text = buildGuideText(createShortcuts()) ?? '';

    // 「点扩展图标 = 全屏」此前只写在 README 与商店文案里，产品内一处都没有。
    expect(text).toContain('点扩展图标');
    // 「改绑的入口」同理。
    expect(text).toContain('改绑');
  });

  it('macOS 上显示 ⌘ 而不是 Meta', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');
    Object.defineProperty(Navigator.prototype, 'platform', {
      configurable: true,
      get: () => 'MacIntel',
    });

    try {
      const text = buildGuideText(createShortcuts({ fullscreen: 'meta+k' })) ?? '';

      // ⚠️ 引导里教的就是「按这个键」：macOS 用户在自己的键盘上找的是 ⌘，
      // 界面上写着 "Meta" 他得先在脑子里换算一次才知道该按哪颗。
      expect(text).toContain('⌘k');
      expect(text).not.toContain('Meta');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Navigator.prototype, 'platform', originalDescriptor);
      }
    }
  });

  /**
   * 英文引导必须**成句**。
   *
   * 旧文案是 "$1 / $2 speed"，拼出来是 "= / - speed" —— 三个词不成句，
   * 英文用户读不出这是「用这两个键调速」。
   */
  it('英文引导读起来是一句话', () => {
    withEnglishMessages(() => {
      const text = buildGuideText(createShortcuts()) ?? '';

      expect(text).toContain('= / - to change speed');
      expect(text).not.toContain('= / - speed');
      expect(text).not.toContain('$1');
      expect(text).not.toContain('$2');
    });
  });

  /**
   * 有 chrome.i18n 时也必须渲染出真实的键位。
   *
   * 真实扩展环境里 locale 走的是 Chrome 的位置占位符（`$1 / $2`），
   * 而上面的用例跑在**回落**路径上（没有 chrome.i18n）。
   * 两条路径必须渲染出**同一个字符串** —— 不一致的话，用户看到的引导
   * 要么露出 "$1 / $2" 这种字面量，要么露出 "{up} / {down}"。
   *
   * 这里模拟 Chrome 的行为：把 $1/$2 填成传进去的替换值。
   */
  it('有 chrome.i18n 时渲染结果与回落路径一致', () => {
    const previous = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {
      i18n: {
        getMessage: (_key: string, substitutions?: string[]) =>
          '$1 / $2 调速'
            .replace('$1', substitutions?.[0] ?? '')
            .replace('$2', substitutions?.[1] ?? ''),
      },
    };
    // 上面这个 mock 两种写法都会「碰巧对」——
    // 因为旧写法传进去的替换值恰好就是 '{up}' / '{down}'，
    // Chrome 填出来的结果与新写法一致。
    //
    // 所以这条锁的是**不变式**，不是「某一种写法对、另一种错」：
    // 将来谁动了 t() 的占位符逻辑，让有/无 chrome.i18n 两条路分叉，
    // 它会立刻失败。

    try {
      const text = buildGuideText(createShortcuts());
      expect(text).toContain('= / -');
      expect(text).not.toContain('$1');
      expect(text).not.toContain('{up}');
    } finally {
      (globalThis as Record<string, unknown>).chrome = previous;
    }
  });
});

describe('FirstRunHint', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let recordFailedAttempt: Mock<[], Promise<void>>;
  let tooManyFailedAttempts: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint;

  const start = async (video: HTMLVideoElement) => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      tooManyFailedAttempts,
    });
    hint.start();
    await settle();
    video.dispatchEvent(new Event('play', { bubbles: true }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
    recordFailedAttempt = vi.fn(async (): Promise<void> => {});
    tooManyFailedAttempts = vi.fn(async (): Promise<boolean> => false);
  });

  afterEach(() => {
    hint?.destroy();
    vi.useRealTimers();
  });

  it('shows nothing until the video has actually been watched for a while', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    // 自动播放的广告位、悬停预览都会派发 play；只按 play 就弹提示等于打扰。
    vi.advanceTimersByTime(2000);
    expect(isVisible()).toBe(false);

    vi.advanceTimersByTime(600);
    expect(isVisible()).toBe(true);
    expect(hintNode()?.textContent).toContain('f');
  });

  it('records that it was shown, exactly once', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(SHOWN_AT);

    expect(markShown).toHaveBeenCalledTimes(1);

    // 同一页面里再次播放（切集、重播）不该再弹一次。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(SHOWN_AT);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('stays silent forever once the flag is set', async () => {
    wasShown = vi.fn(async (): Promise<boolean> => true);
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(5000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('treats a failed read as already shown rather than nagging on every reload', async () => {
    wasShown = vi.fn(async (): Promise<boolean> => {
      throw new Error('storage unavailable');
    });
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(5000);

    expect(isVisible()).toBe(false);
  });

  it('stays silent when the user pauses during the wait', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    // 等 2.5 秒的窗口里用户按了暂停：这时弹提示是在打断他。
    // 判定必须靠真实的 pause 事件，而不是去读 video.paused 的状态快照。
    video.dispatchEvent(new Event('pause', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('stays silent when the video ends during the wait', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    video.dispatchEvent(new Event('ended', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
  });

  it('gives a paused video the full wait again after it resumes', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    video.dispatchEvent(new Event('pause', { bubbles: true }));
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(false);

    // 恢复播放后重新计时，而不是因为「已经等过一次」就永久放弃。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);
  });

  it('stays silent when the video left the document during the wait', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    video.remove();
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('does not mark itself shown when all the actions it would teach are disabled', async () => {
    shortcuts = createShortcuts({ fullscreen: '', increaseSpeed: '', decreaseSpeed: '' });
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    // 什么都没显示出来，就不该消耗掉这一次引导——用户改回绑定后仍应看到。
    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('disappears as soon as the user starts operating the extension', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    expect(isVisible()).toBe(false);
  });

  it('disappears on a click too', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(isVisible()).toBe(false);
  });

  it('fades out on its own instead of staying on screen', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);

    vi.advanceTimersByTime(12000);
    expect(isVisible()).toBe(false);
  });

  it('leaves no trace after destroy', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(hintNode()).not.toBeNull();

    hint.destroy();

    expect(hintNode()).toBeNull();
    // 销毁后既不能再弹，也不能留下定时器（jsdom 会对残留定时器报错）。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    expect(() => vi.advanceTimersByTime(20000)).not.toThrow();
    expect(isVisible()).toBe(false);
  });
});

/**
 * 装饰性自动播放视频：**唯一一次**引导机会不能被它吃掉。
 *
 * 原来的判据是「播够 2.5 秒」—— 装饰性预览同样会播过 2.5 秒，于是
 * 引导会在长文顶部凭空弹出；用户随手按一下键，提示消失 + markShown 落盘，
 * 等他真正打开网课时扩展再也不会开口。整个扩展的发现机制被一个装饰视频
 * 吃掉了 —— 而这个扩展**全部的可见入口**就是这条引导。
 */
describe('FirstRunHint：装饰性自动播放视频', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let hint: FirstRunHint | undefined;

  /**
   * 建一个引导并启动它（**不**派发 play —— 由用例自己决定何时派发）。
   *
   * `trusted` 控制「事件是否算用户真的交互了」：jsdom 造不出可信事件
   * （isTrusted 是实例上的 non-configurable 属性），所以这条缝是测试专用的。
   * 生产代码默认读真实的 `event.isTrusted`。
   *
   * ⚠️ 必须 await 两次微任务：「是否已展示过」是异步查出来的，
   * 没等它落地的话 reveal() 会自己再去查一次，而那次 await 排在
   * 计时器之后 —— 断言就永远赶不上提示出现。
   */
  const create = async (options: { trusted?: boolean } = {}) => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      isTrustedEvent: () => options.trusted !== false,
    });
    hint.start();
    await settle();
    return hint;
  };

  /** 派发一个「用户真的点了这个视频」的可信 pointerdown。 */
  const userClicks = (video: HTMLVideoElement) => {
    video.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('装饰性自动播放视频不会触发引导，也不会烧掉那唯一一次机会', async () => {
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    // 站点让它自己播起来（autoplay 的视频不需要用户点）。
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(5000);

    // ⚠️ 核心断言：引导既没出现，**也没被记成「已展示」**。
    // 只断言前者是不够的 —— 那正是原 bug 的形状：提示出现了又消失，
    // markShown 已经落盘，于是用户后来打开真正的视频时永远等不到它。
    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('装饰性预览播很久也不会触发引导', async () => {
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    preview.dispatchEvent(new Event('play', { bubbles: true }));
    // 播满 30 秒：原来 2.5 秒就弹了。
    vi.advanceTimersByTime(30_000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('装饰性预览不触发引导之后，同页真正的视频仍然能触发', async () => {
    const preview = makeVisible(createDecorativePreview());
    const player = makeVisible(createVideo());
    document.body.append(preview, player);
    await create();

    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(5000);
    expect(isVisible()).toBe(false);

    // 用户后来打开了真正的网课视频 —— 引导必须照常出现。
    player.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('有原生 controls 的自动播放视频仍然会触发引导', async () => {
    // 有 controls = 站点把它当成一个正经播放器给人用，不是装饰物。
    // 这条视频**故意**同时带 autoplay —— 它与装饰预览只差一个 controls 属性。
    const player = makeVisible(createVideo());
    player.setAttribute('autoplay', '');
    player.setAttribute('controls', '');
    document.body.appendChild(player);
    await create();

    player.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('站点点名的主播放器（YouTube 那样）即使自动播也会触发引导', async () => {
    // YouTube 的主播放器恰恰就是静音自动播的（浏览器只允许静音自动播），
    // 而它的 <video> 上**没有**原生 controls —— 形状与装饰预览一模一样。
    // 没有这条豁免，引导在 YouTube 上永远不出现。
    adapterHost.hostname = 'www.youtube.com';

    const main = makeVisible(createVideo());
    main.className = 'html5-main-video';
    main.setAttribute('autoplay', '');
    document.body.appendChild(main);
    await create();

    main.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('用户亲手点过预览之后，它就不再是「装饰的」—— 引导可以出现', async () => {
    // 用户点了 = 用户主动选了它 = 那可能正是他要看的视频。
    // 这条视频仍然是 autoplay + 无 controls（形状没变），变的是「用户选过」。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    userClicks(preview);
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('用户点的预览已经在播（不再派发 play）时，点它也能触发引导', async () => {
    // ⚠️ 这条是「用户点过」这条路径**唯一**能触发的场景：
    // 自动播的预览在用户点它之前就已经在播了，它不会因为用户的点击
    // 再派发一次 play 事件。只靠 play 事件的话，用户点了预览之后
    // 引导永远不会来 —— 而他明明已经「开始看视频」了。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    // 站点先让它自动播起来（被装饰判据挡掉，不排计时器）。
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(isVisible()).toBe(false);

    // 用户点了它 —— 站点没有再派发 play（它本来就在播）。
    userClicks(preview);
    vi.advanceTimersByTime(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('用户点过一条已经暂停的视频时，不再补排那次等待', async () => {
    // ⚠️ 「正在播」这个状态必须随 pause/ended 一起更新。
    //
    // 场景：用户点了一条**正在播**的视频 → 引导开始等 → 用户立刻把它暂停了
    // （取消等待）→ 过了一会儿又点它一次。此时它已经不在播了，
    // 再补排一次等待就是「用户点了它 = 它开始播」这个假设的滥用：
    // 站点不一定会在点击后派发 play 事件（比如它被用户暂停了）。
    //
    // 反过来说，如果「暂停」不更新「正在播」，这条视频会一直留在集合里，
    // 于是下一次点击它（哪怕它早就停了）都会被当成「开始看视频」。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    preview.dispatchEvent(new Event('play', { bubbles: true }));
    preview.dispatchEvent(new Event('pause', { bubbles: true }));

    userClicks(preview);
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('用户点过 A 之后，A 的「用户选过」不会传染给另一条装饰预览 B', async () => {
    // ⚠️ 时间戳必须与视频**绑定**：用户点了 A，随后站点让预览 B 自动播 →
    // B 白继承了 A 的「新鲜度」，被当成「用户选过的」——
    // 那正是文章页预览的形状。
    const chosen = makeVisible(createDecorativePreview());
    const preview = makeVisible(createDecorativePreview());
    document.body.append(chosen, preview);
    await create();

    userClicks(chosen);
    // 站点把 A 暂停了（用户点它是为了让它闭嘴）：这一下取消了 A 的等待。
    chosen.dispatchEvent(new Event('pause', { bubbles: true }));

    // 随后站点让另一条预览 B 自动播 —— B 没被选过，不该触发引导。
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('「用户选过」只在新鲜期内有效', async () => {
    // 用户点一下那个吵人的预览（把它暂停）然后继续读文章 ——
    // 那次点击不该让他接下来半小时都享受「用户选过」的待遇。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    userClicks(preview);
    // 站点把预览暂停了：取消这一次的等待。
    preview.dispatchEvent(new Event('pause', { bubbles: true }));

    // 走过新鲜期（10 秒）之后，站点又让预览自动播 —— 不该再算「用户选过」。
    vi.advanceTimersByTime(11_000);
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('页面伪造的 pointerdown 不能把装饰预览伪装成「用户选过的」', async () => {
    // 安全边界：扩展在 document_start 抢注捕获阶段监听器，页面脚本能
    // dispatchEvent(new PointerEvent('pointerdown')) 打在自己的视频上。
    // 若不挡这一条，页面等于拿到了遥控器：随时把引导骗出来。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create({ trusted: false });

    preview.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('默认判据下合成事件同样不算「用户选过」（不靠注入的缝）', async () => {
    // 上面那条用了注入的 isTrustedEvent；这条用**生产默认**（读真实
    // event.isTrusted）—— jsdom 里合成事件的 isTrusted 恒为 false，
    // 于是它必须被拒掉。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);

    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
    });
    hint.start();

    preview.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });
});

/**
 * P0：唯一一次引导机会不能被「用户根本看不到的视频」烧掉。
 *
 * 原缺陷：`isDecorativeAutoplay()` 只看「autoplay 且没有 controls」，
 * **可见性从不参与判断**；`reveal()` 一旦显示就立刻 `markShown()`。
 * 于是页面上任何一个不可见的自动播放视频都会把用户这辈子唯一的一次
 * 引导消耗掉 —— 而他真正打开 YouTube 观看页时，提示再也没出现。
 */
describe('FirstRunHint：看不见的视频不消耗那唯一一次机会', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let recordFailedAttempt: Mock<[], Promise<void>>;
  let tooManyFailedAttempts: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint | undefined;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      tooManyFailedAttempts,
    });
    hint.start();
    await settle();
    return hint;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
    recordFailedAttempt = vi.fn(async (): Promise<void> => {});
    tooManyFailedAttempts = vi.fn(async (): Promise<boolean> => false);
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('display:none 的自动播放视频：提示不出现，flag 也不写', async () => {
    const hidden = makeHidden(createDecorativePreview());
    document.body.appendChild(hidden);
    await create();

    hidden.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(10_000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('滚出视口的视频：提示不出现，flag 也不写', async () => {
    const offscreen = makeOffScreen(createVideo());
    document.body.appendChild(offscreen);
    await create();

    offscreen.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(10_000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('看不见的视频之后，同页真正可见的视频仍然能触发引导', async () => {
    const hidden = makeHidden(createVideo());
    const visible = makeVisible(createVideo());
    document.body.append(hidden, visible);
    await create();

    hidden.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(5000);
    expect(isVisible()).toBe(false);

    visible.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });
});

/**
 * P0 的另一半：flag 的落盘判据是「用户读过了」，不是「弹出来了」。
 */
describe('FirstRunHint：flag 只在用户真的读过之后才落盘', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let recordFailedAttempt: Mock<[], Promise<void>>;
  let tooManyFailedAttempts: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint | undefined;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      tooManyFailedAttempts,
    });
    hint.start();
    await settle();
    return hint;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
    recordFailedAttempt = vi.fn(async (): Promise<void> => {});
    tooManyFailedAttempts = vi.fn(async (): Promise<boolean> => false);
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('提示刚弹出来时 flag 还没写', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(WATCH_DELAY);

    expect(isVisible()).toBe(true);
    // ⚠️ 核心断言：弹出来 ≠ 用户读过了。
    expect(markShown).not.toHaveBeenCalled();
  });

  it('用户一直没打断：读够之后才写 flag', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(SHOWN_AT);

    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('用户立刻按了键打断：flag 不写，并记一次失败', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // 用户马上按了个键 —— 提示被关掉，他多半没读完。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    vi.advanceTimersByTime(READ_DELAY * 2);

    expect(markShown).not.toHaveBeenCalled();
    expect(recordFailedAttempt).toHaveBeenCalledTimes(1);
  });

  it('连续失败超过上限后不再提示，而且 flag 始终不写', async () => {
    tooManyFailedAttempts = vi.fn(async (): Promise<boolean> => true);
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(10_000);

    // ⚠️ 兜底：失败太多次就不再打扰，但**不写** flag ——
    // 那个 flag 是「一辈子只提示一次」的一次性开关，
    // 用户没真看到就不该消耗掉。
    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });
});

/**
 * P0 的第三重：连续失败之后不再打扰，但**机会还在**。
 *
 * 这一条走的是**生产接线**（createFirstRunHint）：失败计数真的写进
 * storage.local，超过上限就闭嘴 —— 而「一辈子只提示一次」那个 flag
 * 始终不写。用户清掉本地数据、换台设备，仍会有下一次机会。
 *
 * ⚠️ 前面那些用例都把 recordFailedAttempt / tooManyFailedAttempts 注入成 mock，
 * 守的是「类」的行为；这一条守的是「接线」：mock 注入的那条缝
 * 本身也可能被写错（比如把上限写成 0）。
 */
describe('FirstRunHint：连续失败之后不再打扰，但机会还在', () => {
  const STORAGE_LOCAL_KEYS = ['vsc-first-run-hint-shown', 'vsc-first-run-hint-failed-attempts'];

  let shortcuts: ShortcutSettings;
  let storage: Record<string, unknown>;
  let hint: FirstRunHint | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    storage = {};

    // 一份最小的 storage.local 内存实现：跟真实的 chrome.storage.local
    // 一样是「回调 + lastError」的形状。
    (globalThis as Record<string, unknown>).chrome = {
      runtime: { lastError: null },
      storage: {
        local: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) =>
            callback(key in storage ? { [key]: storage[key] } : {}),
          set: (value: Record<string, unknown>, callback?: () => void) => {
            Object.assign(storage, value);
            callback?.();
          },
          remove: (key: string, callback?: () => void) => {
            delete storage[key];
            callback?.();
          },
        },
      },
    };
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    (globalThis as Record<string, unknown>).chrome = undefined;
    vi.useRealTimers();
  });

  /** 跑一轮「视频播起来 → 提示出现 → 用户马上按了个键打断」。 */
  const interruptedRound = async (video: HTMLVideoElement) => {
    hint = createFirstRunHint(() => shortcuts);
    hint.start();
    await settle();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(WATCH_DELAY);
    const appeared = isVisible();

    // 用户马上按了个键：提示被关掉，他多半没读完。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    vi.advanceTimersByTime(READ_DELAY * 2);
    await settle();

    hint.destroy();
    hint = undefined;

    return appeared;
  };

  it('失败次数累加，且「一辈子只提示一次」的 flag 始终不写', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);

    const appeared = await interruptedRound(video);
    expect(appeared).toBe(true);

    expect(storage['vsc-first-run-hint-failed-attempts']).toBe(1);
    // ⚠️ 核心断言：用户没读成就被打断，**不能**因此消耗掉那唯一一次机会。
    expect(storage['vsc-first-run-hint-shown']).toBeUndefined();
    expect(STORAGE_LOCAL_KEYS).toContain('vsc-first-run-hint-failed-attempts');
  });

  it('连续失败到上限之后不再提示，但 flag 仍然不写', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);

    // 连续三轮都被打断。
    await interruptedRound(video);
    await interruptedRound(video);
    await interruptedRound(video);
    expect(storage['vsc-first-run-hint-failed-attempts']).toBe(3);

    // 第四轮：不再打扰。
    const appeared = await interruptedRound(video);
    expect(appeared).toBe(false);

    // ⚠️ 关键：机会还在 —— flag 没写。
    // 用户清掉本地数据、换台设备，下一次仍然会得到一次提示。
    expect(storage['vsc-first-run-hint-shown']).toBeUndefined();
  });
});

/**
 * P2-13：等待窗口期里按的键不该把整轮等待取消掉。
 */
describe('FirstRunHint：窗口期里的按键不取消等待', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let hint: FirstRunHint | undefined;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
    });
    hint.start();
    await settle();
    return hint;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('播放后 0.9 秒按一个键，提示仍然会出现', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(900);

    // 用户按了个键（多半是想用某个快捷键）。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));

    // ⚠️ 之前 dismiss() 把等待计时器一起清了 —— 提示再也不出现，
    // 用户第一次使用就「什么都没看到」。
    vi.advanceTimersByTime(WATCH_DELAY);
    expect(isVisible()).toBe(true);
  });

  it('视频在等待期里暂停：那一轮等待仍然作废', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(900);
    // 暂停是「用户不看了」的信号，与「按了个键」不是一回事。
    video.dispatchEvent(new Event('pause', { bubbles: true }));
    vi.advanceTimersByTime(WATCH_DELAY);

    expect(isVisible()).toBe(false);
  });
});

/**
 * P2-14：shadow DOM 里的视频也要能触发引导。
 */
describe('FirstRunHint：shadow DOM 里的视频', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let hint: FirstRunHint | undefined;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
    });
    hint.start();
    await settle();
    return hint;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('事件 target 被重定向到宿主时，仍能认出真正的视频', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const video = makeVisible(createVideo());
    shadow.appendChild(video);

    await create();

    // composed 事件跨 shadow 边界时，document 上的 event.target 是**宿主**，
    // 只有 composedPath()[0] 才是那个 video。
    video.dispatchEvent(new Event('play', { bubbles: true, composed: true }));
    vi.advanceTimersByTime(WATCH_DELAY);

    expect(isVisible()).toBe(true);
  });
});

/**
 * P2-12：引导不能压住站点的顶栏。
 */
describe('FirstRunHint：面板位置', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let hint: FirstRunHint | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('贴在右下角，不占顶栏那条带子', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);

    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
    });
    hint.start();
    await settle();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(WATCH_DELAY);

    const node = hintNode() as HTMLElement | null;
    expect(node).not.toBeNull();

    // 之前是 `top: 18px; left: 50%` —— 正好压在站点顶栏（搜索框）上。
    expect(node?.style.top).toBe('auto');
    expect(node?.style.bottom).toBe('16px');
    expect(node?.style.left).toBe('auto');
    expect(node?.style.right).toBe('16px');
  });
});
