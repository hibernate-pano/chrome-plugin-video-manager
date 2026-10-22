import { t } from '../shared/i18n';
import { formatRate } from '../shared/rate';
import { announceThrottled } from './liveRegion';
import { topLevelRect } from './frameOffset';
import {
  FULLSCREEN_OVERLAY_ID,
  NOTICE_FADE,
  NOTICE_INSET,
  NOTICE_PILL_TOKENS,
  hideNotice,
  isolateNotice,
  setImportant,
  setImportantAll,
  showNotice,
} from './runtimeStyles';
import { mountViewportRoot } from './viewportRoot';
import { observeBody } from './bodyObserver';
import type { BodyObserver } from './bodyObserver';
import { watchFullscreenSession } from './fullscreenSession';
import type { FullscreenSession } from './fullscreenSession';

const TOAST_ID = 'vsc-speed-toast';
const HIDE_DELAY = 900;

/**
 * 「当前倍速」的读屏镜像节点的 id。
 *
 * 它与调速胶囊、常驻角标是**三个不同的东西**：胶囊与角标是同一个节点的
 * 两种形态，而它是另一个节点 —— 视觉上完全不可见，只为读屏而存在。
 */
const STATE_ID = 'vsc-speed-state';

/**
 * 胶囊形态的外观。
 *
 * 排版**不**在这里写死：它来自 `runtimeStyles.ts` 的 `NOTICE_PILL_TOKENS` ——
 * 与接管提示**逐项相同**的同一套 token（字号、字重、行高、字体族、内边距、
 * 圆角、底色）。
 *
 * 为什么要共用：这两个是同一类东西（都锚在视频上、都是一次性的短提示）。
 * 用户看到两个形状相同的东西却长得不一样，会以为是两个不同的功能。
 * 改 token 的连带影响（`NOTICE_ROW_HEIGHT` / `NOTICE_MAX_HEIGHT`）见
 * runtimeStyles.ts 的注释。
 *
 * ⚠️ 全部走**内联样式**（而不是 runtimeStyles 里的 CSS 规则）：
 * 提示挂在页面里，站点的 `div { ... !important }` 会打穿样式表里的
 * 任何普通声明。隔离机制见 runtimeStyles.ts 的「页面级提示的样式隔离」。
 */
export const PILL_STYLES: Record<string, string> = {
  ...NOTICE_PILL_TOKENS,
  opacity: '0',
  'pointer-events': 'none',
  transition: NOTICE_FADE,
};

/**
 * 常驻角标形态的外观。
 *
 * 与胶囊的差别：字号更小、底板更实、圆角更方、完全不透明、不做过渡。
 * 每一项的理由见 applyBadgeStyles 的注释。
 */
export const BADGE_STYLES: Record<string, string> = {
  'font-size': '12px',
  'font-weight': '500',
  padding: '1px 5px',
  'border-radius': '5px',
  'background-color': 'rgba(0, 0, 0, 0.78)',
  color: '#f8fafc',
  opacity: '1',
  'pointer-events': 'none',
  transition: 'none',
};

/**
 * 「当前倍速」镜像节点的外观：视觉上完全不可见。
 *
 * 尺寸必须压到 1px 并 clip —— 否则页面上会多出一个空白块挡着内容。
 * 与 #vsc-live-region 是同一手法。
 */
const STATE_STYLES: Record<string, string> = {
  width: '1px',
  height: '1px',
  margin: '0',
  padding: '0',
  border: 'none',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  'clip-path': 'inset(50%)',
  'white-space': 'nowrap',
  opacity: '1',
  transition: 'none',
};

/**
 * 胶囊淡出后多久转成常驻角标。
 *
 * 「用户 3 秒内没有再操作」——从这次调速算起 3 秒。到点还什么都没发生，
 * 说明用户不是在连按调速，而是想确认「我现在到底是几倍速」。
 */
const BADGE_DELAY = 3000;

/**
 * 1.50 -> "1.5"，1.00 -> "1"。
 *
 * 实现住在 `src/shared/rate.ts` —— background 也要用它拼工具栏图标的 tooltip，
 * 而 background 不该为了一个纯函数把整个内容脚本模块打进它的 bundle。
 * 这里只做 re-export，方便既有引用不必改。
 */
export { formatRate };

/**
 * 胶囊的对外依赖。
 *
 * 之所以做成回调而不是让胶囊自己去发消息：内容脚本 ↔ background 的消息协议
 * 住在运行时那一层（runtime.ts），胶囊只负责「画面上那个读数」。
 * 两者一旦各自发一条消息，同一次调速就会被记成两次上报。
 */
export interface SpeedToastOptions {
  /**
   * 倍速变了之后的通知。
   *
   * 运行时用它把新的倍速上报给 background —— 工具栏图标的标题要跟着变，
   * 而标题是用户在非全屏状态下**唯一**看得见的倍速读数。
   */
  onRateChange?: (rate: number, video: HTMLVideoElement) => void;
}

/**
 * 极简调速提示：调速时出现一次，约 1 秒后淡出。
 * 不画图标、不做动画曲线，只有一个数字。
 *
 * 但「淡出」不等于「消失」：胶囊淡出后，若视频仍在播放、仍在视口里、
 * 且用户没有再操作，它会缩成一个常驻角标贴在视频角落。
 *
 * 为什么需要常驻角标：控制条 3 秒就隐藏，键盘调速时它根本不在屏幕上，
 * 而非全屏状态下**没有任何其它地方**显示当前倍速。胶囊一消失，
 * 用户就只能凭记忆猜自己刚才调到了几倍 —— 这是「调了速却不知道调成多少」
 * 这种真实困惑的根源。
 *
 * 角标必须足够不打扰：12px、贴在视频左上角、pointer-events: none
 * （绝不挡住用户点视频）。
 *
 * ⚠️ 「很淡」必须靠**尺寸**实现，绝不能靠 opacity —— 白底视频上
 * 半透明的角标对比度只有 1.91:1，字几乎看不见。计算过程见 applyBadgeStyles。
 */
export class SpeedToast {
  private root: HTMLDivElement | null = null;
  private hideTimer: number | null = null;
  private badgeTimer: number | null = null;
  private activeVideo: HTMLVideoElement | null = null;
  /** 当前是否处在「常驻角标」形态。 */
  private badgeActive = false;
  /**
   * 「用户想知道这个视频现在是几倍速」这个意图，以及它指向哪个视频。
   *
   * 它和「角标此刻是不是显示着」是**两件事**，必须分开记：
   * - 进全屏时角标必须收起（控制条上就写着倍速，重复信息），
   *   但这个意图要留着 —— 退出全屏后角标必须自己回来，
   *   否则用户就再也看不到当前倍速了（6.0.9 实测的 bug）。
   * - 视频暂停、滚出视口也只是「暂时看不到」，意图同样要留着
   *   （见 badgeSuspendedBy）。
   * - 只有「视频从 DOM 里被移除」才是真的不需要了 —— 那时连意图一起清掉。
   */
  private badgeTarget: HTMLVideoElement | null = null;
  /**
   * 角标「为什么」被收起来了。
   *
   * 收起的原因决定**怎么回来**，所以不能只记一个布尔：
   * - 'viewport'：视频滚出了视口 —— 滚回来时重新排 3 秒的计时
   *   （别在用户滚动的时候把界面拽回来）。
   * - 'paused'：视频暂停了 —— 恢复播放时**立刻**回来（用户刚按下播放，
   *   他要的正是「我现在是几倍速」这个确认）。
   * - null：没收起。
   *
   * ⚠️ 之前暂停走的是 abandonBadge()（连「想知道当前倍速」的意图一起丢掉），
   * 于是用户按下播放继续看时角标**再也不回来**，直到他再按一次调速键（实测）。
   * 暂停与「滚出视口」「进全屏」是同一类事件 —— 暂时看不到，
   * 不是「用户不再需要这个读数」。
   */
  private badgeSuspendedBy: 'viewport' | 'paused' | null = null;
  /**
   * 盯着「网页全屏会话」的那个观察者。
   *
   * 退出全屏时角标要自己回来，而控制条的退出按钮不经过运行时 ——
   * 没有别的通知渠道，只能自己观察（见 observeFullscreenSurface）。
   *
   * ⚠️ 判据与信号源都在 fullscreenSession.ts 里（与首次引导共用一份），
   * 这里不自己判断「是不是在全屏里」。
   */
  private fullscreenSession: FullscreenSession | null = null;
  /**
   * 上一次观察到的全屏状态。
   *
   * ⚠️ 这份状态由 fullscreenSession 持有（它是唯一的事实来源）；
   * 这里只留一份镜像，用来在「观察者还没挂上」时也答得出
   * 「此刻是不是在全屏里」。
   */
  private fullscreenActive = false;
  /** 位置监听是否已挂上（胶囊或角标活着的时候要跟着滚动走）。 */
  private listenersAttached = false;
  /**
   * 观察 pause / play 的那个视频。
   *
   * ⚠️ 它与 badgeTarget **永远是同一个视频**（同生共死）：
   * - show() 同时设定两者；
   * - abandonBadge() 同时清掉两者（并摘掉监听器）。
   *
   * 这个不变量是「换了视频之后旧监听器不会误伤」的全部依据：
   * pause / play 事件只可能来自意图指向的那个视频。
   * 所以处理函数里**刻意不再**检查「这个事件是不是来自当前意图的视频」——
   * 那种检查会让「监听器有没有摘干净」变成一个**不可观测**的属性
   * （旧视频的事件根本到不了那里，检查它等于检查一个恒真的条件）。
   */
  private observedVideo: HTMLVideoElement | null = null;
  /** 「当前倍速」的读屏镜像节点。 */
  private stateNode: HTMLElement | null = null;
  /**
   * 上一次写进读数的倍速。
   *
   * 用它判断「倍速是不是真的变了」：没变就不该重复播报（读屏用户听一遍
   * 就够了），变了才播。
   */
  private displayedRate: number | null = null;
  /**
   * 盯着「角标指向的那个视频还在不在页面里」的观察者。
   *
   * 为什么需要它：角标一旦长出来就会**一直留在页面上**，而 updatePosition()
   * 只在滚动/缩放时才会发现「视频已经不在了」。于是站点换播放器（SPA 换页、
   * 切清晰度）之后，那块指向虚无的 "1.5x" 角标会一直挂在页面左上角 ——
   * 直到用户碰巧滚一下页面。
   *
   * ⚠️ 必须观察 **body 的整棵子树**：视频被摘掉的方式有两种 ——
   * 站点直接 video.remove()（父节点变了），或者整个播放器容器被换掉
   * （视频跟着祖先一起消失，它自己的父节点根本没变）。
   * 只盯着父节点会漏掉后一种，而那恰恰是 SPA 换页时的常见形态。
   */
  private targetWatcher: BodyObserver | null = null;
  private readonly onRateChange: SpeedToastOptions['onRateChange'];
  private readonly boundUpdatePosition = () => this.updatePosition();
  private readonly boundHandleVideoPause = () => this.suspendBadge('paused');
  private readonly boundHandleVideoPlay = (event: Event) => {
    const video = event.target;
    if (video instanceof HTMLVideoElement) {
      this.restoreBadgeAfterPlay(video);
    }
  };
  /**
   * 视频的倍速被改了。
   *
   * ⚠️ 这里读的是**视频此刻真实的 playbackRate**，不是扩展最后一次设置的值：
   * 站点自己改速（YouTube 的倍速菜单、换清晰度后复位成 1x）时扩展根本不知情 ——
   * 角标与工具栏标题于是继续显示旧值，而那正是用户在照着信的读数。
   *
   * ⚠️ 用「有没有 playbackRate」而不是 instanceof 判断：视频可能住在
   * 另一个 realm（同源 iframe）里，本 realm 的构造器认不出它。
   */
  private readonly boundHandleRateChange = (event: Event) => {
    const video = event.target as HTMLVideoElement | null;
    if (!video || typeof video.playbackRate !== 'number') {
      return;
    }

    this.applyRate(video.playbackRate, video);
  };

  constructor(options: SpeedToastOptions = {}) {
    this.onRateChange = options.onRateChange;
  }

  private ensureRoot(): HTMLDivElement | null {
    // SVG/foreignObject 等文档里 document.body === null，这类文档没有可挂载
    // 的宿主；裸调 appendChild 会抛 TypeError。没有宿主就不显示提示。
    if (!document.body) {
      return null;
    }

    // 自愈：个别站点会主动清理不认识的外来 DOM 节点；root 被摘走后
    // 若继续复用游离引用，toast 会静默失效。检测到脱离文档就重建。
    if (this.root && this.root.isConnected) {
      return this.root;
    }

    const root = document.createElement('div');
    root.id = TOAST_ID;
    root.setAttribute('aria-hidden', 'true');
    root.textContent = '1x';
    // 隔离必须在挂上页面之前做完：站点的一条全局 CSS 随时可能命中它。
    isolateNotice(root, PILL_STYLES);
    // 挂到 <html>：body 带 transform 时 fixed 会相对 body 的盒子定位，
    // 胶囊就会飘到视口之外。详见 viewportRoot.ts。
    mountViewportRoot(root);
    this.root = root;
    return root;
  }

  private updatePosition() {
    const root = this.root;
    const video = this.activeVideo;
    if (!root || !video) {
      return;
    }

    // 视频已经从 DOM 里被摘掉了（站点重建了播放器、SPA 换页）：
    // 「想知道这个视频是几倍速」这个意图已经没有对象了 —— 连意图一起
    // 清掉，并把监听器摘干净（旧视频的 play 事件不该再把角标唤回来：
    // 那时角标指向的是一个已经不在页面上的视频）。
    if (!video.isConnected) {
      if (this.badgeTarget !== null || this.badgeActive) {
        this.abandonBadge();
      }
      return;
    }

    // 角标常驻期间，视频被滚出视口 → **收起但保留意图**。
    //
    // ⚠️ 这里不能「放弃」：滚出视口与进全屏是同一类事件（暂时看不到 /
    // 换个地方看），用户滚回来时角标必须自己回来。
    if (this.badgeActive && !this.isInViewport(video)) {
      this.suspendBadge('viewport');
      return;
    }

    // 视频回到视口 → 重新排计时，角标自己回来。
    //
    // ⚠️ 判据是「被收起了」而不是「因为滚出视口被收起了」：暂停时视频
    // 也可能在视口里，但那时不该把角标叫回来（用户还没恢复播放）。
    // 真正拦住它的是 resumeBadge() 里的「视频还暂停着」那一支。
    if (this.badgeSuspendedBy !== null && this.isInViewport(video)) {
      this.resumeBadge();
    }

    // 若 video 在 iframe 内，把坐标换算到 toast 所在的顶层坐标系。
    //
    // ⚠️ 必须用**完整矩形**：iframe 被 transform: scale() 缩放时，
    // 「rect + 偏移量」推不出正确的下边缘（偏移量只平移，不缩放）。
    const absolute = topLevelRect(video);
    // 左上角：视频可见区域的左上，视频顶部滚出视口时钳到视口顶部，保证看得见。
    //
    // ⚠️ 必须带 !important：提示的隔离底座里有 `all: initial !important`，
    // 而站点的 `div { left: ... !important }` 同样压得住普通内联样式。
    setImportant(root, 'left', `${Math.max(16, absolute.left + NOTICE_INSET)}px`);
    setImportant(root, 'top', `${Math.max(16, absolute.top + NOTICE_INSET)}px`);
  }

  /**
   * 视频是否还在视口里。
   *
   * 无布局引擎的环境（单测用的 jsdom）里 getBoundingClientRect 全是 0，
   * 此时判不出「滚出视口」—— 不能因此把角标判成不可见，
   * 所以零尺寸一律当作「在视口里」。
   */
  private isInViewport(video: HTMLVideoElement): boolean {
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return true;
    }

    const view = video.ownerDocument.defaultView ?? window;
    const height = view.innerHeight || window.innerHeight;
    const width = view.innerWidth || window.innerWidth;

    return rect.bottom > 0
      && rect.right > 0
      && rect.top < height
      && rect.left < width;
  }

  /**
   * 角标外观全部用内联样式。
   *
   * 胶囊挂在页面 DOM 里（不在 shadow root 里），所以 controlsStyles 那套
   * 隔离样式根本管不到它；而 runtimeStyles 又不由本模块维护。
   * 用内联样式是最不依赖别人的做法：所有会被外部规则覆盖的属性
   * （opacity / font-size / padding / background / color / border-radius）
   * 全部显式写死，不留下任何「取决于别处写了什么」的变量。
   *
   * ⚠️ 而且必须带 !important：胶囊的隔离底座里有 `all: initial !important`，
   * 而站点的 `div { ... !important }` 同样压得住普通内联样式。
   */
  private applyBadgeStyles() {
    const root = this.root;
    if (!root) {
      return;
    }

    // ⚠️ 绝不能用 opacity 把角标「调淡」。
    //
    // 旧写法是 opacity: 0.55 + background: rgba(0, 0, 0, 0.5)：opacity 作用于
    // 整块角标（底板与文字一起被压淡），于是白底视频上合成出来的底板是
    // rgb(185,185,185)、文字是 rgb(251,252,253)，对比度只有 1.91:1 ——
    // 远低于 WCAG AA 的 4.5:1，字几乎看不见。录屏、PPT、白底课程视频
    // 正是网课用户的典型画面，那块角标在那里就是一团看不见的灰。
    //
    // 改成「高不透明度底板 + 实色文字」后（WCAG 相对亮度公式实算：
    // 线性化 c/255 ≤ 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4，
    // L = 0.2126R + 0.7152G + 0.0722B，对比度 =(L亮+0.05)/(L暗+0.05)）：
    //   白底视频：底板 rgba(0,0,0,0.78) 合成到白底 = rgb(56,56,56)，L=0.0397
    //              文字 #f8fafc = rgb(248,250,252)，L=0.9536
    //              对比度 =(0.9536+0.05)/(0.0397+0.05) = 11.20:1  ✅ AA 过
    //   黑底视频：底板合成到黑底 = rgb(0,0,0)，L=0
    //              对比度 =(0.9536+0.05)/(0+0.05) = 20.07:1  ✅ AA 过
    // （Chromium 逐像素取样实测：白底 rgb(56,56,56) / 文字 rgb(248,250,252)，
    //   黑底 rgb(0,0,0) / 文字 rgb(248,250,252)。）
    //
    // 「很淡」交给尺寸（12px）和小内边距，不交给透明度。
    // opacity 仍然显式写死（值 1）：页面的 div { opacity: ... } 会打穿它，
    // 而这里要的正是「完全不透明」。
    //
    // 关掉淡入淡出：胶囊备了 `transition: opacity 160ms ease`，
    // 而角标是「从看不见直接切到完全不透明」—— 过渡会让它在半透明的中途
    // 状态上停留 160ms，那正是我们要消灭的低对比度状态。
    setImportantAll(root, BADGE_STYLES);
  }

  /**
   * 回到胶囊形态。
   *
   * ⚠️ 是「换回胶囊的值」，不是「把属性摘掉」：
   * 隔离底座里的 `all: initial !important` 会把摘掉的属性打回初始值
   * （padding 归 0、字号 16px、底板透明）—— 那样下一次调速弹出来的
   * 胶囊就是一个没有底板的裸文字。
   */
  private clearBadgeStyles() {
    const root = this.root;
    if (!root) {
      return;
    }

    setImportantAll(root, PILL_STYLES);
  }

  private attachListeners() {
    if (this.listenersAttached) {
      return;
    }

    this.listenersAttached = true;
    window.addEventListener('scroll', this.boundUpdatePosition, true);
    window.addEventListener('resize', this.boundUpdatePosition);
  }

  private detachListeners() {
    if (!this.listenersAttached) {
      return;
    }

    this.listenersAttached = false;
    window.removeEventListener('scroll', this.boundUpdatePosition, true);
    window.removeEventListener('resize', this.boundUpdatePosition);
  }

  /**
   * 把 pause / play / ratechange 监听挂到「意图指向的那个视频」上。
   *
   * ⚠️ 换视频时必须把旧的摘干净：旧视频的 play 事件会走
   * restoreBadgeAfterPlay()，那里发现「视频已经不在页面上了」就会
   * 把**当前**的意图一起丢掉 —— 于是一个早已作废的旧视频，
   * 仅仅因为派发了一个 play 事件，就把新视频的角标弄没了。
   *
   * 同一个道理适用于 ratechange：站点换掉视频元素之后，旧元素上残留的
   * 倍速变化不该再改**当前**读数。
   */
  private attachVideoListeners(video: HTMLVideoElement) {
    if (this.observedVideo === video) {
      return;
    }

    this.detachVideoListeners();
    video.addEventListener('pause', this.boundHandleVideoPause);
    video.addEventListener('play', this.boundHandleVideoPlay);
    // 站点改速时读数要跟着变 —— 读数停在旧值就是在撒谎。
    video.addEventListener('ratechange', this.boundHandleRateChange);
    this.observedVideo = video;
  }

  private detachVideoListeners() {
    if (!this.observedVideo) {
      return;
    }

    this.observedVideo.removeEventListener('pause', this.boundHandleVideoPause);
    this.observedVideo.removeEventListener('play', this.boundHandleVideoPlay);
    this.observedVideo.removeEventListener('ratechange', this.boundHandleRateChange);
    this.observedVideo = null;
  }

  /**
   * 盯着「意图指向的那个视频还在不在页面里」。
   *
   * 为什么不能只靠 updatePosition()：那个函数只在滚动/缩放时跑，
   * 于是「视频没了」这件事要等到用户碰巧滚一下页面才被发现 ——
   * 而角标是**常驻**的，那块指向虚无的 "1.5x" 会一直挂在页面左上角。
   */
  private observeBadgeTarget() {
    if (this.targetWatcher || !document.body) {
      return;
    }

    this.targetWatcher = observeBody({
      // ⚠️ 必须观察 body 的**整棵子树**：视频被摘掉的方式有两种 ——
      // 站点直接 video.remove()（父节点变了），或者整个播放器容器被换掉
      // （视频跟着祖先一起消失，它自己的父节点根本没变）。
      bodyInit: { childList: true, subtree: true },
      onBodyMutation: () => this.reconcileBadgeTarget(),
      // body 被整个换掉时（SPA 重建页面），旧 body 里的目标视频已经
      // 「不在页面上了」，而观察者再也收不到任何通知 —— 只能在这里主动查一次。
      onBodyReplaced: () => this.reconcileBadgeTarget(),
    });
  }

  /**
   * 「角标指向的那个视频还在不在页面里」。
   *
   * 两条路都会走到这里：body 内部发生了变化（视频被摘掉），
   * 或者 body 本身被换掉了（旧 body 里的视频随之消失）。
   */
  private reconcileBadgeTarget() {
    const target = this.badgeTarget;
    if (!target) {
      // 意图已经没了（abandonBadge 清掉了）—— 收摊，别再白跑观察者。
      this.stopTargetWatcher();
      return;
    }

    // 视频被站点从页面里拿走了（重建播放器、SPA 换页、切清晰度）：
    // 「想知道这个视频是几倍速」这个意图已经没有对象了 ——
    // 连意图一起清掉，角标自己撤掉。
    if (!target.isConnected) {
      this.abandonBadge();
    }
  }

  private stopTargetWatcher() {
    this.targetWatcher?.disconnect();
    this.targetWatcher = null;
  }

  private clearBadgeTimer() {
    if (this.badgeTimer !== null) {
      window.clearTimeout(this.badgeTimer);
      this.badgeTimer = null;
    }
  }

  show(rate: number, video: HTMLVideoElement) {
    const root = this.ensureRoot();

    this.activeVideo = video;
    // 用户刚动过倍速 —— 「想知道现在几倍速」这个意图成立。
    // 后面进全屏时角标要收起，但这个意图必须留着。
    this.badgeTarget = video;
    this.badgeSuspendedBy = null;

    // 盯住这个视频：站点改速（ratechange）时读数要跟着变，
    // 它被从页面里摘掉时角标要自己撤掉。
    this.attachVideoListeners(video);
    this.observeBadgeTarget();
    // 意图换了一个视频 → 全屏判据要跟着换（观察器得盯上新视频）。
    this.fullscreenSession?.refresh();

    // 倍速只有**一条**写入路径（applyRate）。
    //
    // ⚠️ 为什么不能「扩展调速写一次、ratechange 再写一次」：两条路径各写一次
    // 就会出现两个读数来源 —— 角标写着扩展最后设置的值，而视频真实的倍速
    // 已经是站点改过的另一个值。用户在照着一个撒谎的读数做判断。
    this.applyRate(rate, video);

    if (!root) {
      // 没有可挂载的宿主（SVG/foreignObject 等文档里 document.body === null）：
      // 画不出提示，但倍速已经报上去了（applyRate 里的通知照常发生）——
      // 否则工具栏标题会在这种文档里永远停在旧值上。
      return;
    }

    // 新的调速操作：角标回到「一次性胶囊」形态，计时整个重来。
    this.clearBadgeTimer();
    this.badgeActive = false;
    this.clearBadgeStyles();

    // 先移除再强制回流，让连续按键时淡入动画每次都能重新开始。
    showNotice(root, 'vsc-visible');
    this.updatePosition();

    this.attachListeners();
    this.observeFullscreenSurface();

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
    }

    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      hideNotice(root, 'vsc-visible');
      this.scheduleBadge();
    }, HIDE_DELAY);
  }

  /**
   * 把一个倍速写进画面上的读数（胶囊 / 角标 / 读屏镜像），并通知运行时。
   *
   * ⚠️ 这是倍速的**唯一**写入路径：
   * - 扩展自己调速 → show() 调这里；
   * - 站点自己改速（YouTube 的倍速菜单、换清晰度后复位）→ ratechange 调这里。
   *
   * 两条路径汇到一处，读数才可能只有一个来源。
   */
  private applyRate(rate: number, video: HTMLVideoElement) {
    const label = `${formatRate(rate)}x`;
    const root = this.root;

    // 只在真的不一样时写 DOM：同一个值写两遍没有意义，
    // 而写两遍会让读屏镜像被顶掉两次（视觉上也会闪一下）。
    if (root && root.textContent !== label) {
      root.textContent = label;
    }

    const changed = this.displayedRate === null || Math.abs(this.displayedRate - rate) > 0.0001;
    this.displayedRate = rate;

    // 读屏用户可以**随时**查到的「当前倍速」（不只是变化那一刻的播报）。
    this.updateSpeedState(rate);

    if (changed) {
      // 读屏播报：调速胶囊是**唯一**的速度反馈通道（控制条 3 秒就隐藏，
      // 键盘调速时它往往根本不在屏幕上），而它本身是 aria-hidden 的纯视觉元素。
      // 不播报的话，读屏用户按了 `=` 之后得不到任何确认。
      //
      // ⚠️ 走的是**节流**通道：长按加速时每 120ms 就有一个新值，
      // 而 `aria-live="polite"` 是排队而不是丢弃 —— 读屏会一条一条念下去，
      // 队列无界增长（实测：按住 `=` 一秒 → live region 被写 9 次）。
      // 节流后每 1 秒最多一句，且永远播**最新**的值。
      //
      // ⚠️ 占位符由 i18n 负责替换（见 src/shared/i18n.ts 的模块说明），
      // 调用点不自己 replace。
      announceThrottled(t('speedChanged', '播放速度 {rate}x', [formatRate(rate)]));
    }

    // 倍速变了 → 运行时把它上报给 background（工具栏标题要跟着变）。
    this.onRateChange?.(rate, video);
  }

  /**
   * 「当前倍速」的读屏镜像。
   *
   * 常驻角标是 aria-hidden 的纯视觉元素，live region 里只有「值变化那一刻」
   * 的一次性播报 —— 于是视力用户可以随时确认「我现在是几倍速」，
   * **读屏用户没有任何等价物**。这个节点补上那个缺口。
   *
   * ⚠️ 必须是 `aria-live="off"`（而不是 polite）：
   * polite 是「变化时播报」，这里要的是「随时可查」——
   * 用 polite 会让每次调速都被念一遍，与 live region 重复。
   */
  private updateSpeedState(rate: number) {
    const node = this.ensureStateNode();
    if (!node) {
      return;
    }

    const text = t('speedCurrent', '当前播放速度 {rate}x', [formatRate(rate)]);
    // 值没变就别写：写屏用户是**随时可查**这个节点的，
    // 而读屏器在节点内容变化时可能会重新念一遍。
    if (node.textContent !== text) {
      node.textContent = text;
    }
  }

  /**
   * 「当前倍速」镜像节点（视觉上完全不可见，AT 可读）。
   *
   * 自愈与其它注入节点同思路：站点会摘掉不认识的外来节点，
   * 脱离文档就重建。
   */
  private ensureStateNode(): HTMLElement | null {
    if (!document.body) {
      return null;
    }

    if (this.stateNode && this.stateNode.isConnected) {
      return this.stateNode;
    }

    const node = document.createElement('div');
    node.id = STATE_ID;
    // 明确写 off：默认值虽然也是 off，但这里是**刻意的设计决定**，
    // 写出来是为了让下一个改它的人知道「不能改成 polite」。
    node.setAttribute('aria-live', 'off');
    isolateNotice(node, STATE_STYLES);
    // 同上：挂到 <html>，别受 body 的 transform 影响。详见 viewportRoot.ts。
    mountViewportRoot(node);
    this.stateNode = node;
    return node;
  }

  /**
   * 胶囊淡出后安排角标。
   *
   * 三个前提缺一不可：视频还在播、视频还在视口里、用户没有再操作
   * （再操作会重新走 show()，把计时器整个重来）。
   *
   * ⚠️ 它不再接收视频参数：唯一该被安排的那个视频就是**意图指向的**
   * 那一个（badgeTarget）。多一个入口就多一处「给别的视频排角标」
   * 的机会 —— 那正是「角标在别的视频上复活」的来源。
   */
  private scheduleBadge() {
    this.clearBadgeTimer();

    const video = this.badgeTarget;
    if (!video) {
      return;
    }

    // 全屏时控制条上就写着倍速，再挂一个角标是重复信息。
    // 但这里**推迟**而不是**放弃**：意图（badgeTarget）留着，
    // 等全屏结束后由 reconcileBadge() 重新排计时。
    if (this.isFullscreenActive()) {
      return;
    }

    // 视频是暂停的：角标现在不该出现，但**意图要留着** ——
    // 用户一按播放它就回来（见 restoreBadgeAfterPlay）。
    if (video.paused) {
      this.suspendBadge('paused');
      return;
    }

    this.badgeTimer = window.setTimeout(() => {
      this.badgeTimer = null;

      const target = this.badgeTarget;
      if (!target) {
        return;
      }

      // 计时期间可能进了全屏（用户一边看一边按 f）：到点再确认一次。
      if (this.isFullscreenActive()) {
        return;
      }

      // 视频从页面里被摘掉了：意图已经没有对象，连它一起清掉。
      if (!target.isConnected) {
        this.abandonBadge();
        return;
      }

      // 这 3 秒里视频暂停了：**收起但保留意图**，等它恢复播放。
      if (target.paused) {
        this.suspendBadge('paused');
        return;
      }

      // 视频滚出视口：**收起但保留意图**，等它滚回来（见 suspendBadge）。
      if (!this.isInViewport(target)) {
        this.suspendBadge('viewport');
        return;
      }

      this.showBadge();
    }, BADGE_DELAY);
  }

  /**
   * 让常驻角标出现。
   *
   * 单独抽出来是因为有两条路径要走到「常驻态」：
   * - 胶囊淡出后 3 秒（用户不再操作了）；
   * - 暂停之后恢复播放（用户明确表示要继续看了）。
   *
   * ⚠️ 两条路径的**计时**不同，出来的**形态**必须一样：常驻角标。
   */
  private showBadge() {
    // 全屏里控制条上就写着倍速，角标是重复信息，不出。
    if (this.isFullscreenActive()) {
      return;
    }

    this.badgeActive = true;
    this.applyBadgeStyles();
    // 重新加回可见类：胶囊淡出是靠摘掉它，角标要的是「一直在但很小」。
    this.root?.classList.add('vsc-visible');
    // 角标常驻期间要跟着滚动走。位置监听在 hideBadge() 里被摘掉了，
    // 这里必须重新挂上 —— 否则角标会固定在旧坐标上，滚一下就跑位了。
    this.attachListeners();
    // 位置可能是收起时留下的旧坐标 —— 角标回来时必须重新贴一次。
    this.updatePosition();
  }

  /**
   * 收起常驻角标，但**保留**「用户想知道当前倍速」这个意图。
   *
   * 由运行时在进入网页全屏时调用：控制条上就写着倍速，角标是重复信息。
   *
   * ⚠️ 这里不能顺手把意图一起丢掉 —— 进入全屏只是换了个地方看倍速，
   * 不是用户不想看了。退出全屏后角标必须自己回来（见 reconcileBadge）。
   */
  dismissBadge() {
    this.badgeSuspendedBy = null;
    this.hideBadge();
  }

  /**
   * 彻底放弃角标：视频从 DOM 里被移除。
   *
   * 这是唯一「连意图一起清掉」的情形 —— 意图指向的那个视频已经不在
   * 页面上了，「想知道它是几倍速」这个问题已经没有对象。
   *
   * ⚠️ 同时把监听器摘干净：旧视频的 play / ratechange 事件不该再有任何作用。
   *
   * ⚠️ 目标观察者也一起收掉：没有意图就没有「视频还在不在」这回事，
   * 留着它只是让每个 DOM 变化都白跑一次检查。
   */
  private abandonBadge() {
    this.badgeSuspendedBy = null;
    this.badgeTarget = null;
    this.hideBadge();
    this.detachVideoListeners();
    this.stopTargetWatcher();
    // 意图没了 → 全屏判据没有目标视频了，观察者得把 class 观察器摘掉。
    this.fullscreenSession?.refresh();
  }

  /**
   * 收起角标，但**保留**意图。
   *
   * @param reason 收起的原因 —— 它决定「什么时候、以什么形态回来」：
   *   - 'viewport'：视频滚出了视口 —— 滚回来时重新排 3 秒的计时
   *     （别在用户滚动的时候把界面拽回来）。**滚动监听必须留着**：
   *     只有它能发现「视频回到视口了」。
   *   - 'paused'：视频暂停了 —— 恢复播放时立刻回来。滚动监听可以摘掉：
   *     回来的信号是 video 的 play 事件，而提示此刻本来就看不见，
   *     跟着页面重定位是白干活（还会把坐标改坏）。
   *
   * ⚠️ 之前这里走的是 abandonBadge()（连意图一起清掉），于是角标滚出去之后
   * **再也不回来**，直到用户再按一次调速键（实测）；暂停时更是连意图都没了。
   */
  private suspendBadge(reason: 'viewport' | 'paused') {
    this.badgeSuspendedBy = reason;

    // 待触发的角标计时必须停掉：它到点时看到的是「视频暂停」，
    // 会被当成「用户不再需要这个读数」而把意图整个丢掉。
    this.clearBadgeTimer();

    if (!this.badgeActive) {
      // 角标本来就没显示（还在计时）—— 只记下「因为什么而收起」。
      return;
    }

    this.badgeActive = false;
    const root = this.root;
    if (!root) {
      return;
    }

    hideNotice(root, 'vsc-visible');
    this.clearBadgeStyles();

    if (reason === 'paused') {
      this.detachListeners();
    }
  }

  /**
   * 视频恢复播放 → 角标**立刻**回来（而且是常驻态）。
   *
   * @param video 刚恢复播放的那个视频。
   *
   * ⚠️ 为什么不是「再等 3 秒」：用户刚按下播放继续看，他此刻要的正是
   * 「我现在是几倍速」这个确认 —— 让他再等 3 秒，等于把「暂停之后角标
   * 再也不回来」这个 bug 换了个形式。
   *
   * ⚠️ 恢复出来的必须是**常驻角标**，不是「一次性胶囊」：胶囊 900ms 后
   * 淡出、再等 3 秒才转成角标 —— 那是「用户刚调过速」的流程，
   * 而这里用户根本没调速。
   */
  private restoreBadgeAfterPlay(video: HTMLVideoElement) {
    // 视频已经不在页面上了：连意图一起清掉（见 abandonBadge）。
    if (!video.isConnected) {
      this.abandonBadge();
      return;
    }

    // 胶囊还亮着：那是「用户刚调过速」的一次性反馈，别抢它的位置。
    if (this.hideTimer !== null) {
      return;
    }

    // 角标本来就在显示（或已经排好了计时）：什么都不用做。
    if (this.badgeActive || this.badgeTimer !== null) {
      return;
    }

    this.badgeSuspendedBy = null;
    this.showBadge();
  }

  /** 只把角标收起来（不管意图还在不在）。 */
  private hideBadge() {
    this.clearBadgeTimer();

    if (!this.badgeActive) {
      return;
    }

    this.badgeActive = false;
    const root = this.root;
    if (!root) {
      return;
    }

    root.classList.remove('vsc-visible');
    this.clearBadgeStyles();
    this.detachListeners();
  }

  /**
   * 此刻是否处于网页全屏。
   *
   * ⚠️ 判据不在这里 —— 它住在 fullscreenSession.ts 里（与首次引导共用一份），
   * 因为「网页全屏会话还活着吗」这件事只有一个答案，
   * 两个订阅方各判一次迟早会对不上。
   *
   * 判据本身是**控制器的账本**：全屏时控制器会在视频身上挂一个 class
   * （FULLSCREEN_VIDEO_CLASS），退出时摘掉。
   * 它的存续期与「全屏会话」的存续期完全重合，
   * 而且它是**属性**变化 —— 盯它不会漏，也不会被站点的无关 DOM 变化带偏。
   *
   * 为什么不能拿「控制条（#vsc-controls）在不在 DOM 里」当信号：
   * 它是**间接**信号。控制条是全屏 UI 的一个零件，它在不在，
   * 取决于 controls 模块有没有成功挂上宿主 —— 而挂宿主是有失败路径的
   * （没有可挂载的 body 时 mount() 直接返回）。零件缺席不等于功能缺席，
   * 拿零件当状态，状态就是假的。
   */
  private isFullscreenActive(): boolean {
    if (!this.fullscreenSession) {
      // 观察者还没挂上（还没调过速）：只能退回旧判据。
      return document.getElementById(FULLSCREEN_OVERLAY_ID) !== null;
    }

    return this.fullscreenSession.isActive();
  }

  /**
   * 订阅「网页全屏会话」的开始与结束。
   *
   * ⚠️ 这条订阅是**必需**的，不是锦上添花：
   *
   * 退出全屏有三条路径 —— 键盘 Esc、控制条自己的退出按钮、工具栏图标 ——
   * 其中**只有**键盘那条会经过运行时，而控制条的退出按钮走的是
   * FullscreenController.exit()，运行时根本不知道「全屏结束了」。
   * 所以角标不能靠别人通知，必须自己观察到「会话结束了」这件事。
   */
  private observeFullscreenSurface() {
    if (this.fullscreenSession || !document.body || !document.documentElement) {
      return;
    }

    this.fullscreenSession = watchFullscreenSession({
      // 判据问的是「**意图指向的**这个视频是不是在全屏里」。
      getVideo: () => this.badgeTarget,
      onChange: (fullscreen) => this.reconcileBadge(fullscreen),
    });

    // 起点必须与事实对齐：观察者可能是在用户**已经**进了全屏之后才挂上的
    // （比如进全屏后才第一次调速），此时真实状态已经是「在全屏里」。
    // 若这里留成 false，等到退出全屏时「false → false」不算变化，
    // 角标就永远等不到那次「回来」的信号。
    this.fullscreenActive = this.fullscreenSession.active;
  }

  /**
   * 把「角标该显示还是该收起」对齐到当前事实。
   *
   * @param fullscreen 观察者告诉我们的会话状态（进/出各一次）。
   *
   * 它是**幂等**的：同一个状态反复调用不会来回抖。
   */
  private reconcileBadge(fullscreen: boolean) {
    if (fullscreen === this.fullscreenActive) {
      // 全屏状态没变 —— 这次变化与全屏无关（页面自己改了 DOM）。
      // ⚠️ 这里**不能**重排角标的计时：否则页面每隔一秒塞一个广告节点，
      // 角标的 3 秒计时就会被一直推后，永远出不来。
      return;
    }

    this.fullscreenActive = fullscreen;

    // ⚠️ 进/出全屏都必须把胶囊重新贴一次。
    //
    // 进全屏时视频被搬进覆盖层、放大到整个视口，而胶囊贴的还是
    // **进全屏之前**那个页面坐标 —— 于是它飘在黑底覆盖层的外面
    // （实测：胶囊停在页面里视频原来的位置，画面却已经铺满全屏）。
    //
    // 退出全屏时同理：视频回到页面原位，胶囊必须跟着回去，
    // 否则它留在全屏时的那块坐标上，变成一块残渣。
    //
    // 为什么这里能拿到**已经更新过**的坐标：观察者的回调是微任务，
    // 它在 FullscreenController.enter()/exit() 整个同步流程走完之后
    // 才跑 —— 那时视频已经被搬进/搬出覆盖层、样式也已经改好了。
    this.updatePosition();

    if (fullscreen) {
      // 全屏里控制条上就写着倍速，角标是重复信息。
      // 收起，但**留住意图**（badgeTarget）—— 出全屏后还要它回来。
      this.clearBadgeTimer();
      this.hideBadge();
      return;
    }

    this.resumeBadge({ immediate: true });
  }

  /**
   * 全屏结束后把角标重新安排上。
   *
   * 这条路径**不经过运行时**：控制条自带的退出按钮走的是
   * FullscreenController.exit()，运行时根本收不到「全屏结束了」的信号。
   * 所以角标只能自己观察到会话结束，然后自己把角标放回来。
   *
   * @param immediate 是不是「刚退出全屏」这一种回来。
   *   - true：**立刻**回来（见下面的理由）；
   *   - false：排 3 秒的计时（视频滚出视口又滚回来时走这条 ——
   *     别在用户正滚动的时候把界面拽回来）。
   */
  private resumeBadge(options: { immediate?: boolean } = {}) {
    const video = this.badgeTarget;
    this.badgeSuspendedBy = null;
    if (!video) {
      return;
    }

    // 视频从页面里被摘掉了：意图已经没有对象。
    if (!video.isConnected) {
      this.abandonBadge();
      return;
    }

    // 视频是暂停的：角标现在不该出现，但**意图要留着** ——
    // 用户一按播放它就回来（见 restoreBadgeAfterPlay）。
    if (video.paused) {
      this.suspendBadge('paused');
      return;
    }

    // 胶囊自己还活着（它会在淡出后调 scheduleBadge）—— 不要抢它的计时。
    if (this.hideTimer !== null || this.badgeTimer !== null || this.badgeActive) {
      return;
    }

    if (options.immediate) {
      // 刚退出全屏：角标**立刻**回来，不等那 3 秒。
      //
      // ⚠️ 为什么不是「再等 3 秒」：退出全屏是用户**主动**做的动作，
      // 而全屏控制条此刻正被撤掉 —— 画面上关于「我现在是几倍速」的
      // 读数**同时**消失。让用户盯着一个什么读数都没有的画面等 3 秒，
      // 等于把「退出全屏后角标没有回来」这个 bug 换了个形式。
      // 同一判据在「暂停之后恢复播放」那条路径上已经用过了
      // （见 restoreBadgeAfterPlay）。
      //
      // 视频滚出视口时不能这么干：那时用户正在滚动，
      // 把界面拽回来是打扰（那种情况走 3 秒计时那条）。
      if (!this.isInViewport(video)) {
        this.suspendBadge('viewport');
        return;
      }

      this.showBadge();
      return;
    }

    this.scheduleBadge();
  }

  destroy() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.clearBadgeTimer();
    this.fullscreenSession?.dispose();
    this.fullscreenSession = null;
    this.detachListeners();
    this.detachVideoListeners();
    this.stopTargetWatcher();
    this.badgeActive = false;
    this.badgeSuspendedBy = null;
    this.badgeTarget = null;
    this.displayedRate = null;
    this.root?.remove();
    this.root = null;
    this.stateNode?.remove();
    this.stateNode = null;
    this.activeVideo = null;
  }
}
