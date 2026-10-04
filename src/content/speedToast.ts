import { topLevelOffset } from './frameOffset';

const TOAST_ID = 'vsc-speed-toast';
const HIDE_DELAY = 900;

/** 1.50 -> "1.5"，1.00 -> "1"。 */
export const formatRate = (value: number) =>
  value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

/**
 * 极简调速提示：只在用户按键调速时出现，约 1 秒后淡出。
 * 不画图标、不做动画曲线，只有一个数字。
 */
export class SpeedToast {
  private root: HTMLDivElement | null = null;
  private hideTimer: number | null = null;
  private activeVideo: HTMLVideoElement | null = null;
  private readonly boundUpdatePosition = () => this.updatePosition();

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

    const rect = video.getBoundingClientRect();
    // 若 video 在 iframe 内，把 iframe 的偏移补上，换算到 toast 所在的顶层坐标系。
    const { offsetX, offsetY } = topLevelOffset(video);
    // 左上角：视频可见区域的左上，视频顶部滚出视口时钳到视口顶部，保证看得见。
    root.style.left = `${Math.max(16, rect.left + offsetX + 16)}px`;
    root.style.top = `${Math.max(16, rect.top + offsetY + 16)}px`;
  }

  show(rate: number, video: HTMLVideoElement) {
    const root = this.ensureRoot();
    if (!root) {
      return;
    }

    this.activeVideo = video;
    root.textContent = `${formatRate(rate)}x`;

    // 先移除再强制回流，让连续按键时淡入动画每次都能重新开始。
    root.classList.remove('vsc-visible');
    void root.offsetWidth;
    this.updatePosition();
    root.classList.add('vsc-visible');

    window.addEventListener('scroll', this.boundUpdatePosition, true);
    window.addEventListener('resize', this.boundUpdatePosition);

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
    }

    this.hideTimer = window.setTimeout(() => {
      root.classList.remove('vsc-visible');
      window.removeEventListener('scroll', this.boundUpdatePosition, true);
      window.removeEventListener('resize', this.boundUpdatePosition);
    }, HIDE_DELAY);
  }

  destroy() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    window.removeEventListener('scroll', this.boundUpdatePosition, true);
    window.removeEventListener('resize', this.boundUpdatePosition);
    this.root?.remove();
    this.root = null;
    this.activeVideo = null;
  }
}
