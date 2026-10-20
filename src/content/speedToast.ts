import { t } from '../shared/i18n';
import { formatRate } from '../shared/rate';
import { announceThrottled } from './liveRegion';
import { topLevelOffset } from './frameOffset';
import { FULLSCREEN_OVERLAY_ID, NOTICE_INSET } from './runtimeStyles';

const TOAST_ID = 'vsc-speed-toast';
const HIDE_DELAY = 900;

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
   * - 视频暂停、滚出视口则是「用户不再需要它」，这时连意图一起清掉。
   */
  private badgeTarget: HTMLVideoElement | null = null;
  /**
   * 观察全屏背板增删的观察者（挂在 body 上）。
   *
   * 退出全屏时角标要自己回来，而控制条的退出按钮不经过运行时 ——
   * 没有别的通知渠道，只能自己观察（见 observeFullscreenSurface）。
   */
  private fullscreenWatcher: MutationObserver | null = null;
  /** 观察者当前挂在哪个 body 上（body 被换掉时要重新挂）。 */
  private watchedBody: HTMLElement | null = null;
  /**
   * 上一次观察到的全屏状态。
   *
   * 用来只对「进出全屏」这个**变化**做反应：页面自己往 body 里塞东西
   * 也会触发观察者回调，那些与角标无关。
   */
  private fullscreenActive = false;
  /** 位置监听是否已挂上（胶囊或角标活着的时候要跟着滚动走）。 */
  private listenersAttached = false;
  /** 暂停监听挂在哪个视频上（视频换了要换挂）。 */
  private pauseListenerVideo: HTMLVideoElement | null = null;
  private readonly boundUpdatePosition = () => this.updatePosition();
  private readonly boundHandleVideoPause = () => this.abandonBadge();

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
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  private updatePosition() {
    const root = this.root;
    const video = this.activeVideo;
    if (!root || !video || !video.isConnected) {
      return;
    }

    // 角标常驻期间，视频被滚出视口就没必要继续挂着 ——
    // 它贴在视频角落，视频不在屏幕上时它只会变成一块飘在页面上的小字。
    if (this.badgeActive && !this.isInViewport(video)) {
      this.abandonBadge();
      return;
    }

    const rect = video.getBoundingClientRect();
    // 若 video 在 iframe 内，把 iframe 的偏移补上，换算到 toast 所在的顶层坐标系。
    const { offsetX, offsetY } = topLevelOffset(video);
    // 左上角：视频可见区域的左上，视频顶部滚出视口时钳到视口顶部，保证看得见。
    root.style.left = `${Math.max(16, rect.left + offsetX + NOTICE_INSET)}px`;
    root.style.top = `${Math.max(16, rect.top + offsetY + NOTICE_INSET)}px`;
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
   */
  private applyBadgeStyles() {
    const root = this.root;
    if (!root) {
      return;
    }

    root.style.setProperty('padding', '1px 5px');
    root.style.setProperty('font-size', '12px');
    root.style.setProperty('font-weight', '500');
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
    root.style.setProperty('opacity', '1');
    // ⚠️ 用 background-color 而不是 background 简写。
    //
    // 简写会把 background-image 一起清掉（而 clearBadgeStyles 只摘
    // background-color，摘不干净简写留下的 image）——更重要的是：
    // 简写是「一次性设多个长写」，之后 removeProperty('background-color')
    // 在部分实现里摘不掉简写留下的那份底色（jsdom 就是这样：
    // getPropertyValue('background') 已经是空串，style.background 却还返回旧值）。
    // 长写属性可以逐条设、逐条摘，行为可预测。
    root.style.setProperty('background-color', 'rgba(0, 0, 0, 0.78)');
    root.style.setProperty('color', '#f8fafc');
    root.style.setProperty('border-radius', '5px');
    // 角标绝不能挡住用户点视频。
    root.style.setProperty('pointer-events', 'none');
    // 关掉淡入淡出：CSS 给胶囊备了 `transition: opacity 160ms ease`，
    // 而角标是「从看不见直接切到完全不透明」—— 过渡会让它在半透明的中途
    // 状态上停留 160ms，那正是我们要消灭的低对比度状态。
    root.style.setProperty('transition', 'none');
  }

  private clearBadgeStyles() {
    const root = this.root;
    if (!root) {
      return;
    }

    [
      'padding',
      'font-size',
      'font-weight',
      'opacity',
      'background-color',
      'color',
      'border-radius',
      'pointer-events',
      'transition',
    ].forEach((property) => root.style.removeProperty(property));
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

  private attachPauseListener(video: HTMLVideoElement) {
    if (this.pauseListenerVideo === video) {
      return;
    }

    this.detachPauseListener();
    video.addEventListener('pause', this.boundHandleVideoPause);
    this.pauseListenerVideo = video;
  }

  private detachPauseListener() {
    if (!this.pauseListenerVideo) {
      return;
    }

    this.pauseListenerVideo.removeEventListener('pause', this.boundHandleVideoPause);
    this.pauseListenerVideo = null;
  }

  private clearBadgeTimer() {
    if (this.badgeTimer !== null) {
      window.clearTimeout(this.badgeTimer);
      this.badgeTimer = null;
    }
  }

  show(rate: number, video: HTMLVideoElement) {
    const root = this.ensureRoot();
    if (!root) {
      return;
    }

    this.activeVideo = video;
    // 用户刚动过倍速 —— 「想知道现在几倍速」这个意图成立。
    // 后面进全屏时角标要收起，但这个意图必须留着。
    this.badgeTarget = video;
    const label = `${formatRate(rate)}x`;
    root.textContent = label;

    // 读屏播报：调速胶囊是**唯一**的速度反馈通道（控制条 3 秒就隐藏，
    // 键盘调速时它往往根本不在屏幕上），而它本身是 aria-hidden 的纯视觉元素。
    // 不播报的话，读屏用户按了 `=` 之后得不到任何确认。
    //
    // ⚠️ 走的是**节流**通道：长按加速时每 120ms 就有一个新值，
    // 而 `aria-live="polite"` 是排队而不是丢弃 —— 读屏会一条一条念下去，
    // 队列无界增长（实测：按住 `=` 一秒 → live region 被写 9 次）。
    // 节流后每 1 秒最多一句，且永远播**最新**的值。
    announceThrottled(t('speedChanged', '播放速度 {rate}x').replace('{rate}', formatRate(rate)));

    // 新的调速操作：角标回到「一次性胶囊」形态，计时整个重来。
    this.clearBadgeTimer();
    this.badgeActive = false;
    this.clearBadgeStyles();

    // 先移除再强制回流，让连续按键时淡入动画每次都能重新开始。
    root.classList.remove('vsc-visible');
    void root.offsetWidth;
    this.updatePosition();
    root.classList.add('vsc-visible');

    this.attachListeners();
    this.attachPauseListener(video);
    this.observeFullscreenSurface();

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
    }

    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      root.classList.remove('vsc-visible');
      this.scheduleBadge(video);
    }, HIDE_DELAY);
  }

  /**
   * 胶囊淡出后安排角标。
   *
   * 三个前提缺一不可：视频还在播、视频还在视口里、用户没有再操作
   * （再操作会重新走 show()，把计时器整个重来）。
   */
  private scheduleBadge(video: HTMLVideoElement) {
    this.clearBadgeTimer();
    this.badgeTarget = video;

    // 全屏时控制条上就写着倍速，再挂一个角标是重复信息。
    // 但这里**推迟**而不是**放弃**：把视频记下来（badgeTarget），
    // 等全屏结束后由 reconcileBadge() 重新排计时。
    if (this.isFullscreenActive()) {
      return;
    }

    this.badgeTimer = window.setTimeout(() => {
      this.badgeTimer = null;

      // 计时期间可能进了全屏（用户一边看一边按 f）：到点再确认一次。
      if (this.isFullscreenActive()) {
        return;
      }

      if (!video.isConnected || video.paused || !this.isInViewport(video)) {
        this.abandonBadge();
        return;
      }

      this.badgeActive = true;
      this.applyBadgeStyles();
      // 重新加回可见类：胶囊淡出是靠摘掉它，角标要的是「一直在但很小」。
      this.root?.classList.add('vsc-visible');
      // 角标常驻期间要跟着滚动走。位置监听在 hideBadge() 里被摘掉了，
      // 这里必须重新挂上 —— 否则角标会固定在旧坐标上，滚一下就跑位了。
      this.attachListeners();
    }, BADGE_DELAY);
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
    this.hideBadge();
  }

  /**
   * 彻底放弃角标：视频暂停、滚出视口。
   *
   * 这些是「用户不再需要这个角标」—— 与「换个地方看」不同。
   */
  private abandonBadge() {
    this.badgeTarget = null;
    this.hideBadge();
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
   * ⚠️ 这里看的是**全屏背板**（#vsc-page-fullscreen-overlay）在不在 DOM 里，
   * 而不是控制条（#vsc-controls）在不在。
   *
   * 为什么不能拿「控制条在不在 DOM 里」当信号，有两条硬理由：
   *
   * 1. 它是**间接**信号。控制条是全屏 UI 的一个零件，它在不在，
   *    取决于 controls 模块有没有成功挂上宿主 —— 而挂宿主是有失败路径的
   *    （没有可挂载的 body 时 mount() 直接返回）。零件缺席不等于功能缺席，
   *    拿零件当状态，状态就是假的。
   *
   * 2. 它**只会被查询一次**。旧代码只在 scheduleBadge 的计时回调里查一次，
   *    而进全屏时运行时调 dismissBadge() 把计时器整个清掉了 —— 于是
   *    「退出全屏」这件事之后，再没有任何地方会重新查一次，
   *    角标就再也回不来了（6.0.9 实测：退出全屏后角标永远不再出现）。
   *
   * 全屏背板才是事实：enter() 时创建、exit() 时被摘掉，
   * 且它的增删是 body 的直接子节点变化 —— 可以订阅。
   */
  private isFullscreenActive(): boolean {
    return document.getElementById(FULLSCREEN_OVERLAY_ID) !== null;
  }

  /**
   * 订阅全屏背板的增删。
   *
   * ⚠️ 这条订阅是**必需**的，不是锦上添花：
   *
   * 退出全屏有三条路径 —— 键盘 Esc、控制条自己的退出按钮、工具栏图标 ——
   * 其中**只有**键盘那条会经过运行时，而控制条的退出按钮走的是
   * FullscreenController.exit()，运行时根本不知道「全屏结束了」。
   * 所以角标不能靠别人通知，必须自己观察到「背板被摘掉」这件事。
   */
  private observeFullscreenSurface() {
    if (this.fullscreenWatcher || !document.body || !document.documentElement) {
      return;
    }

    const watcher = new MutationObserver(() => {
      // body 被整个换掉时（少见，但 SPA 重建页面时会发生），观察者还挂在
      // 旧 body 上，对新 body 里的背板增删一概看不见 —— 重新挂一次。
      if (document.body && this.watchedBody !== document.body) {
        this.watchedBody = document.body;
        watcher.observe(document.body, { childList: true });
      }

      this.reconcileBadge();
    });

    this.watchedBody = document.body;
    // 只看 body 的**直接子节点**：全屏背板是 body 的直接子节点，
    // 而 body 上的其它增删（站点自己塞个广告位）与全屏无关。
    watcher.observe(document.body, { childList: true });
    // documentElement 这一层只为盯住「body 被换掉」这一种情况。
    watcher.observe(document.documentElement, { childList: true });
    this.fullscreenWatcher = watcher;

    // 起点必须与事实对齐：观察者可能是在用户**已经**进了全屏之后才挂上的
    // （比如进全屏后才第一次调速），此时真实状态已经是「在全屏里」。
    // 若这里留成 false，等到退出全屏时「false → false」不算变化，
    // 角标就永远等不到那次「回来」的信号。
    this.fullscreenActive = this.isFullscreenActive();
  }

  /**
   * 把「角标该显示还是该收起」对齐到当前事实。
   *
   * 每次观察到 DOM 变化（尤其是全屏背板的增删）都走这里。
   * 它是**幂等**的：同一个状态反复调用不会来回抖。
   */
  private reconcileBadge() {
    const fullscreen = this.isFullscreenActive();

    if (fullscreen === this.fullscreenActive) {
      // 全屏状态没变 —— 这次变化与全屏无关（页面自己改了 body 的子节点）。
      // ⚠️ 这里**不能**重排角标的计时：否则页面每隔一秒塞一个广告节点，
      // 角标的 3 秒计时就会被一直推后，永远出不来。
      return;
    }

    this.fullscreenActive = fullscreen;

    if (fullscreen) {
      // 全屏里控制条上就写着倍速，角标是重复信息。
      // 收起，但**留住意图**（badgeTarget）—— 出全屏后还要它回来。
      this.clearBadgeTimer();
      this.hideBadge();
      return;
    }

    this.resumeBadge();
  }

  /**
   * 全屏结束后把角标重新安排上。
   *
   * 这条路径**不经过运行时**：控制条自带的退出按钮走的是
   * FullscreenController.exit()，运行时根本收不到「全屏结束了」的信号。
   * 所以角标只能自己观察到背板被摘掉，然后自己把计时排上。
   */
  private resumeBadge() {
    const video = this.badgeTarget;
    if (!video) {
      return;
    }

    if (!video.isConnected || video.paused) {
      this.abandonBadge();
      return;
    }

    // 胶囊自己还活着（它会在淡出后调 scheduleBadge）—— 不要抢它的计时。
    if (this.hideTimer !== null || this.badgeTimer !== null || this.badgeActive) {
      return;
    }

    this.scheduleBadge(video);
  }

  destroy() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.clearBadgeTimer();
    this.fullscreenWatcher?.disconnect();
    this.fullscreenWatcher = null;
    this.watchedBody = null;
    this.detachListeners();
    this.detachPauseListener();
    this.badgeActive = false;
    this.badgeTarget = null;
    this.root?.remove();
    this.root = null;
    this.activeVideo = null;
  }
}
