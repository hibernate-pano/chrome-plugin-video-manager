import { t } from '../shared/i18n';
import { topLevelOffset } from './frameOffset';
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

  /** 控制条不可见时也常驻在视频左上角附近，所以位置每次都要跟着视频走。 */
  show(video: HTMLVideoElement | null) {
    const text = t('noticeCannotTakeOver', '这个视频暂时接管不了');
    if (!this.pill.show(text)) {
      return;
    }

    if (video && video.isConnected) {
      this.positionNear(video);
    }
  }

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
    // 与 SpeedToast 同一套锚点：可见区域左上角，必要时钳进视口。
    // 这条提示只活 2.6 秒，所以不跟随滚动与缩放——重挂两个全局监听器不值。
    root.style.left = `${Math.max(16, rect.left + offsetX + 16)}px`;
    root.style.top = `${Math.max(16, rect.top + offsetY + 16)}px`;
  }

  destroy() {
    this.pill.destroy();
  }
}
