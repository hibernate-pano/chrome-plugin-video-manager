import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeedToast, formatRate } from './speedToast';
import { destroyLiveRegion } from './liveRegion';
import { FULLSCREEN_OVERLAY_ID } from './runtimeStyles';

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
    // liveRegion 的模块级状态（上次播报时间、待播文本）必须清干净，
    // 否则下一条播报会被上一条卡进节流窗口里 —— 那是跨用例的泄漏。
    destroyLiveRegion();
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

  /** jsdom 里没有真正播放的视频，paused 恒为 true；这里手动改成「正在播」。 */
  const markPlaying = () => {
    Object.defineProperty(video, 'paused', { get: () => false, configurable: true });
  };

  const pill = () => document.getElementById('vsc-speed-toast')!;

  it('turns into a persistent badge once the pill has faded', () => {
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);

    vi.advanceTimersByTime(900);
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    // 900ms 之后再过 3 秒，用户没再操作 —— 说明他想确认「现在到底是几倍速」。
    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible')).toBe(true);
    // 角标绝不能挡住用户点视频。
    expect(pill().style.pointerEvents).toBe('none');
    toast.destroy();
  });

  it('does not leave a badge behind for a paused video', () => {
    const toast = new SpeedToast();
    toast.show(1.5, video);

    // jsdom 的 video 默认就是暂停的（没有 src），等价于「用户按了暂停」。
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(false);
    toast.destroy();
  });

  it('dismisses the badge as soon as the video pauses', () => {
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    video.dispatchEvent(new Event('pause'));

    expect(pill().classList.contains('vsc-visible')).toBe(false);
    expect(pill().style.opacity).toBe('');
    toast.destroy();
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

  /* --- 角标对比度（白底视频）--- */

  /**
   * WCAG 相对亮度。
   *
   * 线性化：c/255 ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4
   * L = 0.2126R + 0.7152G + 0.0722B
   */
  const relativeLuminance = (r: number, g: number, b: number) => {
    const linear = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };

  const contrastRatio = (a: [number, number, number], b: [number, number, number]) => {
    const l1 = relativeLuminance(...a);
    const l2 = relativeLuminance(...b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  /** 解析 css 颜色：'rgb(1, 2, 3)' / 'rgba(1, 2, 3, 0.5)'。 */
  const parseColor = (value: string) => {
    const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
    return {
      r: numbers[0] ?? 0,
      g: numbers[1] ?? 0,
      b: numbers[2] ?? 0,
      a: numbers.length > 3 ? numbers[3] : 1,
    };
  };

  /**
   * 把角标在页面上**实际合成出来**的颜色算出来。
   *
   * 合成链（与浏览器一致）：
   * 1. 元素自身的 opacity 作用于**整块元素**（底板与文字一起），
   *    所以底板的有效 alpha = 背景 alpha × opacity。
   * 2. 底板颜色 = 背景色按有效 alpha 合成到页面上。
   * 3. 文字颜色 = 文字色按 opacity 合成到页面上（文字在组内不透明）。
   */
  const compositedBadgeColors = (page: [number, number, number]) => {
    const style = pill().style;
    const opacity = Number(style.opacity || '1');
    const background = parseColor(style.backgroundColor);
    const text = parseColor(style.color);

    const plateAlpha = background.a * opacity;
    const plate: [number, number, number] = [
      background.r * plateAlpha + page[0] * (1 - plateAlpha),
      background.g * plateAlpha + page[1] * (1 - plateAlpha),
      background.b * plateAlpha + page[2] * (1 - plateAlpha),
    ];
    const textOnPage: [number, number, number] = [
      text.r * opacity + page[0] * (1 - opacity),
      text.g * opacity + page[1] * (1 - opacity),
      text.b * opacity + page[2] * (1 - opacity),
    ];

    return { plate, text: textOnPage };
  };

  it('keeps the badge readable on a white video (WCAG AA)', () => {
    // 回归：旧写法是 opacity 0.55 + rgba(0,0,0,0.5)，白底视频上合成出来的
    // 对比度只有 1.91:1（远低于 AA 的 4.5:1）—— 录屏、PPT、白底课程视频
    // 上那块角标就是一团看不见的灰。
    //
    // 这里不写死具体像素，而是**按角标此刻真实的内联样式**重算对比度：
    // 任何人把背景调淡、或把 opacity 调回 0.55，这条断言都会立刻变红。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);

    expect(pill().classList.contains('vsc-visible')).toBe(true);

    const white: [number, number, number] = [255, 255, 255];
    const onWhite = compositedBadgeColors(white);
    const whiteContrast = contrastRatio(onWhite.plate, onWhite.text);
    expect(whiteContrast, `白底视频上的角标对比度只有 ${whiteContrast.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

    // 黑底视频是原来的「过」的那一侧，改动不能把它弄坏。
    const black: [number, number, number] = [0, 0, 0];
    const onBlack = compositedBadgeColors(black);
    expect(contrastRatio(onBlack.plate, onBlack.text)).toBeGreaterThanOrEqual(4.5);

    toast.destroy();
  });

  it('does not fade the badge with opacity', () => {
    // opacity 会把**底板和文字一起**压淡 —— 合成后的对比度必然塌下去。
    // 「很淡」只能靠尺寸（12px），不能靠透明度。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);

    expect(Number(pill().style.opacity)).toBe(1);
    expect(pill().style.backgroundColor).toBe('rgba(0, 0, 0, 0.78)');
    // 文字颜色必须显式写死：runtimeStyles 里那条 color 规则管的是胶囊形态，
    // 角标形态要靠自己保证颜色就是算过对比度的那个值。
    expect(pill().style.color).toBe('rgb(248, 250, 252)');
    // 「很淡」靠**尺寸**实现：12px 的角标不该被人改成 20px 的大字。
    expect(pill().style.fontSize).toBe('12px');
    // 角标是「从看不见直接切到完全不透明」，过渡会让它在半透明的中途
    // 状态上停留 160ms —— 那正是要消灭的低对比度状态。
    expect(pill().style.transition).toBe('none');
    toast.destroy();
  });

  it('胶囊与角标都是 aria-hidden 的（播报走独立的 live region）', () => {
    // 视觉节点保留 aria-hidden，避免某些读屏器在 DOM 变化时把贴片再念一遍 ——
    // 播报已经由 live region 负责了。
    const toast = new SpeedToast();
    toast.show(1.5, video);

    expect(pill().getAttribute('aria-hidden')).toBe('true');
    toast.destroy();
  });

  it('drops the badge styles again when the badge is dismissed', () => {
    // 角标样式是内联的，撤掉时必须一起清干净 ——
    // 否则下一次调速的胶囊会带着角标的 12px 字号与深色底板出现。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().style.backgroundColor).toBe('rgba(0, 0, 0, 0.78)');

    video.dispatchEvent(new Event('pause'));

    expect(pill().style.backgroundColor).toBe('');
    expect(pill().style.color).toBe('');
    expect(pill().style.opacity).toBe('');
    toast.destroy();
  });

  /* --- 全屏进出 --- */

  /** 等 MutationObserver 的回调落地（它是微任务）。 */
  const flushMutations = async () => {
    await Promise.resolve();
  };

  const enterFullscreen = async () => {
    const overlay = document.createElement('div');
    overlay.id = FULLSCREEN_OVERLAY_ID;
    document.body.appendChild(overlay);
    await flushMutations();
  };

  /**
   * 模拟控制条自己的退出按钮退出全屏。
   *
   * ⚠️ 这条路径**不经过运行时**：FullscreenController.exit() 只把全屏背板
   * 摘掉，运行时完全不知情。所以角标只能自己观察到背板被摘掉。
   */
  const exitFullscreenViaControls = async () => {
    document.getElementById(FULLSCREEN_OVERLAY_ID)?.remove();
    await flushMutations();
  };

  it('stays out of the way in fullscreen, where the bar already shows the rate', async () => {
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);

    await enterFullscreen();
    vi.advanceTimersByTime(3900);

    expect(pill().classList.contains('vsc-visible')).toBe(false);
    toast.destroy();
  });

  it('brings the badge back after leaving fullscreen', async () => {
    // 回归（6.0.9 实测）：全屏外调速 → 4.5 秒后角标可见 → 进全屏 → 退出 →
    // 再等 5 秒 → 角标永远不再出现（视频上仍是 1.1x）。
    // 根因是「角标消失」依赖了「控制条在不在 DOM 里」这个**只查一次**的间接信号。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.1, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    await enterFullscreen();
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    await exitFullscreenViaControls();
    // 退出全屏后角标不会**立刻**回来 —— 与第一次出现时一样，要等 3 秒。
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible')).toBe(true);
    expect(pill().textContent).toBe('1.1x');
    toast.destroy();
  });

  it('brings the badge back even when the runtime never learned about the fullscreen', async () => {
    // 控制条自带的退出按钮走的是 FullscreenController.exit()，运行时收不到信号。
    // 这一条专门守那条最容易漏的路径：全程不调用 dismissBadge()，
    // 只靠「全屏背板被摘掉」这一个事实，角标也得自己回来。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.25, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    await enterFullscreen();
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    await exitFullscreenViaControls();
    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible')).toBe(true);
    toast.destroy();
  });

  it('does not bring the badge back when the video paused while in fullscreen', async () => {
    // 用户在全屏里暂停了视频 —— 他不需要「当前倍速」的角标了。
    // 全屏控制条上有暂停按钮，但视频本身的 pause 事件照样会来。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);

    await enterFullscreen();
    video.dispatchEvent(new Event('pause'));
    await exitFullscreenViaControls();

    vi.advanceTimersByTime(5000);
    expect(pill().classList.contains('vsc-visible')).toBe(false);
    toast.destroy();
  });

  it('keeps the badge out of the way in fullscreen, while the one-shot pill still shows', async () => {
    // 全屏里调速：胶囊照样要出（控制条 3 秒就隐藏，键盘调速时它往往不在屏幕上），
    // 但**常驻角标**不该出 —— 控制条上就写着倍速。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);

    // 胶囊淡出前它还在（一次性反馈）。
    vi.advanceTimersByTime(500);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    await enterFullscreen();

    // 胶囊在 900ms 时淡出，淡出后**不该**变成角标。
    vi.advanceTimersByTime(400);
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible')).toBe(false);
    expect(pill().style.backgroundColor).toBe('');
    toast.destroy();
  });

  it('brings the badge back after adjusting speed inside fullscreen, then leaving', async () => {
    // 最真实的一条路径：用户先在页面里调速，进全屏，**在全屏里**又调了一次，
    // 然后退出全屏。这时「用户想知道当前倍速」的意图指向的是同一个视频，
    // 角标必须回来 —— 而且是回来显示**全屏里最后一次**调到的那个值。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.1, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    await enterFullscreen();
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    // 全屏里调速：胶囊出，角标不出。
    toast.show(1.75, video);
    expect(pill().textContent).toBe('1.75x');
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    await exitFullscreenViaControls();
    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible')).toBe(true);
    expect(pill().textContent).toBe('1.75x');
    toast.destroy();
  });

  it('stops watching the page when destroyed', async () => {
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    toast.destroy();

    // 销毁后再进出全屏，不该有任何残留节点或异常。
    await enterFullscreen();
    await exitFullscreenViaControls();
    vi.advanceTimersByTime(5000);
    expect(document.getElementById('vsc-speed-toast')).toBeNull();
  });

  /* --- 读屏播报通道 --- */

  it('必须通过 live region 播报倍速（它是产品唯一的读屏反馈通道）', () => {
    // 胶囊本身是 aria-hidden 的纯视觉元素，读屏用户从中得不到任何信息。
    // liveRegion.ts 的注释写着这是产品**唯一**对读屏用户可用的反馈路径 ——
    // 删掉 announceThrottled(...) 这一行，读屏用户按了 `=` 之后
    // 得不到任何确认，而且**没有任何视觉症状**（胶囊照样显示）。
    const toast = new SpeedToast();
    toast.show(1.5, video);

    const region = document.getElementById('vsc-live-region');
    expect(region, '必须有 live region').not.toBeNull();
    expect(region!.textContent).toContain('1.5');
    toast.destroy();
  });

  /* --- 自愈 --- */

  it('节点被站点摘掉后能自愈重建', () => {
    // 站点会主动清理不认识的外来 DOM 节点。root 被摘走后若继续复用
    // 游离引用，胶囊会**静默失效** —— 失效时没有任何视觉线索。
    const toast = new SpeedToast();
    toast.show(1.5, video);
    const first = document.getElementById('vsc-speed-toast')!;
    first.remove();

    toast.show(1.25, video);

    const rebuilt = document.getElementById('vsc-speed-toast');
    expect(rebuilt, '应当重建提示节点').not.toBeNull();
    expect(rebuilt, '不能继续复用那个被摘掉的游离节点').not.toBe(first);
    expect(rebuilt!.isConnected).toBe(true);
    expect(rebuilt!.textContent).toBe('1.25x');
    toast.destroy();
  });

  /* --- 位置跟随 --- */

  it('角标常驻期间跟着页面滚动', () => {
    // 角标贴在视频角落，页面一滚它就该跟着挪 —— 否则它会留在旧坐标上，
    // 变成一块飘在页面上的小字。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 视频往下滚 200px：顶边从 100 变成 300 → 提示的 top = 300 + 16 = 316px。
    mockRect(video, 640, 360, 300, 200);
    window.dispatchEvent(new Event('scroll'));

    expect(pill().style.top).toBe('316px');
    toast.destroy();
  });

  it('视频滚出视口上方时，提示钳在视口左上角', () => {
    // 视频顶部滚出屏幕时，提示必须钳到 (16,16) —— 否则它跟着视频跑出屏幕，
    // 用户按了键什么都没看见。
    markPlaying();
    mockRect(video, 640, 360, -100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);

    expect(pill().style.top).toBe('16px');
    toast.destroy();
  });

  it('角标收起之后不再跟着页面跑', () => {
    // hideBadge() 把 scroll / resize 监听摘掉：提示已经看不见了，
    // 再跟着页面重定位是白干活（还会把坐标改坏 —— 角标下次回来时
    // 用的是被改过的旧坐标）。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 视频暂停 = 用户不再需要这个角标 → 角标被彻底放弃。
    video.dispatchEvent(new Event('pause'));
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    const before = pill().style.top;
    mockRect(video, 640, 360, 300, 200);
    window.dispatchEvent(new Event('scroll'));

    expect(pill().style.top, '收起之后不该再跟着页面跑').toBe(before);
    toast.destroy();
  });

  /* --- 时长 --- */

  it('胶囊在 900ms 后淡出', () => {
    const toast = new SpeedToast();
    toast.show(1.5, video);

    vi.advanceTimersByTime(899);
    expect(pill().classList.contains('vsc-visible'), '900ms 之前还在').toBe(true);

    vi.advanceTimersByTime(2);
    expect(pill().classList.contains('vsc-visible'), '900ms 之后淡出').toBe(false);
    toast.destroy();
  });

  it('角标在胶囊淡出 3 秒之后才出现', () => {
    // 「用户 3 秒内没有再操作」—— 从这次调速算起 3 秒。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);

    vi.advanceTimersByTime(900 + 2999);
    expect(pill().classList.contains('vsc-visible'), '3 秒之前不该出现角标').toBe(false);

    vi.advanceTimersByTime(2);
    expect(pill().classList.contains('vsc-visible'), '3 秒之后出现角标').toBe(true);
    toast.destroy();
  });
});
