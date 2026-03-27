import { getPreferredVideo } from './siteAdapters';

const VIDEO_SELECTOR = 'video';

const isConnected = (video: HTMLVideoElement) =>
  video.ownerDocument.defaultView != null && video.ownerDocument.contains(video);

const isVisible = (video: HTMLVideoElement) => {
  const rect = video.getBoundingClientRect();
  const style = video.ownerDocument.defaultView?.getComputedStyle(video);

  return rect.width > 0
    && rect.height > 0
    && style?.display !== 'none'
    && style?.visibility !== 'hidden';
};

const isInViewport = (video: HTMLVideoElement) => {
  const rect = video.getBoundingClientRect();
  return rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
};

const area = (video: HTMLVideoElement) => {
  const rect = video.getBoundingClientRect();
  return rect.width * rect.height;
};

const collectVideos = (root: Document | ShadowRoot, videos: HTMLVideoElement[]) => {
  root.querySelectorAll(VIDEO_SELECTOR).forEach((node) => {
    if (node instanceof HTMLVideoElement) {
      videos.push(node);
    }
  });

  root.querySelectorAll('*').forEach((node) => {
    if (node instanceof HTMLElement && node.shadowRoot) {
      collectVideos(node.shadowRoot, videos);
    }

    if (node instanceof HTMLIFrameElement) {
      try {
        const frameDocument = node.contentDocument;
        if (frameDocument?.documentElement) {
          collectVideos(frameDocument, videos);
        }
      } catch {
        // Cross-origin iframe.
      }
    }
  });
};

export class VideoRegistry {
  private fullscreenVideo: HTMLVideoElement | null = null;
  private lastInteractedVideo: HTMLVideoElement | null = null;
  private readonly boundHandleInteraction = (event: Event) => this.handleInteraction(event);

  start() {
    document.addEventListener('pointerdown', this.boundHandleInteraction, true);
    document.addEventListener('focusin', this.boundHandleInteraction, true);
    document.addEventListener('play', this.boundHandleInteraction, true);
  }

  stop() {
    document.removeEventListener('pointerdown', this.boundHandleInteraction, true);
    document.removeEventListener('focusin', this.boundHandleInteraction, true);
    document.removeEventListener('play', this.boundHandleInteraction, true);
    this.fullscreenVideo = null;
    this.lastInteractedVideo = null;
  }

  setFullscreenVideo(video: HTMLVideoElement | null) {
    this.fullscreenVideo = video;
    if (video) {
      this.lastInteractedVideo = video;
    }
  }

  getAllVideos() {
    const videos: HTMLVideoElement[] = [];
    collectVideos(document, videos);
    return videos.filter((video, index) => videos.indexOf(video) === index);
  }

  getCurrentVideo() {
    if (this.fullscreenVideo && isConnected(this.fullscreenVideo)) {
      return this.fullscreenVideo;
    }

    const videos = this.getAllVideos().filter(isConnected);
    const preferred = getPreferredVideo(document);

    const sorted = videos
      .map((video) => {
        let score = 0;

        if (video === preferred) {
          score += 50;
        }
        if (video === this.lastInteractedVideo) {
          score += 1000;
        }
        if (!video.paused && !video.ended && video.readyState > 2) {
          score += 600;
        }
        if (isVisible(video)) {
          score += 300;
        }
        if (isInViewport(video)) {
          score += 200;
        }

        score += Math.min(area(video), 1_000_000) / 1000;
        return { video, score };
      })
      .sort((left, right) => right.score - left.score);

    return sorted[0]?.video ?? null;
  }

  private handleInteraction(event: Event) {
    const video = this.findNearestVideo(event.target);
    if (video) {
      this.lastInteractedVideo = video;
    }
  }

  private findNearestVideo(target: EventTarget | null): HTMLVideoElement | null {
    if (target instanceof HTMLVideoElement) {
      return target;
    }

    if (target instanceof Element) {
      const nearest = target.closest(VIDEO_SELECTOR);
      if (nearest instanceof HTMLVideoElement) {
        return nearest;
      }
    }

    return null;
  }
}
