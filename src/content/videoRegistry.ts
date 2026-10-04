import { getSiteAdapter } from './siteAdapters';

const VIDEO_SELECTOR = 'video';

type VideoRect = Pick<DOMRect, 'width' | 'height' | 'top' | 'left' | 'right' | 'bottom'>;
type SafeMatcher = HTMLVideoElement & { safeMatches?: (selector: string) => boolean };

// 帧号：模块内常驻的 rAF 自增计数器。页面隐藏时 rAF 停摆、帧号不前进，
// 于是隐藏期间快照不失效——隐藏页面本来就不该重扫视频。
let currentFrame = 0;
const tickFrame = () => {
  currentFrame = currentFrame >= Number.MAX_SAFE_INTEGER ? 1 : currentFrame + 1;
  requestAnimationFrame(tickFrame);
};
if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(tickFrame);
}

const isConnected = (video: HTMLVideoElement) =>
  video.ownerDocument.defaultView != null && video.ownerDocument.contains(video);

/**
 * video 可能住在同源 iframe 里，那属于另一个 realm、构造器不共享（jsdom 即如此）。
 * 只认本 realm 的构造器会把 iframe 里的播放器整片丢掉，而这里恰恰是唯一
 * 下钻同源 iframe 的地方：先看本 realm，再退回节点自己那个 realm 的构造器。
 */
const isVideoElement = (node: Element): node is HTMLVideoElement => {
  if (node instanceof HTMLVideoElement) {
    return true;
  }

  const view = node.ownerDocument.defaultView;
  return view != null && node instanceof view.HTMLVideoElement;
};

/** 同源 iframe 里的节点属于另一个 realm，用本 realm 的构造器 instanceof 会全部落空。 */
const shadowRootOf = (node: Element): ShadowRoot | null => {
  const view = node.ownerDocument.defaultView;
  if (view == null || !(node instanceof view.HTMLElement)) {
    return null;
  }

  return node.shadowRoot;
};

/** 同上，iframe 判定也要退回节点自己那个 realm；跨域时读 contentDocument 会抛。 */
const frameDocumentOf = (node: Element): Document | null => {
  const view = node.ownerDocument.defaultView;
  if (view == null || !(node instanceof view.HTMLIFrameElement)) {
    return null;
  }

  try {
    const frameDocument = node.contentDocument;
    return frameDocument?.documentElement ? frameDocument : null;
  } catch {
    return null;
  }
};

const isVisible = (style: CSSStyleDeclaration | null | undefined, rect: VideoRect) =>
  rect.width > 0
  && rect.height > 0
  && style?.display !== 'none'
  && style?.visibility !== 'hidden';

/**
 * 被 CSS 明确隐藏（display/visibility）——不依赖布局引擎，任何环境都可判定。
 */
const isCssHidden = (style: CSSStyleDeclaration | null | undefined) =>
  style?.display === 'none' || style?.visibility === 'hidden';

/**
 * 是否有可信的布局几何。无布局引擎的环境（如单测用的 jsdom）里 getComputedStyle
 * 返回空 display，且所有元素的 rect 恒为 0；此时不能凭 rect 判定「不可见」，
 * 否则会把页面里所有候选一并误杀。
 */
const hasReliableLayout = (style: CSSStyleDeclaration | null | undefined) =>
  style != null && style.display !== '';

const isInViewport = (video: HTMLVideoElement, rect: VideoRect) => {
  // iframe 内 video 的 rect 相对 iframe 自己的视口，拿顶层窗口的尺寸去比会判错。
  const view = video.ownerDocument.defaultView;
  const height = view?.innerHeight ?? window.innerHeight;
  const width = view?.innerWidth ?? window.innerWidth;

  return rect.bottom > 0
    && rect.right > 0
    && rect.top < height
    && rect.left < width;
};

const area = (rect: VideoRect) => rect.width * rect.height;

const collectVideos = (root: Document | ShadowRoot, videos: Set<HTMLVideoElement>) => {
  root.querySelectorAll(VIDEO_SELECTOR).forEach((node) => {
    if (isVideoElement(node)) {
      videos.add(node);
    }
  });

  root.querySelectorAll('*').forEach((node) => {
    const shadow = shadowRootOf(node);
    if (shadow) {
      collectVideos(shadow, videos);
    }

    const frameDocument = frameDocumentOf(node);
    if (frameDocument) {
      collectVideos(frameDocument, videos);
    }
  });
};

const matchesSelector = (video: HTMLVideoElement, selector: string) => {
  const safeMatches = (video as SafeMatcher).safeMatches;
  return safeMatches ? safeMatches.call(video, selector) : video.matches?.(selector) === true;
};

/**
 * 在候选集上判定 preferred（而不是单独 querySelector 一次文档），
 * 这样 shadow root / 同源 iframe 里的 video 同样参与选择器匹配。
 * 站点专属选择器优先、通用 'video' 兜底的降级链保持不变：命中第一个有候选的
 * 选择器就停，否则整条链都会命中、所有候选都是 preferred，适配器等于失效。
 */
const selectPreferredVideos = (videos: HTMLVideoElement[], selectors: string[]) => {
  const preferred = new Set<HTMLVideoElement>();
  for (const selector of selectors) {
    for (const video of videos) {
      if (matchesSelector(video, selector)) {
        preferred.add(video);
      }
    }
    if (preferred.size > 0) {
      return preferred;
    }
  }

  return preferred;
};

export class VideoRegistry {
  private fullscreenVideo: HTMLVideoElement | null = null;
  private lastInteractedVideo: HTMLVideoElement | null = null;
  /** 同一帧内的查询结果；未置脏且帧号未前进时直接复用，不再遍历全页。 */
  private snapshot: { frame: number; result: HTMLVideoElement | null } | null = null;
  private dirty = true;
  /** 只置脏标记，绝不在回调里重建视频列表。 */
  private readonly observer = new MutationObserver(() => {
    this.dirty = true;
  });
  private readonly boundHandleInteraction = (event: Event) => this.handleInteraction(event);

  start() {
    document.addEventListener('pointerdown', this.boundHandleInteraction, true);
    document.addEventListener('focusin', this.boundHandleInteraction, true);
    document.addEventListener('play', this.boundHandleInteraction, true);
    // observe 要求真实节点：极端情况下 body 还没建好就退到 documentElement。
    this.observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
    this.dirty = true;
  }

  stop() {
    document.removeEventListener('pointerdown', this.boundHandleInteraction, true);
    document.removeEventListener('focusin', this.boundHandleInteraction, true);
    document.removeEventListener('play', this.boundHandleInteraction, true);
    this.observer.disconnect();
    this.fullscreenVideo = null;
    this.lastInteractedVideo = null;
    this.snapshot = null;
    this.dirty = true;
  }

  setFullscreenVideo(video: HTMLVideoElement | null) {
    this.fullscreenVideo = video;
    if (video) {
      this.lastInteractedVideo = video;
    }
    // lastInteractedVideo 变了，缓存里的"当前视频"可能已过期。
    this.dirty = true;
  }

  private getAllVideos() {
    const videos = new Set<HTMLVideoElement>();
    collectVideos(document, videos);
    return Array.from(videos);
  }

  getCurrentVideo() {
    // 全屏视频永远最高优先，必须留在快照判断之前。
    if (this.fullscreenVideo && isConnected(this.fullscreenVideo)) {
      return this.fullscreenVideo;
    }

    const snapshot = this.snapshot;
    // 快照持强引用：页面可能在同一帧内把节点摘掉，命中缓存前重新确认存活。
    if (!this.dirty
      && snapshot
      && snapshot.frame === currentFrame
      && (snapshot.result === null || isConnected(snapshot.result))) {
      return snapshot.result;
    }

    const result = this.resolveCurrentVideo();
    this.snapshot = { frame: currentFrame, result };
    this.dirty = false;
    return result;
  }

  private resolveCurrentVideo() {
    const videos = this.getAllVideos().filter(isConnected);
    const preferred = selectPreferredVideos(videos, getSiteAdapter(window.location.hostname).selectors);

    const sorted = videos
      // 一个 video 只读一次 rect、一次 computed style，可见性/视口/面积判定复用；
      // getComputedStyle 读不到样式就判不了 display/visibility，不能从 rect 推。
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const style = video.ownerDocument.defaultView?.getComputedStyle(video);
        return { video, rect, style };
      })
      // 完全不可见的候选不是有效受控对象：单候选时它会以最高分胜出，速度被改在
      // 看不见的视频上、toast 还会因为 rect 全 0 而钳到屏幕角落。唯一豁免用户
      // 显式交互过的那条——那是用户亲自选中的目标，即使站点把它藏起来也应尊重。
      .filter(({ video, rect, style }) => {
        if (video === this.lastInteractedVideo) {
          return true;
        }
        if (isCssHidden(style)) {
          return false;
        }
        // rect 为 0 只作参考：无布局引擎时所有 rect 恒为 0，此时不能据此过滤。
        return !hasReliableLayout(style) || (rect.width > 0 && rect.height > 0);
      })
      .map(({ video, rect, style }) => {
        let score = 0;

        // 1600 = 1 + 可见300 + 在视口200 + 面积上限1000：
        // 非播放中的候选里 preferred 必赢，而正在播放的视频仍能凭 +600 压过暂停的 preferred。
        if (preferred.has(video)) {
          score += 1600;
        }
        if (video === this.lastInteractedVideo) {
          score += 10000;
        }
        if (!video.paused && !video.ended && video.readyState > 2) {
          score += 600;
        }

        if (isVisible(style, rect)) {
          score += 300;
        }
        if (isInViewport(video, rect)) {
          score += 200;
        }

        score += Math.min(area(rect), 1_000_000) / 1000;
        return { video, score };
      })
      .sort((left, right) => right.score - left.score);

    return sorted[0]?.video ?? null;
  }

  private handleInteraction(event: Event) {
    const video = this.findNearestVideo(event.target);
    if (video && video !== this.lastInteractedVideo) {
      this.lastInteractedVideo = video;
      // 否则同一帧内紧随其后的查询会读到交互前的旧结果。
      this.dirty = true;
    }
  }

  private findNearestVideo(target: EventTarget | null): HTMLVideoElement | null {
    if (target instanceof Element) {
      const nearest = target.closest(VIDEO_SELECTOR);
      if (nearest && isVideoElement(nearest)) {
        return nearest;
      }
    }

    return null;
  }
}
