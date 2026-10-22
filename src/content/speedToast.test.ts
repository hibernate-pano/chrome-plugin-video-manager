import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SpeedToast, formatRate } from './speedToast';
import { destroyLiveRegion } from './liveRegion';
import { FULLSCREEN_OVERLAY_ID } from './runtimeStyles';
import { resetExtensionDom } from './testDom';

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
    resetExtensionDom();
    playing = false;
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

  /**
   * jsdom 里没有真正播放的视频，paused 恒为 true；这里手动改。
   *
   * ⚠️ 必须做成**可开关**的，不能写死成 false：
   * 浏览器里「暂停」是**两件事**——先把 paused 置真，再派发 pause 事件。
   * 只派发事件而不动 paused，等于造出一个真实浏览器里不存在的状态，
   * 于是「实现到底该信事件还是该信属性」这件事根本测不出来。
   */
  let playing = false;

  const markPlaying = () => {
    playing = true;
    Object.defineProperty(video, 'paused', { get: () => !playing, configurable: true });
  };

  /** 模拟「用户按了暂停」：浏览器先把 paused 置真，再派发 pause 事件。 */
  const pauseVideo = () => {
    playing = false;
    video.dispatchEvent(new Event('pause'));
  };

  /** 模拟「用户按了播放」：浏览器先把 paused 置假，再派发 play 事件。 */
  const playVideo = () => {
    playing = true;
    video.dispatchEvent(new Event('play'));
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

    pauseVideo();

    expect(pill().classList.contains('vsc-visible')).toBe(false);
    // 收起 = 完全透明（角标形态的 opacity 是 1，胶囊形态是 0）。
    expect(pill().style.opacity).toBe('0');
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

  /*
   * ⚠️ 这里**没有**「角标在白底视频上的对比度」这条 jsdom 用例。
   *
   * 之前有一条叫 "keeps the badge readable on a white video (WCAG AA)"，
   * 它读的是 `pill().style.*`（**内联值**）—— 而浏览器真正渲染的是
   * getComputedStyle 的值。两者被 `!important` 分道扬镳：
   * 站点的 `div { color:#f00 !important; ... }` 能把内联值打穿，
   * 而那条用例读不到这一点，于是它**声称在守的对比度在浏览器里并不成立**
   * （实测：白底视频上从 11.21:1 掉到 2.29:1，连 AA-large 的 3:1 都过不了）。
   *
   * 渲染结果的对比度由**真实浏览器**量：tests/e2e/style-isolation.spec.js
   * 读 getComputedStyle 的颜色，按 WCAG 相对亮度公式算对比度。
   * jsdom 没有布局引擎、也不实现 `all: initial` 与 important 的级联，
   * 在这里算出来的对比度是假的。
   */

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
    //
    // ⚠️ 「清干净」现在指的是「换回胶囊形态的值」，不是「把属性摘掉」：
    // 隔离底座里的 `all: initial !important` 会把摘掉的属性打回初始值
    // （padding 归 0、字号 16px、底板透明）—— 那样弹出来的胶囊就是一个
    // 没有底板的裸文字。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().style.backgroundColor).toBe('rgba(0, 0, 0, 0.78)');
    expect(pill().style.fontSize).toBe('12px');

    pauseVideo();

    // ⚠️ 断言对着 **token** 写，不写死字面量：
    // 胶囊的排版来自 runtimeStyles 的 NOTICE_PILL_TOKENS（与接管提示共用），
    // 写死 '14px' 只会让「token 改了、测试还按旧值红」这种漂移变成噪音，
    // 于是人开始去改测试而不是去改 token。
    expect(pill().style.backgroundColor).toBe('rgba(0, 0, 0, 0.66)');
    expect(pill().style.fontSize).toBe('13px');
    expect(pill().style.padding).toBe('6px 12px');
    expect(pill().style.borderRadius).toBe('999px');
    expect(pill().style.color).toBe('rgb(248, 250, 252)');
    expect(pill().style.opacity).toBe('0');
    toast.destroy();
  });

  /* --- 全屏进出 --- */

  /** 等 MutationObserver 的回调落地（它是微任务）。 */
  const flushMutations = async () => {
    await Promise.resolve();
  };

  /**
   * 模拟进入网页全屏。
   *
   * ⚠️ 除了挂上全屏背板，还必须把视频的盒子改成**全屏里的样子**：
   * 真实浏览器里进全屏时，视频被搬进覆盖层并变成
   * `position:fixed; inset:0; width:100vw; height:100vh`（没有 transform:scale），
   * 于是它的 rect 就是整个视口。不改这个盒子的话，用例会以为
   * 「视频在进全屏之后还在老地方」—— 那正是本组用例要守的反面。
   */
  const enterFullscreen = async (target: HTMLVideoElement = video) => {
    const overlay = document.createElement('div');
    overlay.id = FULLSCREEN_OVERLAY_ID;
    document.body.appendChild(overlay);
    mockRect(target, window.innerWidth, window.innerHeight, 0, 0);
    await flushMutations();
  };

  /**
   * 模拟控制条自己的退出按钮退出全屏。
   *
   * ⚠️ 这条路径**不经过运行时**：FullscreenController.exit() 只把全屏背板
   * 摘掉，运行时完全不知情。所以角标只能自己观察到背板被摘掉。
   *
   * 视频的盒子也一并还原成页面上的位置 —— 真实浏览器里 exit() 正是
   * 把视频放回原来的槽位。
   */
  const exitFullscreenViaControls = async (
    pagePosition: { top: number; left: number } = { top: 100, left: 200 },
  ) => {
    document.getElementById(FULLSCREEN_OVERLAY_ID)?.remove();
    mockRect(video, 640, 360, pagePosition.top, pagePosition.left);
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

  /* --- 全屏里的胶囊位置（P0-4）--- */

  it('进网页全屏后，胶囊重新贴到全屏画面上（不能留在旧坐标）', async () => {
    // 进全屏时视频被搬进覆盖层、放大到整个视口（position:fixed; inset:0;
    // 100vw×100vh，没有 transform:scale），于是它的位置整个变了。
    // 胶囊贴的是**视频的左上角**——不跟着重贴一次，它就留在进全屏之前
    // 那个页面坐标上，浮在黑底覆盖层的外面（视觉上「有个东西飞在画面外」）。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);

    // 进全屏之前：胶囊贴在视频的左上角（100+16 / 200+16）。
    expect(pill().style.top).toBe('116px');
    expect(pill().style.left).toBe('216px');

    await enterFullscreen();

    // 进全屏之后：视频铺满视口，胶囊必须跟着重新贴一次。
    expect(pill().style.top, '胶囊不能留在进全屏之前的坐标上').toBe('16px');
    expect(pill().style.left, '胶囊不能留在进全屏之前的坐标上').toBe('16px');
    toast.destroy();
  });

  it('退出全屏后胶囊回到页面的位置（不留残渣）', async () => {
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);

    await enterFullscreen();
    expect(pill().style.top).toBe('16px');

    await exitFullscreenViaControls({ top: 100, left: 200 });

    // 视频回到页面原位，胶囊必须跟着回去 —— 否则它留在全屏时那块坐标上。
    expect(pill().style.top, '退出全屏后胶囊必须回到页面的位置').toBe('116px');
    expect(pill().style.left, '退出全屏后胶囊必须回到页面的位置').toBe('216px');
    toast.destroy();
  });

  it('全屏里调速：胶囊出现在全屏画面上（控制条不闪时它是唯一的反馈）', async () => {
    // 全屏控制条上**确实**写着倍速，但它不会为键盘调速「闪一下」：
    // SPEED_CHANGE_EVENT 是控制条**发**出来的（给运行时订阅），
    // 控制条自己不监听它；而控制条的「按键唤醒」监听器排在
    // document_start 桥接监听器之后，被后者的 stopImmediatePropagation
    // 挡掉 —— 于是键盘调速时控制条根本不会醒来。
    //
    // 结论：全屏里调速的**唯一**视觉反馈就是这个胶囊，它必须在正确的位置上。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);

    await enterFullscreen();

    // 全屏里再调一次速。
    toast.show(2, video);

    expect(pill().classList.contains('vsc-visible'), '全屏里调速必须有反馈').toBe(true);
    expect(pill().textContent).toBe('2x');
    expect(pill().style.top, '胶囊必须落在全屏画面上').toBe('16px');
    expect(pill().style.left, '胶囊必须落在全屏画面上').toBe('16px');
    toast.destroy();
  });

  it('全屏里暂停的视频恢复播放时，也不会长出角标（控制条上就写着倍速）', async () => {
    // 角标在全屏里是**重复信息**（控制条上写着倍速），所以恢复播放
    // 也不能把它放出来 —— 否则全屏里会同时有两处倍速读数。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);

    await enterFullscreen();
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    // 全屏里暂停又恢复播放：角标仍然不该出来。
    pauseVideo();
    playVideo();
    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible'), '全屏里不该长出角标').toBe(false);

    // 退出全屏后：意图一直在，角标自己回来。
    await exitFullscreenViaControls();
    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible'), '退出全屏后角标该回来').toBe(true);
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
    // 用户在全屏里暂停了视频 —— 视频还暂停着，角标就不该出现。
    // 全屏控制条上有暂停按钮，但视频本身的 pause 事件照样会来。
    //
    // ⚠️ 暂停**不**放弃意图（那是 P1-7 的设计修正）：意图留着，
    // 等用户恢复播放角标再回来。这条用例守的是「暂停期间角标不出现」。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);

    await enterFullscreen();
    pauseVideo();
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
    // 角标没出 → 胶囊形态的底板还在（不是角标那块更实的深色）。
    expect(pill().style.backgroundColor).toBe('rgba(0, 0, 0, 0.66)');
    expect(pill().style.fontSize).toBe('13px');
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
    pauseVideo();
    expect(pill().classList.contains('vsc-visible')).toBe(false);

    const before = pill().style.top;
    mockRect(video, 640, 360, 300, 200);
    window.dispatchEvent(new Event('scroll'));

    expect(pill().style.top, '收起之后不该再跟着页面跑').toBe(before);
    toast.destroy();
  });

  /* --- 角标滚出视口 --- */

  it('视频滚出视口时角标收起，滚回来后自己回来', () => {
    // 实测的 bug：角标常驻后用户往下滚一点（视频还在屏幕边缘）→ 角标消失；
    // **滚回来，角标再也不出现**，直到用户再按一次调速键。
    //
    // 根因：滚出视口走的是 abandonBadge()（连「想知道当前倍速」的意图一起
    // 清掉）。但滚出视口与进全屏是同一类事件 —— 暂时看不到 / 换个地方看，
    // 意图要留着。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 视频整个滚到视口上方（视口高 768，rect.bottom = -40 → 完全不在视口里）。
    mockRect(video, 640, 360, -400, 200);
    window.dispatchEvent(new Event('scroll'));
    expect(pill().classList.contains('vsc-visible'), '滚出视口后角标该收起').toBe(false);

    // 滚回来：角标**不会立刻**出现（与第一次一样要重新等 3 秒）。
    mockRect(video, 640, 360, 100, 200);
    window.dispatchEvent(new Event('scroll'));
    expect(pill().classList.contains('vsc-visible'), '刚滚回来时角标还没到点').toBe(false);

    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible'), '滚回来后角标必须自己回来').toBe(true);
    expect(pill().textContent).toBe('1.5x');
    toast.destroy();
  });

  it('视频暂停之后角标不会自己回来（滚回视口也不行），要等用户恢复播放', () => {
    // 「滚出视口」与「视频暂停」是同一类事件 —— 暂时看不到，意图要留着。
    // 但它们都**不是**「用户想看这个读数」的信号：角标要等用户恢复播放。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 先滚出去（收起但保留意图），再暂停（同样保留意图）。
    mockRect(video, 640, 360, -400, 200);
    window.dispatchEvent(new Event('scroll'));
    pauseVideo();

    mockRect(video, 640, 360, 100, 200);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(5000);

    expect(pill().classList.contains('vsc-visible'), '恢复播放之前不该回来').toBe(false);

    // 用户恢复播放 → 角标自己回来。
    playVideo();
    expect(pill().classList.contains('vsc-visible'), '恢复播放后角标必须自己回来').toBe(true);
    expect(pill().textContent).toBe('1.5x');
    toast.destroy();
  });

  /* --- 暂停 → 继续播放（P1-7）--- */

  it('暂停之后继续播放，角标自己回来（不必再按一次调速键）', () => {
    // 实测的 bug：用户按空格暂停 → 角标收起；再按空格继续播放 →
    // 角标**再也不回来**，直到他再按一次 `=`。
    //
    // 根因是设计判断：暂停被当成了「用户不再需要这个读数」，于是
    // 「想知道当前倍速」这个**意图**被一起扔掉了。但暂停与「滚出视口」
    // 「进全屏」是同一类事件 —— 暂时看不到。真正该放弃意图的只有
    // 「视频从 DOM 里被移除」。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    pauseVideo();
    expect(pill().classList.contains('vsc-visible'), '暂停后角标该收起').toBe(false);

    playVideo();
    expect(pill().classList.contains('vsc-visible'), '恢复播放后角标必须自己回来').toBe(true);
    expect(pill().textContent).toBe('1.5x');
    toast.destroy();
  });

  it('恢复出来的是常驻角标，不会再走一次「3 秒后转成角标」', () => {
    // 恢复走的是「胶囊 → 3 秒 → 角标」那条路的话，用户按下播放之后
    // 还要再等 3 秒才看到读数 —— 那等于把 bug 换了个形式。
    // 而且出来的一定要是**常驻角标**：胶囊 900ms 后淡出、再等 3 秒才转成
    // 角标，那是「用户刚调过速」的流程，而这里用户根本没调速。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);

    pauseVideo();
    playVideo();

    // 恢复是**立刻**的：那 3 秒不该再走一遍。
    expect(pill().classList.contains('vsc-visible'), '恢复播放后角标必须立刻回来').toBe(true);
    // 而且恢复出来的就是角标形态（更小的字号、更实的底板）。
    expect(pill().style.backgroundColor).toBe('rgba(0, 0, 0, 0.78)');
    expect(pill().style.fontSize).toBe('12px');

    // 再等 3 秒：计时器没被搞乱 —— 角标还在，而且仍然是角标形态。
    vi.advanceTimersByTime(3000);
    expect(pill().classList.contains('vsc-visible'), '计时器没被搞乱，角标不该消失').toBe(true);
    expect(pill().style.backgroundColor).toBe('rgba(0, 0, 0, 0.78)');
    expect(pill().style.fontSize).toBe('12px');
    toast.destroy();
  });

  it('视频从 DOM 里被移除后，角标不会在别的视频上复活', () => {
    // 「视频被移除」才是真的不需要这个读数了：意图指向的对象已经不在
    // 页面上了，连意图一起清掉。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 站点把视频换掉了（重建播放器、SPA 换页）。
    video.remove();

    // 位置重算时会发现「视频已经不在页面上了」→ 角标连同意图一起没。
    window.dispatchEvent(new Event('scroll'));
    expect(pill().classList.contains('vsc-visible'), '视频没了就该收起角标').toBe(false);

    // 别的视频开始播：也不该凭旧意图长出一个指向它的角标。
    const other = document.createElement('video');
    document.body.appendChild(other);
    other.dispatchEvent(new Event('play'));
    expect(pill().classList.contains('vsc-visible'), '别的视频上不该复活角标').toBe(false);
    toast.destroy();
  });

  it('换成别的视频后，旧视频的 play 事件不该把新视频的角标弄乱', () => {
    // 旧视频的监听器必须摘干净：它的 play 事件会让实现认为
    // 「视频已经不在页面上了」，进而把**新**视频的意图一起丢掉。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 站点换了个视频：旧的被摘掉，新的接上。
    const other = document.createElement('video');
    document.body.appendChild(other);
    Object.defineProperty(other, 'paused', { get: () => false, configurable: true });
    video.remove();

    // 用户在新视频上重新调速 → 意图指向新视频。
    toast.show(2, other);
    vi.advanceTimersByTime(3900);
    expect(pill().textContent).toBe('2x');
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 旧视频的 play 事件：监听器已摘干净，不该有任何作用。
    video.dispatchEvent(new Event('play'));
    expect(pill().classList.contains('vsc-visible'), '旧视频不该影响新视频的角标').toBe(true);
    toast.destroy();
  });

  /* --- 读屏用户的「当前倍速」出口 --- */

  it('读屏用户可以随时查到当前倍速（视觉隐藏但 AT 可读）', () => {
    // 常驻角标是 aria-hidden 的纯视觉元素，live region 里只有「值变化那一刻」
    // 的一次性播报 —— 于是视力用户可以随时确认「我现在是几倍速」，
    // **读屏用户没有任何等价物**。
    const toast = new SpeedToast();
    toast.show(1.5, video);

    const state = document.getElementById('vsc-speed-state');
    expect(state, '必须有「当前倍速」的镜像节点').not.toBeNull();
    expect(state!.textContent).toContain('1.5');

    // 视觉上完全不可见：1px + clip（与 #vsc-live-region 同一手法）。
    expect(state!.style.width).toBe('1px');
    expect(state!.style.height).toBe('1px');
    expect(state!.style.overflow).toBe('hidden');
    expect(state!.style.getPropertyValue('clip-path')).toBe('inset(50%)');

    // ⚠️ 绝不能是 polite：那是「变化时播报」，这里要的是「随时可查」。
    expect(state!.getAttribute('aria-live')).toBe('off');

    // 也不能对读屏隐藏 —— 那就与不做一模一样。
    expect(state!.getAttribute('aria-hidden')).toBeNull();

    toast.destroy();
  });

  it('「当前倍速」随倍速变化更新', () => {
    const toast = new SpeedToast();
    toast.show(1.5, video);
    expect(document.getElementById('vsc-speed-state')!.textContent).toContain('1.5');

    toast.show(2, video);
    expect(document.getElementById('vsc-speed-state')!.textContent).toContain('2');
    expect(document.getElementById('vsc-speed-state')!.textContent).not.toContain('1.5');

    toast.destroy();
  });

  /* --- 站点自己改速（读数不能撒谎）--- */

  it('角标显示的是视频此刻真实的倍速，而不是扩展最后一次设置的值', () => {
    // 实测的 bug：用户在 YouTube 自己的菜单里把倍速改成 1.25x，
    // 扩展完全不知情 —— 角标与工具栏标题继续显示 1.5x。
    //
    // 用户照着角标判断「我现在是 1.5 倍」，而画面上其实是 1.25 倍 ——
    // 这是产品里唯一常驻的读数在撒谎。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);
    expect(pill().textContent).toBe('1.5x');

    // 站点自己改速（jsdom 的 playbackRate 是真的存取器，改值会派发 ratechange）。
    video.playbackRate = 1.25;

    expect(pill().textContent, '角标必须跟着视频真实的倍速走').toBe('1.25x');
    toast.destroy();
  });

  it('站点复位到 1x 时，读屏镜像也跟着复位', () => {
    // 读屏用户随时可查「当前倍速」的那个节点（#vsc-speed-state）同样不能撒谎。
    const toast = new SpeedToast();
    toast.show(1.5, video);
    expect(document.getElementById('vsc-speed-state')!.textContent).toContain('1.5');

    video.playbackRate = 1;

    expect(document.getElementById('vsc-speed-state')!.textContent).toContain('1x');
    expect(document.getElementById('vsc-speed-state')!.textContent).not.toContain('1.5');
    toast.destroy();
  });

  it('倍速变了要通知运行时（工具栏标题要跟着变）', () => {
    // 运行时靠这条回调把新倍速上报给 background —— 工具栏图标的标题
    // 是用户在非全屏状态下唯一看得见的读数，它必须同步。
    const seen: number[] = [];
    const toast = new SpeedToast({
      onRateChange: (rate) => seen.push(rate),
    });

    toast.show(1.5, video);
    expect(seen).toEqual([1.5]);

    // 站点自己改速 → 也要上报。
    video.playbackRate = 1.25;
    expect(seen).toEqual([1.5, 1.25]);

    toast.destroy();
  });

  it('换成别的视频后，旧视频的倍速变化不该再改读数', () => {
    // 监听器必须跟着「意图指向的那个视频」走：旧元素上残留的 ratechange
    // 事件不该把新视频的读数改掉。
    markPlaying();
    const toast = new SpeedToast();
    toast.show(1.5, video);

    const other = document.createElement('video');
    document.body.appendChild(other);
    toast.show(2, other);
    expect(pill().textContent).toBe('2x');

    // 旧视频的倍速又变了：读数不该跟着动。
    video.playbackRate = 3;
    expect(pill().textContent, '旧视频不该影响新视频的读数').toBe('2x');
    toast.destroy();
  });

  it('视频从页面里消失后，监听器要摘干净', async () => {
    // 泄漏的监听器不只是浪费：它会让一个已经不在页面上的视频
    // 继续改写画面上的读数（而画面上的读数早就该撤掉了）。
    const seen: number[] = [];
    const toast = new SpeedToast({
      onRateChange: (rate) => seen.push(rate),
    });
    toast.show(1.5, video);

    video.remove();
    await flushMutations();

    const before = seen.length;
    video.playbackRate = 2;
    expect(seen.length, '消失的视频不该再上报倍速').toBe(before);
    toast.destroy();
  });

  /* --- 孤儿角标 --- */

  it('站点把视频摘掉后，角标自己撤掉（不用等用户滚动一下）', async () => {
    // 实测的 bug：SPA 换页 / 切清晰度之后，页面左上角永久留着一块
    // 指向虚无的 "1.5x" 黑底角标 —— 直到用户碰巧滚一下页面才消失。
    //
    // 根因：角标是常驻的，而「视频已经不在了」这件事只有 updatePosition()
    // 会发现，而它只在滚动/缩放时才跑。
    markPlaying();
    mockRect(video, 640, 360, 100, 200);
    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 站点把播放器整个换掉了。
    video.remove();
    await flushMutations();

    expect(pill().classList.contains('vsc-visible'), '视频没了，角标必须自己撤掉').toBe(false);
    toast.destroy();
  });

  it('整棵播放器被换掉时，角标也要撤掉（不只是父节点被换掉）', async () => {
    // 站点换播放器的方式有两种：直接 video.remove()，或者把整个容器换掉
    // （视频跟着祖先一起消失，它自己的父节点根本没变）。
    // 只盯着父节点会漏掉后一种 —— 而那恰恰是 SPA 换页时的常见形态。
    markPlaying();
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.appendChild(video);
    mockRect(video, 640, 360, 100, 200);

    const toast = new SpeedToast();
    toast.show(1.5, video);
    vi.advanceTimersByTime(3900);
    expect(pill().classList.contains('vsc-visible')).toBe(true);

    // 整个容器被换掉。
    container.remove();
    await flushMutations();

    expect(pill().classList.contains('vsc-visible'), '祖先被换掉也要撤掉角标').toBe(false);
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

  /* --- i18n 契约 --- */

  it('倍速文案的占位符必须交给 i18n 解析（调用点不自己 replace）', () => {
    // src/shared/i18n.ts 的模块说明写着「占位符一律由这里负责解析，
    // 调用点不用自己 replace」。而旧代码恰恰是自己 replace：
    //   t('speedChanged', '播放速度 {rate}x').replace('{rate}', formatRate(rate))
    //
    // 渲染结果两者一样 —— 所以这条断言不看结果，看**替换值是怎么传进去的**：
    // 交给 i18n 的话，substitutions 是 ['1.5']；调用点自己 replace 的话，
    // 传进去的是 token 本身 ['{rate}']。
    const calls: Array<[string, string[] | undefined]> = [];
    const original = (globalThis as Record<string, unknown>).chrome;
    (globalThis as Record<string, unknown>).chrome = {
      i18n: {
        getMessage: (key: string, substitutions?: string[]) => {
          calls.push([key, substitutions]);
          // 模拟 Chrome：位置占位符由 Chrome 自己替换掉。
          return 'Playback speed $1x'.replace('$1', substitutions?.[0] ?? '');
        },
      },
    };

    try {
      const toast = new SpeedToast();
      toast.show(1.5, video);

      const region = document.getElementById('vsc-live-region');
      expect(region!.textContent).toBe('Playback speed 1.5x');

      const call = calls.find(([key]) => key === 'speedChanged');
      expect(call, '必须取 speedChanged').toBeTruthy();
      expect(call![1], '替换值必须原样交给 i18n').toEqual(['1.5']);

      toast.destroy();
    } finally {
      (globalThis as Record<string, unknown>).chrome = original;
    }
  });

  it('locale 里的倍速文案用 Chrome 原生占位符（$1），并声明了 placeholders', () => {
    // 与 src/shared/i18n.test.ts 里 hintSpeed 那条同一套规矩。
    // ⚠️ 期望值必须是**字面量**，不能拿被测常量拼出来。
    (['en', 'zh_CN'] as const).forEach((locale) => {
      const messages = JSON.parse(
        readFileSync(resolve(process.cwd(), '_locales', locale, 'messages.json'), 'utf8'),
      ) as Record<string, { message?: string; placeholders?: Record<string, { content?: string }> }>;

      expect(messages.speedChanged?.message, `${locale}/speedChanged`).toContain('$1');
      expect(messages.speedChanged?.placeholders?.rate?.content).toBe('$1');
      expect(messages.speedCurrent?.message, `${locale}/speedCurrent`).toContain('$1');
      expect(messages.speedCurrent?.placeholders?.rate?.content).toBe('$1');
    });
  });
});
