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
   * 站点点名的那一个。
   *
   * 为什么需要它：YouTube 的主播放器会**静音自动播放**（浏览器只允许静音自动播）。
   * 单看「静音 + 在播」会把它误判成文章页里那种背景预览视频，于是用户在
   * YouTube 上按 f 没反应 —— 而那恰恰是这个扩展最该工作的场景。
   * 站点自己点名的主播放器不受这条误伤。
   *
   * ⚠️ 这里的选择器**不能**退化成 'video'：那会让页面上每一个视频
   * （包括 hover 预览、推荐卡片）都拿到主播放器豁免。
   */
  mainSelectors: string[];
}

/**
 * 域名匹配：**必须是后缀**。
 *
 * ⚠️ 曾经用 `hostname.includes('youtube.com')` —— 那会把 `notyoutube.com`、
 * `youtube.com.evil.example` 这类域名也当成 YouTube，于是它们拿到了
 * YouTube 的 mainSelectors 豁免（主播放器豁免 = 装饰性判定失效）。
 * 键盘控制器那边用的是严格后缀正则 `/(^|\.)youtube\.com$/`，两处不一致 ——
 * 同一个域名在两条路径上被分成两类视频，这正是「图标和快捷键表现不一致」的来源。
 *
 * 规则：`/(^|\.)example\.com$/` 匹配 example.com 与所有 *.example.com，
 * 不匹配 notexample.com。
 */
const matchesDomain = (hostname: string, ...domains: string[]): boolean =>
  domains.some((domain) => new RegExp(`(^|\\.)${domain}$`).test(hostname));

const adapters: Array<{
  match: (hostname: string) => boolean;
  adapter: SiteAdapter;
}> = [
  {
    match: (hostname) => matchesDomain(hostname, 'youtube.com', 'youtu.be'),
    adapter: {
      selectors: ['video.html5-main-video', '.html5-video-player video', 'video'],
      mainSelectors: ['video.html5-main-video', '.html5-video-player video'],
    },
  },
  {
    match: (hostname) => matchesDomain(hostname, 'bilibili.com'),
    adapter: {
      selectors: ['video.bpx-player-video-wrap-video', '.bilibili-player-video video', 'video'],
      mainSelectors: ['video.bpx-player-video-wrap-video', '.bilibili-player-video video'],
    },
  },
  {
    /**
     * 爱奇艺。
     *
     * 实测（真实 Chromium，https://www.iqiyi.com/，1440×900 视口）：
     *   <video class="full" autoplay muted>（无 controls，正在播）
     *   尺寸 1353×671，占视口 **70.1%**
     *   父链：div.iq-player-cont > div.iq-mini-player > div#playerInstId > div#playerDstId2
     *
     * ⚠️ 为什么它必须有专属适配器：这个视频的形状恰好是「autoplay + 无 controls」，
     * 与文章页里那种装饰性预览**完全一样** —— 6.0.9 的判定因此把它当成装饰，
     * 整页放弃接管（实测：按 = / Space / f 全部无反应，扩展等于没装）。
     * 站点能点名谁是主播放器，那条豁免就不适用于它。
     */
    match: (hostname) => matchesDomain(hostname, 'iqiyi.com'),
    adapter: {
      selectors: ['.iq-player-cont video', 'video'],
      mainSelectors: ['.iq-player-cont video'],
    },
  },
  {
    /**
     * 腾讯视频（v.qq.com）。
     *
     * 播放器的 <video> 带 `tx-video-player-video`（站点的播放器本体），
     * 首页的焦点播放器在 `#vod-focus-play-wrap` 里。
     */
    match: (hostname) => matchesDomain(hostname, 'v.qq.com'),
    adapter: {
      selectors: ['video.tx-video-player-video', '.tx-video-player video', '#vod-focus-play-wrap video', 'video'],
      mainSelectors: ['video.tx-video-player-video', '.tx-video-player video', '#vod-focus-play-wrap video'],
    },
  },
  {
    /** 优酷。 */
    match: (hostname) => matchesDomain(hostname, 'youku.com'),
    adapter: {
      selectors: ['video.yk-video-player-video', '.youku-player video', 'video'],
      mainSelectors: ['video.yk-video-player-video', '.youku-player video'],
    },
  },
  {
    /** 芒果 TV。 */
    match: (hostname) => matchesDomain(hostname, 'mgtv.com'),
    adapter: {
      selectors: ['video.mg-video-player-video', '.mg-video-player video', 'video'],
      mainSelectors: ['video.mg-video-player-video', '.mg-video-player video'],
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
