import type { SiteAdapter } from './types';

const queryMedia = (root: Document | ShadowRoot, selectors: string[]): HTMLMediaElement | null => {
  for (const selector of selectors) {
    const media = root.querySelector(selector);
    if (media instanceof HTMLMediaElement) {
      return media;
    }
  }

  return null;
};

export const genericAdapter: SiteAdapter = {
  match: () => true,
  canReparent: () => false,
};

export const localhostAdapter: SiteAdapter = {
  match: (hostname) => hostname === 'localhost' || hostname === '127.0.0.1',
  canReparent: (media) => media instanceof HTMLVideoElement,
};

export const youtubeAdapter: SiteAdapter = {
  match: (hostname) => hostname.includes('youtube.com') || hostname.includes('youtu.be'),
  canReparent: () => false,
  getPreferredMedia: (root) => queryMedia(root, ['video.html5-main-video', '.html5-video-player video']),
};

export const bilibiliAdapter: SiteAdapter = {
  match: (hostname) => hostname.includes('bilibili.com'),
  canReparent: () => false,
  getPreferredMedia: (root) => queryMedia(root, ['video.bpx-player-video-wrap-video', '.bilibili-player-video video', 'video']),
};

const adapters = [youtubeAdapter, bilibiliAdapter, localhostAdapter, genericAdapter];

export const getSiteAdapter = (hostname: string): SiteAdapter =>
  adapters.find((adapter) => adapter.match(hostname)) ?? genericAdapter;
