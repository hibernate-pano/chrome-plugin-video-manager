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
  /**
   * 「站点在 **keyup** 上处理这些键」—— 键名（`event.key` 的值：
   * 空格是 `' '`，字母键是小写，方向键是 `'ArrowLeft'`）。
   *
   * 为什么需要它（这是「站点用 keyup 处理按键 → 快捷键彻底失灵」的根因）：
   * 扩展在 window 捕获阶段拦下 keydown（preventDefault + stopImmediatePropagation），
   * 页面就**收不到 keydown** —— 但 keyup 是**另一次事件派发**，页面照收不误。
   * 于是对「在 keyup 上处理按键」的站点，我们拦掉的不是一次按键，而是**半截按键**：
   * 它只收到 keyup，于是它的处理照样跑一遍。
   * 我们的「切播放/暂停」在 keydown 跑一次、站点的「切播放/暂停」在 keyup 再跑一次
   * = 一次按键两次切换 = **净效果为零**。
   * 用户看到的现象是：视频闪一下又回到原状，页面也不滚动 ——
   * 唯一的结论是「扩展坏了 / 空格被吃了」。
   *
   * 命中时 **keydown 与 keyup 一起放行**，让站点拿到完整的一次按键。
   *
   * ⚠️ 只列**站点在 keyup 上处理**的键：
   * 站点在 keydown 上处理的键，我们抢在前面就等于替它做了 ——
   * 站点根本收不到，不存在双重执行，不需要让路。
   * （YouTube 的方向键与全屏键就属于这一类：列进来会让扩展在 YouTube 上
   *   彻底失去快进与网页全屏这两项主力功能。）
   */
  nativeKeyHandling: string[];
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
      // YouTube 的播放/暂停有**完整**的原生实现，而它的实现挂在 **keyup** 上。
      //
      // 我们在 keydown 拦截切换一次、它的 keyup 再切换一次 = 一次空格两次切换
      // = 净效果为零（暂停停不住、或暂停后不放）——
      // stopImmediatePropagation 挡不住跨事件的第二次。
      //
      // 所以这两个键整体放行给站点原生处理（keydown 与 keyup 一起放），
      // 让站点拿到完整的一次按键。用户若把播放/暂停改绑到别的键，
      // 那个键不受这里影响（不在列表里就是我们的）。
      nativeKeyHandling: [' ', 'k'],
    },
  },
  {
    match: (hostname) => matchesDomain(hostname, 'bilibili.com'),
    adapter: {
      selectors: ['video.bpx-player-video-wrap-video', '.bilibili-player-video video', 'video'],
      mainSelectors: ['video.bpx-player-video-wrap-video', '.bilibili-player-video video'],
      // 没有可核实的「站点在 keyup 上处理哪些键」的证据 → 不列。
      // 宁可少让路（让路 = 扩展在那个键上失效），也不要瞎让。
      nativeKeyHandling: [],
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
      nativeKeyHandling: [],
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
      nativeKeyHandling: [],
    },
  },
  {
    /** 优酷。 */
    match: (hostname) => matchesDomain(hostname, 'youku.com'),
    adapter: {
      selectors: ['video.yk-video-player-video', '.youku-player video', 'video'],
      mainSelectors: ['video.yk-video-player-video', '.youku-player video'],
      nativeKeyHandling: [],
    },
  },
  {
    /** 芒果 TV。 */
    match: (hostname) => matchesDomain(hostname, 'mgtv.com'),
    adapter: {
      selectors: ['video.mg-video-player-video', '.mg-video-player video', 'video'],
      mainSelectors: ['video.mg-video-player-video', '.mg-video-player video'],
      nativeKeyHandling: [],
    },
  },
  {
    match: (hostname) => hostname === 'localhost' || hostname === '127.0.0.1',
    adapter: {
      selectors: ['video'],
      mainSelectors: [],
      nativeKeyHandling: [],
    },
  },
];

const genericAdapter: SiteAdapter = {
  selectors: ['video'],
  mainSelectors: [],
  // 通用站点：没有可核实的「站点自己处理哪些键」的证据 → 不让路。
  nativeKeyHandling: [],
};

export const getSiteAdapter = (hostname: string): SiteAdapter =>
  adapters.find((item) => item.match(hostname))?.adapter ?? genericAdapter;
