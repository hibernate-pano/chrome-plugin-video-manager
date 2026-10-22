import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TakeoverNotice } from './takeoverNotice';
import { publishAmbientPreview } from './ambientPreview';

const NOTICE_ID = 'vsc-takeover-notice';

/**
 * 胶囊那一行的下边缘（视口坐标）：内缩 16px + 那一行本身 47px = 63px。
 *
 * ⚠️ 这里必须是**字面量**。
 * 之前这条用例拿 NOTICE_INSET / NOTICE_ROW_HEIGHT 这些**被测常量**算出期望值 ——
 * 常量一改，期望值跟着一起变，断言恒成立（把 NOTICE_ROW_HEIGHT 改成 0
 * 测试照样绿）。那是重言式，不是守卫。
 *
 * 63 = 16 + 47 这两个数的来历写在 runtimeStyles.ts 的常量注释里：
 * 16px 是页面级提示与视频边缘的距离，47px 是胶囊那一行的高度
 * （13px 字号 × line-height 1.4 + 上下各 6px 内边距 = 46.2，向上取整）。
 *
 * ⚠️ 胶囊的排版现在由 `NOTICE_PILL_TOKENS` 决定（见 runtimeStyles.ts），
 * 14px → 13px、内边距 5px → 6px —— 那一行因此从 46px 变成 47px。
 */
const PILL_ROW_BOTTOM = 63;

/**
 * 提示自身的最大高度（最坏的两行），runtimeStyles.ts 里写的是 49px。
 *
 * 49 的来历：13px 字号 × line-height 1.4 = 每行 18.2px，两行 = 36.4px，
 * 加上上下各 6px 内边距 = 48.4px，向上取整到 49。
 * （之前这里写的是 44 —— 那是「两行 ≈ 44px」的估算，比实际少 4.4px。）
 */
const NOTICE_MAX_HEIGHT = 49;

const mockRect = (element: HTMLElement, width: number, height: number, top = 0, left = 0) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      width,
      height,
      top,
      left,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
};

describe('TakeoverNotice', () => {
  let notice: TakeoverNotice;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    // 判定结果住在模块里（见 ambientPreview.ts）：每条用例都要从「没有页面预览」
    // 出发，否则上一条用例的结论会漏进这一条。
    publishAmbientPreview(null);
    notice = new TakeoverNotice();
  });

  afterEach(() => {
    notice.destroy();
    vi.useRealTimers();
  });

  it('says what will not happen, without guessing a reason', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    mockRect(video, 640, 360, 100, 200);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    expect(root.textContent).toBe('这个视频暂时控制不了');
    expect(root.classList.contains('vsc-visible')).toBe(true);
  });

  it('anchors the notice to the bottom-left of the video, not the top-left', () => {
    // 回归（6.0.9 实测）：调速胶囊与接管提示曾经用**逐字相同**的锚点公式，
    // 都贴在视频左上角。接管提示更宽（154px vs 胶囊 54px），它把胶囊整个盖住，
    // 用户看到的是「文字压文字」—— 两个提示都等于没说。
    //
    // 现在接管提示退到视频**左下角**：胶囊占左上角（刚发生的高优先级反馈），
    // 接管提示占左下角（出了点问题的次要信息）。
    //
    // 坐标锚在 **bottom**（离视口下边多远），不是 top ——
    // 锚 bottom 就不需要知道提示自己有多高，而高度随文案语言变化
    // （中 154px / 英 269px），jsdom 里更是恒为 0。
    const video = document.createElement('video');
    document.body.appendChild(video);
    // 视频占 y=100..460（高 360），视口高 768。
    mockRect(video, 640, 360, 100, 200);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    // 左边缘仍与视频左边缘对齐（同一个内缩 16px）：200 + 16 = 216px。
    expect(root.style.left).toBe('216px');
    // 下边缘贴视频下边缘再往上收 16px：视口高 768 - (460 - 16) = 324px。
    expect(root.style.bottom).toBe('324px');
    // 关键：**不能**再是 top 定位 —— top 与 bottom 同时给会让元素被拉高。
    expect(root.style.top).toBe('auto');
  });

  it('keeps the notice clear of the speed pill row even on a short video', () => {
    // 视频太矮时（放不下胶囊一行 + 一条提示），接管提示不能爬回
    // 胶囊那一行去压住它 —— 宁可掉到胶囊**下面**。
    const video = document.createElement('video');
    document.body.appendChild(video);
    // 视频只占 y=0..60。
    mockRect(video, 640, 60, 0, 0);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    // 胶囊那一行的下边缘在 63px 处；提示的下边缘必须低于它，
    // 也就是提示的上边缘在 63px 以下 —— 两者不重叠。
    const limit = 768 - PILL_ROW_BOTTOM - NOTICE_MAX_HEIGHT;
    // 视频下边缘给的位置比这个上限低（视频太矮），所以必须被上限顶住。
    expect(parseFloat(root.style.bottom)).toBeLessThanOrEqual(limit);
    // 确切值：768 - 63 - 49 = 656px。
    // 只写 toBeLessThanOrEqual 是不够的 —— 把 NOTICE_ROW_HEIGHT 改成 0
    // 之后这个上限会跟着变大，断言照样成立；写死确切值才咬得住。
    expect(root.style.bottom).toBe('656px');
    const noticeTop = 768 - parseFloat(root.style.bottom) - 26;
    expect(noticeTop).toBeGreaterThanOrEqual(PILL_ROW_BOTTOM);
  });

  it('adds the iframe offset when the video lives in a same-origin iframe', () => {
    // 这条路径最常见的场景**就是** iframe 里的视频（跨 document 搬不动），
    // 而 iframe 内元素的 rect 用的是 iframe 自己的视口坐标。不换算就会被
    // 钳到屏幕角落——6.0.3 在调速提示上修过同一个坑，这边是同一个坐标系。
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;
    const framedVideo = frameDocument.createElement('video');
    frameDocument.body.appendChild(framedVideo);

    mockRect(frame, 400, 300, 400, 50);
    mockRect(framedVideo, 320, 180, 0, 0);

    notice.show(framedVideo);

    const root = document.getElementById(NOTICE_ID)!;
    // 视频在顶层坐标里占 y=400..580；下边缘往上收 16px → 564；
    // 视口高 768 → bottom = 768 - 564 = 204px。
    // 未换算会是 768 - (180-16) = 604px，正是"掉到屏幕角落"的表现。
    expect(root.style.bottom).toBe('204px');
    // 左边缘 = iframe 左边缘 50 + 内缩 16 = 66px。
    expect(root.style.left).toBe('66px');
  });

  it('falls back to the viewport bottom-left when the video is scrolled off', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    // 视频整个在视口上方（y=-560..-200）。
    mockRect(video, 640, 360, -560, -300);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    // 视频完全在屏幕外 → 提示不能跟着掉出去（用户按了 f 什么都没看见是最糟的）。
    // 退到视口**左下角** —— 左上角是调速胶囊的位置，不能占。
    expect(root.style.bottom).toBe('16px');
    expect(root.style.left).toBe('16px');
    expect(root.style.top).toBe('auto');
  });

  it('keeps the notice inside the viewport when the video is taller than the viewport', () => {
    // 视频比视口高（长视频/长页面）时，下边缘远在屏幕外。
    // 提示必须整个露在屏幕上，而不是有一半在屏幕外。
    const video = document.createElement('video');
    document.body.appendChild(video);
    mockRect(video, 640, 2000, 100, 100);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    const bottom = parseFloat(root.style.bottom);
    // 提示上边缘（视口高 - bottom - 提示高）必须 >= 0。
    expect(768 - bottom - 44).toBeGreaterThanOrEqual(0);
    // 且下边缘不能超过视口高。
    expect(768 - bottom).toBeLessThanOrEqual(768);
  });

  it('follows the video while the page is scrolled', () => {
    // 胶囊是**跟着滚动**走的（它常驻，必须一直贴着视频）。
    // 这条提示以前不跟随，于是两者在不同的滚动状态下会错开甚至重合。
    // 现在两个提示都贴在同一个视频上，相对位置恒定。
    const video = document.createElement('video');
    document.body.appendChild(video);
    mockRect(video, 640, 360, 100, 200);

    notice.show(video);
    const root = document.getElementById(NOTICE_ID)!;
    const before = root.style.bottom;

    // 视频往下滚 100px：下边缘从 460 变成 560 → bottom 从 324 变成 224。
    mockRect(video, 640, 360, 200, 200);
    window.dispatchEvent(new Event('scroll'));

    expect(root.style.bottom).not.toBe(before);
    expect(root.style.bottom).toBe('224px');
  });

  it('stops following once the notice has faded out', () => {
    // 提示只活 2.6 秒。跟随监听必须自己摘掉 ——
    // 否则每次滚动都在重定位一个早就看不见的节点。
    const video = document.createElement('video');
    document.body.appendChild(video);
    mockRect(video, 640, 360, 100, 200);

    notice.show(video);
    vi.advanceTimersByTime(2600);

    mockRect(video, 640, 360, 200, 200);
    window.dispatchEvent(new Event('scroll'));

    // 提示淡出后位置不该再被改动。
    expect(rootBottom()).toBe('324px');
  });

  const rootBottom = () => document.getElementById(NOTICE_ID)?.style.bottom;

  it('fades out on its own', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    notice.show(video);
    expect(document.getElementById(NOTICE_ID)!.classList.contains('vsc-visible')).toBe(true);

    vi.advanceTimersByTime(2600);
    expect(document.getElementById(NOTICE_ID)!.classList.contains('vsc-visible')).toBe(false);
  });

  it('shows nothing at all in a document with no body', () => {
    // SVG/foreignObject 这类文档没有可挂载的宿主，裸调 appendChild 会抛 TypeError。
    const video = document.createElement('video');
    document.body.appendChild(video);
    const body = document.body;
    body.remove();

    expect(() => notice.show(video)).not.toThrow();
    expect(document.getElementById(NOTICE_ID)).toBeNull();

    document.documentElement.appendChild(body);
  });

  it('leaves no trace after destroy', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    notice.show(video);
    notice.destroy();

    expect(document.getElementById(NOTICE_ID)).toBeNull();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('keeps the no-video notice at the viewport corner', () => {
    // 页面上压根没有视频 → 没有锚点，贴视口左上角。
    // 这条路径与「视频接管不了」是两回事，位置也不该被视频那条的
    // bottom 定位污染 —— top 与 bottom 必须互斥地清掉。
    notice.showNoVideo();

    const root = document.getElementById(NOTICE_ID)!;
    expect(root.textContent).toBe('这个页面里没有视频');
    expect(root.style.top).toBe('16px');
    expect(root.style.left).toBe('16px');
    expect(root.style.bottom).toBe('auto');
  });

  it('页面预览：说清楚「为什么」，并给出「下一步」', () => {
    // ⚠️ 这条文案**不能**说「控制不了」：
    // 工具栏图标那条路径**能**接管页面预览（显式点击是明确意图），
    // 说「控制不了」就与事实矛盾 —— 用户看到的会是「图标能、键盘不能」。
    const video = document.createElement('video');
    document.body.appendChild(video);
    publishAmbientPreview(video);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    expect(root.textContent).toBe('这是页面预览 —— 点一下它，或点扩展图标，就能控制它');
    expect(
      root.textContent,
      '必须给出下一步：点一下它就能用快捷键',
    ).toContain('点一下它');
    expect(
      root.textContent,
      '不能说「控制不了」—— 那与工具栏图标路径的事实矛盾',
    ).not.toContain('控制不了');
  });

  it('不是页面预览时仍说「接管不了」（不猜原因）', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    publishAmbientPreview(null);

    notice.show(video);

    const root = document.getElementById(NOTICE_ID)!;
    expect(root.textContent).toBe('这个视频暂时控制不了');
  });
});
