const INDICATOR_ID = 'vsc-target-indicator';

const formatRate = (value: number) =>
  value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const isVideo = (node: unknown): node is HTMLVideoElement => node instanceof HTMLVideoElement;

/**
 * 受控对象指示器：悬停任意视频时显示"VSC 将控制此视频"，
 * 若该视频就是当前受控对象则显示当前速度；点击后锁定（registry 已记录交互）。
 */
export class TargetIndicator {
  private root: HTMLDivElement | null = null;
  private hoveredVideo: HTMLVideoElement | null = null;
  private readonly getCurrent: () => HTMLVideoElement | null;
  private readonly boundHandleMouseOver = (event: MouseEvent) => this.handleMouseOver(event);
  private readonly boundHandleMouseOut = (event: MouseEvent) => this.handleMouseOut(event);
  private readonly boundHandlePointerDown = () => this.update();
  private readonly boundHandleScroll = () => this.updatePosition();

  constructor(getCurrent: () => HTMLVideoElement | null) {
    this.getCurrent = getCurrent;
  }

  start() {
    document.addEventListener('mouseover', this.boundHandleMouseOver, true);
    document.addEventListener('mouseout', this.boundHandleMouseOut, true);
    document.addEventListener('pointerdown', this.boundHandlePointerDown, true);
    window.addEventListener('scroll', this.boundHandleScroll, true);
    window.addEventListener('resize', this.boundHandleScroll);
  }

  stop() {
    document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
    document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
    document.removeEventListener('pointerdown', this.boundHandlePointerDown, true);
    window.removeEventListener('scroll', this.boundHandleScroll, true);
    window.removeEventListener('resize', this.boundHandleScroll);
    this.hoveredVideo = null;
    this.hide();
  }

  private ensureRoot() {
    if (this.root) {
      return this.root;
    }

    const root = document.createElement('div');
    root.id = INDICATOR_ID;
    root.innerHTML = `
      <div class="vsc-target-indicator__pill">
        <span class="vsc-target-indicator__dot"></span>
        <span class="vsc-target-indicator__text"></span>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  private findVideo(target: EventTarget | null): HTMLVideoElement | null {
    if (isVideo(target)) {
      return target;
    }

    if (target instanceof Element) {
      const nearest = target.closest('video');
      if (isVideo(nearest)) {
        return nearest;
      }
    }

    return null;
  }

  private handleMouseOver(event: MouseEvent) {
    const video = this.findVideo(event.target);
    if (video && video !== this.hoveredVideo) {
      this.hoveredVideo = video;
      this.update();
    }
  }

  private handleMouseOut(event: MouseEvent) {
    if (!this.hoveredVideo) {
      return;
    }

    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && this.hoveredVideo.contains(nextTarget)) {
      return;
    }

    if (nextTarget && this.hoveredVideo.isSameNode(nextTarget)) {
      return;
    }

    this.hoveredVideo = null;
    this.hide();
  }

  private update() {
    const video = this.hoveredVideo;
    if (!video || !video.isConnected) {
      this.hoveredVideo = null;
      this.hide();
      return;
    }

    const root = this.ensureRoot();
    const isCurrent = this.getCurrent() === video;
    root.dataset.current = String(isCurrent);

    const textNode = root.querySelector<HTMLElement>('.vsc-target-indicator__text');
    if (textNode) {
      textNode.textContent = isCurrent
        ? `VSC · ${formatRate(video.playbackRate)}x`
        : 'VSC · 点击后控制';
    }

    root.classList.add('vsc-visible');
    this.updatePosition();
  }

  private updatePosition() {
    const root = this.root;
    const video = this.hoveredVideo;
    if (!root || !video || !video.isConnected) {
      return;
    }

    const rect = video.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      root.classList.remove('vsc-visible');
      return;
    }

    root.style.top = `${Math.max(0, rect.top)}px`;
    root.style.left = `${Math.max(0, rect.left)}px`;
    root.style.width = `${rect.width}px`;
    root.style.height = `${rect.height}px`;
  }

  private hide() {
    if (this.root) {
      this.root.classList.remove('vsc-visible');
    }
  }

  destroy() {
    this.stop();
    this.root?.remove();
    this.root = null;
  }
}
