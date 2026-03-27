import { getSiteAdapter } from './siteAdapters';

type FullscreenMode = 'reparent' | 'css-cover';

interface FullscreenSnapshot {
  video: HTMLVideoElement | null;
  mode: FullscreenMode | null;
  originalParent: ParentNode | null;
  originalNextSibling: Node | null;
  originalStyle: string;
  originalControls: boolean;
  originalBodyOverflow: string;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  muted: boolean;
}

const OVERLAY_ID = 'vsc-page-fullscreen-overlay';
const STAGE_ID = 'vsc-page-fullscreen-stage';

export class FullscreenController {
  private state: FullscreenSnapshot = {
    video: null,
    mode: null,
    originalParent: null,
    originalNextSibling: null,
    originalStyle: '',
    originalControls: false,
    originalBodyOverflow: '',
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    muted: false,
  };

  private healthTimer: number | null = null;

  isActive() {
    return this.state.video !== null;
  }

  getActiveVideo() {
    return this.state.video;
  }

  toggle(video: HTMLVideoElement | null) {
    if (this.isActive()) {
      this.exit();
      return true;
    }

    if (!video) {
      return false;
    }

    return this.enter(video);
  }

  private ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.innerHTML = `<div id="${STAGE_ID}"></div>`;
      document.body.appendChild(overlay);
    }

    const stage = overlay.querySelector(`#${STAGE_ID}`);
    if (!(stage instanceof HTMLElement)) {
      throw new Error('Fullscreen overlay stage missing');
    }

    return { overlay, stage };
  }

  private applySnapshot(video: HTMLVideoElement) {
    try {
      video.currentTime = this.state.currentTime;
    } catch {
      // Best effort.
    }

    video.playbackRate = this.state.playbackRate;
    video.muted = this.state.muted;

    if (!this.state.paused) {
      void video.play().catch(() => {
        // Best effort.
      });
    }
  }

  private applyFullscreenLayout(video: HTMLVideoElement, mode: FullscreenMode) {
    video.classList.add('vsc-page-fullscreen-video', `vsc-page-fullscreen-video--${mode}`);
    video.style.setProperty('position', 'fixed', 'important');
    video.style.setProperty('inset', '0', 'important');
    video.style.setProperty('margin', 'auto', 'important');
    video.style.setProperty('width', '100vw', 'important');
    video.style.setProperty('height', '100vh', 'important');
    video.style.setProperty('max-width', '100vw', 'important');
    video.style.setProperty('max-height', '100vh', 'important');
    video.style.setProperty('object-fit', 'contain', 'important');
    video.style.setProperty('z-index', '2147483647', 'important');
    video.style.setProperty('background', '#000', 'important');
  }

  private applyCssCover(video: HTMLVideoElement) {
    this.applyFullscreenLayout(video, 'css-cover');
  }

  private fallbackToCssCover() {
    const video = this.state.video;
    if (!video || this.state.mode !== 'reparent' || !this.state.originalParent) {
      return;
    }

    this.state.originalParent.insertBefore(video, this.state.originalNextSibling);
    this.state.mode = 'css-cover';
    this.applyCssCover(video);
    this.applySnapshot(video);
  }

  private startHealthCheck() {
    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
    }

    this.healthTimer = window.setInterval(() => {
      const video = this.state.video;
      if (!video || !video.isConnected) {
        this.exit();
      }
    }, 500);
  }

  enter(video: HTMLVideoElement) {
    if (video.ownerDocument !== document) {
      return false;
    }

    if (this.state.video === video) {
      return true;
    }

    if (this.isActive()) {
      this.exit();
    }

    const { overlay, stage } = this.ensureOverlay();
    const shouldTryReparent = getSiteAdapter(window.location.hostname).shouldTryReparent(video);
    const mode: FullscreenMode = shouldTryReparent ? 'reparent' : 'css-cover';

    this.state = {
      video,
      mode,
      originalParent: video.parentNode,
      originalNextSibling: video.nextSibling,
      originalStyle: video.getAttribute('style') ?? '',
      originalControls: video.controls,
      originalBodyOverflow: document.body.style.overflow,
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      paused: video.paused,
      muted: video.muted,
    };

    overlay.classList.add('vsc-active');
    document.body.style.overflow = 'hidden';
    video.controls = true;

    if (mode === 'reparent') {
      this.applyFullscreenLayout(video, 'reparent');
      stage.appendChild(video);
      this.applySnapshot(video);

      window.setTimeout(() => {
        if (!this.state.video || this.state.video !== video || this.state.mode !== 'reparent') {
          return;
        }

        const rect = video.getBoundingClientRect();
        const lostPlaybackPosition = this.state.currentTime > 0.5 && video.currentTime < 0.1;
        const lostPlaybackState = !this.state.paused && video.paused;
        const lostLayout = rect.width < 32 || rect.height < 32 || !stage.contains(video);

        if (lostPlaybackPosition || lostPlaybackState || lostLayout) {
          this.fallbackToCssCover();
        }
      }, 180);
    } else {
      this.applyCssCover(video);
    }

    this.startHealthCheck();
    return true;
  }

  exit() {
    const video = this.state.video;
    if (!video) {
      return;
    }

    const overlay = document.getElementById(OVERLAY_ID);

    if (this.state.mode === 'reparent' && this.state.originalParent) {
      this.state.originalParent.insertBefore(video, this.state.originalNextSibling);
      this.applySnapshot(video);
    }

    video.classList.remove('vsc-page-fullscreen-video', 'vsc-page-fullscreen-video--reparent', 'vsc-page-fullscreen-video--css-cover');
    video.controls = this.state.originalControls;
    video.setAttribute('style', this.state.originalStyle);

    overlay?.remove();
    document.body.style.overflow = this.state.originalBodyOverflow;

    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    this.state = {
      video: null,
      mode: null,
      originalParent: null,
      originalNextSibling: null,
      originalStyle: '',
      originalControls: false,
      originalBodyOverflow: '',
      currentTime: 0,
      playbackRate: 1,
      paused: true,
      muted: false,
    };
  }

  destroy() {
    this.exit();
  }
}
