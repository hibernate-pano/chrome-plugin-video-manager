export interface SiteAdapter {
  selectors: string[];
  shouldTryReparent: (video: HTMLVideoElement) => boolean;
}

const adapters: Array<{
  match: (hostname: string) => boolean;
  adapter: SiteAdapter;
}> = [
  {
    match: (hostname) => hostname.includes('youtube.com') || hostname.includes('youtu.be'),
    adapter: {
      selectors: ['video.html5-main-video', '.html5-video-player video', 'video'],
      shouldTryReparent: (video) => video.ownerDocument === document,
    },
  },
  {
    match: (hostname) => hostname.includes('bilibili.com'),
    adapter: {
      selectors: ['video.bpx-player-video-wrap-video', '.bilibili-player-video video', 'video'],
      shouldTryReparent: (video) => video.ownerDocument === document,
    },
  },
  {
    match: (hostname) => hostname === 'localhost' || hostname === '127.0.0.1',
    adapter: {
      selectors: ['video'],
      shouldTryReparent: (video) => video.ownerDocument === document,
    },
  },
];

const genericAdapter: SiteAdapter = {
  selectors: ['video'],
  shouldTryReparent: (video) => video.ownerDocument === document,
};

export const getSiteAdapter = (hostname: string): SiteAdapter =>
  adapters.find((item) => item.match(hostname))?.adapter ?? genericAdapter;
