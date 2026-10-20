import { t } from '../shared/i18n';
import { topLevelOffset } from './frameOffset';
import { NOTICE_INSET, NOTICE_MAX_HEIGHT, NOTICE_ROW_HEIGHT } from './runtimeStyles';
import { TransientPill } from './transientPill';

const NOTICE_ID = 'vsc-takeover-notice';
const NOTICE_DURATION = 2600;

/**
 * 「这个视频接管不了」的一次性提示。
 *
 * 网页全屏对少数视频必然失败：视频住在同源 iframe 里（跨 document 的节点搬不动），
 * 或者文档没有可挂载的 body。此前这些情况是**静默**的——用户按了 f、按键被放行、
 * 页面毫无变化，看起来像扩展坏了。
 *
 * 只说「这个视频这里接管不了」，不假装知道原因：从扩展这一侧无法可靠区分
 * DRM 受保护、跨 document、无宿主这几种失败，猜一个具体原因比不说更糟。
 * 提示本身不承诺任何后续动作，只解释「不会发生什么」。
 */
export class TakeoverNotice {
  private readonly pill = new TransientPill({
    id: NOTICE_ID,
    visibleClass: 'vsc-visible',
    duration: NOTICE_DURATION,
  });

  /**
   * 提示在屏时要跟随的那个视频。
   *
   * 调速胶囊（SpeedToast）是**跟着滚动**走的：它常驻，必须一直贴在视频上。
   * 这条提示以前不跟随，于是两者在不同的滚动状态下会错开甚至重合 ——
   * 提示停在旧位置，胶囊跟着视频走，滚几下就压到一起了。
   *
   * 现在这条提示也跟随：两个提示都贴在**同一个视频**上，
   * 它们的相对位置就恒定了（一个在左上角、一个在左下角），
   * 无论页面怎么滚都不会打架。
   *
   * 代价只是 2.6 秒里的两个 window 监听器 —— 与「重挂两个**全局常驻**监听器」
   * 完全是两回事，后者才是当初不跟随的理由。
   */
  private followVideo: HTMLVideoElement | null = null;
  /** 跟随监听的清理计时器（与提示本身的停留时长一致）。 */
  private followTimer: number | null = null;
  private readonly boundFollow = () => this.handleFollow();

  /** 控制条不可见时也常驻在视频附近，所以位置每次都要跟着视频走。 */
  show(video: HTMLVideoElement | null) {
    const text = t('noticeCannotTakeOver', '这个视频暂时接管不了');
    if (!this.pill.show(text)) {
      return;
    }

    this.detachFollowListeners();

    if (video && video.isConnected) {
      this.positionNear(video);
      this.attachFollowListeners(video);
    }
  }

  /**
   * 「这个页面里没有视频」。
   *
   * 与上面的「接管不了」是**两回事**，文案也不能混用：
   * - 接管不了 → 视频在，只是不归我们管（跨 document 等）
   * - 没有视频 → 页面上压根没有 <video>
   *
   * 工具栏图标是扩展**唯一**看得见的入口。用户点它却什么都没发生，
   * 能得出的唯一结论就是「扩展坏了」。所以这条路径必须给一句话。
   */
  showNoVideo() {
    const text = t('noticeNoVideo', '这个页面里没有视频');
    if (!this.pill.show(text)) {
      return;
    }

    this.detachFollowListeners();
    this.positionAtViewportCorner();
  }

  /**
   * 没有视频可锚定时，贴到视口左上角。
   *
   * 提示是 position:fixed 且默认没有 top/left —— 静态位置在文档流末尾，
   * 对绝大多数页面来说在屏幕外。所以每次显示都必须显式给坐标，
   * 这条路径不能例外。
   */
  private positionAtViewportCorner() {
    const root = document.getElementById(NOTICE_ID);
    if (!root) {
      return;
    }

    // 两条路径的锚点不同（一条用 top、一条用 bottom），
    // 所以必须把另一条显式清掉 —— 否则上一次的坐标会残留下来。
    root.style.setProperty('bottom', 'auto');
    root.style.setProperty('left', '16px');
    root.style.setProperty('top', '16px');
  }

  /**
   * 把提示贴在视频的**左下角**。
   *
   * ⚠️ 为什么不是左上角：左上角是调速胶囊（SpeedToast）的地盘。
   * 两者曾经用**逐字相同**的锚点公式、都贴在左上角，而接管提示更宽
   * （154px vs 胶囊 54px）—— 它把胶囊整个盖住，用户看到的是「文字压文字」，
   * 两个提示都等于没说（6.0.9 实测）。
   *
   * 为什么是左下角而不是右下角：接管提示说的是「**这个视频**接管不了」，
   * 它必须贴着**视频**、一眼能找到。放到右下角会压在站点自己的
   * 全屏/设置按钮上（YouTube 之类），那是别人的地盘。
   *
   * 同一个左边缘、上下分开：胶囊是「刚刚发生」的高优先级反馈，占左上角；
   * 接管提示是「出了点问题」的次要信息，退到左下角。
   *
   * 竖向锚在 **bottom**（离视口下边多远）而不是 top：
   * 锚 bottom 就不需要知道提示自己有多高 —— 而高度随文案语言变化
   * （中 154px / 英 269px），jsdom 里更是恒为 0（没有布局引擎）。
   * 用 top 锚就得再维护一份高度表，两处一漂移就错位。
   *
   * ⚠️ top 与 bottom 必须**互斥**：同时给会让元素被拉成上下两行之间的高度。
   * 所以每次定位都显式把另一边写成 auto。
   */
  private positionNear(video: HTMLVideoElement) {
    const root = document.getElementById(NOTICE_ID);
    if (!root) {
      return;
    }

    const rect = video.getBoundingClientRect();
    // 视频在同源 iframe 里时 rect 用的是 iframe 自己的视口坐标，必须换算到顶层，
    // 否则提示会被钳到屏幕角落——这条路径**恰恰**以 iframe 视频为主，
    // 换算漏掉就等于在最常见的情况下错位（6.0.3 在调速提示上修过同一个坑）。
    const { offsetX, offsetY } = topLevelOffset(video);

    const viewportHeight = window.innerHeight || 0;
    if (viewportHeight <= 0) {
      return;
    }

    const videoTop = rect.top + offsetY;
    const videoBottom = rect.bottom + offsetY;

    // 视频竖向完全不在视口里（整块滚上去了，或还在下面没滚到）：
    // 退回视口左下角。
    //
    // 为什么不能跟着视频走：视频下边缘在屏幕外时，锚在它上面等于锚在屏幕外 ——
    // 用户按了 f，什么都没看见，这是最糟的结果。
    // 为什么是视口**左下角**而不是左上角：左上角是胶囊的地盘。
    if (videoBottom <= 0 || videoTop >= viewportHeight) {
      this.positionAtViewportBottomCorner();
      return;
    }

    // 目标：提示的**下边缘**贴在视频下边缘往上 NOTICE_INSET 处。
    // bottom 记的是「离视口下边多远」，所以要反过来减。
    let bottom = viewportHeight - (videoBottom - NOTICE_INSET);

    // 别爬回胶囊那一行：视频太矮时（放不下胶囊一行 + 一条提示），
    // 宁可让提示落到胶囊**下面**，也不能让它压住胶囊。
    //
    // ⚠️ 这里必须用胶囊**钳位之后**的位置，而不是视频顶边的原始坐标：
    // 胶囊贴的是 max(16, 视频顶边 + 内缩) —— 视频顶边滚出视口上方时，
    // 胶囊会钳到视口左上角 (16,16)。若按原始顶边算，提示会以为
    // 「胶囊那一行」在视口外，于是自己爬到视口顶部 —— 正好压在胶囊上。
    // 两个提示同锚一个视频时，钳位规则必须用同一套。
    const pillTop = Math.max(16, videoTop + NOTICE_INSET);
    const pillRowBottom = pillTop + NOTICE_ROW_HEIGHT;
    bottom = Math.min(bottom, viewportHeight - pillRowBottom - NOTICE_MAX_HEIGHT);

    // 整个提示必须在视口内：上界用 NOTICE_MAX_HEIGHT 预留
    // （按最坏的两行算），保证提示整个露在屏幕上。
    bottom = Math.min(bottom, viewportHeight - NOTICE_MAX_HEIGHT - NOTICE_INSET);

    root.style.setProperty('top', 'auto');
    root.style.setProperty('bottom', `${Math.max(16, bottom)}px`);
    root.style.setProperty('left', `${Math.max(16, rect.left + offsetX + NOTICE_INSET)}px`);
  }

  /**
   * 视口左下角（视频不可见时的退路）。
   *
   * 刻意不贴视口**左上角**：那是调速胶囊的位置。
   */
  private positionAtViewportBottomCorner() {
    const root = document.getElementById(NOTICE_ID);
    if (!root) {
      return;
    }

    root.style.setProperty('top', 'auto');
    root.style.setProperty('bottom', '16px');
    root.style.setProperty('left', '16px');
  }

  /**
   * 跟随滚动与缩放，重新贴合视频。
   *
   * 只在提示还活着的时候挂，2.6 秒后自己摘掉。
   */
  private attachFollowListeners(video: HTMLVideoElement) {
    this.followVideo = video;
    window.addEventListener('scroll', this.boundFollow, true);
    window.addEventListener('resize', this.boundFollow);

    this.followTimer = window.setTimeout(() => {
      this.followTimer = null;
      this.detachFollowListeners();
    }, NOTICE_DURATION);
  }

  private detachFollowListeners() {
    window.removeEventListener('scroll', this.boundFollow, true);
    window.removeEventListener('resize', this.boundFollow);
    this.followVideo = null;

    if (this.followTimer !== null) {
      window.clearTimeout(this.followTimer);
      this.followTimer = null;
    }
  }

  private handleFollow() {
    const video = this.followVideo;
    if (!video || !video.isConnected) {
      this.detachFollowListeners();
      return;
    }

    this.positionNear(video);
  }

  destroy() {
    this.detachFollowListeners();
    this.pill.destroy();
  }
}
