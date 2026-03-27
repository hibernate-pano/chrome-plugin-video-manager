import { getSiteAdapter } from './siteAdapters';

type LightboxMode = 'reparent' | 'css-cover';

interface LightboxSnapshot {
  media: HTMLVideoElement | null;
  mode: LightboxMode | null;
  originalParent: ParentNode | null;
  originalNextSibling: Node | null;
  originalStyle: string;
  originalControls: boolean;
  originalBodyOverflow: string;
  playbackTime: number;
  playbackRate: number;
  wasPaused: boolean;
  wasMuted: boolean;
}

type LightboxListener = () => void;

const OVERLAY_ID = 'vsc-lightbox-overlay';
const STAGE_ID = 'vsc-lightbox-stage';
const CONTROLS_ID = 'vsc-lightbox-controls-root';

export class LightboxManager {
  private state: LightboxSnapshot = {
    media: null,
    mode: null,
    originalParent: null,
    originalNextSibling: null,
    originalStyle: '',
    originalControls: false,
    originalBodyOverflow: '',
    playbackTime: 0,
    playbackRate: 1,
    wasPaused: true,
    wasMuted: false,
  };

  private listeners = new Set<LightboxListener>();

  subscribe(listener: LightboxListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private applyPlaybackState(media: HTMLVideoElement) {
    const { playbackTime, playbackRate, wasPaused, wasMuted } = this.state;

    try {
      if (Number.isFinite(playbackTime) && playbackTime > 0) {
        media.currentTime = playbackTime;
      }
    } catch {
      // Some sites may block immediate currentTime updates during DOM transitions.
    }

    media.playbackRate = playbackRate;
    media.muted = wasMuted;

    if (!wasPaused) {
      void media.play().catch(() => {
        // Best-effort restore only.
      });
    }
  }

  private restorePlaybackState(media: HTMLVideoElement) {
    this.applyPlaybackState(media);
    requestAnimationFrame(() => this.applyPlaybackState(media));
    window.setTimeout(() => this.applyPlaybackState(media), 120);
  }

  private applyCssCoverMode(media: HTMLVideoElement) {
    media.classList.add('vsc-lightbox-media', 'vsc-lightbox-media--cover');
    media.style.position = 'fixed';
    media.style.inset = '0';
    media.style.margin = 'auto';
    media.style.width = '100vw';
    media.style.height = '100vh';
    media.style.maxWidth = '100vw';
    media.style.maxHeight = '100vh';
    media.style.objectFit = 'contain';
    media.style.zIndex = '2147483646';
    media.style.background = 'black';
  }

  private fallbackToCssCover(media: HTMLVideoElement) {
    if (this.state.mode !== 'reparent' || !this.state.originalParent) {
      return;
    }

    this.state.originalParent.insertBefore(media, this.state.originalNextSibling);
    this.state.mode = 'css-cover';
    this.applyCssCoverMode(media);
    this.restorePlaybackState(media);
  }

  private scheduleReparentVerification(media: HTMLVideoElement) {
    const expectedTime = this.state.playbackTime;
    const expectedPaused = this.state.wasPaused;
    const verify = () => {
      if (this.state.media !== media || this.state.mode !== 'reparent') {
        return;
      }

      const lostPlaybackPosition = expectedTime > 0.5 && media.currentTime < 0.1;
      const lostPlaybackState = !expectedPaused && media.paused;

      if (lostPlaybackPosition || lostPlaybackState) {
        this.fallbackToCssCover(media);
      }
    };

    [120, 320, 720].forEach((delay) => {
      window.setTimeout(verify, delay);
    });
  }

  isActive(): boolean {
    return this.state.media !== null;
  }

  getMedia(): HTMLVideoElement | null {
    return this.state.media;
  }

  getOverlayRoot(): HTMLElement | null {
    return document.getElementById(CONTROLS_ID);
  }

  private ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    let stage = document.getElementById(STAGE_ID);
    let controlsRoot = document.getElementById(CONTROLS_ID);

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.className = 'vsc-lightbox-overlay';
      overlay.innerHTML = `
        <div id="${STAGE_ID}" class="vsc-lightbox-stage"></div>
        <div id="${CONTROLS_ID}" class="vsc-lightbox-controls-root"></div>
      `;
      document.body.appendChild(overlay);
      stage = overlay.querySelector(`#${STAGE_ID}`);
      controlsRoot = overlay.querySelector(`#${CONTROLS_ID}`);
    }

    if (!(stage instanceof HTMLElement) || !(controlsRoot instanceof HTMLElement)) {
      throw new Error('Failed to create lightbox overlay');
    }

    return { overlay, stage, controlsRoot };
  }

  enter(media: HTMLMediaElement): boolean {
    if (!(media instanceof HTMLVideoElement)) {
      return false;
    }

    if (this.isActive()) {
      if (this.state.media === media) {
        return true;
      }
      this.exit();
    }

    if (media.ownerDocument !== document) {
      return false;
    }

    const adapter = getSiteAdapter(window.location.hostname);
    const { overlay, stage } = this.ensureOverlay();
    const mode: LightboxMode = adapter.canReparent(media) ? 'reparent' : 'css-cover';

    this.state = {
      media,
      mode,
      originalParent: media.parentNode,
      originalNextSibling: media.nextSibling,
      originalStyle: media.getAttribute('style') ?? '',
      originalControls: media.controls,
      originalBodyOverflow: document.body.style.overflow,
      playbackTime: media.currentTime,
      playbackRate: media.playbackRate,
      wasPaused: media.paused,
      wasMuted: media.muted,
    };

    adapter.beforeEnterLightbox?.(media);

    document.body.style.overflow = 'hidden';
    overlay.classList.add('vsc-lightbox-overlay--active');
    media.controls = false;
    media.classList.add('vsc-lightbox-media');

    if (mode === 'reparent') {
      stage.appendChild(media);
      this.restorePlaybackState(media);
      this.scheduleReparentVerification(media);
    } else {
      this.applyCssCoverMode(media);
    }

    this.emit();
    return true;
  }

  exit(): void {
    const media = this.state.media;
    if (!media) {
      return;
    }

    const adapter = getSiteAdapter(window.location.hostname);
    const overlay = document.getElementById(OVERLAY_ID);
    const controlsRoot = document.getElementById(CONTROLS_ID);

    if (this.state.mode === 'reparent' && this.state.originalParent) {
      this.state.originalParent.insertBefore(media, this.state.originalNextSibling);
      this.restorePlaybackState(media);
    }

    media.classList.remove('vsc-lightbox-media', 'vsc-lightbox-media--cover');
    media.controls = this.state.originalControls;
    media.setAttribute('style', this.state.originalStyle);

    document.body.style.overflow = this.state.originalBodyOverflow;
    overlay?.classList.remove('vsc-lightbox-overlay--active');
    controlsRoot?.replaceChildren();
    overlay?.remove();

    adapter.afterExitLightbox?.(media);

    this.state = {
      media: null,
      mode: null,
      originalParent: null,
      originalNextSibling: null,
      originalStyle: '',
      originalControls: false,
      originalBodyOverflow: '',
      playbackTime: 0,
      playbackRate: 1,
      wasPaused: true,
      wasMuted: false,
    };

    this.emit();
  }

  toggle(media: HTMLMediaElement | null): boolean {
    if (this.isActive()) {
      this.exit();
      return false;
    }

    if (!media) {
      return false;
    }

    return this.enter(media);
  }
}

export const lightboxManager = new LightboxManager();
