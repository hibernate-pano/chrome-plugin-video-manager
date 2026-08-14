const HUD_ID = 'vsc-speed-hud';

const RATE_HIDE_DELAY = 1400;
const PLAYBACK_HIDE_DELAY = 800;

/** 1.50 -> "1.5"，1.00 -> "1"，1.25 -> "1.25"。 */
const formatRate = (value: number) =>
  value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

export class SpeedHud {
  private root: HTMLDivElement | null = null;
  private hideTimer: number | null = null;
  private lastRate = 1;
  private activeVideo: HTMLVideoElement | null = null;
  private readonly boundUpdatePosition = () => this.updatePosition();

  private ensureRoot() {
    if (this.root) {
      return this.root;
    }

    const root = document.createElement('div');
    root.id = HUD_ID;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="vsc-hud__inner">
        <span class="vsc-hud__glyph"></span>
        <span class="vsc-hud__value"><span class="vsc-hud__rate">1</span><span class="vsc-hud__unit">x</span></span>
        <span class="vsc-hud__trend"></span>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  private bringToFront(root: HTMLDivElement) {
    if (root.parentElement !== document.body) {
      document.body.appendChild(root);
      return;
    }

    if (document.body.lastElementChild !== root) {
      document.body.appendChild(root);
    }
  }

  private updatePosition() {
    if (!this.root || !this.activeVideo) {
      return;
    }

    const rect = this.activeVideo.getBoundingClientRect();
    this.root.style.top = `${Math.max(12, rect.top + 12)}px`;
    this.root.style.left = `${Math.max(12, rect.left + 12)}px`;
  }

  private show(mode: 'rate' | 'playback', hideDelay: number) {
    const root = this.ensureRoot();
    this.bringToFront(root);
    this.updatePosition();

    root.classList.remove('vsc-visible');
    void root.offsetWidth;
    root.classList.add('vsc-visible');
    root.dataset.mode = mode;

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
    }

    window.addEventListener('scroll', this.boundUpdatePosition, true);
    window.addEventListener('resize', this.boundUpdatePosition);

    this.hideTimer = window.setTimeout(() => {
      root.classList.remove('vsc-visible');
      window.removeEventListener('scroll', this.boundUpdatePosition, true);
      window.removeEventListener('resize', this.boundUpdatePosition);
    }, hideDelay);
  }

  /** 速度模式：大数字 + 趋势箭头。 */
  showRate(rate: number, video: HTMLVideoElement) {
    const root = this.ensureRoot();
    this.activeVideo = video;
    this.updateTrend(rate);

    const rateNode = root.querySelector<HTMLElement>('.vsc-hud__rate');
    if (rateNode) {
      rateNode.textContent = formatRate(rate);
    }

    this.show('rate', RATE_HIDE_DELAY);
    this.lastRate = rate;
  }

  /** 播放/暂停模式：状态字形 + 当前速度。 */
  showPlayback(playing: boolean, video: HTMLVideoElement) {
    const root = this.ensureRoot();
    this.activeVideo = video;

    const glyph = root.querySelector<HTMLElement>('.vsc-hud__glyph');
    if (glyph) {
      glyph.textContent = playing ? '▶' : '⏸';
    }

    const rateNode = root.querySelector<HTMLElement>('.vsc-hud__rate');
    if (rateNode) {
      rateNode.textContent = formatRate(video.playbackRate);
    }

    this.show('playback', PLAYBACK_HIDE_DELAY);
  }

  private updateTrend(nextRate: number) {
    if (!this.root) {
      return;
    }

    const trend = nextRate > this.lastRate ? 'up' : nextRate < this.lastRate ? 'down' : 'up';
    this.root.dataset.trend = trend;

    const trendNode = this.root.querySelector<HTMLElement>('.vsc-hud__trend');
    if (trendNode) {
      trendNode.textContent = trend === 'up' ? '▲' : '▼';
    }
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
