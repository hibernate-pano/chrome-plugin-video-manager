import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { buildGuideText, FirstRunHint } from './firstRunHint';
import { DEFAULT_SHORTCUTS, type ShortcutSettings } from '../shared/types';

// jsdom 的 location.hostname 是 [LegacyUnforgeable]，无法重定义；
// 这里只把"hostname 从哪来"换成可变变量，选择器链仍走真实的 siteAdapters。
const adapterHost = vi.hoisted(() => ({ hostname: 'localhost' }));
vi.mock('./siteAdapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./siteAdapters')>();
  return { ...actual, getSiteAdapter: () => actual.getSiteAdapter(adapterHost.hostname) };
});

const HINT_ID = 'vsc-first-run-hint';

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

const hintNode = () => document.getElementById(HINT_ID);
const isVisible = () => hintNode()?.classList.contains('vsc-visible') ?? false;

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
    // 两个动作之间要有可见间隔：HTML 会折叠连续空格，靠空格排版会挤成一团。
    expect(text).toContain('  ·  ');
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
    const original = (globalThis as Record<string, unknown>).chrome;
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
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });
});

describe('FirstRunHint', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let hint: FirstRunHint;

  const start = async (video: HTMLVideoElement) => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
    });
    hint.start();
    await Promise.resolve();
    await Promise.resolve();
    video.dispatchEvent(new Event('play', { bubbles: true }));
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
    vi.useRealTimers();
  });

  it('shows nothing until the video has actually been watched for a while', async () => {
    const video = createVideo();
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
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    expect(markShown).toHaveBeenCalledTimes(1);

    // 同一页面里再次播放（切集、重播）不该再弹一次。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('stays silent forever once the flag is set', async () => {
    wasShown = vi.fn(async (): Promise<boolean> => true);
    const video = createVideo();
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
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(5000);

    expect(isVisible()).toBe(false);
  });

  it('stays silent when the user pauses during the wait', async () => {
    const video = createVideo();
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
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);

    video.dispatchEvent(new Event('ended', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
  });

  it('gives a paused video the full wait again after it resumes', async () => {
    const video = createVideo();
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
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);

    video.remove();
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('does not mark itself shown when all the actions it would teach are disabled', async () => {
    shortcuts = createShortcuts({ fullscreen: '', increaseSpeed: '', decreaseSpeed: '' });
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    // 什么都没显示出来，就不该消耗掉这一次引导——用户改回绑定后仍应看到。
    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('disappears as soon as the user starts operating the extension', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    expect(isVisible()).toBe(false);
  });

  it('disappears on a click too', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);

    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(isVisible()).toBe(false);
  });

  it('fades out on its own instead of staying on screen', async () => {
    const video = createVideo();
    document.body.appendChild(video);
    await start(video);
    vi.advanceTimersByTime(2600);
    expect(isVisible()).toBe(true);

    vi.advanceTimersByTime(12000);
    expect(isVisible()).toBe(false);
  });

  it('leaves no trace after destroy', async () => {
    const video = createVideo();
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
    await Promise.resolve();
    await Promise.resolve();
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
    const preview = createDecorativePreview();
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
    const preview = createDecorativePreview();
    document.body.appendChild(preview);
    await create();

    preview.dispatchEvent(new Event('play', { bubbles: true }));
    // 播满 30 秒：原来 2.5 秒就弹了。
    vi.advanceTimersByTime(30_000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('装饰性预览不触发引导之后，同页真正的视频仍然能触发', async () => {
    const preview = createDecorativePreview();
    const player = createVideo();
    document.body.append(preview, player);
    await create();

    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(5000);
    expect(isVisible()).toBe(false);

    // 用户后来打开了真正的网课视频 —— 引导必须照常出现。
    player.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('有原生 controls 的自动播放视频仍然会触发引导', async () => {
    // 有 controls = 站点把它当成一个正经播放器给人用，不是装饰物。
    // 这条视频**故意**同时带 autoplay —— 它与装饰预览只差一个 controls 属性。
    const player = createVideo();
    player.setAttribute('autoplay', '');
    player.setAttribute('controls', '');
    document.body.appendChild(player);
    await create();

    player.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('站点点名的主播放器（YouTube 那样）即使自动播也会触发引导', async () => {
    // YouTube 的主播放器恰恰就是静音自动播的（浏览器只允许静音自动播），
    // 而它的 <video> 上**没有**原生 controls —— 形状与装饰预览一模一样。
    // 没有这条豁免，引导在 YouTube 上永远不出现。
    adapterHost.hostname = 'www.youtube.com';

    const main = createVideo();
    main.className = 'html5-main-video';
    main.setAttribute('autoplay', '');
    document.body.appendChild(main);
    await create();

    main.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('用户亲手点过预览之后，它就不再是「装饰的」—— 引导可以出现', async () => {
    // 用户点了 = 用户主动选了它 = 那可能正是他要看的视频。
    // 这条视频仍然是 autoplay + 无 controls（形状没变），变的是「用户选过」。
    const preview = createDecorativePreview();
    document.body.appendChild(preview);
    await create();

    userClicks(preview);
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(2600);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('用户点的预览已经在播（不再派发 play）时，点它也能触发引导', async () => {
    // ⚠️ 这条是「用户点过」这条路径**唯一**能触发的场景：
    // 自动播的预览在用户点它之前就已经在播了，它不会因为用户的点击
    // 再派发一次 play 事件。只靠 play 事件的话，用户点了预览之后
    // 引导永远不会来 —— 而他明明已经「开始看视频」了。
    const preview = createDecorativePreview();
    document.body.appendChild(preview);
    await create();

    // 站点先让它自动播起来（被装饰判据挡掉，不排计时器）。
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(isVisible()).toBe(false);

    // 用户点了它 —— 站点没有再派发 play（它本来就在播）。
    userClicks(preview);
    vi.advanceTimersByTime(2600);

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
    const preview = createDecorativePreview();
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
    const chosen = createDecorativePreview();
    const preview = createDecorativePreview();
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
    const preview = createDecorativePreview();
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

  it('页面伪造的 pointerdown 不能把装饰预览伪装成「用户选过」', async () => {
    // 安全边界：扩展在 document_start 抢注捕获阶段监听器，页面脚本能
    // dispatchEvent(new PointerEvent('pointerdown')) 打在自己的视频上。
    // 若不挡这一条，页面等于拿到了遥控器：随时把引导骗出来。
    const preview = createDecorativePreview();
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
    const preview = createDecorativePreview();
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
