const TOAST_ID = 'vsc-speed-toast';
const HIDE_DELAY = 900;
const TOAST_HEIGHT = 30;

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

  private ensureRoot() {
    if (this.root) {
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
    const bottomOffset = Math.min(76, Math.max(16, rect.height * 0.28));
    const top = Math.max(rect.top + 16, rect.top + rect.height - bottomOffset - TOAST_HEIGHT);

    root.style.left = `${Math.max(16, rect.left + 16)}px`;
    root.style.top = `${top}px`;
  }

  show(rate: number, video: HTMLVideoElement) {
    const root = this.ensureRoot();
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
