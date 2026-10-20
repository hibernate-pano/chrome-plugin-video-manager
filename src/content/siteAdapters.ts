export interface SiteAdapter {
  /**
   * 「这个站点的视频在哪」的降级链。
   *
   * 链上的选择器按顺序试，命中第一个有候选的就停 —— 否则整条链都会命中、
   * 所有候选都是 preferred，适配器等于失效。最后一档 'video' 是通用兜底。
   */
  selectors: string[];
  /**
   * 「这个站点的**主**播放器」选择器。
   *
   * 与 selectors 的区别是**唯一性**：selectors 最后一档 'video' 会匹配页面上
   * 每一个视频，拿它当主播放器毫无意义。主播放器必须是**具体**的选择器 ——
   * 站站点名的那一个。
   *
   * 为什么需要它：YouTube 的主播放器会**静音自动播放**（浏览器只允许静音自动播）。
   * 单看「静音 + 在播」会把它误判成文章页里那种背景预览视频，于是用户在
   * YouTube 上按 f 没反应 —— 而那恰恰是这个扩展最该工作的场景。
   * 站点自己点名的主播放器不受这条误伤。
   */
  mainSelectors: string[];
}

const adapters: Array<{
  match: (hostname: string) => boolean;
  adapter: SiteAdapter;
}> = [
  {
    match: (hostname) => hostname.includes('youtube.com') || hostname.includes('youtu.be'),
    adapter: {
      selectors: ['video.html5-main-video', '.html5-video-player video', 'video'],
      mainSelectors: ['video.html5-main-video', '.html5-video-player video'],
    },
  },
  {
    match: (hostname) => hostname.includes('bilibili.com'),
    adapter: {
      selectors: ['video.bpx-player-video-wrap-video', '.bilibili-player-video video', 'video'],
      mainSelectors: ['video.bpx-player-video-wrap-video', '.bilibili-player-video video'],
    },
  },
  {
    match: (hostname) => hostname === 'localhost' || hostname === '127.0.0.1',
    adapter: {
      selectors: ['video'],
      mainSelectors: [],
    },
  },
];

const genericAdapter: SiteAdapter = {
  selectors: ['video'],
  mainSelectors: [],
};

export const getSiteAdapter = (hostname: string): SiteAdapter =>
  adapters.find((item) => item.match(hostname))?.adapter ?? genericAdapter;
