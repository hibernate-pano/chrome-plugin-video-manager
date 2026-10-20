import { getSiteAdapter } from './siteAdapters';

const VIDEO_SELECTOR = 'video';

type VideoRect = Pick<DOMRect, 'width' | 'height' | 'top' | 'left' | 'right' | 'bottom'>;
type SafeMatcher = HTMLVideoElement & { safeMatches?: (selector: string) => boolean };

/** 一个候选视频连同它的测量结果。 */
type Candidate = {
  video: HTMLVideoElement;
  rect: VideoRect;
  style: CSSStyleDeclaration | null | undefined;
};

/**
 * 快捷键对某个视频的**接管许可**。
 *
 * - 'full'：所有快捷键都可以作用在它身上。
 * - 'no-space'：除空格以外都可以；**空格必须放行给页面**。
 *
 * 为什么空格要单独设门槛：空格在页面上首先是「往下翻页」。
 * 用户在一篇长文里按空格，期望的是翻页而不是暂停页面里某个预览视频。
 * 而其它快捷键（= / - / 方向键 / f）没有这种歧义 —— 它们在页面上本来
 * 就没什么默认行为，抢过来几乎不会破坏什么。
 *
 * 判据见 resolvePermission。
 */
export type TakeoverPermission = 'full' | 'no-space';

/** 「用户此刻正在看的视频」+ 它能吃下哪些键。 */
export interface WatchedTarget {
  video: HTMLVideoElement;
  permission: TakeoverPermission;
}

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

/**
 * 这个视频是不是「还挂在文档里」。
 *
 * ⚠️ **不能用 `ownerDocument.contains(video)`** ——
 * `Document.contains()` **不穿透 shadow tree**，于是所有 shadow DOM 里的
 * `<video>` 一律被判成「已从文档移除」。
 *
 * 实测（真实 Chromium）：960×540、带 controls 的 shadow-DOM 播放器 →
 * 按 `=` / `ArrowRight` / `f` 三个键全部无效。
 * 根因量测：
 *   document.contains(shadowVideo) = false
 *   host.contains(shadowVideo)     = false
 *   shadowRoot.contains(shadowVideo)= true
 *   video.isConnected               = true   ← 正确判据
 *
 * `Node.isConnected` 走的是「连着文档树」这条真实链路，shadow tree 在内 ✓。
 *
 * 跨 document 的判断保留：ownerDocument.defaultView 为 null 说明这个文档
 * 没有浏览上下文（document.implementation.createHTMLDocument 造出来的、
 * 或者已经被丢弃的 iframe 文档），那种视频我们接管不了。
 */
const isConnected = (video: HTMLVideoElement) =>
  video.ownerDocument.defaultView != null && video.isConnected;

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
 * 这个文档有没有可用的布局几何。
 *
 * 判据是**根元素的 clientWidth**：真实浏览器里它恒等于视口宽度（实测 HTML、
 * SVG、XML 三种文档都是 1280），无布局引擎的环境（如单测用的 jsdom）恒为 0。
 *
 * ⚠️ 曾经用「元素的 computed display 是否为空」来判 —— 那是错的，
 * 而且错得很隐蔽：我们自己注入的 runtimeStyles 里有
 * `.vsc-page-fullscreen-video { display: block }`，于是**一进全屏**，
 * 视频元素的 computed display 就从空变成了 'block'，判定从「无布局」翻成
 * 「有布局」。接下来所有 rect 判定（此时恒为 0）开始生效，视频被判成
 * 「看不见」→ 快捷键在全屏里彻底失灵。
 * 根元素的 clientWidth 不受任何页面样式影响，判据本身是稳的。
 */
const hasReliableLayout = (doc: Document | null | undefined): boolean =>
  (doc?.documentElement?.clientWidth ?? 0) > 0;

/**
 * 视频有多少比例**看得见**（在视口内的那部分）。
 *
 * ⚠️ 判「在视口里」不能只看「有一像素重叠」。
 * 旧实现是 `rect.bottom > 0 && rect.top < height && ...` ——
 * 视频只要露出 1 像素就算「在视口里」。实测：视频顶部在视口底边内 2px
 * （98% 在视口外）时，它照样被接管 —— 而用户根本看不到它。
 *
 * 阈值取 **10%**：低于这个比例，用户实际上看不见这个视频，
 * 接管它等于抢走用户的按键。10% 也正好与 isProminent 的相对线一致，
 * 两条判据用同一个尺度，不至于互相打架。
 */
const MIN_VISIBLE_FRACTION = 0.1;

const visibleFraction = (video: HTMLVideoElement, rect: VideoRect): number => {
  // iframe 内 video 的 rect 相对 iframe 自己的视口，拿顶层窗口的尺寸去比会判错。
  const view = video.ownerDocument.defaultView;
  const height = view?.innerHeight ?? window.innerHeight;
  const width = view?.innerWidth ?? window.innerWidth;

  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, width) - Math.max(rect.left, 0),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, height) - Math.max(rect.top, 0),
  );

  const total = rect.width * rect.height;
  if (total <= 0) {
    return 0;
  }

  return (visibleWidth * visibleHeight) / total;
};

const isInViewport = (video: HTMLVideoElement, rect: VideoRect) =>
  visibleFraction(video, rect) >= MIN_VISIBLE_FRACTION;

const area = (rect: VideoRect) => rect.width * rect.height;

/**
 * 视频是不是「正在播」。
 *
 * 三个条件：没暂停、没播完、而且已经缓冲到能播（HAVE_CURRENT_DATA = 2）。
 *
 * ⚠️ readyState 那一条不能省：它是**打分**用的（见 resolveCurrentVideo /
 * resolveWatchedVideo 里给「正在播」加 600 分），不是**判定**用的。
 * 一个刚 `play()` 但还没缓冲出任何一帧的视频（readyState = 1）此刻还什么都没显示，
 * 把它算成「正在播」会让它在打分里胜过一个真正在播的视频。
 */
const isRunning = (video: HTMLVideoElement) =>
  !video.paused && !video.ended && video.readyState > 2;

/**
 * 「用户明确选过这个视频」在多久之内算数。
 *
 * 10 秒覆盖的是「点一下播放 / 暂停，然后马上按 f」这一串动作。
 * 再长就会开始误伤：用户点一下页面上那个吵人的自动播放预览（把它暂停），
 * 然后继续往下读 —— 那次点击不该让他接下来半小时的空格键都归我们管。
 */
const RECENT_CHOICE_MS = 10_000;

/**
 * 「用户明确选过它」这个状态能维持多久（**与播放状态无关**）。
 *
 * 为什么需要这条比 RECENT_CHOICE_MS 更长的窗口：
 * - 短视频信息流里的卡片视频只有 320×180 —— 过不了尺寸线、也过不了比例线。
 *   用户点开它、它开始播，10 秒窗口一过，它就彻底掉出所有规则 ——
 *   于是「按 `=` 没反应」，而视频明明还在播、用户明明在看它。
 *   实测（真实 Chromium）：点开后 11 秒按 `=`，速度纹丝不动。
 * - 课程页的小窗预览：用户点一下侧边那个 320×180 的小窗（它暂停着），
 *   11 秒后按 `=`，目标却跳回了大播放器。
 *
 * 关键在「用户**显式点过**」这个前提 —— 不能简化成「正在播就接管」，
 * 那等于把文章页里那种「站点用 JS 调 play() 播的静音预览」重新请回来。
 *
 * 60 秒覆盖的是「点开一条短视频，认认真真看完这一段」。
 * 再长就不合理了 —— 那时用户多半早就划到下一条了。
 */
const EXPLICIT_CHOICE_MS = 60_000;

/**
 * 「用户刚在页面上动过手」与随后的 play 事件之间的关联窗口。
 *
 * 自动播放也会触发 play 事件 —— 那不是用户的选择。
 * 只有「紧跟在一次真实手势之后」的 play 才是用户按下了播放键。
 */
const GESTURE_TO_PLAY_MS = 2000;

/**
 * 键盘最近一次命中的视频，在多久之内算「当前视频」。
 *
 * 为什么需要它：多视频页面（信息流、会议室、画廊）里，「正在播 +600」这一档
 * 会让目标**漂移** —— 用户刚用空格暂停了 A，A 立刻失去 600 分，
 * 还在播的 B 变成最高分，下一次按键就打到 B 身上。
 * 实测：两个 600×338 同时在播 → `=` 命中 cam1 → 空格暂停 cam1 →
 * `f` 却把 cam2 搬进了全屏；四个同时在播 → 连按 4 次空格依次暂停了四个视频。
 *
 * 30 秒覆盖的是「用户正在连续操作这个视频」这一串动作；
 * 再长就变成「粘住不放」，用户想换目标却换不掉。
 */
const KEYBOARD_TARGET_MS = 30_000;

/**
 * 快捷键路径的缓存，非 null 结果的最长有效期。
 *
 * 候选的分数里有随时间变化的成分（键盘目标的 30 秒窗口、「用户选过」的
 * 10/60 秒窗口），所以非 null 的结果不能一直留着。
 * 5 秒足够覆盖「长按加速」那种每 120ms 一次的连发（缓存全中），
 * 又不会让结果过期太久。
 *
 * ⚠️ null 结果**不设时限**：页面上没有视频是最常见的情况，
 * 而「有没有视频」是 DOM 变更代次说了算（视频出现/消失都会推进代次），
 * 所以它可以一直命中。
 */
const WATCHED_CACHE_TTL_MS = 5_000;

/**
 * 「这个视频够不够大，值得当成页面主角」的两条线。
 *
 * ⚠️ 为什么是「相对 + 绝对」两个条件，而不是单看面积占比：
 * 面积占比会随屏幕变大而变小。同一段 640×360 的内容视频，
 * 在 1280×720 的屏上占 25%，在 1920×1080 的屏上只占 11%。
 * 单看比例的话，**大屏用户反而用不了** —— 这是纯比例阈值最致命的毛病。
 *
 * 绝对尺寸补上了这一块：400×225 是「一个正经播放器」的下限，
 * 再小就是缩略图、装饰性预览，而不是内容。
 *
 * ⚠️ 绝对线为什么是 400×225 而不是 480×270：
 * 站点自己的迷你播放器（小窗）常常正好是这个尺寸 —— 400×225 在 1280×720
 * 里占 9.8%，相对线（10%）**就差一点点**过不去，绝对线（480×270）差得更远。
 * 实测：这种小窗在用户点它之前完全不被接管，点一下之后才生效。
 *
 * 两条线是**或**的关系：相对够大（窄屏上的小播放器）或绝对够大
 * （大屏上的中等播放器）都算数；两者都不够才算小。
 *
 * ⚠️ 这里曾经还有一条「竖屏短边 ≥ 400」的独立线（isProminentPortrait），
 * 专门为竖屏短视频而设。它现在是**恒被覆盖的重复规则**：竖屏视频的短边
 * 就是它的宽，而竖屏条件（高 > 宽）保证它的高也 ≥ 400 > 225 ——
 * 于是凡是它能放行的，绝对线（400×225）本来就放行。
 * 绝对线从 480×270 降到 400×225 之后它就彻底没用了，已删除。
 */
const PROMINENT_AREA_RATIO = 0.1;
const MIN_CONTENT_WIDTH = 400;
const MIN_CONTENT_HEIGHT = 225;

/**
 * 「这个视频就是页面主角」的面积线 —— 占视口 ≥ 这个比例就不再是装饰。
 *
 * 为什么需要它：站点的**主播放器**常常是「autoplay + 没有原生 controls」
 * —— 与文章页里那种装饰性预览的形状**完全一样**。
 * 只看属性就分不出来，于是 6.0.9 把 iQiyi 首页的主播放器（1203×604，
 * 占视口 78%）判成装饰，整页放弃接管 —— 实测按 = / Space / f 全部无反应，
 * 扩展等于没装。
 *
 * 60% 这条线的依据很朴素：**装饰性预览从来不会占满大半个屏幕**。
 * 背景视频、缩略图动图、卡片预览 —— 它们都要给正文留位置。
 * 而「用户正在看的那个视频」通常就是页面上的主角。
 *
 * 实测（真实 Chromium，https://www.iqiyi.com/，1440×900）：
 *   主播放器 1353×671 → 占视口 **70.1%** → 过线 → 接管 ✓
 */
const PAGE_MAIN_CONTENT_FRACTION = 0.6;

/**
 * 这个视频是不是「站点摆在那儿的装饰性自动播放视频」。
 *
 * 判据是**两个信号同时成立**：autoplay + 没有原生 controls。
 *
 * - `autoplay` 表达的是**站点的意图** —— 「这条视频会自动开始播，用户没要求过」。
 * - 没有 `controls` 说明站点没打算让用户把它当「一个可以操作的播放器」——
 *   有原生控件的是内容视频，没有的是背景视频/预览。
 *
 * 为什么要单独识别它：文章里嵌的那种「边滚动边播的小预览」正是这个形状。
 * 浏览器允许静音自动播，于是它在用户读字的时候自己播了起来 —— 扩展若按
 * 「页面上有视频」接管，用户按空格翻页就变成了暂停那个预览。
 *
 * ⚠️ 曾经还要求「静音」，那是多余的：浏览器本来就只允许静音自动播，
 * 于是「自动播放」几乎蕴含「静音」，这一条判据形同虚设（删掉它，
 * 全部用例照样通过 —— 说明它什么也没守）。反过来它还有个害处：
 * 用户允许了「自动播放声音」时，未静音的自动播放视频会被当成内容视频接管，
 * 而那种视频恰恰更可能是背景视频。
 *
 * ⚠️⚠️ **`controls` 属性会被我们自己弄掉。**
 * 进网页全屏时我们把 `video.controls = false`（用自制控制条取代原生控件），
 * 而这会**反射性地移除 `controls` 属性**。于是：
 *   进全屏前：`<video controls autoplay>` → 有 controls → 不是装饰视频 → 接管
 *   进全屏后：controls 属性没了        → 变成「装饰视频」 → **快捷键彻底失灵**
 *
 * 实测（真实浏览器）：进全屏后按 `=` 速度纹丝不动，退出全屏后又好了。
 * 修法见 isAmbientPreview —— 判定必须对「我们自己造成的属性变化」免疫。
 *
 * ⚠️ 尺寸**不**参与这个判定。一个铺满全屏的背景视频同样该被放过。
 */
const hasAutoplayAttribute = (video: HTMLVideoElement) => video.hasAttribute('autoplay');

/**
 * 这个视频够不够大，值得当成「页面主角」。
 *
 * 两条线取**或**：
 * - 相对线：占视口 ≥ 10%。窄屏（笔记本、平板竖屏）上的正经播放器都在这头。
 * - 绝对线：宽 ≥ 400 且高 ≥ 225。大屏（4K、27 寸）上，同一段 640×360 的
 *   内容视频只占 11%，纯看比例会被误杀 —— 绝对尺寸就是为它准备的。
 *
 * ⚠️ 分母用**视频自己所在文档**的视口，不是顶层视口。
 * 同源 iframe 里的视频只占顶层视口的一小块，但它是**那个画框里的主要内容**
 * —— 用户正在看的正是那个画框。按顶层算会把 iframe 里的播放器全部误杀
 * （实测 320×180 在 400×300 的 iframe 里占 48%，按顶层算只有 7.8%）。
 */
const isProminent = (rect: VideoRect, viewportArea: number): boolean => {
  const bigEnough = rect.width >= MIN_CONTENT_WIDTH && rect.height >= MIN_CONTENT_HEIGHT;
  if (bigEnough) {
    return true;
  }

  if (viewportArea <= 0) {
    return false;
  }

  return area(rect) / viewportArea >= PROMINENT_AREA_RATIO;
};

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

/**
 * 找出站点自己点名的「主播放器」。
 *
 * 与 selectPreferredVideos 的关键区别是**唯一性**：
 * preferred 的最后一档是 'video'（通用兜底），匹配页面上每一个视频；
 * 而主播放器必须由站点用一个**具体**选择器指认。
 *
 * 为什么这条这么重要：YouTube 的主播放器是**静音自动播放**的
 * （浏览器只允许静音自动播）。若把「静音」当作排除依据，
 * 用户在 YouTube 上按 f 就会没反应 —— 而那正是这个扩展最该工作的场景。
 * 站点能指名谁是主播放器，于是那条禁令就不适用于它。
 *
 * 降级链与 preferred 一致：命中第一个有候选的选择器就停。
 */
const selectMainPlayerVideos = (videos: HTMLVideoElement[], selectors: string[]) => {
  const main = new Set<HTMLVideoElement>();
  for (const selector of selectors) {
    for (const video of videos) {
      if (matchesSelector(video, selector)) {
        main.add(video);
      }
    }
    if (main.size > 0) {
      return main;
    }
  }

  return main;
};

export interface VideoRegistryOptions {
  /**
   * 这个事件是不是「用户真的交互了」。
   *
   * 默认读 `event.isTrusted`。注入它只是为了**测试**：
   * jsdom 造出来的事件 isTrusted 恒为 false，而且 `isTrusted` 在 jsdom 里是
   * 实例上的 non-configurable 属性（实测 `Object.defineProperty` 抛 TypeError），
   * 连原型上的 getter 都没有 —— 所以单测**无法**造出可信事件。
   *
   * 不给这条缝的话，「用户点过视频 → 该视频被接管」这条链路在单测里
   * 根本跑不起来（合成事件会被正确地当成伪造事件拒掉）。
   */
  isTrustedEvent?: (event: Event) => boolean;
}

export class VideoRegistry {
  private readonly isTrustedEvent: (event: Event) => boolean;
  private fullscreenVideo: HTMLVideoElement | null = null;
  /**
   * 最近一次**用户真的用指针/焦点碰过**的视频。
   *
   * ⚠️ 它只记录用户的行为，**不**记录站点的行为：自动播放的 play 事件
   * 不算「用户碰过」。曾经算过，于是站点一播预览视频就把这个字段抢走 ——
   * 而它的 +10000 分权重让那个预览视频在工具栏图标路径里胜出
   * （实测：1600×900 暂停的主播放器 + 320×180 正在播的预览，
   * 按 `=` 改的是主视频，点图标进全屏进的却是那个小预览）。
   *
   * ⚠️ 它也**不能**用来豁免可见性过滤：它永不过期，
   * 用户一小时前点过的视频后来被站点 `display:none` 藏起来，
   * 工具栏图标仍会接管它 —— overlay 起来了，里面却是空的。
   * 豁免可见性用的是 lastChoiceVideo（有 10 秒窗口，见 wasRecentlyChosen）。
   *
   * ⚠️ **键盘命中不写这个字段**：键盘写的是 keyboardTargetVideo。
   * 两者语义不同 —— 这个字段回答「用户用鼠标碰过谁」，
   * 那个字段回答「快捷键此刻在操作谁」。混在一起会让一次键盘操作
   * 盖掉用户的指针选择。
   */
  private lastInteractedVideo: HTMLVideoElement | null = null;
  /**
   * 用户最近一次**主动**选这个视频的时间戳。
   *
   * 为什么不能只有 lastInteractedVideo：那个字段会被自动播放的 play 事件改写
   * （站点自己播的预览视频也会触发 play），而"用户选过"必须来自用户的手势。
   * 有了时间戳，10 秒之外的选择就自动失效 —— 用户点了页面上的预览视频然后
   * 继续往下读，那次点击不该让他接下来半小时的空格键都归我们管。
   */
  private lastChoiceAt = 0;
  /**
   * 「用户选过」这个新鲜度**属于哪个视频**。
   *
   * ⚠️ 必须与 lastChoiceAt 绑定，不能只靠时间戳。
   * 只记时间的话字段会漂移：用户点了视频 A，10 秒窗口内站点让预览视频 B
   * 自动播 → lastInteractedVideo 变成 B，而 lastChoiceAt 还是 A 的 ——
   * B 白白继承了 A 的「新鲜度」，被判成「用户亲手选过」。
   */
  private lastChoiceVideo: HTMLVideoElement | null = null;
  /**
   * 最近一次**真实手势**的时间戳。
   *
   * 用来把随后的 play 事件判成「用户按了播放」而不是「站点自动播放」。
   */
  private lastGestureAt = 0;
  /**
   * 最近一次真实手势**指向**的视频。
   *
   * 「用户刚动过手」不等于「用户选了这个视频」—— 页面上可能有几十个视频。
   * 这个字段记的是手势发生时用户最可能在看的那一条，
   * 用来把随后的 play 事件判成「用户按了播放」。
   */
  private lastGestureVideo: HTMLVideoElement | null = null;
  /**
   * 键盘最近一次命中的视频 —— 快捷键路径的「当前视频」。
   *
   * ⚠️ 为什么不能复用 lastInteractedVideo：那个字段的语义是
   * 「用户用指针/焦点碰过的最后一个视频」，键盘写进去会盖掉指针的信号。
   * 而且它永不过期 —— 用它记键盘目标的话，用户一年前点过的视频会
   * 永久霸占「当前视频」的位置。
   */
  private keyboardTargetVideo: HTMLVideoElement | null = null;
  private keyboardTargetAt = 0;
  /**
   * 用户**曾经**交互过的视频（**不随时间过期**）。
   *
   * 这是「装饰性预览」判定的核心否定证据：只要用户碰过它一次，
   * 它就不是「站点自己摆在那儿的装饰」了 —— 哪怕那次点击只是
   * 想把它按停。
   *
   * 为什么用 WeakSet 而不是「最近一次」：那个字段只记得住最后一个视频，
   * 用户先碰 A 再碰 B，A 的证据就没了，A 又变回「装饰」。
   */
  private readonly userTouchedVideos = new WeakSet<HTMLVideoElement>();
  /**
   * **站点自己**开播的视频（用户没有要求过它）。
   *
   * 两种来源：
   * - DOM 上有 `autoplay` 属性；
   * - 站点调了 `video.play()`，而那之前没有任何指向它的用户手势。
   *
   * ⚠️ 为什么必须区分「站点开的」与「用户开的」：
   * 同一个「无 controls + 暂停着」的视频形状，在两种来源下含义完全不同 ——
   *   - 站点开的（文章页里的滚动预览）→ 装饰，别抢用户的空格键；
   *   - 没人开过它（网课页面里还暂停着的播放器）→ 用户正要「先调速再播放」。
   * 只看属性（autoplay / controls）分不出这两者。
   */
  private readonly siteStartedVideos = new WeakSet<HTMLVideoElement>();
  /** 同一帧内的查询结果；未置脏且帧号未前进时直接复用，不再遍历全页。 */
  private snapshot: { frame: number; result: HTMLVideoElement | null } | null = null;
  private dirty = true;
  /**
   * DOM 变更代次。
   *
   * 任何可能改变候选集合或判定结果的变化都会让它前进；
   * 快捷键路径的缓存按它失效（见 getWatchedTarget）。
   */
  private generation = 0;
  /** 快捷键路径的缓存（按 generation 失效）。 */
  private watchedCache: { generation: number; target: WatchedTarget | null; at: number } | null = null;
  /** 只置脏标记，绝不在回调里重建视频列表。 */
  private readonly observer = new MutationObserver(() => {
    this.invalidate();
  });
  private readonly boundHandleInteraction = (event: Event) => this.handleInteraction(event);
  private readonly boundHandleFocus = (event: Event) => this.handleFocus(event);
  private readonly boundHandleGesture = (event: Event) => this.handleGesture(event);

  constructor(options: VideoRegistryOptions = {}) {
    this.isTrustedEvent = options.isTrustedEvent ?? ((event) => event.isTrusted);
  }

  start() {
    document.addEventListener('pointerdown', this.boundHandleInteraction, true);
    // ⚠️ focusin **不能**算「用户选过它」。
    //
    // 实测（真实 Chrome）：页面脚本调 `video.focus()` 会让浏览器派发一个
    // `focusin`，而它的 **isTrusted 是 true** —— 因为这个事件是**浏览器自己**
    // 生成的，不是页面 dispatch 的。所以 isTrusted 这道防线挡不住它。
    //
    // 后果实测：文章页里那个小小的预览视频，页面加载后 focus 一下自己，
    // 就被当成了「用户亲手选过的」→ 快捷键照旧被接管 —— 本轮要修的问题原样回来。
    document.addEventListener('focusin', this.boundHandleFocus, true);
    document.addEventListener('play', this.boundHandleInteraction, true);
    // 真实手势单独记一条：它才代表"用户碰了这个页面"。
    document.addEventListener('pointerdown', this.boundHandleGesture, true);
    document.addEventListener('keydown', this.boundHandleGesture, true);
    // observe 要求真实节点：极端情况下 body 还没建好就退到 documentElement。
    //
    // ⚠️ 为什么还要观察属性：判定依赖 `controls` / `autoplay` 两个属性，
    // 也依赖 class/style（可见性）。只观察 childList 的话，站点后来给视频
    // 加上 controls，我们仍然按「装饰视频」看待它。
    // attributeFilter 把回调限制在这几个属性上，避免 class 频繁变化时
    // 缓存被冲掉。
    this.observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['controls', 'autoplay', 'class', 'style'],
    });
    this.dirty = true;
    this.generation += 1;
    this.catchUpSiteStartedVideos();
  }

  /**
   * 补记「站点自己开的」那些视频。
   *
   * ⚠️ 为什么需要这一步：扩展注入在 document_start，但 registry.start()
   * 要等设置加载完才跑 —— 中间这几十毫秒里，页面脚本已经可能调了
   * `video.play()`。那次 play 事件我们**没监听到**（监听器还没挂上），
   * 于是「站点自己开的」这条证据就丢了。
   *
   * 后果实测（真实 Chromium）：文章页里那个用 JS 启动的预览视频被当成
   * 内容视频接管 —— 按空格翻页被抢走，按 `=` 改了它的倍速，按 `f` 把它
   * 拉进全屏；YouTube 搜索页的 hover 预览小窗同样被接管并被拉进全屏。
   *
   * 补记的判据是「此刻正在播」：扩展刚启动时用户还没来得及动手，
   * 所以此刻在播的视频一定是站点自己开的。
   * 之后的播放由 play 事件监听器负责（见 handleInteraction）。
   */
  private catchUpSiteStartedVideos() {
    for (const video of this.getAllVideos()) {
      if (isConnected(video) && !video.paused) {
        this.siteStartedVideos.add(video);
      }
    }
  }

  stop() {
    document.removeEventListener('pointerdown', this.boundHandleInteraction, true);
    document.removeEventListener('focusin', this.boundHandleFocus, true);
    document.removeEventListener('play', this.boundHandleInteraction, true);
    document.removeEventListener('pointerdown', this.boundHandleGesture, true);
    document.removeEventListener('keydown', this.boundHandleGesture, true);
    this.observer.disconnect();
    this.fullscreenVideo = null;
    this.lastInteractedVideo = null;
    this.lastChoiceVideo = null;
    this.keyboardTargetVideo = null;
    this.snapshot = null;
    this.watchedCache = null;
    this.dirty = true;
    this.generation += 1;
  }

  setFullscreenVideo(video: HTMLVideoElement | null) {
    this.fullscreenVideo = video;
    if (video) {
      this.lastInteractedVideo = video;
    }
    // lastInteractedVideo 变了，缓存里的"当前视频"可能已过期。
    this.invalidate();
  }

  /**
   * 作废一切缓存。
   *
   * generation 前进 = 快捷键路径的缓存失效；dirty = 工具栏路径的帧快照失效。
   */
  private invalidate() {
    this.dirty = true;
    this.generation += 1;
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

  /**
   * 用户是不是「刚刚亲手选过」这个视频。
   *
   * ⚠️ 「选过」与「最近交互过」是**两件事**，不能互相顶替：
   * - lastInteractedVideo：最后碰到过的那个视频（点一下就变；**永不过期**，
   *   而且会被自动播放的 play 事件改写 —— 它只是「最近碰过什么」的线索）
   * - lastChoiceVideo + lastChoiceAt：用户**主动选过**的那个，和它的时间
   *
   * 只有后者带证据（用户的手势）与时效（10 秒窗口）。
   * 豁免可见性过滤时必须用后者 —— 用前者会让「一小时前点过、后来被站点
   * 藏起来的视频」永远享受豁免（实测：工具栏图标接管了一个 display:none 的
   * 视频，overlay 起来里面是空的）。
   */
  private wasRecentlyChosen(video: HTMLVideoElement): boolean {
    return video === this.lastChoiceVideo
      && Date.now() - this.lastChoiceAt < RECENT_CHOICE_MS;
  }

  /**
   * 用户**显式选过**它，而且那次选择还不算久远（60 秒内）。
   *
   * 与 wasRecentlyChosen 的差别只有**时间窗**，以及**不看播放状态**：
   * 用户点过一个小窗、它暂停着，11 秒后按 `=` 仍应该命中它 ——
   * 「被选过的新鲜度」独立于「它此刻在不在播」。
   *
   * ⚠️ 必须与「正在播」那条老规则区分开：后者是 60 秒 **且还在播**。
   * 这一条是 60 秒、**暂停也算** —— 课程页的小窗被用户点开后是暂停的，
   * 那条老规则永远轮不到它。
   */
  private wasExplicitlyChosen(video: HTMLVideoElement): boolean {
    return video === this.lastChoiceVideo
      && Date.now() - this.lastChoiceAt < EXPLICIT_CHOICE_MS;
  }

  /**
   * 用户是不是「碰过」这个视频 —— **不看时间**。
   *
   * 用于「装饰性预览」的判定：只要用户碰过一次，它就不再是
   * 「站点自己摆在那儿的装饰」了。
   */
  private wasEverTouched(video: HTMLVideoElement): boolean {
    return this.userTouchedVideos.has(video);
  }

  /**
   * 站点是不是**自己**把这个视频播起来的（用户没要求过）。
   *
   * 两种证据：
   * - DOM 上有 `autoplay` 属性；
   * - 站点调了 `video.play()`，而那之前没有任何指向它的用户手势。
   */
  private wasStartedBySite(video: HTMLVideoElement): boolean {
    return hasAutoplayAttribute(video) || this.siteStartedVideos.has(video);
  }

  /**
   * 这个视频是不是「站点摆在那儿的装饰性预览」。
   *
   * 判据全部是**证据**，不是属性：
   *
   * 1. 站点**没有**点名它是主播放器 —— 站点能点名就不该由我们猜。
   * 2. 不是**我们**接管着的（进全屏时我们会把 controls 弄掉）。
   * 3. 用户**从未**碰过它 —— 碰过就是用户自己的选择。
   * 4. 它**没有原生 controls** —— 站点没打算让人把它当播放器操作。
   * 5. 它是**站点自己**播起来的（autoplay 属性，或站点调 play()）。
   * 6. 它**没有占满大半个视口** —— 装饰性预览从来不会霸占整个屏幕。
   *
   * 六条全中 → 它就是装饰，不接管。
   *
   * ⚠️ 第 5 条为什么不能省：它把「装饰性预览」与
   * 「没人开过、正等着用户先调速再播放的视频」区分开。
   * 两者在 DOM 上可能一模一样（没有 controls、暂停着），
   * 区别只在**谁开的**。少了这一条，「先调速再播放」这条最常见的用法
   * 会在任何用自制播放器的网站上直接失效。
   *
   * ⚠️ 第 6 条为什么不能省：站点的**主播放器**常常也是「autoplay + 无 controls」
   * —— 与装饰性预览形状完全一样。只看属性就分不出来，于是 6.0.9 把
   * iQiyi 首页的主播放器判成装饰，整页放弃接管（实测：按 = / Space / f
   * 全部无反应，扩展等于没装）。
   */
  private isAmbientPreview(
    video: HTMLVideoElement,
    rect: VideoRect,
    wasMainPlayer: boolean,
    isTakenOverByUs: boolean,
  ): boolean {
    // 1. 站点点名它是主播放器 → 那是站点的声明，比我们的推断硬。
    if (wasMainPlayer) {
      return false;
    }

    // 2. 我们接管着的 → 判定必须对「我们自己造成的变化」免疫。
    //
    // 进全屏时我们把 `video.controls = false`（用自制控制条取代原生控件），
    // 而这会**反射性地移除 `controls` 属性`。于是：
    //   进全屏前：`<video controls autoplay>` → 有 controls → 不是装饰视频 → 接管
    //   进全屏后：controls 属性没了        → 变成「装饰视频」 → **快捷键彻底失灵**
    //
    // 实测（真实浏览器）：进全屏后按 `=` 速度纹丝不动，退出全屏后又好了。
    // 症状极像「全屏里快捷键坏了」，但根因在接管范围的判定上。
    //
    // 修法：**由 VideoRegistry 自己知道**哪些视频是我们接管的（setFullscreenVideo
    // 已经在记），而不是去猜 DOM 位置。
    // 曾经用 `video.closest('#vsc-page-fullscreen-stage')` 判断 —— 那把
    // fullscreenController 的内部 id 约定抄了一份到另一个模块，两处各写各的
    // 字面量，改一处忘另一处就会漂；而且 css-cover 回退模式下视频**不在** stage 里，
    // 那条路径上这个豁免根本不生效。
    if (isTakenOverByUs) {
      return false;
    }

    // 3. 用户碰过它 → 那是用户自己的选择，任何推断都推翻不了。
    if (this.wasEverTouched(video)) {
      return false;
    }

    // 4. 有原生控件 = 站点把它当成一个正经播放器给人用。
    if (video.hasAttribute('controls')) {
      return false;
    }

    // 5. 站点自己播起来的（用户没要求过它，它自己播起来了）。
    if (!this.wasStartedBySite(video)) {
      return false;
    }

    // 6. 占满大半个视口 → 它是页面主角，不是装饰。
    if (this.isPageMainContent(video, rect)) {
      return false;
    }

    // 7. 键盘刚命中过它 → 用户正在操作它，不是装饰。
    //
    // 为什么需要：没有原生 controls 的自定义播放器（不少站点都是自己画的
    // 控制条），一旦站点自己调 play() 把它播起来，第 5 条就成立 ——
    // 它会被判成「装饰性预览」而丢掉。但用户明明正在用快捷键调它。
    //
    // ⚠️ 这条证据**不能**靠 userTouchedVideos 顺带提供：
    // 那个集合的语义是「**用户的手**碰过它」，而「键盘命中了它」是我们
    // **自己打分打出来的结果** —— 视频被选中的前提就是它不是装饰，
    // 拿它当「不是装饰」的证据是用结论证明结论。
    // 所以这里单独记一份证据（keyboardTargetVideo）。
    if (this.wasTargetedByKeyboard(video)) {
      return false;
    }

    return true;
  }

  /**
   * 键盘是不是刚刚命中过这个视频（当前目标）。
   *
   * 与 isRecentKeyboardTarget 的差别：那条带 30 秒时限（用于**打分**），
   * 这条不带（用于「它不是装饰」这个**判定**）——
   * 打分过期了不该让用户正在操作的视频突然失去快捷键。
   */
  private wasTargetedByKeyboard(video: HTMLVideoElement): boolean {
    return this.keyboardTargetVideo === video;
  }

  /**
   * 这个视频是不是「页面主角」（占视口 ≥ 60%）。
   *
   * 无布局引擎时判不了（rect 恒为 0）→ 返回 false，即「不豁免」。
   * 那种环境（单测的 jsdom）里这个豁免本来也测不出来。
   */
  private isPageMainContent(video: HTMLVideoElement, rect: VideoRect): boolean {
    if (!hasReliableLayout(video.ownerDocument)) {
      return false;
    }

    const view = video.ownerDocument.defaultView ?? window;
    const viewportArea = (view.innerWidth || 0) * (view.innerHeight || 0);
    if (viewportArea <= 0) {
      return false;
    }

    return area(rect) / viewportArea >= PAGE_MAIN_CONTENT_FRACTION;
  }

  /**
   * 这个视频是不是「用户已经滚过去了」。
   *
   * 用户选过某个视频之后滚走了它（信息流：点第 1 条 → 滚到第 2 条），
   * 那条视频还在后台播放，但它**已经不是用户此刻在看的东西**了。
   * 继续把它当目标，快捷键就会打在已经滚走的视频上。
   *
   * 例外：**被站点用 CSS 藏起来**的不算「滚走」——
   * 那是站点把它藏了，不是用户不管它了（用户刚点过它，站点随后藏起来，
   * 仍然尊重用户的选择，见 isUsableCandidate）。
   */
  private isScrolledOutOfView(
    video: HTMLVideoElement,
    rect: VideoRect,
    style: CSSStyleDeclaration | null | undefined,
  ): boolean {
    if (!hasReliableLayout(video.ownerDocument)) {
      return false;
    }

    if (isCssHidden(style)) {
      return false;
    }

    return !isInViewport(video, rect);
  }

  /**
   * 这个视频是不是「用户正在看的那个」。
   *
   * 判定按**证据强度**分层，从强到弱：
   *
   * 1. **用户亲手选过它**（60 秒内，暂停也算）→ 一定是。
   *    用户点了一个暂停的、小尺寸的视频然后按 f —— 那条视频此刻不播、也不大，
   *    但它显然是用户的目标。没有任何推断能推翻用户自己的手势。
   *    ⚠️ 但用户**滚走了**它就另说（见 isScrolledOutOfView）。
   *
   * 2. **站点自己点名的「主播放器」，而且它还在视口里** → 是。
   *    YouTube 的主播放器会静音自动播放（浏览器只允许静音自动播），
   *    所以「静音自动播」本身不能当排除依据 —— 只有站点能指名谁是主播放器。
   *    ⚠️ 「还在视口里」这一条不能省：主播放器完全滚出视口之后，
   *    用户看的是页面下方的内容，此时按 `=` 改的应该是不在屏幕上的
   *    那个视频（实测：YouTube watch 页滚到 4000px，按 `=` 改的是
   *    看不见的主播放器）。
   *
   * 3. **它不是站点的装饰性预览** → 否则排除。
   *    这一条专治「文章里嵌的静音预览」：那种视频站点自己播、没有原生控件，
   *    用户在读字而它在播。接管它 = 用户按空格翻页结果视频跳了。
   *
   * 4. 其余视频要同时满足：**可见 + 在视口里 + 够大**（见 isProminent）。
   *
   * 为什么第 4 档**不**要求「正在播」：用户常常是「先调速再播放」——
   * 打开一个网课页面，视频还暂停着，他想先设成 1.5x 再按播放。
   * 若要求在播，这条最常见的用法直接失效，用户只会得出「扩展坏了」。
   * 既然「在播」不能当必要条件，就不能靠它在**排除**方向上做文章：
   * 一个暂停着的大视频，恰恰比一个正在播的小预览更像「用户要看的那个」。
   *
   * 第 3 档为什么还要「装饰性预览」这条排除？因为它认的是**证据**
   * （站点自己开的 + 没有原生控件 + 用户没碰过 + 不是页面主角），
   * 与播放状态无关，也不受大小影响。
   *
   * ⚠️ 尺寸只当**排除线**，不当认定依据。这两者的区别很关键：
   * 尺寸门槛当依据时，同源 iframe 里的视频（只占顶层视口 6%）、
   * 以及「视频旁边开着文档」这种正经用法，都会被误杀。
   */
  private isWatchedVideo(
    video: HTMLVideoElement,
    rect: VideoRect,
    style: CSSStyleDeclaration | null | undefined,
    isSiteMainPlayer: boolean,
  ): boolean {
    // 判定顺序不是随意的：**不依赖布局的判据必须排在依赖布局的判据前面**。
    //
    // 依赖布局的判据（rect 的宽高、是否在视口内、占多大）在没有布局引擎的
    // 环境里全部读成 0，会把候选**误杀**。而用户选过、站点主播放器、
    // 装饰性预览这三条都不依赖布局，任何环境都判得准。
    //
    // 曾经把布局判据放在最前面，于是 jsdom 里 getBoundingClientRect 恒为 0
    // → isVisible 恒假 → 整条规则恒假，快捷键在单测里全部失灵 ——
    // 那个"没有布局就放行"的兜底写在后面，根本轮不到它执行。

    // 1. 用户选过它（60 秒内，暂停也算）—— 没有任何推断能推翻用户自己的手势。
    //    ⚠️ 用户滚走了它就另说：信息流里点第 1 条 → 滚到第 2 条，
    //    第 1 条还在后台播放却已经不是用户此刻在看的东西了。
    if (this.wasExplicitlyChosen(video)
      && !this.isScrolledOutOfView(video, rect, style)) {
      return true;
    }

    // 2. 站点自己点名的主播放器：用户就在这个站点上看视频，不必再猜。
    //    ⚠️ 必须排在「装饰性预览」之前 —— YouTube 的主播放器
    //    恰恰就是静音自动播的（浏览器只允许静音自动播）。
    //    ⚠️ 「还在视口里」这一条不能省 —— 主播放器滚出视口之后，
    //    页面上的内容才是用户此刻在看的东西。
    if (isSiteMainPlayer
      && (!hasReliableLayout(video.ownerDocument)
        || isInViewport(video, rect)
        || this.wasRecentlyChosen(video))) {
      return true;
    }

    // 3. 站点的装饰性预览：用户没要求过它，它自己播起来了。
    if (this.isAmbientPreview(video, rect, isSiteMainPlayer, video === this.fullscreenVideo)) {
      return false;
    }

    // 4. 无布局引擎时到此为止：尺寸与视口都无从判断，不能因此把候选全判成
    //    "没在看"—— 那会让所有单测里的视频都失去被接管资格。
    //
    //    ⚠️ CSS 隐藏的判定**不在这里**：display/visibility 已经被上面的
    //    候选过滤（resolveWatchedVideo 里的 isCssHidden）与下面的 isVisible
    //    各挡过一次。曾经在这里还写了一份，删掉后 338 条用例全绿 ——
    //    那说明它是个**恒不可达的重复分支**，留着只会让人误以为
    //    「隐藏判定有三条独立防线」。
    if (!hasReliableLayout(video.ownerDocument)) {
      return true;
    }

    // 5. 依赖布局的判据：真的看不见、真的滚出视口。
    if (!isVisible(style, rect) || !isInViewport(video, rect)) {
      return false;
    }

    // 6. 够不够大 —— 最后一道排除线。
    const view = video.ownerDocument.defaultView ?? window;
    const viewportArea = (view.innerWidth || 0) * (view.innerHeight || 0);
    if (viewportArea <= 0) {
      return true;
    }

    return isProminent(rect, viewportArea);
  }

  /**
   * 候选视频的一次性测量结果。
   *
   * 一个 video 只读一次 rect、一次 computed style，可见性/视口/面积判定复用；
   * getComputedStyle 读不到样式就判不了 display/visibility，不能从 rect 推。
   */
  private measure(video: HTMLVideoElement) {
    const rect = video.getBoundingClientRect();
    const style = video.ownerDocument.defaultView?.getComputedStyle(video);
    return { video, rect, style };
  }

  /**
   * 给候选打分。**两条路径共用同一份权重。**
   *
   * ⚠️ 曾经这里有两份逐行相同的打分代码（resolveCurrentVideo 与
   * resolveWatchedVideo 各写一遍），只差一个 filter。两份已经开始漂移：
   * resolveCurrentVideo 完全没有「装饰性自动播放视频」的概念，于是同一个页面上
   * —— 快捷键作用在主视频、工具栏图标作用在预览小视频。
   * 实测（真实 Chromium）：1600×900 暂停的主播放器 + 320×180 正在播的预览，
   * 按 `=` 改的是主视频（1.1x），点工具栏图标进全屏进的却是那个小预览。
   *
   * 用户能看到的现象是「图标和快捷键表现不一致」—— 这比「两者都错」更让人困惑。
   * 根因不是权重算错了，是**两套契约各自长出了自己的打分逻辑**。
   *
   * 所以：契约的差别只在「没有明确目标时怎么办」，**不在「怎么给候选打分」**。
   */
  private scoreCandidate(
    video: HTMLVideoElement,
    rect: VideoRect,
    style: CSSStyleDeclaration | null | undefined,
    preferred: Set<HTMLVideoElement>,
  ): number {
    let score = 0;

    // 1600 = 1 + 可见300 + 在视口200 + 面积上限1000：
    // 非播放中的候选里 preferred 必赢，而正在播放的视频仍能凭 +600 压过暂停的 preferred。
    if (preferred.has(video)) {
      score += 1600;
    }
    if (video === this.lastInteractedVideo) {
      score += 10000;
    }
    // 键盘刚刚命中的视频：让它在接下来的操作里继续当目标。
    //
    // ⚠️ 这一档**只给键盘路径用**（见 rememberKeyboardTarget），但打分是
    // 两条路径共用的 —— 所以工具栏图标与快捷键仍然指向同一个视频。
    // 「图标和快捷键表现不一致」是 6.0.9 修掉过的缺陷，不能再引回来。
    if (this.isRecentKeyboardTarget(video)) {
      score += 8000;
    }
    if (isRunning(video)) {
      score += 600;
    }

    if (isVisible(style, rect)) {
      score += 300;
    }
    if (isInViewport(video, rect)) {
      score += 200;
    }

    score += Math.min(area(rect), 1_000_000) / 1000;
    return score;
  }

  /** 键盘最近命中的那个视频，是不是还在「新鲜期」内。 */
  private isRecentKeyboardTarget(video: HTMLVideoElement): boolean {
    return video === this.keyboardTargetVideo
      && Date.now() - this.keyboardTargetAt < KEYBOARD_TARGET_MS;
  }

  /**
   * 找出「用户正在看的那个视频」+ 它能吃下哪些键。
   *
   * 找不到时返回 null —— 宁可不接管，也不要接管错对象。
   * 这条是 6.0.9 最重要的一条行为变更：此前只要页面上存在任何 <video>，
   * 快捷键就在**整页**生效，用户在读长文时按空格翻页结果视频跳了。
   */
  private resolveWatchedTarget(candidates?: Candidate[]): WatchedTarget | null {
    const list = candidates ?? this.collectCandidates();
    const adapter = getSiteAdapter(window.location.hostname);
    const preferred = selectPreferredVideos(
      list.map((item) => item.video),
      adapter.selectors,
    );
    // 站点自己点名的「主播放器」——与 preferred 不同，它要求唯一。
    const mainPlayers = selectMainPlayerVideos(
      list.map((item) => item.video),
      adapter.mainSelectors,
    );

    const scored = list
      .filter(({ video, rect, style }) =>
        this.isWatchedVideo(video, rect, style, mainPlayers.has(video)))
      .map(({ video, rect, style }) => ({
        video,
        score: this.scoreCandidate(video, rect, style, preferred),
      }))
      .sort((left, right) => right.score - left.score);

    const video = scored[0]?.video ?? null;
    if (!video) {
      return null;
    }

    return {
      video,
      permission: this.resolvePermission(video, mainPlayers.has(video)),
    };
  }

  /**
   * 这个视频能不能吃下**空格**。
   *
   * 空格在页面上首先是「往下翻页」。用户在一篇长文里按空格，
   * 期望的是翻页而不是暂停页面里某个预览视频。
   *
   * 只有下面这些情况才允许拦截空格：
   * - 它是**站点点名的主播放器** —— 站点自己说「这就是播放器」。
   * - 用户**刚刚亲手选过**它（10 秒内）—— 用户正在跟它互动。
   * - 它**有原生 controls** —— 站点把它当播放器给人用。
   * - 它**正在播** —— 用户此刻在跟一段正在进行的画面互动。
   *
   * 其余情况（暂停着、没有原生控件、不是主播放器、用户没碰过）
   * → 'no-space'：空格放行给页面。
   */
  private resolvePermission(
    video: HTMLVideoElement,
    isSiteMainPlayer: boolean,
  ): TakeoverPermission {
    if (isSiteMainPlayer) {
      return 'full';
    }

    if (this.wasRecentlyChosen(video)) {
      return 'full';
    }

    if (video.hasAttribute('controls')) {
      return 'full';
    }

    if (isRunning(video)) {
      return 'full';
    }

    return 'no-space';
  }

  /**
   * 找出「页面上最可能是目标的视频」——工具栏图标这类**显式**操作用。
   *
   * ⚠️ 契约与 resolveWatchedTarget **不同**：显式操作必须**有**目标，
   * 没有就返回 null（运行时据此提示「这个页面里没有视频」）。
   * 但**候选集合与打分必须与快捷键路径一致** —— 否则同一个页面上
   * 「按 = 改的是 A、点图标进的是 B」，用户看到的只是「这个扩展行为不一致」。
   *
   * 所以这里复用 resolveWatchedTarget 的候选集合与打分，
   * 只在它**一个候选都找不到**时才回退到「最大可见候选」。
   *
   * 为什么要有这个回退：显式操作是用户主动指出来的意图，
   * 他点了图标就是想对**某个**视频动手。此时「宁可不接管」的取舍要反过来 ——
   * 但回退也**必须**排除完全不可见的候选（否则接管的是一个黑屏里的视频）。
   */
  private resolveCurrentVideo(): HTMLVideoElement | null {
    // 只扫一次页面：两条路径共用同一批测量结果。
    // 每次按键都扫两遍全页是浪费（getComputedStyle 会强制样式重算）。
    const candidates = this.collectCandidates();

    const watched = this.resolveWatchedTarget(candidates);
    if (watched) {
      return watched.video;
    }

    // 回退：快捷键路径一个候选都没有 —— 显式操作仍然要给用户一个结果，
    // 否则点工具栏图标毫无反应（那是扩展唯一看得见的入口）。
    const preferred = selectPreferredVideos(
      candidates.map((item) => item.video),
      getSiteAdapter(window.location.hostname).selectors,
    );

    const scored = candidates
      .map(({ video, rect, style }) => ({
        video,
        score: this.scoreCandidate(video, rect, style, preferred),
      }))
      .sort((left, right) => right.score - left.score);

    return scored[0]?.video ?? null;
  }

  /**
   * 收集候选：扫一遍页面，量好每个视频的尺寸与样式，过滤掉不能当受控对象的。
   */
  private collectCandidates(): Candidate[] {
    return this.getAllVideos()
      .filter(isConnected)
      .map((video) => this.measure(video))
      .filter(({ video, rect, style }) => this.isUsableCandidate(video, rect, style));
  }

  /**
   * 这个候选能不能当受控对象。
   *
   * 完全不可见的候选不是有效受控对象：单候选时它会以最高分胜出，
   * 速度被改在看不见的视频上、toast 还会因为 rect 全 0 而钳到屏幕角落。
   *
   * 唯一豁免的是「用户**亲手选过**」的那条 —— 那有用户的手势做证据，
   * 即使站点随后把它藏起来，也仍是用户自己的选择。
   *
   * ⚠️ 这里豁免的必须是 lastChoiceVideo（带 10 秒窗口），**不能**是
   * lastInteractedVideo —— 后者永不过期，且会被自动播放改写。
   * 曾经豁免的是 lastInteractedVideo，实测：用户一小时前点过的视频，
   * 后来被站点 `display:none` 藏起来，工具栏图标仍然接管它 ——
   * overlay 起来了，里面却是空的（视频甚至没被搬进 stage）。
   */
  private isUsableCandidate(
    video: HTMLVideoElement,
    rect: VideoRect,
    style: CSSStyleDeclaration | null | undefined,
  ): boolean {
    if (this.wasRecentlyChosen(video)) {
      return true;
    }

    if (isCssHidden(style)) {
      return false;
    }

    // rect 为 0 只作参考：无布局引擎时所有 rect 恒为 0，此时不能据此过滤。
    return !hasReliableLayout(video.ownerDocument) || (rect.width > 0 && rect.height > 0);
  }

  /**
   * 「用户正在看的视频」+ 它能吃下哪些键。没有就 null。
   *
   * ⚠️ 这条路径**只被键盘控制器调用**（runtime.ts 里
   * `getWatchedVideo: () => this.registry.getWatchedVideo()` 只喂给
   * keyboardController），所以这里记录「键盘命中了谁」是安全的。
   *
   * ⚠️ 缓存：每次按键都全页扫一遍 DOM 代价不小（实测 3 万节点的页面
   * 单次约 3.2ms，而扩展注入在 <all_urls>、长按加速时每 120ms 一次）。
   * 缓存按 **DOM 变更代次**失效（静态页面上代次长期不变 → 一直命中），
   * 并且**连 null 结果一起缓存**（页面上没有视频是最常见的情况）。
   *
   * 非 null 的结果额外有个 5 秒的时间上限：候选的分数里含有随时间
   * 变化的成分（键盘目标的 30 秒窗口、「用户选过」的 10/60 秒窗口），
   * 时间到了就该重新算一次。
   */
  getWatchedTarget(): WatchedTarget | null {
    const cached = this.watchedCache;
    if (cached && cached.generation === this.generation) {
      const target = cached.target;
      // 缓存持强引用：页面可能在同一帧内把节点摘掉，命中缓存前重新确认存活。
      const alive = target === null || isConnected(target.video);
      const fresh = alive
        && (target === null || Date.now() - cached.at < WATCHED_CACHE_TTL_MS);
      if (fresh) {
        return target;
      }
    }

    const target = this.resolveWatchedTarget();
    this.watchedCache = { generation: this.generation, target, at: Date.now() };

    if (target) {
      this.rememberKeyboardTarget(target.video);
    }

    return target;
  }

  /**
   * 「用户正在看的视频」，没有就 null。
   *
   * 与 getCurrentVideo() 的区别是**契约**不同：
   * - getCurrentVideo()：「页面上最可能是目标的视频」——用于工具栏图标点击
   *   这类**显式**操作，用户点了就是想对某个视频动手。
   * - getWatchedVideo()：「用户此刻正在看的视频」——用于快捷键这类
   *   **隐式**操作。没有明确目标时必须返回 null（按键穿透），
   *   宁可什么都不做，也不要接管错对象。
   */
  getWatchedVideo(): HTMLVideoElement | null {
    return this.getWatchedTarget()?.video ?? null;
  }

  /**
   * 记住「键盘刚命中了哪个视频」。
   *
   * 为什么需要：多视频页面上「正在播 +600」这一档会让目标**漂移**。
   * 用户刚用空格暂停了 A，A 立刻失去 600 分，还在播的 B 变成最高分，
   * 下一次按键就打到 B 身上。实测：两个 600×338 同时在播 → `=` 命中 cam1 →
   * 空格暂停 cam1 → `f` 却把 cam2 搬进了全屏。
   *
   * ⚠️ 记的是 keyboardTargetVideo，**不是** lastInteractedVideo ——
   * 后者的语义是「用户用指针碰过的最后一个视频」，键盘写进去会盖掉
   * 用户的指针选择（而且它永不过期）。
   *
   * ⚠️ **不能让 generation 前进**：那会把刚算好的缓存立刻作废，
   * 每按一次键就重扫一次全页，缓存等于没有。之所以安全，是因为
   * 记录只会给**刚刚返回的那个视频**加分 —— 它本来就是第一名，
   * 加完还是第一名，缓存里的结果依然正确。
   */
  private rememberKeyboardTarget(video: HTMLVideoElement) {
    this.keyboardTargetVideo = video;
    this.keyboardTargetAt = Date.now();
    // ⚠️ 这里**不能**往 userTouchedVideos 里写。
    //
    // userTouchedVideos 的语义是「**用户**真的用手碰过它」——
    // 它是「这是装饰性预览吗」这个判定的**否定证据**。
    // 而「键盘打到了它」是我们**自己打分打出来的结果**：
    // 视频被选中的前提就是它**不是**装饰，写进去等于用结论证明结论。
    //
    // 后果实测：装饰性判定会自我豁免 —— 一个被判定为「装饰」的预览，
    // 只要先被键盘选中过一次（哪怕是打分选中的），它就永远不再是装饰。
    // 键盘目标的粘性由 keyboardTargetVideo（+8000 分、30 秒窗口）负责，
    // 不需要污染「用户碰过」这条证据。
    // 工具栏路径的帧快照要失效（打分变了）。
    this.dirty = true;
  }

  /**
   * focusin：记录「用户刚把焦点移进了某个视频」。
   *
   * ⚠️ **不能**参与「用户选过」的判定：页面脚本调 `video.focus()` 会让浏览器
   * 派发一个 focusin，而它的 isTrusted 恒为 true（这个事件是**浏览器**生成的，
   * 不是页面 dispatch 的）—— isTrusted 那道防线挡不住它。
   * 实测：文章页里的小预览视频被页面 focus 一下，就被当成了「用户亲手选过的」。
   *
   * ⚠️ 但也不能**完全不信** focusin：真实用户按 Tab 把焦点移进视频、
   * 或用键盘操作原生控件时，**只有** focusin 能告诉我们「用户此刻在操作哪个视频」。
   *
   * 两者的区别是「有没有伴随用户手势」：
   * - 用户按 Tab → keydown 先发生（我们听得到，是可信的）→ 随后 focusin → **可信**
   * - 页面加载时自己 focus() → 没有任何手势 → focusin → **不可信**
   *
   * 所以判据是「focusin 发生前不久是否有一次真实手势」。
   * 窗口用 GESTURE_TO_PLAY_MS —— 与「手势 → play」那条链共用同一个窗口，
   * 语义一致：都是「刚才用户确实在这个页面上动过手」。
   */
  private handleFocus(event: Event) {
    const video = this.findNearestVideo(event);
    if (!video) {
      return;
    }

    // 没有任何用户手势做背景的 focusin —— 一律不信（页面伪造的典型形状）。
    if (Date.now() - this.lastGestureAt >= GESTURE_TO_PLAY_MS) {
      return;
    }

    // 用户确实在操作它 → 它不是「站点摆在那儿的装饰」。
    this.userTouchedVideos.add(video);

    if (video !== this.lastInteractedVideo) {
      this.lastInteractedVideo = video;
      this.invalidate();
    }
  }

  private handleInteraction(event: Event) {
    // ⚠️ 合成事件不算「用户的交互」。
    //
    // 这一条是**安全边界**，不是风格偏好：扩展在 document_start 抢注捕获阶段
    // 监听器，本来是为了赢过页面脚本 —— 副作用是页面脚本能
    // `dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))` 打在
    // 自己的 video 上，把 lastChoiceAt 刷新成「现在」。
    // 那样一来，文章页里那个装饰性自动播放视频就成了「用户亲手选过的」，
    // 快捷键照旧被接管 —— 正是本轮要修的那个问题。
    //
    // 页面能伪造事件，但伪造不了 isTrusted（浏览器对真实输入恒为 true）。
    if (!this.isTrustedEvent(event)) {
      return;
    }

    const video = this.findNearestVideo(event);
    if (!video) {
      return;
    }

    // 只有**用户的手势**才算「用户选过它」。
    //
    // play 事件是站点自己触发的（自动播放预览）——那是站点在选视频，不是用户。
    // 但「用户点了播放按钮 → 站点随后派发 play」这个序列必须算用户选的，
    // 所以用"最近一次手势"作为中介。
    //
    // ⚠️ 中介必须是**指向这个视频**的手势，不能是「页面上随便什么键」。
    // 否则页面只要在用户按任意键后的 2 秒内让自己的预览视频播起来，
    // 就能把它伪装成「用户选过的」——那正是文章页预览的形状。
    // 修法：手势发生时**记下当时在视口中心附近的视频**（见 handleGesture），
    // play 事件只认「手势指向的就是这个视频」。
    const isGesture = event.type !== 'play'
      || (Date.now() - this.lastGestureAt < GESTURE_TO_PLAY_MS
        && this.lastGestureVideo === video);

    if (isGesture) {
      // 用户碰过它 → 它不再是「站点摆在那儿的装饰」（哪怕只是一次点击）。
      this.userTouchedVideos.add(video);
    } else if (event.type === 'play') {
      // ⚠️ 站点自己把它播起来了，用户没要求过。
      // 这条证据把「装饰性预览」与「没人开过、正等着用户先调速再播放的视频」
      // 区分开 —— 两者在 DOM 上可能一模一样。
      this.siteStartedVideos.add(video);
    }

    // ⚠️ lastInteractedVideo **只记用户的行为**，不记站点的行为。
    //
    // 曾经不管 isGesture 就更新它 —— 于是站点一播预览视频就把这个字段抢走，
    // 而它有 +10000 分权重（全场最高），在工具栏图标路径里直接胜出：
    // 实测（真实 Chromium）1600×900 暂停的主播放器 + 320×180 正在播的预览，
    // 按 `=` 改的是主视频，点工具栏图标进全屏进的却是那个小预览。
    //
    // 用户能看到的现象是「图标和快捷键表现不一致」—— 比「两者都错」更让人困惑。
    //
    // 那条 +10000 是给「用户刚碰过的视频」的：用户点了一个视频，
    // 我们就该优先处理它。自动播放不构成这种意图。
    if (isGesture && video !== this.lastInteractedVideo) {
      this.lastInteractedVideo = video;
      // 否则同一帧内紧随其后的查询会读到交互前的旧结果。
      this.invalidate();
    }

    if (isGesture) {
      this.lastChoiceAt = Date.now();
      // ⚠️ 时间戳必须**与视频绑定**。
      // 只记时间的话字段会漂移：用户点了视频 A（lastChoiceAt = 现在），
      // 随后站点让预览视频 B 自动播 → lastInteractedVideo 变成 B，
      // 而 lastChoiceAt 还是 A 的 —— 于是 B 白白继承了 A 的「新鲜度」，
      // 被判成「用户亲手选过」。这正是文章页预览的形状。
      this.lastChoiceVideo = video;
    }
  }

  /**
   * 事件附近最近的那个 video。
   *
   * ⚠️ 必须走 **composedPath**：键盘/指针事件跨 shadow 边界时，
   * `event.target` 会被**重定向成宿主元素**（实测：在 shadow 里的 <video>
   * 上 pointerdown，window 捕获阶段看到的 target 是 DIV#host）。
   * 只认 target 的话，shadow DOM 里的视频既拿不到「用户选过」的证据，
   * 也永远不会被记成「站点自己开的」—— 两条判定同时失效。
   */
  private findNearestVideo(event: Event): HTMLVideoElement | null {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const nodes: (EventTarget | null)[] = path.length > 0 ? path : [event.target];

    for (const node of nodes) {
      const element = node as Element | null;
      if (!element || typeof element.closest !== 'function') {
        continue;
      }

      const nearest = element.closest(VIDEO_SELECTOR);
      if (nearest && isVideoElement(nearest)) {
        return nearest;
      }
    }

    return null;
  }

  /**
   * 记一次真实手势。
   *
   * 用来把随后的 play 事件判成「用户按了播放」而不是「站点自动播放」。
   *
   * 记两样东西：时间（多快之内算「紧接着」）与**指向哪个视频**
   * （用户当时看着的是谁）。只记时间不够 —— 页面只要在用户按任意键后的
   * 2 秒内让自己的预览视频播起来，就能把它伪装成「用户按了播放」。
   */
  private handleGesture(event: Event) {
    // 合成事件不算手势：页面脚本能随意派发 pointerdown，
    // 让它刷新「用户刚动过手」的时间戳就等于给了页面一个遥控器。
    if (!this.isTrustedEvent(event)) {
      return;
    }

    this.lastGestureAt = Date.now();
    this.lastGestureVideo = this.findGestureTarget(event);
  }

  /**
   * 手势指向的是哪个视频。
   *
   * 两条路：
   * 1. 手势**落在**某个 video 上（点它、点它的控件）—— 那就是它，**不看尺寸**。
   *    用户亲手点了它，那就是他的目标，哪怕它只有 240×135。
   * 2. 手势落在页面别处（按了空格、按了某个键、点了空白）——
   *    那就取「视口中心附近、且**够大**」的视频，也就是用户此刻可能在看的那条。
   *
   * 第 2 条不能省：用户点的是站点自己的播放按钮（那是个 <button>，不是 video），
   * 事件目标落在按钮上。此时若只认第 1 条，用户点播放就永远算不上「选过它」。
   *
   * ⚠️ 第 2 条**必须**要求够大。不要求的话，文章页里那个小小的预览视频
   * 成了「离视口中心最近的那个」—— 用户按任意键都能把它变成「用户选过的」，
   * 那个洞就等于没堵。
   */
  private findGestureTarget(event: Event): HTMLVideoElement | null {
    const direct = this.findNearestVideo(event);
    if (direct) {
      return direct;
    }

    const view = window;
    const centerX = (view.innerWidth || 0) / 2;
    const centerY = (view.innerHeight || 0) / 2;
    const viewportArea = (view.innerWidth || 0) * (view.innerHeight || 0);
    let best: HTMLVideoElement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const video of this.getAllVideos()) {
      if (!isConnected(video)) {
        continue;
      }
      const rect = video.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      // 够大才有资格当「用户此刻在看的那条」。
      if (!hasReliableLayout(video.ownerDocument) || !isProminent(rect, viewportArea)) {
        continue;
      }
      const videoCenterX = rect.left + rect.width / 2;
      const videoCenterY = rect.top + rect.height / 2;
      const distance = Math.hypot(videoCenterX - centerX, videoCenterY - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = video;
      }
    }

    return best;
  }
}
