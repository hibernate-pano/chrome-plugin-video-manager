import { getSiteAdapter } from './siteAdapters';
import type { MediaCandidate } from './types';

type DetectorListener = () => void;

const MEDIA_SELECTOR = 'video, audio';

const isVisible = (media: HTMLMediaElement) => {
  const rect = media.getBoundingClientRect();
  const style = media.ownerDocument.defaultView?.getComputedStyle(media);

  return rect.width > 0
    && rect.height > 0
    && style?.visibility !== 'hidden'
    && style?.display !== 'none';
};

const isInViewport = (media: HTMLMediaElement) => {
  const rect = media.getBoundingClientRect();
  return rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
};

const area = (media: HTMLMediaElement) => {
  const rect = media.getBoundingClientRect();
  return rect.width * rect.height;
};

const isConnectedAcrossFrames = (media: HTMLMediaElement) => {
  const ownerDoc = media.ownerDocument;
  return ownerDoc?.defaultView != null && ownerDoc.contains(media);
};

const collectFromRoot = (root: Document | ShadowRoot, collected: HTMLMediaElement[]) => {
  root.querySelectorAll(MEDIA_SELECTOR).forEach((node) => {
    if (node instanceof HTMLMediaElement) {
      collected.push(node);
    }
  });

  root.querySelectorAll('*').forEach((node) => {
    if (node instanceof HTMLElement && node.shadowRoot) {
      collectFromRoot(node.shadowRoot, collected);
    }

    if (node instanceof HTMLIFrameElement) {
      try {
        const frameDocument = node.contentDocument;
        if (frameDocument?.documentElement) {
          collectFromRoot(frameDocument, collected);
        }
      } catch {
        // Cross-origin iframe.
      }
    }
  });
};

export class MediaDetector {
  private lastInteractedMedia: HTMLMediaElement | null = null;
  private overlayMedia: HTMLMediaElement | null = null;
  private listeners = new Set<DetectorListener>();
  private mutationObserver: MutationObserver | null = null;
  private fallbackInterval: number | null = null;
  private boundHandleInteraction = (event: Event) => this.handleInteraction(event);

  subscribe(listener: DetectorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  start() {
    if (this.mutationObserver) {
      return;
    }

    this.mutationObserver = new MutationObserver(() => this.notify());
    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'style', 'class'],
    });

    document.addEventListener('pointerdown', this.boundHandleInteraction, true);
    document.addEventListener('focusin', this.boundHandleInteraction, true);
    document.addEventListener('play', this.boundHandleInteraction, true);

    this.fallbackInterval = window.setInterval(() => this.notify(), 1500);
  }

  stop() {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;

    document.removeEventListener('pointerdown', this.boundHandleInteraction, true);
    document.removeEventListener('focusin', this.boundHandleInteraction, true);
    document.removeEventListener('play', this.boundHandleInteraction, true);

    if (this.fallbackInterval !== null) {
      window.clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }

  setOverlayMedia(media: HTMLMediaElement | null) {
    this.overlayMedia = media;
    if (media) {
      this.lastInteractedMedia = media;
    }
    this.notify();
  }

  private handleInteraction(event: Event) {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const media = this.findNearestMedia(target);
    if (media) {
      this.lastInteractedMedia = media;
      this.notify();
    }
  }

  private findNearestMedia(node: Node): HTMLMediaElement | null {
    if (node instanceof HTMLMediaElement) {
      return node;
    }

    if (node instanceof Element) {
      const nearest = node.closest(MEDIA_SELECTOR);
      if (nearest instanceof HTMLMediaElement) {
        return nearest;
      }
    }

    return null;
  }

  getAllMediaElements(): HTMLMediaElement[] {
    const collected: HTMLMediaElement[] = [];
    collectFromRoot(document, collected);
    return collected.filter((media, index) => collected.indexOf(media) === index);
  }

  getCandidates(): MediaCandidate[] {
    const adapter = getSiteAdapter(window.location.hostname);
    const allMedia = this.getAllMediaElements().filter((media) => isConnectedAcrossFrames(media));
    const candidates: MediaCandidate[] = [];

    if (this.overlayMedia && isConnectedAcrossFrames(this.overlayMedia)) {
      candidates.push({ element: this.overlayMedia, score: Number.MAX_SAFE_INTEGER, reason: ['lightbox'] });
      return candidates;
    }

    const preferredMedia = adapter.getPreferredMedia?.(document) ?? null;

    for (const media of allMedia) {
      const reason: string[] = [];
      let score = 0;

      if (media === preferredMedia) {
        score += 1200;
        reason.push('site-preferred');
      }

      if (media === this.lastInteractedMedia) {
        score += 1000;
        reason.push('recent-interaction');
      }

      if (!media.paused && !media.ended && media.readyState > 2) {
        score += 600;
        reason.push('playing');
      }

      if (isVisible(media)) {
        score += 300;
        reason.push('visible');
      }

      if (isInViewport(media)) {
        score += 200;
        reason.push('viewport');
      }

      score += Math.min(area(media), 1_000_000) / 1000;
      reason.push(`area:${Math.round(area(media))}`);

      candidates.push({ element: media, score, reason });
    }

    return candidates.sort((left, right) => right.score - left.score);
  }

  getCurrentMedia(): HTMLMediaElement | null {
    return this.getCandidates()[0]?.element ?? null;
  }

  canFullscreen(media: HTMLMediaElement | null): boolean {
    return media instanceof HTMLVideoElement && media.ownerDocument === document;
  }
}

export const mediaDetector = new MediaDetector();
