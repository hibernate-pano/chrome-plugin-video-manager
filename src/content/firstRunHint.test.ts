import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGuideText, createFirstRunHint, createStorageClaimBroker, FirstRunHint, readWindowMs, type HintClaimBroker, CLAIM_SETTLE_MS } from './firstRunHint';
import { NOTICE_CARD_TOKENS } from './runtimeStyles';
import { VideoRegistry } from './videoRegistry';
import { DEFAULT_SHORTCUTS, FIRST_RUN_HINT_KEY, type ShortcutSettings } from '../shared/types';

// jsdom 的 location.hostname 是 [LegacyUnforgeable]，无法重定义；
// 这里只把"hostname 从哪来"换成可变变量，选择器链仍走真实的 siteAdapters。
const adapterHost = vi.hoisted(() => ({ hostname: 'localhost' }));
vi.mock('./siteAdapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./siteAdapters')>();
  return { ...actual, getSiteAdapter: () => actual.getSiteAdapter(adapterHost.hostname) };
});

/**
 * 把「我是不是顶层文档」永远答成 false —— 也就是**嵌在 iframe 里的那个 frame**。
 *
 * ⚠️ jsdom 的 `window.top` 是 non-configurable 的（改不了），所以只能把
 * `isTopDocument` 换掉 —— 而那正是「只有顶层才能弹引导」那条限制的入口。
 *
 * 现在引导**不再**问这个问题（视频在哪个 frame，引导就该在哪个 frame 弹），
 * 所以这个 mock 只是**回归守卫**：哪天有人又把顶层限制加回来，
 * 「iframe 里的 frame 也能弹引导」那条用例会立刻变红。
 */
vi.mock('./frameScope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./frameScope')>();
  return { ...actual, isTopDocument: () => false };
});

const HINT_ID = 'vsc-first-run-hint';

/** 提示出现的时间点（播放满 2.5 秒）。 */
const WATCH_DELAY = 2500;
/**
 * 「用户读过了」的判据时长：提示出现后还要再等这么久。
 *
 * ⚠️ 它**按行数**算，而行数由**真实文案**决定 —— 所以这里**不能写死数字**。
 *
 * 原来这里写死着 4000ms（= 4 行 × 1000ms）。后来引导多了一行（教复位），
 * 真实窗口变成 5000ms，而测试还按 4000ms 走 —— 于是「读够了」的判据
 * 比用户实际要读的字数**短了一行**，那条用例当场变红。
 *
 * 更糟的是它**红得莫名其妙**：失败信息说的是「spy 没被调用」，
 * 而根因是「文案多了一行」。写死的数字把「文案长度」这个真实变量
 * 藏了起来。
 *
 * 现在从**生产代码自己**推：readWindowMs 是唯一说了算的地方，
 * 测试直接用它算，于是文案怎么变，测试都跟着变。
 */
const createShortcuts = (overrides: Partial<ShortcutSettings> = {}): ShortcutSettings => ({
  ...DEFAULT_SHORTCUTS,
  ...overrides,
});

/**
 * 完整版引导的真实文案，以及由它推出的阅读窗口。
 *
 * ⚠️ 必须放在 createShortcuts **之后**：const 不会 hoist，
 * 声明在前会撞 TDZ（ReferenceError），而不是「拿到 undefined」。
 */
const FULL_GUIDE_TEXT = buildGuideText(createShortcuts()) ?? '';
const READ_DELAY = readWindowMs(FULL_GUIDE_TEXT);
/** flag 落盘的时间点：出现 + 读完。 */
const SHOWN_AT = WATCH_DELAY + READ_DELAY;

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
 * 把 CSS 的 `padding` **简写**展开成四条长写值。
 *
 * ⚠️ 为什么测试里要自己展开：断言必须与 **token** 对得上，
 * 而 token 里写的是简写（'10px 16px'）。把 '10px' / '16px' 写死在断言里的话，
 * token 一改它就红 —— 而红的时候看不出该改哪里（是 token 变了，
 * 还是断言过期了？）。从 token 推导就没有这个歧义。
 */
const expandPadding = (shorthand: string) => {
  const parts = shorthand.trim().split(/\s+/);
  const [top, right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left };
};

/**
 * 一把测试用的认领锁：**跨实例共享**，模拟「同一个标签页里的两个 frame」。
 *
 * ⚠️ 生产实现靠扩展存储（chrome.storage.local）跨 frame 协调；jsdom 里既没有
 * chrome 也没有第二个 document，所以这里用一把内存锁把两个运行时接起来。
 */
const makeTestClaimBroker = () => {
  let owner: string | null = null;

  return {
    start: () => {},
    // ⚠️ 认领是**异步**的（生产实现要写后读回，见 createStorageClaimBroker），
    // 所以这里也返回 Promise —— 接口是异步的，注入的实现不能偷偷同步。
    tryClaim: async (candidate: string) => {
      if (owner !== null) {
        return false;
      }

      owner = candidate;
      return true;
    },
    release: (candidate: string) => {
      if (owner === candidate) {
        owner = null;
      }
    },
    dispose: () => {},
  };
};

/**
 * 等「能不能提示」这个异步判断落地。
 *
 * 判定要读两次异步存储（展示过没有 + 失败次数），**认领**还要写后读回
 * （一次读 + 一次写 + 一次读），所以要排空十几轮微任务。
 * 排空之前 `eligible` 还是 null，reveal() 会自己去查 —— 而那次查询排在
 * 计时器之后，断言就永远赶不上提示出现。
 */
const settle = async () => {
  for (let i = 0; i < 24; i += 1) {
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
    // ⚠️ 调速那行必须带**方向**：原来只写「= / -」，
    // 用户分不清哪个是加速、哪个是减速。
    expect(text).toContain('= 加快');
    expect(text).toContain('- 减慢');
    // 断言动作名本身：i18n 键名写错时会把**键名**渲染给用户（曾经就把
    // "fullscreen" 当动作名显示了出来），只断言键位是抓不到的。
    expect(text).toContain('网页全屏');
    expect(text).not.toContain('fullscreen');
    expect(text).toContain('调速');
    // 动作名与键之间要有可见的间隔符：「调速 · …」而不是「调速…」。
    expect(text).toContain('·');
  });

  it('says the fullscreen key **toggles**（设置页与引导对同一个键的说法必须一致）', () => {
    const text = buildGuideText(createShortcuts()) ?? '';

    // 设置页原来写的是「进入或退出网页全屏」，引导原来只写「网页全屏」——
    // 用户读到那儿根本不知道按下去会发生什么。
    expect(text).toContain('切换网页全屏');
    expect(text).toContain('按 f 切换网页全屏');
  });

  it('renders the user\'s own bindings instead of the defaults', () => {
    const text = buildGuideText(
      createShortcuts({ fullscreen: 'q', increaseSpeed: ']', decreaseSpeed: '[' }),
    );

    // 照默认值写死的提示会教用户按一个已经改掉的键。
    expect(text).toContain('按 q 切换网页全屏');
    expect(text).toContain('] 加快');
    expect(text).toContain('[ 减慢');
    expect(text).not.toContain('= 加快');
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

    // 「全屏控制条里能用鼠标点倍速档位」此前只写在 README 与商店文案里，
    // 产品内一处都没有。
    //
    // ⚠️ 原来这一行守的是「点扩展图标可切换网页全屏」，2026-10-22 换掉了：
    // 那一行与同一张卡片里的「按 f 切换网页全屏」是**同一个动作**
    // （同一个 TOGGLE_FULLSCREEN_MESSAGE，见 background/index.ts:22），
    // 两行讲同一件事就是浪费一行版面。
    // 而「鼠标点倍速档位」是**别处没有**的事实：它是这个产品**唯一**
    // 能用鼠标**精确**选倍速的地方（按 = 只能一档一档按，要 1.5x 得按 5 次），
    // 而且倍速菜单只存在于全屏控制条里（FullscreenControls 只在 enter() 里创建）。
    expect(text).toContain('鼠标点选倍速档位');
    // 「改绑的入口」同理。
    expect(text).toContain('改绑');
  });

  /**
   * 引导**必须**教「怎么回到 1x」。
   *
   * ⚠️ 这不是「多教一条更好」，而是**只有这一条路**：
   * - 调速胶囊与角标都是 pointer-events: none（故意不挡用户点视频）→ 点不动；
   * - 倍速档位菜单只存在于全屏控制条里（FullscreenControls 在 enter() 时
   *   创建、退出时 unmount）→ 不进全屏就够不着；
   * - manifest 里没有 contextMenus 权限 → 没有右键菜单。
   *
   * 于是「按几下 = 觉得太快」的用户，唯一能回到 1x 的办法是**自己猜**
   * 「大概有个键能复位」。而引导是这个产品**全部**的可见入口、
   * 唯一一次教学机会 —— 不教复位，用户就永远卡在 2x 上。
   */
  it('教用户怎么回到 1x（全屏之外没有别的出口）', () => {
    const text = buildGuideText(createShortcuts()) ?? '';

    expect(text).toContain('回到 1x');
    // ⚠️ 而且要教**真实的键** —— 默认绑定是 0。
    expect(text).toContain('0');
  });

  /**
   * 复位必须**并进调速那一行**，不能另起一行。
   *
   * ⚠️ 理由是「完整版 4 行 / 精简版 2 行」这个数字是**承重不变式**：
   * 阅读窗口（readWindowMs）、小视口里的高度预算（240×135 的框放不下 4 行）、
   * runtimeStyles 里「卡片 4 行」的注释、以及测试里 130px 的高度桩
   * **全都锁在它上面**。多一行就要同时改掉这一串，而它们互相锁死：
   * 少一行 → 阅读窗口算短；多一行 → 小视口里盖住播放器。
   *
   * ⚠️ 实测（真实 Chromium）：并进去之后完整版仍是 4 行、精简版仍是 2 行。
   */
  it('复位并进调速那一行，不占额外版面', () => {
    const text = buildGuideText(createShortcuts()) ?? '';
    const lines = text.split('\n');

    // 调速与复位必须在**同一行**里。
    const speedLine = lines.find((line) => line.includes('加快'));
    expect(speedLine, '引导里应该有调速那一行').toBeTruthy();
    expect(speedLine).toContain('回到 1x');

    // ⚠️ 而且完整版就是 **4 行**：两行动作（调速+全屏）+ 工具栏 + 改绑入口。
    // 这条断言守的是「别再随手加一行」—— 加之前先问：版面预算够吗？
    expect(lines).toHaveLength(4);
  });

  /**
   * 调速排在全屏**前面**。
   *
   * ⚠️ 两条理由：
   * 1. 产品叫「Video Speed Controller」——名字里第一个词就是 Speed，
   *    扩展图标画的也是加速符号。第一行必须是产品**最核心**的动作。
   * 2. 设置页的快捷键表顺序是「调速 → 播放控制 → 全屏」（见 types.ts 的
   *    ACTION_LIST）—— 引导与设置页对同一个产品说了两个不同的顺序。
   */
  it('调速排在全屏前面（与设置页的顺序一致）', () => {
    const text = buildGuideText(createShortcuts()) ?? '';
    const lines = text.split('\n');

    const speedIndex = lines.findIndex((line) => line.includes('加快'));
    const fullscreenIndex = lines.findIndex((line) => line.includes('全屏'));

    expect(speedIndex).toBeGreaterThanOrEqual(0);
    expect(fullscreenIndex).toBeGreaterThanOrEqual(0);
    expect(speedIndex, '调速必须是第一行').toBe(0);
    expect(speedIndex).toBeLessThan(fullscreenIndex);
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
   * 英文引导的第二行必须与第一行**同构**：「动作名 · 键」。
   *
   * 旧文案是 "$1 / $2 to change speed"，拼出来是 "= / - to change speed" ——
   * 半句话：键名甩在前面，句子从中间才开始。而同一份文案的第一行是
   * "Page fullscreen · f"，两行结构不一致，用户读第二行时得重新学一遍语法。
   */
  it('英文引导的第二行与第一行同构：动作名 · 键', () => {
    withEnglishMessages(() => {
      const text = buildGuideText(createShortcuts()) ?? '';

      expect(text).toContain('Press f to toggle page fullscreen');
      expect(text).toContain('Speed · = faster / - slower');
      // 旧写法：键名甩在前面，句子从中间开始。
      expect(text).not.toContain('= / - to change speed');
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
          '调速 · $1 加快 / $2 减慢'
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
      expect(text).toContain('= 加快');
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
  let isInCooldown: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint;

  const start = async (video: HTMLVideoElement) => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      isInCooldown,
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
    isInCooldown = vi.fn(async (): Promise<boolean> => false);
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
    await vi.advanceTimersByTimeAsync(2000);
    expect(isVisible()).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    expect(isVisible()).toBe(true);
    expect(hintNode()?.textContent).toContain('f');
  });

  it('records that it was shown, exactly once', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

    expect(markShown).toHaveBeenCalledTimes(1);

    // 同一页面里再次播放（切集、重播）不该再弹一次。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('stays silent forever once the flag is set', async () => {
    wasShown = vi.fn(async (): Promise<boolean> => true);
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(5000);

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
    await vi.advanceTimersByTimeAsync(5000);

    expect(isVisible()).toBe(false);
  });

  it('stays silent when the user pauses during the wait', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    // 等 2.5 秒的窗口里用户按了暂停：这时弹提示是在打断他。
    // 判定必须靠真实的 pause 事件，而不是去读 video.paused 的状态快照。
    video.dispatchEvent(new Event('pause', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('stays silent when the video ends during the wait', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    video.dispatchEvent(new Event('ended', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(2600);

    expect(isVisible()).toBe(false);
  });

  it('gives a paused video the full wait again after it resumes', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    video.dispatchEvent(new Event('pause', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(2600);
    expect(isVisible()).toBe(false);

    // 恢复播放后重新计时，而不是因为「已经等过一次」就永久放弃。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(2600);
    expect(isVisible()).toBe(true);
  });

  it('补记：视频在我们挂上监听器之前就已经在播 → 引导照样出现', async () => {
    // ⚠️ 这是**真实发生过的**竞态：扩展注入在 document_start，
    // 但要等设置加载完才挂上 `play` 监听器；页面脚本在这中间调了
    // `video.play()`，那次事件我们根本没听见 —— 引导于是**永远不出现**。
    //
    // 最深的地方在于它咬得最狠的时候正是引导最该出现的时候：
    // 首次安装时扩展是**冷的**，而「打开课程页、视频自动开始播」
    // 正是最典型的首见场景 —— 越是新用户越看不到这条引导。
    const video = makeVisible(createVideo());
    document.body.appendChild(video);

    // 关键：此刻它**已经在播**，而且**不会**再有 play 事件。
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false });

    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      isInCooldown,
    });
    hint.start();
    await settle();

    // 没有 play 事件可听 —— 唯一的入口是「补记」。
    await vi.advanceTimersByTimeAsync(2600);
    expect(
      isVisible(),
      '视频在我们开始监听之前就已经在播 → 引导必须照样出现（否则用户永远不知道这个扩展会做什么）',
    ).toBe(true);
  });

  it('补记：装饰性自动播放的视频不打扰（补记不是「见视频就弹」）', async () => {
    const video = makeVisible(createDecorativePreview());
    document.body.appendChild(video);
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false });

    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      isInCooldown,
    });
    hint.start();
    await settle();

    await vi.advanceTimersByTimeAsync(2600);
    expect(
      isVisible(),
      '文章里那种边滚动边播的小预览不该被引导打扰 —— 判据与 play 事件那条完全一致',
    ).toBe(false);
  });

  it('stays silent when the video left the document during the wait', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);

    video.remove();
    await vi.advanceTimersByTimeAsync(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('does not mark itself shown when all the actions it would teach are disabled', async () => {
    shortcuts = createShortcuts({ fullscreen: '', increaseSpeed: '', decreaseSpeed: '' });
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);

    // 什么都没显示出来，就不该消耗掉这一次引导——用户改回绑定后仍应看到。
    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('disappears as soon as the user starts operating the extension', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);
    expect(isVisible()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    expect(isVisible()).toBe(false);
  });

  it('页面上的误点在阅读窗口之内**只算忽略**（连提示都不关）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);
    expect(isVisible()).toBe(true);

    // ⚠️ 用户刚看到提示冒出来，随手点了页面（点视频、点按钮）。
    // 原来这里会把提示关掉**并记一次失败** —— 三次误点就闭嘴一星期，
    // 而引导是全键盘界面下唯一的入口。
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(isVisible(), '阅读窗口之内的误点不该把提示关掉').toBe(true);
  });

  it('fades out on its own instead of staying on screen', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);
    expect(isVisible()).toBe(true);

    await vi.advanceTimersByTimeAsync(12000);
    expect(isVisible()).toBe(false);
  });

  it('leaves no trace after destroy', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);
    expect(hintNode()).not.toBeNull();

    hint.destroy();

    expect(hintNode()).toBeNull();
    // 销毁后既不能再弹，也不能留下定时器（jsdom 会对残留定时器报错）。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    expect(() => {
      vi.advanceTimersByTime(20000);
    }).not.toThrow();
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
    await vi.advanceTimersByTimeAsync(5000);

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
    await vi.advanceTimersByTimeAsync(30_000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('装饰性预览不触发引导之后，同页真正的视频仍然能触发', async () => {
    const preview = makeVisible(createDecorativePreview());
    const player = makeVisible(createVideo());
    document.body.append(preview, player);
    await create();

    preview.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(isVisible()).toBe(false);

    // 用户后来打开了真正的网课视频 —— 引导必须照常出现。
    player.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

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
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

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
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('页面把 matches 改坏时：判定退化，而不是让这一轮引导崩掉', async () => {
    // ⚠️ 页面可以把 `Element.prototype.matches` 换成会抛异常的版本。
    //
    // 「站点有没有点名它是主播放器」这条判据在装饰性判定的**核心路径**上
    // （每次判定都要先问一遍），它一抛，`handlePlay` 就崩 ——
    // 计时器根本没排上，引导永远不出现，而用户什么都看不出来。
    //
    // 所以它走的是**同一份**带 try/catch 的匹配器：判不出来就当「不匹配」
    // （只少一条豁免，不崩）。这条用例守的就是那份 try/catch 还在。
    //
    // ⚠️ 为什么这条视频**又**是主播放器、**又**带原生 controls：
    // - 「是主播放器」→ 站点适配器真的有 mainSelectors → `matches` **真的被调到**
    //   （通用站点的 mainSelectors 是空的，`.some()` 根本不会回调，
    //   于是那份 try/catch 永远走不到 —— 那样这条用例就成了假守卫）；
    // - 「带 controls」→ 就算主播放器豁免因退化而失效，它仍然**不是装饰物** →
    //   引导照样该出现。
    // 于是「退化」与「抛异常」的结果**不一样**：退化 → 引导出现；
    // 抛异常 → handlePlay 崩掉 → 引导永远不出现。
    adapterHost.hostname = 'www.youtube.com';

    const player = makeVisible(createVideo());
    player.className = 'html5-main-video';
    player.setAttribute('autoplay', '');
    player.setAttribute('controls', '');
    document.body.appendChild(player);
    await create();

    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'matches');
    Object.defineProperty(Element.prototype, 'matches', {
      value: () => {
        throw new Error('页面把 matches 改坏了');
      },
      configurable: true,
      writable: true,
    });

    try {
      player.dispatchEvent(new Event('play', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(SHOWN_AT);

      expect(isVisible(), '判定退化之后，引导照样要为内容视频出现').toBe(true);
      expect(markShown).toHaveBeenCalledTimes(1);
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, 'matches', original);
      }
    }
  });

  it('用户亲手点过预览之后，它就不再是「装饰的」—— 引导可以出现', async () => {
    // 用户点了 = 用户主动选了它 = 那可能正是他要看的视频。
    // 这条视频仍然是 autoplay + 无 controls（形状没变），变的是「用户选过」。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    userClicks(preview);
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

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
    await vi.advanceTimersByTimeAsync(1000);
    expect(isVisible()).toBe(false);

    // 用户点了它 —— 站点没有再派发 play（它本来就在播）。
    userClicks(preview);
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

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
    await vi.advanceTimersByTimeAsync(2600);

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
    await vi.advanceTimersByTimeAsync(2600);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('用户碰过的视频**永远**不是装饰物（与 registry 的 wasEverTouched 同一份语义）', async () => {
    // ⚠️ 「用户碰过」与「用户选过（10 秒窗口）」是**两件事**，不能混：
    // - 10 秒窗口管的是「**接管**能不能抢空格」—— 抢按键的授权，越短越安全；
    // - 「是不是装饰物」管的是「站点摆在那儿的装饰」—— 只要用户碰过一次，
    //   它就不是装饰了，哪怕那次点击只是想把它按停。
    //
    // ⚠️ 兜底路径若在这里用短窗口，就会比 registry **更早**地把视频判成装饰物 ——
    // 于是「接管了（对的），引导却永远不出现（错的）」，
    // 正是本轮要消灭的那种**相反**结论。详见 firstRunHint.ts 的
    // isDecorativeAutoplay 里逐条的对照。
    const preview = makeVisible(createDecorativePreview());
    document.body.appendChild(preview);
    await create();

    userClicks(preview);
    // 站点把预览暂停了：取消这一次的等待。
    preview.dispatchEvent(new Event('pause', { bubbles: true }));

    // 走过任何时间窗之后，站点又让预览自动播 —— 它仍然不是「装饰的」。
    await vi.advanceTimersByTimeAsync(60_000);
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
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
    await vi.advanceTimersByTimeAsync(2600);

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
    await vi.advanceTimersByTimeAsync(2600);

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
  let isInCooldown: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint | undefined;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      isInCooldown,
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
    isInCooldown = vi.fn(async (): Promise<boolean> => false);
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
    await vi.advanceTimersByTimeAsync(10_000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('滚出视口的视频：提示不出现，flag 也不写', async () => {
    const offscreen = makeOffScreen(createVideo());
    document.body.appendChild(offscreen);
    await create();

    offscreen.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(isVisible()).toBe(false);
    expect(markShown).not.toHaveBeenCalled();
  });

  it('看不见的视频之后，同页真正可见的视频仍然能触发引导', async () => {
    const hidden = makeHidden(createVideo());
    const visible = makeVisible(createVideo());
    document.body.append(hidden, visible);
    await create();

    hidden.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(isVisible()).toBe(false);

    visible.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

    expect(isVisible()).toBe(true);
    expect(markShown).toHaveBeenCalledTimes(1);
  });
});

/**
 * P0 的另一半：flag 的落盘判据是「用户读过了」，不是「弹出来了」。
 */
/**
 * 「已展示」的落盘判据：**显示的当下**。
 *
 * ⚠️ 6.2.0 之前是「读完才落盘」（阅读窗口走完才写）。那个判据有两个洞：
 * 1. 用户**没读完就关掉**引导 → 那个键**根本不存在** →
 *    设置页的「重新显示使用引导」执行 removeValue 时，
 *    **删一个不存在的键不触发 storage.onChanged**（实测：events 为空）→
 *    已经打开的标签页里的引导**不会回来**，而按钮当场显示「已重置」。
 * 2. 没读成的用户**每次都可能被重新提示**（键一直没落盘）：
 *    引导是这个产品唯一的可见入口，反复弹同一条说明是在浪费他的屏幕。
 *
 * 现在「显示过」就是「展示过」；「读完」仍然有意义 ——
 * 它管的是**失败计数**（读完了 = 他不是拒绝，计数清零）。
 */
describe('FirstRunHint：「已展示」在显示的当下就落盘', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let recordFailedAttempt: Mock<[], Promise<void>>;
  let resetFailedAttempts: Mock<[], Promise<void>>;
  let isInCooldown: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint | undefined;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      resetFailedAttempts,
      isInCooldown,
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
    resetFailedAttempts = vi.fn(async (): Promise<void> => {});
    isInCooldown = vi.fn(async (): Promise<boolean> => false);
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('提示一显示就写 flag（不再等「读完」）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

    expect(isVisible()).toBe(true);
    // ⚠️ 核心断言：**显示即落盘**。
    // 旧判据（读完才落盘）留了两个洞：设置页的「重新显示使用引导」
    // 删一个不存在的键不触发 storage.onChanged（按钮在撒谎），
    // 而没读成的用户每次都可能被重新提示。
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('阅读窗口按**行数**算：四行引导不能按两行的时间判「读过了」', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // ⚠️ 完整版引导是 4 行（调速 / 全屏 / 工具栏 / 去哪儿改绑）。
    // 原来的判据是**固定两秒**（注释写着「2 秒够读完两行短句」）——
    // 于是四行字只显示了它一半的时长就被判成「读过了」，
    // 而用户还在读第三行。
    //
    // ⚠️ 现在「读过」管的是**失败计数**（读完了 = 他不是拒绝，计数清零），
    // 所以这条用例盯的是 resetFailedAttempts，而不是 markShown。
    //
    // ⚠️ 时间**从真实文案推导**（READ_DELAY），不写死：
    // 写死的数字在引导多一行/少一行时会悄悄过期 ——
    // 那正是它一开始就该被发现的形状。
    await vi.advanceTimersByTimeAsync(READ_DELAY - 1000);
    expect(resetFailedAttempts, '四行引导不能按两行的时间判「读过了」').not.toHaveBeenCalled();

    // 再等一点 → 累计够四行的时间 → 算他读过了。
    await vi.advanceTimersByTimeAsync(1100);
    expect(resetFailedAttempts).toHaveBeenCalledTimes(1);
  });

  /**
   * 阅读窗口必须跟着**文案长度**走，不是一个固定数字。
   *
   * ⚠️ 这条守的是「换文案的人会记得改那个数字吗」——
   * 不会。所以窗口由 readWindowMs 统一算，而这条用例拿**不同长度的两版文案**
   * 去比：长的那版必须等更久。
   *
   * 原来这里是写死的 4000ms，于是引导多一行之后：
   * - 真实窗口变成 5000ms，测试还按 4000ms 走 →
   * - 「读够了」的判据比用户实际要读的字数**短了一行**，
   *   用户还在读最后一行，失败计数就被清零了。
   */
  it('阅读窗口随文案变长而变长', () => {
    const short = '一行';
    const long = '一行\n二行\n三行';

    expect(readWindowMs(long)).toBeGreaterThan(readWindowMs(short));
    // 每行 1000ms（中文；英文另有 1.5 倍系数，见 readWindowMs）。
    expect(readWindowMs(short)).toBe(1000);
    expect(readWindowMs(long)).toBe(3000);
  });

  it('用户一直没打断：读够之后清掉「连续关闭」的计数', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

    expect(markShown).toHaveBeenCalledTimes(1);
    expect(resetFailedAttempts).toHaveBeenCalledTimes(1);
  });

  it('阅读窗口之内的误点：不算失败，也不消耗那次机会', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // ⚠️ 用户在页面上随手点了一下（点视频、点按钮）。
    // 原来的判据是「读没读完」——而「读完」要到阅读窗口结束才成立，
    // 于是**头两秒里的每一次点击都被记成拒绝**：三次误点就闭嘴 7 天。
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(READ_DELAY * 2);

    expect(recordFailedAttempt, '误点不是拒绝').not.toHaveBeenCalled();
  });

  it('点引导自己的「×」：算一次拒绝（用户故意关掉它）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // ⚠️ 「×」是**唯一**的「我故意关掉它」的正路：
    // 引导节点是 pointer-events: none + aria-hidden，用户点不到它、
    // 选不中它，也没有第二个按钮可按 —— 于是拒绝只剩下「误点到页面」这一条路。
    const close = document.getElementById('vsc-first-run-hint-close') as HTMLButtonElement | null;
    expect(close, '引导必须有一个真正的关闭按钮').not.toBeNull();
    close!.click();
    await settle();

    expect(isVisible()).toBe(false);
    expect(recordFailedAttempt, '主动关掉引导 = 一次拒绝').toHaveBeenCalledTimes(1);
  });

  it('随手按一个键不算失败（碰键盘不是拒绝）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // 用户碰了一下键盘（多半是想用某个快捷键），没读完提示。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    await vi.advanceTimersByTimeAsync(READ_DELAY * 2);

    // ⚠️ 核心断言：**不记失败**。旧契约是「任何一次 keydown 都记一次失败」，
    // 于是按三下 Shift 就能把引导永久毁掉 —— 而引导是这个产品唯一的可见入口。
    expect(recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('按下扩展自己的快捷键算接受：不算失败，并立刻算「已读」', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // 按下扩展自己绑定的键（默认 increaseSpeed = '='）：
    // 用户接受了这个功能 —— 不是失败，而且他显然已经看到这条引导了。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
    await settle();

    expect(isVisible()).toBe(false);
    expect(recordFailedAttempt).not.toHaveBeenCalled();
    // ⚠️ 提示正显示着时按下扩展的键 → 「已展示」已经写过（显示时就写了），
    // 这里不再重复写 —— 写两次会让「落盘次数」这个断言变得没有意义。
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  /**
   * 导航键（Tab / 方向键 …）**不能**关掉引导。
   *
   * ⚠️ 这是一条真缺陷（2026-10-22 修），实测形状：
   * 键盘用户要把那个「×」关掉 → 必须先 **Tab 过去** →
   * 那次 Tab 落在页面的别的元素上 → 引导把按键当成「用户碰了一下键盘」
   * → 提示当场消失 → **那个按钮永远按不到**。
   *
   * 而那个「×」是「我故意关掉引导」的**唯一**正路
   * （引导节点本身是 pointer-events: none 且 aria-hidden，
   * 用户点不到它、也选不中它）。
   * 于是一个**专门为键盘用户准备的产品**，唯一的退出入口走不通。
   *
   * ⚠️ 所以判据不是「焦点在不在按钮上」，而是「这个键是不是在导航」。
   */
  it.each([
    ['Tab', 'Tab'],
    ['Shift+Tab', 'Tab'],
    ['ArrowDown', 'ArrowDown'],
    ['ArrowUp', 'ArrowUp'],
    ['ArrowLeft', 'ArrowLeft'],
    ['ArrowRight', 'ArrowRight'],
    ['Home', 'Home'],
    ['End', 'End'],
    ['PageUp', 'PageUp'],
    ['PageDown', 'PageDown'],
  ])('导航键 %s 不关掉引导', async (_label, key) => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(
      isVisible(),
      `${key} 是「在页面里移动焦点」，不是「我看完了要走」—— 引导不该消失`,
    ).toBe(true);
  });

  /**
   * 但 **Esc 仍然关掉**引导。
   *
   * ⚠️ 上一条不能变成「所有键都不关引导」：Esc 是用户表达
   * 「这东西我不要了」的标准动作，它必须继续关掉引导。
   */
  it('Esc 仍然关掉引导（导航键豁免不能扩大到 Esc）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(isVisible(), 'Esc 是「我不要了」的标准动作，必须照常关掉引导').toBe(false);
  });

  it('连续失败超过上限后不再提示，而且 flag 始终不写', async () => {
    isInCooldown = vi.fn(async (): Promise<boolean> => true);
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(10_000);

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
 * storage.local，超过上限就闭嘴。
 *
 * ⚠️ 6.2.0 变了落盘时机：「已展示」在**显示的当下**就写了
 * （不再是「读完才写」），所以「用户拒绝之后」那个标记必须**改回 false**
 * —— 否则引导**再也不会出现**（被「已展示」挡住），
 * 而设置页正写着「已关闭 N 次（再关闭 N 次将暂时不再出现）」。那是界面在撒谎。
 *
 * ⚠️ 改回 false 而不是**删掉**这个键：删一个不存在的键不触发
 * storage.onChanged → 设置页的「重新显示使用引导」会当场显示「已重置」，
 * 而已打开的标签页里的引导**不会回来**。键存在（哪怕值是 false）时，
 * 删除一定触发事件。
 *
 * ⚠️ 前面那些用例都把 recordFailedAttempt / isInCooldown 注入成 mock，
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

  /** 跑一轮「视频播起来 → 提示出现 → 用户主动关掉它（点 ×）」。 */
  const interruptedRound = async (video: HTMLVideoElement) => {
    hint = createFirstRunHint(() => shortcuts);
    hint.start();
    await settle();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    const appeared = isVisible();

    // ⚠️ 必须是**主动关掉**（点引导自己的「×」）：那才是拒绝。
    // （页面上误点一下不算 —— 见上面那条用例。）
    const close = document.getElementById('vsc-first-run-hint-close') as HTMLButtonElement | null;
    if (appeared) {
      expect(close, '引导必须有一个真正的关闭按钮').not.toBeNull();
      close!.click();
    }
    await vi.advanceTimersByTimeAsync(READ_DELAY * 2);
    await settle();

    hint.destroy();
    hint = undefined;

    return appeared;
  };

  it('失败次数累加，且「已展示」被改回 false（拒绝之后还有一次机会）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);

    const appeared = await interruptedRound(video);
    expect(appeared).toBe(true);

    expect(storage['vsc-first-run-hint-failed-attempts']).toBe(1);
    // ⚠️ 核心断言：用户拒绝之后，那个标记必须是 **false**（不是 true，
    // 也不是 undefined —— undefined 会让设置页的「重新显示使用引导」
    // 删一个不存在的键，不触发 storage.onChanged，引导叫不回来）。
    expect(storage['vsc-first-run-hint-shown']).toBe(false);
    expect(STORAGE_LOCAL_KEYS).toContain('vsc-first-run-hint-failed-attempts');
  });

  it('连续失败到上限之后不再提示，但冷却一过仍有机会', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);

    // 连续三轮都被打断。
    await interruptedRound(video);
    await interruptedRound(video);
    await interruptedRound(video);
    expect(storage['vsc-first-run-hint-failed-attempts']).toBe(3);

    // 第四轮：不再打扰（冷却期里）。
    const appeared = await interruptedRound(video);
    expect(appeared).toBe(false);

    // ⚠️ 关键：机会还在 —— 「已展示」是 false（不是 true）。
    // 冷却期一过，引导还会再出现一次。
    expect(storage['vsc-first-run-hint-shown']).toBe(false);
    expect(storage['vsc-first-run-hint-cooldown-until']).toBeGreaterThan(Date.now());
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
    await vi.advanceTimersByTimeAsync(900);

    // 用户按了个键（多半是想用某个快捷键）。
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));

    // ⚠️ 之前 dismiss() 把等待计时器一起清了 —— 提示再也不出现，
    // 用户第一次使用就「什么都没看到」。
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);
  });

  it('视频在等待期里暂停：那一轮等待仍然作废', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(900);
    // 暂停是「用户不看了」的信号，与「按了个键」不是一回事。
    video.dispatchEvent(new Event('pause', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

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
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

    expect(isVisible()).toBe(true);
  });
});

/**
 * 关闭按钮的**焦点环**。
 *
 * ⚠️ 这是一条真缺陷（2026-10-22 修），形状是「看起来有、其实没有」：
 * 焦点环原先写在样式表里（`#vsc-first-run-hint-close:focus-visible { outline: … }`），
 * 而按钮上有一句**内联**的 `all: initial !important`（样式隔离机制）——
 * 它把 outline / box-shadow 整个重置掉了。
 *
 * 而**内联的 important 赢过样式表里的任何声明**（连 `!important` 也一样）：
 * 实测 `#b:focus { outline: 3px solid red !important }` 在
 * `style="all: initial !important"` 面前依然输。
 * 于是那条样式表规则**从来没生效过** —— 键盘用户 Tab 到那个「×」上，
 * 屏幕上**一点焦点指示都没有**。
 *
 * 而那个「×」是「我故意关掉引导」的**唯一**正路（引导节点本身
 * pointer-events: none 且 aria-hidden，用户点不到它）。
 * 一个为键盘用户做的产品，唯一的退出入口走不通。
 *
 * 所以焦点环必须写成**内联 important**，跟着 focus/blur 状态走。
 */
describe('FirstRunHint：关闭按钮的焦点环', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let recordFailedAttempt: Mock<[], Promise<void>>;
  let isInCooldown: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint | undefined;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      isInCooldown,
    });
    hint.start();
    await settle();
    return hint;
  };

  const closeButton = () =>
    document.getElementById('vsc-first-run-hint-close') as HTMLButtonElement | null;

  /** 按钮当前的焦点环（读**内联样式** —— 那才是真正生效的那一份）。 */
  const ring = () => {
    const button = closeButton();
    if (!button) return null;
    return {
      outline: button.style.getPropertyValue('outline'),
      outlinePriority: button.style.getPropertyPriority('outline'),
      offset: button.style.getPropertyValue('outline-offset'),
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
    recordFailedAttempt = vi.fn(async (): Promise<void> => {});
    isInCooldown = vi.fn(async (): Promise<boolean> => false);
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    vi.useRealTimers();
  });

  it('聚焦时有焦点环，移开时收掉', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    const button = closeButton();
    expect(button, '引导必须有一个真正的关闭按钮').not.toBeNull();

    // ⚠️ 未聚焦时**不能**有环 —— 否则一个常驻的圈会让人以为
    // 「它一直是被选中的」，反而看不清状态。
    expect(ring()?.outline).toBe('none');

    button!.focus();
    button!.dispatchEvent(new FocusEvent('focus'));

    const focused = ring();
    expect(
      focused?.outline,
      '聚焦时必须有可见的焦点环 —— 键盘用户 Tab 到它之后要知道自己在哪',
    ).toBe('2px solid #f8fafc');
    // ⚠️ 必须是 **important**：按钮上那句 `all: initial !important`
    // 是内联的 important —— 普通的内联声明会被它整个重置掉。
    expect(
      focused?.outlinePriority,
      '焦点环必须带 important —— 否则被 `all: initial !important` 重置掉',
    ).toBe('important');

    button!.blur();
    button!.dispatchEvent(new FocusEvent('blur'));
    expect(ring()?.outline, '移开焦点后环要收掉').toBe('none');
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
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

    const node = hintNode() as HTMLElement | null;
    expect(node).not.toBeNull();

    // 之前是 `top: 18px; left: 50%` —— 正好压在站点顶栏（搜索框）上。
    expect(node?.style.top).toBe('auto');
    expect(node?.style.bottom).toBe('16px');
    expect(node?.style.left).toBe('auto');
    expect(node?.style.right).toBe('16px');
  });
});

/**
 * 引导归「拥有视频的那个 frame」—— 这是 6.1.0 带出来的**功能回归**的修复。
 *
 * 回归的形状：内容脚本注入到**所有** frame。6.1.0 之前顶层注册表会递归进
 * 同源 iframe 找视频，所以引导（只跑在顶层）能发现 iframe 里的视频；
 * 6.1.0 之后注册表不再钻进 iframe（免得两个运行时抢同一个 <video>），
 * 于是引导只跑在顶层、顶层又看不见 iframe 的视频 ——
 * **页面上唯一的视频在嵌入框里时，引导永远不出现**。
 *
 * 而引导是这个产品**唯一的可见入口**：它不出现，用户就永远发现不了
 * `f`（网页全屏）与 `=`/`-`（调速）这些快捷键 —— 功能等于不存在。
 */
describe('FirstRunHint：引导要放得下（嵌入框里的小视口）', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let hint: FirstRunHint;

  /**
   * jsdom 不做布局：`getBoundingClientRect()` 恒为 0。
   * 而这条契约的判据正是「**量出来的**提示有多高」——
   * 所以必须自己把高度喂进去，否则测的永远是「放得下」。
   */
  const stubViewport = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  };

  /** 给提示节点一个高度：内容有 4 行时约 130px，2 行时约 64px（实测真实浏览器）。 */
  const stubHintHeight = (height: number) => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function patched(this: Element) {
      if (this.id === HINT_ID) {
        return {
          x: 0, y: 0, top: 0, left: 0, right: 288, bottom: height,
          width: 288, height,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return original.call(this);
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  };

  const start = async (video: HTMLVideoElement) => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
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
  });

  afterEach(() => {
    hint?.destroy();
    vi.useRealTimers();
  });

  it('视口够大 → 显示完整版', async () => {
    // 1280×720 的顶层页面：完整版（4 行，130px）只占 18%，放得下。
    stubViewport(1280, 720);
    const restore = stubHintHeight(130);

    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);

    const text = hintNode()?.textContent ?? '';

    // ⚠️ 完整版的**两条补充信息**都必须在里面：
    // 1. 鼠标点选倍速档位（全屏控制条里的菜单）
    // 2. 去哪儿改绑
    expect(text).toContain('鼠标点选倍速档位');
    expect(text).toContain('改绑');

    // ⚠️ 而「点扩展图标可切换网页全屏」必须**不在**里面：
    // 它与第一行「按 f 切换网页全屏」是同一个动作
    // （同一个 TOGGLE_FULLSCREEN_MESSAGE，见 background/index.ts:22），
    // 两行讲同一件事就是浪费一行版面。
    expect(text).not.toContain('点扩展图标');
    restore();
  });

  it('视口很小 → 退到精简版，但**读屏播报的仍是完整版**', async () => {
    // 320×180 的嵌入框：完整版 130px 放得下，却盖住了播放器 72%
    // （实测，真实 Chromium）—— 那不是贴片，是「画面被糊住了」。
    stubViewport(320, 180);
    const restore = stubHintHeight(130);

    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);

    // 视觉上退到精简版：只留「按哪个键」那两行。
    expect(hintNode()?.textContent).toContain('网页全屏');
    expect(hintNode()?.textContent).not.toContain('点扩展图标可进入网页全屏');
    restore();
  });

  it('连精简版都放不下 → 至少不显示被裁掉一半的那一版', async () => {
    // 240×135 的框：完整版（130px）超出视口，顶部会被裁掉（实测 top = -11px）。
    stubViewport(240, 135);
    const restore = stubHintHeight(130);

    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);

    // 退到精简版（64px）—— 135 - 64 = 71，装得下。
    expect(hintNode()?.textContent).not.toContain('点扩展图标可进入网页全屏');
    restore();
  });

  /**
   * 降级链的**第三档**：极简版。
   *
   * ⚠️ 这是一条真回归（2026-10-22 修）。形状：
   * 复位键并进调速行之后，精简版第 1 行在 240px 宽的框里折成 **2 行** ——
   * 整张卡片 74.6px，而那个框的一半是 67.5px。
   *
   * 而当时 `pickFittingText` 里「精简版再量一次」那段是**假守卫**：
   * 量了，但两个分支都 `return compactText` —— 结果被直接丢掉。
   * 于是「放不下」这件事在代码里没有任何后果。
   *
   * ⚠️ 单测守不了「折行」（jsdom 不做布局），所以这里守的是**降级链本身**：
   * 给精简版喂一个「放不下」的高度，它必须退到极简版；
   * 而极简版必须**还认得出是干什么的**（不是一串光秃秃的符号）。
   */
  it('精简版也放不下 → 退到极简版，且仍然说得出「这是调速」', async () => {
    stubViewport(240, 135);

    // ⚠️ 高度必须**按文案内容**给，不能按「第几次量」给。
    //
    // 第一版按调用次数喂（第 3 次才给 56px），于是把降级链短路掉之后
    // 测试**照样绿**（实测：变异 A 没被抓住）—— 因为短路时只量 2 次，
    // 第 2 次（精简版）拿到的是「放不下」的那个高度……而它确实放不下，
    // 于是断言恰好成立，而「第三档有没有生效」根本没被检查。
    //
    // 现在按**真实文案**判：完整版与精简版给 130px（真实 Chromium 实测：
    // 240px 宽的框里折行后确实放不下），极简版给 56px（2 行 + 20px 内边距）。
    // 这样「有没有走到第三档」由**文案**决定，而不是由调用次序决定。
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function patched(this: Element) {
      if (this.id === HINT_ID) {
        const content = this.textContent ?? '';
        // ⚠️ 极简版的特征是「没有动作名」：完整版与精简版都以
        // 「调速 · …」开头，极简版是「调速 · = / - / 0」——
        // 它同样有「调速」这个词，所以判据不能是「有没有调速」，
        // 而是「有没有方向说明」（加快 / 减慢 / faster / slower）。
        //
        // ⚠️ 更不能拿「第几次量」当判据：降级链短路时只量 2 次，
        // 于是第 2 次（精简版）拿到了极简版的高度，「放不下」被读成「放得下」——
        // 断言恰好成立，而第三档根本没走到（实测：变异 A 没被抓住）。
        const isTiny = !/加快|减慢|faster|slower/i.test(content);
        const height = isTiny ? 56 : 130;
        return {
          x: 0, y: 0, top: 0, left: 0, right: 288, bottom: height,
          width: 288, height,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return original.call(this);
    };

    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await start(video);
    await vi.advanceTimersByTimeAsync(2600);

    const text = hintNode()?.textContent ?? '';

    // ① 真的退到了极简版：完整版那两行补充说明不在。
    expect(text).not.toContain('改绑');

    // ② **动作名还在** —— 只剩 `= / - / 0` 的话，用户看到三个符号，
    //    不知道那是在调速。省掉的必须是「加快 / 减慢」这类方向说明，
    //    不是「这三个键是干什么的」。
    expect(
      text,
      '极简版必须还说得出这是调速 —— 光秃秃的键名用户读不懂',
    ).toMatch(/调速|speed/i);

    // ③ **方向说明必须不在** —— 这一条是「真的退到了极简版」的判据。
    //
    // ⚠️ 少了它这条用例是**假守卫**（实测）：只断言「有调速、有 =」的话，
    // 精简版**也满足** —— 于是把降级链短路掉（永远停在精简版），
    // 测试照样绿，而「第三档到底有没有生效」根本没被检查。
    //
    // 极简版与精简版的**唯一区别**就是有没有「加快 / 减慢 / 回到 1x」
    // 这些方向说明：完整版和精简版都有，极简版没有。
    expect(
      text,
      '没退到极简版 —— 方向说明还在，说明显示的是精简版',
    ).not.toMatch(/加快|减慢|faster|slower/i);

    // ④ 键必须真的在（引导存在的理由）。
    expect(text).toContain('=');

    Element.prototype.getBoundingClientRect = original;
  });
});

describe('FirstRunHint：引导归「拥有视频的那个 frame」', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let recordFailedAttempt: Mock<[], Promise<void>>;
  let isInCooldown: Mock<[], Promise<boolean>>;
  /** 本次用例里建过的运行时（afterEach 统一销毁）。 */
  const hints: FirstRunHint[] = [];

  const create = async (options: { claimBroker?: HintClaimBroker } = {}) => {
    const hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      isInCooldown,
      ...(options.claimBroker ? { claimBroker: options.claimBroker } : {}),
    });
    hints.push(hint);
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
    isInCooldown = vi.fn(async (): Promise<boolean> => false);
  });

  afterEach(() => {
    hints.splice(0).forEach((hint) => hint.destroy());
    (globalThis as Record<string, unknown>).chrome = undefined;
    vi.useRealTimers();
  });

  it('嵌在 iframe 里的 frame 也能弹出引导（顶层限制已取消）', async () => {
    // ⚠️ 这个文件把 isTopDocument 永久答成 false（见文件头的 mock），
    // 也就是「我是一个嵌在 iframe 里的 frame」。旧实现在这里直接 return，
    // 于是「视频在嵌入框里」时引导永远不出现 —— 用户完全无从发现这个扩展。
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

    expect(isVisible()).toBe(true);
    // ⚠️ 「已展示」现在在**显示的当下**就落盘了（见 reveal）——
    // 「读完了」管的是**失败计数**，不是落盘时机。
    expect(markShown).toHaveBeenCalledTimes(1);
  });

  it('同一个标签页里同时只会弹一条引导', async () => {
    // 两个运行时 = 同一个标签页里的两个 frame（顶层一个、iframe 一个），
    // 它们共享同一把认领锁。
    const broker = makeTestClaimBroker();
    const video = makeVisible(createVideo());
    document.body.appendChild(video);

    await create({ claimBroker: broker });
    await create({ claimBroker: broker });

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

    // ⚠️ jsdom 里两个 frame 共用同一个 document，所以只能**数节点**：
    // 两个 frame 各弹一条的话，页面上会挂着两个提示。
    expect(document.querySelectorAll(`#${HINT_ID}`).length).toBe(1);
  });

  it('引导关掉之后，认领标记就还回去了（别的 frame 还有机会）', async () => {
    const broker = makeTestClaimBroker();
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create({ claimBroker: broker });

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // 用户点掉提示：锁必须被归还 —— 不然这个标签页再也弹不出引导。
    // ⚠️ 必须用**主动关掉**（点「×」）：页面上误点一下现在只算忽略，
    // 提示不会被关掉（也就没有「归还锁」这回事）。
    const close = document.getElementById('vsc-first-run-hint-close') as HTMLButtonElement | null;
    expect(close, '引导必须有一个真正的关闭按钮').not.toBeNull();
    close!.click();
    await settle();

    // 归还之后，另一个 frame 就能抢到锁了。
    const second = await create({ claimBroker: broker });
    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

    // ⚠️ 这里数的是**看得见**的提示：被关掉的那条只是淡出，节点还留在
    // document 里（TransientPill 复用自己的节点）。
    expect(document.querySelectorAll(`#${HINT_ID}.vsc-visible`).length).toBe(1);
    second.destroy();
  });

  it('认领标记写进共享存储（别的 frame 才看得到），读完之后清掉', async () => {
    // 一份最小的 chrome.storage.local + onChanged：真实扩展里，
    // 认领标记就靠它跨 frame 传递（内容脚本拿不到 chrome.tabs，
    // 也就没有 tabId 可用 —— 见 firstRunHint.ts 里的说明）。
    const data: Record<string, unknown> = {};
    const listeners: ((changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void)[] = [];
    const emit = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
      listeners.slice().forEach((listener) => listener(changes, 'local'));
    };

    (globalThis as Record<string, unknown>).chrome = {
      runtime: { lastError: null },
      storage: {
        local: {
          get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
          set: async (values: Record<string, unknown>) => {
            const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
            Object.entries(values).forEach(([key, value]) => {
              changes[key] = { oldValue: data[key], newValue: value };
              data[key] = value;
            });
            emit(changes);
          },
          remove: async (key: string) => {
            const changes = { [key]: { oldValue: data[key], newValue: undefined } };
            delete data[key];
            emit(changes);
          },
        },
        onChanged: {
          addListener: (listener: typeof listeners[number]) => { listeners.push(listener); },
          removeListener: (listener: typeof listeners[number]) => {
            const index = listeners.indexOf(listener);
            if (index >= 0) {
              listeners.splice(index, 1);
            }
          },
        },
      },
    };

    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    // ⚠️ 认领要等一段稳定窗口（写后读回，见 CLAIM_SETTLE_MS），
    // 所以提示比「播放满 2.5 秒」晚 CLAIM_SETTLE_MS 出现 —— 断言必须跟实现对得上。
    await vi.advanceTimersByTimeAsync(WATCH_DELAY + CLAIM_SETTLE_MS);
    expect(isVisible()).toBe(true);

    // ⚠️ 标记必须真的落到**共享**存储里 —— 不然别的 frame 看不见，
    // 顶层与 iframe 会各弹一条。
    const claim = data['vsc-first-run-hint-claim'] as { owner?: unknown; claimedAt?: unknown } | undefined;
    expect(typeof claim?.owner).toBe('string');
    expect(typeof claim?.claimedAt).toBe('number');

    // 读完（READ_DELAY 之后）→ 标记清掉，别的 frame 才有机会弹下一条。
    await vi.advanceTimersByTimeAsync(READ_DELAY);
    await settle();
    expect(data['vsc-first-run-hint-claim']).toBeUndefined();
  });
});

/**
 * 一份**故意慢半拍**的共享存储：写要等测试放行才落盘。
 *
 * ⚠️ 模拟的是 bug 的现场：两个窗口几乎同时发起认领时，
 * 先发起的那个写**还没落盘**，第二个已经读过了（读到「没人认领」）。
 * 真实浏览器里就是这个时序 —— `storage.local.set` 要走一次 IPC 才落盘，
 * 而读回可以排在它前面。
 */
const createDeferredStorage = () => {
  const data: Record<string, unknown> = {};
  const pending: Array<() => void> = [];

  return {
    data,
    /** 放行待落盘的写（按发起顺序）。 */
    flush: () => {
      while (pending.length > 0) {
        pending.shift()!();
      }
    },
    local: {
      get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
      set: async (values: Record<string, unknown>) => {
        await new Promise<void>((resolve) => {
          pending.push(() => {
            Object.assign(data, values);
            resolve();
          });
        });
      },
      remove: async (key: string) => {
        delete data[key];
      },
    },
  };
};

/**
 * 认领必须是**原子的**：同一时刻只允许一个 frame 拿到锁。
 *
 * ⚠️ 这条守的是实测 bug（2026-10-22）：两个浏览器窗口同时起播 →
 * **两条引导同时弹出来**，而 storage.local 里只有**一个**「已展示」标记。
 * 引导是设备级的一次性提示、也是这个扩展**全部**的可见入口，
 * 两条同时出现 = 用户第一眼看到的是「粗制滥造」。
 *
 * ⚠️ 旧实现（订阅式快照 + fire-and-forget 写）守不住这条：
 * 两个窗口在同一瞬间读到同一份「没人认领」的快照 → 都认领 → 都弹。
 */
describe('认领的原子性：两个实例同时抢，只有一个赢', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** 装一份共享存储（两个 broker 共用它）。 */
  const useStorage = (local: unknown) => {
    vi.stubGlobal('chrome', {
      storage: {
        local,
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    });
  };

  it('同时认领 → 只有一个拿到锁（写后读回）', async () => {
    const storage = createDeferredStorage();
    useStorage(storage.local);

    const a = createStorageClaimBroker();
    const b = createStorageClaimBroker();
    a.start();
    b.start();
    await settle();

    // 两个实例几乎同时发起认领。
    const claimA = a.tryClaim('frame-a');
    const claimB = b.tryClaim('frame-b');
    await settle();

    // ⚠️ 两个写都还没落盘（真实浏览器里就是这个时序）。
    expect(storage.data['vsc-first-run-hint-claim']).toBeUndefined();

    storage.flush();
    await settle();

    // 稳定窗口：让两个写都落盘之后再去读回。
    await vi.advanceTimersByTimeAsync(CLAIM_SETTLE_MS + 10);
    await settle();

    const granted = [await claimA, await claimB];
    expect(granted.filter(Boolean).length, '只能有一个赢 —— 两个都赢就是两条引导').toBe(1);

    // 输的那个**不许**把赢家的锁删掉（那把锁正被别人拿着）。
    const stored = storage.data['vsc-first-run-hint-claim'] as { owner?: unknown } | undefined;
    const winner = granted[0] ? 'frame-a' : 'frame-b';
    expect(stored?.owner, '存储里必须还是赢家的锁').toBe(winner);
  });

  it('后来的那个看到活锁就让开（先来后到）', async () => {
    const storage = createDeferredStorage();
    useStorage(storage.local);

    const a = createStorageClaimBroker();
    a.start();
    const claimA = a.tryClaim('frame-a');
    await settle();
    storage.flush();
    await settle();
    await vi.advanceTimersByTimeAsync(CLAIM_SETTLE_MS + 10);
    await settle();

    expect(await claimA, '第一个应当拿到锁').toBe(true);

    // 后来者：写之前现读，读到的是**还活着**的别人的锁 → 让开。
    const b = createStorageClaimBroker();
    b.start();
    expect(await b.tryClaim('frame-b'), '后来的那个必须让开').toBe(false);
  });

  it('锁被归还之后，另一个实例能拿到', async () => {
    const storage = createDeferredStorage();
    useStorage(storage.local);

    const a = createStorageClaimBroker();
    a.start();
    const claimA = a.tryClaim('frame-a');
    await settle();
    storage.flush();
    await settle();
    await vi.advanceTimersByTimeAsync(CLAIM_SETTLE_MS + 10);
    await settle();
    expect(await claimA).toBe(true);

    // 归还（引导读完了 / 被关掉了）。
    a.release('frame-a');
    await settle();
    expect(storage.data['vsc-first-run-hint-claim'], '锁必须真的还回去').toBeUndefined();

    // 归还之后，别的实例就有机会了。
    const b = createStorageClaimBroker();
    b.start();
    const claimB = b.tryClaim('frame-b');
    await settle();
    storage.flush();
    await settle();
    await vi.advanceTimersByTimeAsync(CLAIM_SETTLE_MS + 10);
    await settle();

    expect(await claimB, '锁还回去之后就该轮得到别人').toBe(true);
  });

  /**
   * 用户实测到的那个症状，原样复现。
   *
   * ⚠️ 实测（真实 Chromium，两个窗口同时起播）：
   *   - 两边都看得见引导（各一条）；
   *   - 而 storage.local 里只有**一个**「已展示」标记。
   *
   * 「一条提示却只记了一次展示」= 提示出现了两次，但只消耗了一次机会 ——
   * 也就是说用户会看到**两条一模一样的引导**，而这个扩展的全部可见入口
   * 就是这条引导。两条同时出现在两个窗口里，是这个产品的第一印象。
   */
  it('两个实例同时抢 → 页面上只有一条引导，「已展示」也只记一次', async () => {
    const storage = createDeferredStorage();
    useStorage(storage.local);

    // ⚠️ 两个 FirstRunHint = 两个窗口里的两个内容脚本（各拿一份 broker，
    // 但**共用**同一份 storage —— 那就是「同一个设备」）。
    const makeHint = () => {
      const hint = new FirstRunHint({
        getShortcuts: () => createShortcuts(),
        wasShown: async () => false,
        markShown: async () => {},
        recordFailedAttempt: async () => {},
        isInCooldown: async () => false,
        claimBroker: createStorageClaimBroker(),
      });
      hint.start();
      return hint;
    };

    const first = makeHint();
    const second = makeHint();

    try {
      await settle();

      // 两个「窗口」各自起播（两个运行时各自监听 play）。
      const video = makeVisible(createVideo());
      document.body.appendChild(video);
      video.dispatchEvent(new Event('play', { bubbles: true }));

      // 播放满 2.5 秒 → 两个运行时都来抢锁（此刻两个写都还没落盘）。
      await vi.advanceTimersByTimeAsync(WATCH_DELAY);
      await settle();
      expect(storage.data['vsc-first-run-hint-claim'], '前置条件：两个写都还在路上').toBeUndefined();

      // 两个写落盘（后写的赢）。
      storage.flush();
      await settle();

      // 稳定窗口 + 读回。
      await vi.advanceTimersByTimeAsync(CLAIM_SETTLE_MS + 10);
      await settle();

      // ⚠️ jsdom 里两个实例共用一个 document，所以只能**数节点**。
      const hints = document.querySelectorAll(`#${HINT_ID}.vsc-visible`);
      expect(hints.length, '两个窗口不能各弹一条引导').toBe(1);
    } finally {
      // ⚠️ 必须销毁：不销毁的话，这两个运行时会继续监听 document 上的
      // play 事件，把**后面**那些用例的引导节点抢走（它们共用一个 document）。
      first.destroy();
      second.destroy();
    }
  });
});

/**
 * 设置页的「重新显示使用引导」在**同一个标签页**里必须立刻生效。
 *
 * 背景：设置页那个按钮只做了一件事 —— 清掉 storage.local 里的
 * 「已展示」标记。而内容脚本把「本会话已展示」记在**内存**里，从不复位；
 * 又因为引导状态在 local，而 `subscribeToSettings` 只监听 sync 命名空间，
 * 没有任何一条通道把「用户点了重置」告诉内容脚本。
 *
 * 结果：用户点了按钮、切回标签页，**什么都不会发生** ——
 * 必须手动刷新页面，而界面从头到尾没说过这一点。
 *
 * 现在的约定：内容脚本订阅 storage.local 的变化（`subscribeToFirstRunHintState`），
 * 收到「已展示标记被删了」就把内存里的会话状态复位，
 * 下一次 reveal() 把整条流程原样重跑一遍。
 */
describe('FirstRunHint：设置页重置之后，同一个标签页里能再看到一次引导', () => {
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;
  let recordFailedAttempt: Mock<[], Promise<void>>;
  let isInCooldown: Mock<[], Promise<boolean>>;
  let hint: FirstRunHint;
  let storageListeners: Array<
    (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => void
  >;

  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      recordFailedAttempt,
      isInCooldown,
    });
    hint.start();
    await settle();
  };

  /** 模拟设置页点了「重新显示使用引导」：storage.local 里的标记被删掉。 */
  const fireShownCleared = () => {
    storageListeners.forEach((listener) => {
      listener({ [FIRST_RUN_HINT_KEY]: { oldValue: true } }, 'local');
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
    recordFailedAttempt = vi.fn(async (): Promise<void> => {});
    isInCooldown = vi.fn(async (): Promise<boolean> => false);
    storageListeners = [];

    // 只给 storage.onChanged：内容脚本靠它知道「用户点了重置」。
    vi.stubGlobal('chrome', {
      storage: {
        onChanged: {
          addListener: (
            listener: (
              changes: Record<string, chrome.storage.StorageChange>,
              namespace: string,
            ) => void,
          ) => {
            storageListeners.push(listener);
          },
          removeListener: (
            listener: (
              changes: Record<string, chrome.storage.StorageChange>,
              namespace: string,
            ) => void,
          ) => {
            const index = storageListeners.indexOf(listener);
            if (index >= 0) {
              storageListeners.splice(index, 1);
            }
          },
        },
      },
    });
  });

  afterEach(() => {
    hint?.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('重置之后引导在同一个标签页里再出现一次（不必刷新页面）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    // 第一轮：引导出现 → 读完 → 落盘「已展示」。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    await vi.advanceTimersByTimeAsync(READ_DELAY);
    expect(markShown).toHaveBeenCalledTimes(1);

    // 用户在设置页点了「重新显示使用引导」。
    fireShownCleared();

    // 同一个标签页里，不刷新页面，引导应该再出现一次。
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    await settle();
    expect(isVisible(), '重置之后引导必须再出现一次').toBe(true);

    // ⚠️ 而且整条流程**重跑**：读完之后再次落盘「已展示」。
    // 只把提示画出来不算数 —— 用户要的是「再走一遍」。
    await vi.advanceTimersByTimeAsync(READ_DELAY);
    await settle();
    expect(markShown).toHaveBeenCalledTimes(2);
  });

  it('用户主动关掉引导之后，重置同样能把它叫回来', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);

    // 用户点了引导自己的「×」（那是一次拒绝）。
    const close = document.getElementById('vsc-first-run-hint-close') as HTMLButtonElement | null;
    expect(close, '引导必须有一个真正的关闭按钮').not.toBeNull();
    close!.click();
    await settle();
    expect(isVisible()).toBe(false);

    // 设置页点「重新显示使用引导」。
    fireShownCleared();

    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    await settle();
    expect(isVisible(), '被关掉之后也要能被叫回来').toBe(true);
  });

  it('没有重置信号时，引导不会自己再出现（守住「一次性」这条底线）', async () => {
    const video = makeVisible(createVideo());
    document.body.appendChild(video);
    await create();

    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);
    expect(isVisible()).toBe(true);
    await vi.advanceTimersByTimeAsync(READ_DELAY);

    // 视频再播一次、页面再等一会儿 —— 引导不该回来。
    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);
    await settle();

    expect(markShown).toHaveBeenCalledTimes(1);
  });
});


/**
 * 接缝：VideoRegistry 与 FirstRunHint 对同一条视频必须给出**同一个**结论。
 *
 * ⚠️ 这条接缝曾经**存在却从未接上**：`createFirstRunHint` 的第二个参数
 * （`isAmbientPreview`）一直没人传，于是引导退回自己那份更粗的兜底判据。
 * 后果是同一条视频，两个模块给出**相反**的结论 ——
 * 「要不要接管它」说它不是装饰（接管了，键盘能用），
 * 「要不要给它弹引导」说它是装饰（引导永远不出现）。
 * 而引导是这个产品**全部的可见入口**。
 *
 * 这组用例跑的是**真实的类**（VideoRegistry + FirstRunHint），
 * 中间只隔那条接缝 —— 任何一方都不 mock。
 */
describe('接缝：判定只有一份（VideoRegistry 代答）', () => {
  let registry: VideoRegistry;
  let hint: FirstRunHint | undefined;
  let shortcuts: ShortcutSettings;
  let wasShown: Mock<[], Promise<boolean>>;
  let markShown: Mock<[], Promise<void>>;

  /** 按**生产接线**建一个引导：判定由 registry 代答。 */
  const create = async () => {
    hint = new FirstRunHint({
      getShortcuts: () => shortcuts,
      wasShown,
      markShown,
      isAmbientPreview: (video) => registry.isAmbientPreview(video),
    });
    hint.start();
    await settle();
    return hint;
  };

  /**
   * 让一条视频播起来，然后把两边的结论摆在一起。
   *
   * 「引导有没有出现」就是 FirstRunHint 对这条视频的结论：
   * 装饰物 → 不出现（不能把唯一一次机会烧在装饰预览上）；
   * 内容视频 → 出现。
   */
  const verdictOf = async (video: HTMLVideoElement) => {
    document.body.appendChild(video);
    await create();
    video.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

    return {
      decorative: registry.isAmbientPreview(video),
      hintAppeared: isVisible(),
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    adapterHost.hostname = 'localhost';
    shortcuts = createShortcuts();
    wasShown = vi.fn(async (): Promise<boolean> => false);
    markShown = vi.fn(async (): Promise<void> => {});
    // isTrustedEvent 恒真：jsdom 造不出可信事件（isTrusted 是实例上的
    // non-configurable 属性），而「用户碰过」「站点自己开的」这两条证据
    // 靠事件判定 —— 合成事件在生产里会被正确地拒掉，这里放行。
    registry = new VideoRegistry({ isTrustedEvent: () => true });
    registry.start();
  });

  afterEach(() => {
    hint?.destroy();
    hint = undefined;
    registry.stop();
    vi.useRealTimers();
  });

  it('站点主播放器：两边都认为它不是装饰物，引导会出现', async () => {
    // YouTube 的主播放器恰恰就是「静音自动播 + 没有原生 controls」——
    // 形状与装饰性预览一模一样，只看属性分不出来。
    adapterHost.hostname = 'www.youtube.com';
    const main = makeVisible(createVideo());
    main.className = 'html5-main-video';
    main.setAttribute('autoplay', '');

    const { decorative, hintAppeared } = await verdictOf(main);

    expect(decorative, '站点点名的主播放器不是装饰物').toBe(false);
    expect(hintAppeared, '引导必须为它出现').toBe(true);
  });

  it('装饰性预览：两边都认为它是装饰物，引导不出现', async () => {
    const preview = makeVisible(createDecorativePreview());

    const { decorative, hintAppeared } = await verdictOf(preview);

    expect(decorative, 'autoplay + 无 controls + 没人碰过 = 装饰物').toBe(true);
    expect(hintAppeared, '装饰物不该拿到引导（那会烧掉唯一一次机会）').toBe(false);
  });

  it('站点用 play() 启动的预览：两边都认为它是装饰物，引导不出现', async () => {
    // ⚠️ 这条视频**没有** autoplay 属性 —— 它是被站点的 play() 启动的。
    // 那条证据只有 registry 知道（它监听 play 事件），引导自己算不出来。
    //
    // 所以这条用例正是「接缝接上了没有」的判据：
    // 没接上 → 引导退回自己的兜底判据（只认 autoplay 属性）
    //        → 判成「不是装饰」→ 引导会为一条装饰物弹出，
    //          还把「这辈子只提示一次」的机会烧掉。
    const preview = makeVisible(createVideo());
    document.body.appendChild(preview);
    await create();

    // 站点自己调 play()（没有任何用户手势做背景）。
    preview.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(SHOWN_AT);

    expect(
      registry.isAmbientPreview(preview),
      '站点自己播起来的预览是装饰物（公开判定）',
    ).toBe(true);
    expect(isVisible(), '装饰物不该拿到引导').toBe(false);
  });

  it('普通内容视频：两边都认为它不是装饰物，引导会出现', async () => {
    // 一个**带原生 controls** 的正经播放器 —— 页面上最常见的形态。
    //
    // ⚠️ 注意这里不能拿「暂停着、没人开过」的视频当例子：
    // 一旦它自己播起来（play 事件、没有用户手势做背景），
    // registry 就认定「站点自己开的」（第 5 条成立）—— 而它既没有原生
    // controls、又不是页面主角 → 它就是**装饰物**。这正是「先调速再播放」
    // 那条用法要靠「用户点过」来豁免的原因。
    const player = makeVisible(createVideo());
    player.setAttribute('controls', '');

    const { decorative, hintAppeared } = await verdictOf(player);

    expect(decorative, '有原生 controls 的视频不是装饰物').toBe(false);
    expect(hintAppeared, '引导必须为它出现').toBe(true);
  });

  it('runtime.ts 必须把 registry 的判定接到引导上（接缝不能被删掉）', () => {
    // ⚠️ 这条断言守的是**接线本身**。
    //
    // 上面三条守的是「接上之后两边结论一致」；而「接上了没有」这件事
    // 只有 runtime.ts 知道 —— 它是唯一调用 createFirstRunHint 的地方。
    // 那行被删掉时，上面的用例**照样全绿**（它们自己接线），
    // 于是断链会一路溜到线上：引导永远不出现，而用户什么都看不出来。
    //
    // 所以这里直接读源码，断言 createFirstRunHint 的实参里带着
    // 「registry 的判定」。删掉那一行 → 这条立刻变红。
    const source = readFileSync(resolve(process.cwd(), 'src/content/runtime.ts'), 'utf8');
    const args = extractCallArguments(source, 'createFirstRunHint');

    expect(args, 'runtime.ts 里必须调用 createFirstRunHint').not.toBeNull();
    expect(
      args,
      'createFirstRunHint 必须拿到「这条视频是不是装饰物」的判定（第二个参数）',
    ).toMatch(/isAmbientPreview/);
    expect(
      args,
      '那条判定必须由 VideoRegistry 代答（证据只有 registry 知道）',
    ).toMatch(/registry\s*\.\s*isAmbientPreview/);
  });

  it('引导用的是「卡片」token：与胶囊同一副嗓子，形状不同', async () => {
    // 首次引导是**教学卡片**：它有自己的底色与更直的圆角（形状不同），
    // 但字号/字重/行高/字体族必须与胶囊一致 —— 它是同一个产品的入口。
    const player = makeVisible(createVideo());
    player.setAttribute('controls', '');
    document.body.appendChild(player);
    await create();

    player.dispatchEvent(new Event('play', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(WATCH_DELAY);

    const root = document.getElementById(HINT_ID)!;
    expect(root.style.getPropertyValue('font-size')).toBe(NOTICE_CARD_TOKENS['font-size']);
    expect(root.style.getPropertyValue('font-weight')).toBe(NOTICE_CARD_TOKENS['font-weight']);
    expect(root.style.getPropertyValue('line-height')).toBe(NOTICE_CARD_TOKENS['line-height']);
    // ⚠️ padding 用**长写**属性断言：jsdom 的 shorthand 读回来是空串。
    //
    // ⚠️ 断言必须**从 token 推导**：写死 '10px' / '16px' 的话，token 一改它就红，
    // 而红的时候看不出该改哪里（是 token 变了，还是断言过期了？）。
    const padding = expandPadding(NOTICE_CARD_TOKENS.padding);
    expect(root.style.getPropertyValue('padding-top')).toBe(padding.top);
    expect(root.style.getPropertyValue('padding-bottom')).toBe(padding.bottom);
    expect(root.style.getPropertyValue('padding-left')).toBe(padding.left);
    // ⚠️ 右侧由 token 的 'padding-right' **单独**给（给关闭按钮留位置）。
    // 断言它存在，是为了「token 里那一项被删掉」这件事立刻变红 ——
    // 否则断言会退化成简写里的 16px，从此什么也守不住。
    expect(
      NOTICE_CARD_TOKENS['padding-right'],
      '关闭按钮的位置必须由 token 单独给',
    ).toBeDefined();
    expect(root.style.getPropertyValue('padding-right')).toBe(
      NOTICE_CARD_TOKENS['padding-right'],
    );
    expect(root.style.getPropertyValue('border-radius')).toBe(NOTICE_CARD_TOKENS['border-radius']);
    expect(root.style.getPropertyValue('background-color')).toBe(NOTICE_CARD_TOKENS['background-color']);
  });
});

/**
 * 从源码里取出 `fn(...)` 的实参文本（按括号配平，注释先剥掉）。
 *
 * ⚠️ 为什么先剥注释：注释里也可能有括号与「isAmbientPreview」这些词，
 * 不剥掉就会把注释当成实参 —— 而我们要断的恰恰是**代码**。
 */
const extractCallArguments = (source: string, fnName: string): string | null => {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const start = withoutComments.indexOf(`${fnName}(`);
  if (start < 0) {
    return null;
  }

  let depth = 0;
  for (let index = start + fnName.length; index < withoutComments.length; index += 1) {
    const char = withoutComments[index];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return withoutComments.slice(start + fnName.length + 1, index);
      }
    }
  }

  return null;
};
