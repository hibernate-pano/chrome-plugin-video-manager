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

interface PlaybackSnapshot {
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

  private capturePlaybackSnapshot(video: HTMLVideoElement): PlaybackSnapshot {
    return {
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      paused: video.paused,
      muted: video.muted,
    };
  }

  private applySnapshot(video: HTMLVideoElement, snapshot: PlaybackSnapshot) {
    try {
      video.currentTime = snapshot.currentTime;
    } catch {
      // Best effort.
    }

    video.playbackRate = snapshot.playbackRate;
    video.muted = snapshot.muted;

    if (!snapshot.paused) {
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
    video.style.setProperty('z-index', '2147483646', 'important');
    video.style.setProperty('background', '#000', 'important');
  }

  // css-cover 模式下视频留在页面自己的树里（靠 fixed + 最高 z-index 盖全屏），
  // 跨不过页面祖先的层叠上下文：transform / filter / opacity / contain /
  // position+z-index 都会在祖先上新建一个，把 fixed 视频关在里面。
  // 所以这一模式下绝不能靠 overlay 提供不透明背板——背板反而会盖住视频。
  // 视频自身已有 background:#000 与 object-fit:contain（见 applyFullscreenLayout），
  // 退化成「浮在真实页面上」依然可看。
  private applyCssCover(video: HTMLVideoElement) {
    this.applyFullscreenLayout(video, 'css-cover');
  }

  private fallbackToCssCover() {
    const video = this.state.video;
    if (!video || this.state.mode !== 'reparent' || !this.state.originalParent) {
      return;
    }

    const playbackSnapshot = this.capturePlaybackSnapshot(video);
    this.state.originalParent.insertBefore(video, this.state.originalNextSibling);
    this.state.mode = 'css-cover';
    // 摘掉 vsc-active 即彻底 display:none（runtimeStyles.ts:4-16），一个像素都不画。
    // overlay 此刻仍在 DOM 里（只有 exit 会 remove 它），不清掉就会留下一层
    // 98% 不透明的深色背板，把可能被页面祖先压住的视频整个盖住。
    document.getElementById(OVERLAY_ID)?.classList.remove('vsc-active');
    this.applyCssCover(video);
    this.applySnapshot(video, playbackSnapshot);
  }

  private startHealthCheck() {
    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
    }

    this.healthTimer = window.setInterval(() => {
      const video = this.state.video;
      if (!video || !video.isConnected) {
        // 页面已经把这个节点从文档里丢掉了：不能走 exit()，否则会把废弃节点
        // 重新插回它原来的父节点（originalNextSibling 也可能已被移除 → NotFoundError），
        // 还会对没人看的游离节点调 play()。这里只做清理。
        this.release();
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
    // 若页面正处于系统原生全屏（如之前点了站点自己的全屏按钮），先退出：
    // 否则后续按 ESC 会被浏览器拿去退系统全屏，keydown 不再派发给页面，
    // 我们的 overlay 盖在最上层，看起来就像“按 ESC 没反应”。
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Best effort.
      });
    }
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
      const playbackSnapshot = this.capturePlaybackSnapshot(video);
      this.applyFullscreenLayout(video, 'reparent');
      stage.appendChild(video);
      this.applySnapshot(video, playbackSnapshot);

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

  // 只清理、不碰视频在页面里的位置。给「节点已经不在文档里」的路径用：
  // 还原 class/style/controls 对游离节点是 no-op，无副作用。
  private release() {
    const video = this.state.video;
    if (!video) {
      return;
    }

    video.classList.remove('vsc-page-fullscreen-video', 'vsc-page-fullscreen-video--reparent', 'vsc-page-fullscreen-video--css-cover');
    video.controls = this.state.originalControls;
    video.setAttribute('style', this.state.originalStyle);

    document.getElementById(OVERLAY_ID)?.remove();
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

  exit() {
    const video = this.state.video;
    if (!video) {
      return;
    }

    // isConnected 守卫：页面若已把视频连同 originalNextSibling 一起丢弃，
    // 插回去要么插入一张已经被页面丢弃的节点，要么直接抛 NotFoundError 让退出流程中断。
    if (this.state.mode === 'reparent' && this.state.originalParent && video.isConnected) {
      const playbackSnapshot = this.capturePlaybackSnapshot(video);
      this.state.originalParent.insertBefore(video, this.state.originalNextSibling);
      this.applySnapshot(video, playbackSnapshot);
    }

    this.release();
  }

  destroy() {
    this.exit();
  }
}
