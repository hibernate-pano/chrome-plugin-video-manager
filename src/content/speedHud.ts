const HUD_ID = 'vsc-speed-hud';

const formatRate = (value: number) => value.toFixed(2).replace(/\.00$/, '.0');

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
      <div class="vsc-speed-hud__shell">
        <div class="vsc-speed-hud__aura"></div>
        <div class="vsc-speed-hud__header">
          <span>VSC</span>
          <span>HUD</span>
          <span class="vsc-speed-hud__label">SPEED</span>
        </div>
        <div class="vsc-speed-hud__body">
          <div>
            <div class="vsc-speed-hud__value">
              <div class="vsc-speed-hud__rate">1.0</div>
              <div class="vsc-speed-hud__unit">x</div>
            </div>
            <div class="vsc-speed-hud__meta">
              <span class="vsc-speed-hud__trend">•</span>
              <span class="vsc-speed-hud__label">SPEED</span>
              <span>PLAYBACK VECTOR</span>
            </div>
          </div>
          <div class="vsc-speed-hud__orb">
            <div class="vsc-speed-hud__ring"></div>
          </div>
        </div>
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

  private updateTrend(nextRate: number) {
    if (!this.root) {
      return;
    }

    const trend = nextRate > this.lastRate ? 'up' : nextRate < this.lastRate ? 'down' : 'up';
    this.root.dataset.trend = trend;

    const trendGlyph = this.root.querySelector<HTMLElement>('.vsc-speed-hud__trend');
    const label = this.root.querySelectorAll<HTMLElement>('.vsc-speed-hud__label');
    if (trendGlyph) {
      trendGlyph.textContent = trend === 'up' ? '▲' : '▼';
    }
    label.forEach((node) => {
      node.textContent = trend === 'up' ? 'FASTER' : 'SLOWER';
    });
  }

  show(rate: number, video: HTMLVideoElement) {
    const root = this.ensureRoot();
    this.bringToFront(root);
    this.activeVideo = video;
    this.updatePosition();
    this.updateTrend(rate);

    const rateNode = root.querySelector<HTMLElement>('.vsc-speed-hud__rate');
    if (rateNode) {
      rateNode.textContent = formatRate(rate);
    }

    root.classList.remove('vsc-visible');
    void root.offsetWidth;
    root.classList.add('vsc-visible');

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
    }

    window.addEventListener('scroll', this.boundUpdatePosition, true);
    window.addEventListener('resize', this.boundUpdatePosition);

    this.hideTimer = window.setTimeout(() => {
      root.classList.remove('vsc-visible');
      window.removeEventListener('scroll', this.boundUpdatePosition, true);
      window.removeEventListener('resize', this.boundUpdatePosition);
    }, 1400);

    this.lastRate = rate;
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
