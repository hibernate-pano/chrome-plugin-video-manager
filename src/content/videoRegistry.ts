import {
  hasReliableLayout,
  isDecorativeAutoplay,
  isPageMainContent,
  isSiteMainPlayerVideo,
  publishAmbientPreview,
  viewportAreaOf,
} from './ambientPreview';
import { matchesSelector } from '../shared/domMatches';
import { getSiteAdapter } from './siteAdapters';
import { closestSelector } from '../shared/domMatches';
import { observeBody } from './bodyObserver';
import type { BodyObserver } from './bodyObserver';

const VIDEO_SELECTOR = 'video';

type VideoRect = Pick<DOMRect, 'width' | 'height' | 'top' | 'left' | 'right' | 'bottom'>;

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
/**
 * 「够像页面主角」的比例线（占视口 ≥ 40%）—— 决定能不能抢空格。
 *
 * ⚠️ 与 PAGE_MAIN_CONTENT_FRACTION（60%）不是一回事：那条判「是不是
 * 装饰物」（要**排除**它），这条判「够不够像主角」（决定**能不能**抢空格）。
 */
const PAGE_DOMINANT_FRACTION = 0.4;

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
/**
 * 这个视频是不是「站点摆在那儿的装饰性自动播放视频」。
 *
 * ⚠️ 判定规则在 `src/content/ambientPreview.ts` —— **只有一份**，
 * firstRunHint 用的是同一份。曾经这里与 firstRunHint 各写一份，
 * 两份已经漂移（见 ambientPreview.ts 开头的说明）。
 *
 * `autoplay` 属性表达的是**站点的意图** —— 「这条视频会自动开始播，
 * 用户没要求过」。
 *
 * ⚠️ 曾经还要求「静音」，那是多余的：浏览器本来就只允许静音自动播，
 * 于是「自动播放」几乎蕴含「静音」，这一条判据形同虚设（删掉它，
 * 全部用例照样通过 —— 说明它什么也没守）。反过来它还有个害处：
 * 用户允许了「自动播放声音」时，未静音的自动播放视频会被当成内容视频接管，
 * 而那种视频恰恰更可能是背景视频。
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

/**
 * 收集候选视频 —— **只收本 frame 自己的 document**。
 *
 * ⚠️⚠️ 6.1.0 之前这里会**下钻同源 iframe**。内容脚本注入到所有 frame 之后
 * （manifest 的 `all_frames`），那件事从「必要」变成了「有害」——
 *
 * 顶层 registry 下钻到 iframe 里的视频，而 **iframe 里另有一份 registry**
 * （同一个 `<video>` 节点，两份独立的运行时状态）。于是：
 *
 * 1. **同一个视频被两个 runtime 各管一半**：顶层把它的倍速改了、iframe 里
 *    那个 runtime 又改一次 —— 角标显示的倍率与视频实际倍率**互相矛盾**。
 * 2. **顶层能改 iframe 里的视频，却报不了倍速**：顶层 runtime 的
 *    `reportSpeed` 只让顶层文档说话，于是工具栏标题停在 1.0，
 *    而视频实际是 1.1 —— 唯一的常驻读数在**说谎**。
 * 3. **焦点在哪就在哪改**这条铁律被破坏：用户焦点在顶层，按 `=` 改的却是
 *    iframe 里的视频（实测）。
 *
 * 修法：**每个 frame 只管自己 document 里的视频**。跨 frame 的意图
 * （点工具栏图标）由 background 路由到「用户此刻聚焦的那个 frame」——
 * 那一个 frame 的 registry 里就有那个视频，它的 `canEnter` 也成立。
 *
 * ⚠️ shadow root 仍然要下钻：shadow tree 与 document 是**同一个 realm**，
 * `video.ownerDocument === document` 依然成立，reparent 搬得动。
 */
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
  });
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
  /**
   * 「我们接管着哪个视频」。
   *
   * ⚠️ 这个字段的**生灭必须与全屏会话同生共死** ——
   * 它由**控制器**在会话真正结束时统一清掉（见 runtime.ts 里 onSessionEnd
   * 的接线，以及 fullscreenController 的 release() → finishSession()）。
   *
   * ⚠️ 以前这份状态**只有 Esc 那条退出路径会去清** —— 于是从控制条的
   * 退出钮退出之后，这个字段仍然指着那个已经退出全屏的视频：
   * - 点工具栏图标 → 它以「全屏视频优先」的姿态胜出（错的视频）；
   * - 按空格 → 它不再被当成「页面预览」，空格被它吃掉，页面翻不动。
   *
   * ⚠️ 为什么**不**在这里另抄一份「会话账本」（控制器写在视频身上的
   * 那个 class，见 fullscreenSession.ts）：那等于给同一件事安**第二道闸**。
   * 两道闸都放行同一个问题，就会出现「拆掉其中一道，另一道照样兜住」——
   * 于是**哪一道在真正守着什么**再也说不清，守卫也做不出隔离的变异验证。
   * 会话的账本归控制器（角标与引导在读它），注册表只保留「我们接管的是
   * 哪条视频」这一个指针，而它的生死由控制器在唯一的出口处通知。
   */
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
   * ⚠️ 它也**不能**用来豁免可见性过滤：那要靠 lastChoiceVideo
   * （有 10 秒窗口，见 wasRecentlyChosen）。用这个字段豁免的话，
   * 用户一小时前点过的视频后来被站点 `display:none` 藏起来，
   * 工具栏图标仍会接管它 —— overlay 起来了，里面却是空的。
   *
   * ⚠️ **键盘命中不写这个字段**：键盘写的是 keyboardTargetVideo。
   * 两者语义不同 —— 这个字段回答「用户用鼠标碰过谁」，
   * 那个字段回答「快捷键此刻在操作谁」。混在一起会让一次键盘操作
   * 盖掉用户的指针选择。
   */
  private lastInteractedVideo: HTMLVideoElement | null = null;
  /**
   * 「用户碰过 lastInteractedVideo」这件事发生在什么时候。
   *
   * ⚠️ 为什么必须与视频**绑定**（而不是只看时间戳）：只记时间的话字段会漂移 ——
   * 用户碰过 A 之后又碰了 B，旧的时间戳会让 B 白白继承 A 的新鲜度。
   *
   * ⚠️ 为什么必须有**时限**：这个字段的语义是「用户**刚刚**碰过它」。
   * 一条几十分钟前的点击不再说明用户此刻想动哪个视频 —— 而它带着全场最高的
   * 权重（+10000），永不过期就会让「很久以前点过、早已滚出屏幕」的小预览
   * 一直霸占工具栏图标的目标（见 isRecentInteracted 与 resolveCurrentVideo）。
   */
  private lastInteractedAt = 0;
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
   * 而且它是「用户碰过什么」的线索，不是「快捷键此刻在操作谁」——
   * 用它记键盘目标的话，键盘的意图会被指针的意图顶掉。
   */
  private keyboardTargetVideo: HTMLVideoElement | null = null;
  private keyboardTargetAt = 0;
  /**
   * **扩展自己的快捷键**把哪些视频暂停了（还没被恢复的）。
   *
   * ⚠️ 为什么需要这条证据：`isRunning` 是「能不能吃空格」的条件之一
   * （见 resolvePermission），而扩展自己按空格把视频暂停之后它就变成 false。
   * 于是「按空格暂停 → 再按空格恢复」这条最普通的操作，第二下会把空格
   * 还给页面：视频一动不动，页面却往下翻页 —— 用户看到的是「空格键坏了」，
   * 而 `=` 仍然有效，所以这个结论特别牢固。
   *
   * ⚠️ 为什么**不能**直接拿 `wasTargetedByKeyboard` 当判据（最初的写法）：
   * `getWatchedTarget()` 对**任何**解析出的目标都会调 `rememberKeyboardTarget`，
   * 包括权限是 'no-space' 的那些。于是文章页里那个「暂停着、没人开过、
   * 无 controls」的预览视频，只要用户按过一次 `=`（调速本来就允许作用在
   * no-space 视频上），下一次按键它就会被升级成 'full' —— 空格从此被它吃掉，
   * 翻不了页。那正是 P1-1 要守住的场景（判据 11）。
   *
   * 所以证据必须收窄到**「是我们按停的」**：只有我们自己的快捷键把它从
   * 播放状态按停，才需要豁免。一个从头到尾没播过、也没被我们按停的视频
   * 不满足这条 —— 它掉到 'no-space' 是对的（用户按空格是想翻页）。
   *
   * ⚠️ 为什么用 WeakSet 而不是一个字段：多视频页面上用户可能先后按停过
   * 好几个（长按/连按），字段只记得住最后一个；WeakSet 随视频回收，不泄漏。
   *
   * ⚠️ 谁写谁清：只由 `noteShortcutPlaybackChange` 写（runtime 在快捷键
   * 切换播放后回调），由「这个视频又开始播了」清（见 handleInteraction 的
   * play 事件分支）—— 站点自己把它恢复之后，它就不再是「我们按停的」了。
   */
  private pausedByShortcut = new WeakSet<HTMLVideoElement>();
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
  /**
   * 测量代次 —— 只管「测量结果」的缓存。
   *
   * ⚠️ 为什么要与 generation 分开：class 变动在重渲染站点上每秒几十次，
   * 而它**只**影响「这个视频长什么样」（可见性/尺寸），不影响
   * 「这个页面上有哪些视频」。把它算进 generation 的话，
   * 快捷键路径的缓存每次 class 变动都被作废 → 每次按键都要全页重扫
   * （实测 3 万节点的页面约 3ms，长按加速时每 120ms 一次）。
   *
   * 所以：class 变动只推进测量代次（见 invalidateMeasurements），
   * 其余变动两个代次一起推进（见 invalidate）。
   */
  private measurementGeneration = 0;
  /** 快捷键路径的缓存（按 generation 失效）。 */
  private watchedCache: {
    generation: number;
    /** 算这份缓存时的测量代次 —— 用来判断「可见性判定的依据有没有变」。 */
    measurement: number;
    target: WatchedTarget | null;
    at: number;
  } | null = null;
  /**
   * 每个视频的**测量结果**（帧内缓存）。
   *
   * 为什么缓存的是「测量」而不是「候选列表」：
   *
   * - 测量（`getBoundingClientRect` + `getComputedStyle`）会**强制排一次版**，
   *   实测它是整条路径里最贵的一半（真实 Chromium，3 万节点的页面：
   *   采样里 getBoundingClientRect 的占比比 querySelectorAll 还高）。
   * - 候选列表本身必须**每次重收**：DOM 的增删是同步可见的
   *   （单元测试就是这个形状：appendChild 之后立刻查询），
   *   而 MutationObserver 的失效通知是**微任务** —— 缓存列表会漏掉
   *   同一个同步块里刚加进来的视频。
   *
   * 所以：列表永远新鲜，测量按帧复用。同一帧内布局不会变
   * （滚动与 CSS 动画都会推进帧号），跨帧必须重测 —— 视频可能刚被挪了位置。
   * 另按 measurementGeneration 失效：DOM 变了（改 class、改 style）立刻作废。
   */
  private rectCache = new WeakMap<HTMLVideoElement, {
    measurement: number;
    frame: number;
    rect: VideoRect;
  }>();
  /** 计算样式单独缓存：只有「判定可见性」那条路需要它。 */
  private styleCache = new WeakMap<HTMLVideoElement, {
    measurement: number;
    frame: number;
    style: CSSStyleDeclaration | null | undefined;
  }>();
  /**
   * body 级观察器（见 bodyObserver.ts）。
   *
   * ⚠️ 它必须是「会跟着 body 换人」的那一种：站点
   * `document.body.replaceWith(newBody)` 之后，观察者若还挂在**旧 body** 上，
   * 新 body 里的任何变化都看不见 ——
   * 「DOM 变更代次」永远不前进 → 快捷键路径缓存里的 `null` 永不过期
   * → 所有快捷键静默失灵（而图标那条路按帧重算，不受影响）。
   */
  private bodyObserver: BodyObserver | null = null;
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
    // ⚠️ 为什么观察的是 body 而不是 documentElement：
    //
    // 我们自己的浮层全挂在 <html> 上（见 viewportRoot.ts）——
    // 若去观察 documentElement 的**子树**，我们自己挂/摘浮层就会被算成
    // 「DOM 变化」，每次浮层显隐都推进一次变更代次，
    // 把「测量结果按帧复用」那套优化整个打掉（每次按键都要全页重扫）。
    //
    // 观察 body（子树）就覆盖了页面内容的一切变化；
    // 「body 被整个换掉」由 bodyObserver 额外盯着 <html> 那一层。
    //
    // ⚠️ 为什么还要观察属性：判定依赖 `controls` / `autoplay` 两个属性，
    // 也依赖 class/style（可见性）。只观察 childList 的话，站点后来给视频
    // 加上 controls，我们仍然按「装饰视频」看待它。
    // attributeFilter 把回调限制在这几个属性上，避免无关属性（id、data-*）
    // 变动时缓存被冲掉。
    this.bodyObserver = observeBody({
      bodyInit: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['controls', 'autoplay', 'class', 'style'],
      },
      onBodyMutation: (records) => this.handleBodyMutation(records),
      // body 被换掉时，新 body 里的内容**在换之前就已经存在** ——
      // 观察器看不到它们的「加入」，只能靠这一次显式作废。
      //
      // ⚠️ 这一步是「快捷键全体失灵」的根因修复：没有它，
      // 缓存里的 `null` 永不过期（null 结果没有 TTL），
      // 站点换一次页面，快捷键就再也不会醒来。
      onBodyReplaced: () => this.invalidate(),
    });
    this.invalidate();
    this.catchUpSiteStartedVideos();
  }

  /**
   * DOM 变更回调：**按变更的种类**决定作废多少缓存。
   *
   * ⚠️ 为什么不能一律作废：class 变动在重渲染站点上每秒几十次
   * （React / Vue / Next.js 每次渲染都要重算 class）。
   * 一律作废 = 每次按键都要全页重扫一遍（实测 3 万节点的页面约 3ms），
   * 而长按加速时每 120ms 一次 —— 那点开销全烧在这里了。
   *
   * 分类的依据是「这条变更会不会改变**候选集合**」：
   * - childList：会（视频出现了/被摘掉了）→ 全量作废。
   * - controls / autoplay / style：会（它们决定视频是不是装饰物、
   *   是不是被 CSS 藏起来了）→ 全量作废。
   * - class：**不会** —— 可见性判定读的是**计算样式**与**实测矩形**
   *   （isCssHidden / isVisible / isInViewport），class 属性本身从头到尾
   *   没有被读过 → 只作废测量结果（见 invalidateMeasurements）。
   *
   * ⚠️ 为什么**不能**把 class 从 attributeFilter 里去掉（那会更省）：
   * 测量结果虽然是「每帧重测」的，但**目标缓存**是跨帧的（5 秒）。
   * class 变动不推进任何代次的话，缓存里的目标就永远不会被复核 ——
   * 站点用 `display:none` 把视频藏起来之后，它还能继续吃下快捷键整整 5 秒。
   * 留着 class 观察，它才会推进**测量代次**，从而触发「复核那一个视频」
   * （见 isStillUsable）。省下的那点观察开销，换来的是一条正确性。
   */
  private handleBodyMutation(records: MutationRecord[]) {
    for (const record of records) {
      if (record.type !== 'attributes' || record.attributeName !== 'class') {
        this.invalidate();
        return;
      }
    }

    // 只有 class 变了 → 只作废测量结果。
    this.invalidateMeasurements();
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
    this.bodyObserver?.disconnect();
    this.bodyObserver = null;
    this.fullscreenVideo = null;
    this.lastInteractedVideo = null;
    this.lastInteractedAt = 0;
    this.lastChoiceVideo = null;
    this.keyboardTargetVideo = null;
    // pausedByShortcut 是 WeakSet：没有 clear()，但注册表停止之后
    // 它指向的视频已经没有意义了 —— 新建一个空集合即可。
    this.pausedByShortcut = new WeakSet();
    this.snapshot = null;
    this.watchedCache = null;
    this.invalidate();
  }

  setFullscreenVideo(video: HTMLVideoElement | null) {
    this.fullscreenVideo = video;
    if (video) {
      // 我们接管了它 —— 这也是一条「用户此刻要动它」的强信号，
      // 顺手把「用户碰过」的新鲜度续上（见 isRecentInteracted）。
      this.lastInteractedVideo = video;
      this.lastInteractedAt = Date.now();
    }
    // lastInteractedVideo 变了，缓存里的"当前视频"可能已过期。
    this.invalidate();
  }

  /**
   * 快捷键刚刚切换了播放状态 —— 记下「暂停是我们干的」。
   *
   * 唯一的调用点：runtime.ts 的 `onPlaybackStateChange`（快捷键路径）。
   * 控制条自己的播放按钮**不走这里** —— 那条路径不经过 `getWatchedTarget`，
   * 也就不会因为 `isRunning` 变 false 而掉权限，没有这个问题。
   *
   * ⚠️ 操作对象取自 `keyboardTargetVideo`：键盘控制器在动手**之前**一定先调了
   * `getWatchedTarget()`，而那条路径（无论是命中缓存还是重新解析）
   * 都把「它此刻操作的是谁」记在这个字段里。这是本项目里
   * 「快捷键此刻在操作谁」**唯一**的载体 —— 不另立第二个。
   *
   * ⚠️ 只在**暂停**时记：`playing === true` 表示我们把它恢复了，
   * 此时它已经回到 `isRunning`，不需要豁免（顺手把旧证据清掉）。
   */
  noteShortcutPlaybackChange(playing: boolean) {
    const video = this.keyboardTargetVideo;
    if (!video) {
      return;
    }
    if (playing) {
      this.pausedByShortcut.delete(video);
      return;
    }
    this.pausedByShortcut.add(video);
    // 权限变了（no-space → full）→ 快捷键缓存里的那份 permission 已经过期。
    this.invalidate();
  }

  /**
   * 「我们**此刻**还在接管这个视频」吗？
   *
   * ⚠️ 判据是 `fullscreenVideo` 字段 —— 而那个字段由**控制器**在会话
   * 真正结束时统一清掉（见 runtime.ts 里 onSessionEnd 的接线）。
   *
   * ⚠️ 为什么不是现场去读那个 class（FULLSCREEN_VIDEO_CLASS）：
   * 那样做等于给同一件事安**第二道闸**。两道闸都放行同一个问题，
   * 就会出现「拆掉其中一道，另一道照样兜住」—— 于是**哪一道在真正
   * 守着什么**再也说不清，守卫也做不出隔离的变异验证。
   *
   * 这里要守的判据只有一条：**会话结束时，控制器必须通知到注册表**。
   */
  private isTakenOverByUs(video: HTMLVideoElement): boolean {
    return video === this.fullscreenVideo;
  }

  /**
   * 作废一切缓存。
   *
   * generation 前进 = 快捷键路径的缓存失效；dirty = 工具栏路径的帧快照失效；
   * measurementGeneration 前进 = 测量结果（矩形/计算样式）失效。
   */
  private invalidate() {
    this.dirty = true;
    this.generation += 1;
    this.measurementGeneration += 1;
  }

  /**
   * 只作废**测量结果**的缓存，「当前目标」的缓存留着。
   *
   * 什么时候用它：class 变化（见 observer 的注释）。
   *
   * ⚠️ 为什么不能连「当前目标」一起作废：重渲染站点的 class 变动
   * 每秒几十次，作废一次目标缓存 = 全页重扫（3 万节点的页面约 3ms），
   * 而长按加速时每 120ms 一次 —— 那点开销全烧在这里了。
   *
   * ⚠️ 为什么作废测量就够：可见性判定读的是**计算样式**与**实测矩形**
   * （isCssHidden / isVisible / isInViewport），class 属性本身没有被读过；
   * 而测量本来就是**每帧重测**的（同一帧内布局不会变，滚动与 CSS 动画
   * 都会推进帧号）。class 变动要做的只是让「这一帧」的测量重做一遍。
   *
   * ⚠️ 候选列表（collectCandidates）**永远不缓存** —— DOM 的增删是
   * 同步可见的，而 MutationObserver 的作废通知是**微任务**：
   * 缓存列表会漏掉同一个同步块里刚加进来的视频。
   */
  private invalidateMeasurements() {
    this.dirty = true;
    this.measurementGeneration += 1;
  }

  /**
   * 这一层文档里的所有视频（**不含**子 iframe 里的那些）。
   *
   * ⚠️ 这是「本 frame 拥有哪些视频」的**唯一**枚举口径 ——
   * 引导的「补记」也要用它（见 firstRunHint.ts 的 catchUpAlreadyPlayingVideos），
   * 所以它必须是**公开**的，而不是让那边自己抄一份
   * （抄一份的后果是两边对「哪些视频算数」的判断慢慢漂移）。
   *
   * ⚠️ shadow root 会下钻，**子 iframe 不会**：
   * shadow tree 与 document 是同一个 realm；而子 iframe 是另一个 realm，
   * 那边的视频由**那个 frame 自己的**注册表负责。
   */
  getAllVideos(): HTMLVideoElement[] {
    const videos = new Set<HTMLVideoElement>();
    collectVideos(document, videos);
    return Array.from(videos);
  }

  getCurrentVideo() {
    // 全屏视频永远最高优先，必须留在快照判断之前。
    //
    // ⚠️ 这个分支的前提是「`fullscreenVideo` 字段与会话同生共死」——
    // 而那个前提由**控制器在会话结束时统一通知**来保证
    // （runtime.ts 里 onSessionEnd 的接线）。
    // 以前只有 Esc 那条退出路径会去通知，于是从控制条的退出钮退出之后，
    // 这个分支仍然把手伸向那个**已经退出全屏**的视频：
    // 用户点工具栏图标，进的是那个早就滚出屏幕的视频，而不是眼前这个。
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
   * - lastInteractedVideo：最后碰到过的那个视频（点一下就变；带 60 秒窗口，
   *   且**只记用户的行为**、不被自动播放的 play 事件改写 ——
   *   它只是「最近碰过什么」的线索）
   * - lastChoiceVideo + lastChoiceAt：用户**主动选过**的那个，和它的时间
   *
   * 只有后者带证据（用户的手势）与更短的时效（10 秒窗口）。
   * 豁免可见性过滤时必须用后者 —— 用前者会让「一小时前点过、后来被站点
   * 藏起来的视频」享受更长的豁免（实测：工具栏图标接管了一个 display:none 的
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
   * 这个视频是不是「站点摆在那儿的装饰性自动播放视频」。
   *
   * ⚠️ **公开这个方法是有意的**：判定规则在 `ambientPreview.ts`（只有一份），
   * 而「用户碰过它」「站点自己开的」这两条**证据**只有本模块知道
   * （它们靠事件与手势的时间关系来判定，别人算不出来）。
   *
   * firstRunHint 需要同一份判定来回答另一个问题：
   * 「这条视频是装饰物吗？—— 是的话就别给它弹引导」。两边对同一条视频
   * 给出**相反**的结论是最糟的组合：键盘接管了（对的），引导永远不出现
   * （错的，唯一一次教学机会被烧掉）。
   *
   * ⚠️ 候选集**不**含 shadow DOM 与同源 iframe 里的视频 ——
   * 那两条下钻路径只对「页面里选目标」有意义，而这里的用途是
   * 「这条**正在播放**的 video 是不是装饰物」（firstRunHint 拿到的是
   * play 事件的目标节点，本身就在候选集里）。
   */
  isAmbientPreview(video: HTMLVideoElement): boolean {
    const rect = this.measureRect(video);
    return this.computeAmbientPreview(
      video,
      rect,
      this.isTakenOverByUs(video),
    );
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
   * 判据全部是**证据**，不是属性 —— 一共**七条**，
   * 分属三个地方（谁提供哪一条，见 `src/content/ambientPreview.ts` 的文件头）：
   *
   * 1. 站点**没有**点名它是主播放器 —— 站点能点名就不该由我们猜。
   * 2. 不是**我们**接管着的（进全屏时我们会把 controls 弄掉）。
   * 3. 用户**从未**碰过它 —— 碰过就是用户自己的选择。
   * 4. 它**没有原生 controls** —— 站点没打算让人把它当播放器操作。
   * 5. 它是**站点自己**播起来的（autoplay 属性，或站点调 play()）。
   * 6. 它**没有占满大半个视口** —— 装饰性预览从来不会霸占整个屏幕。
   * 7. **键盘刚命中过它** —— 我们自己打分打出来的结果，别人算不出来。
   *
   * 七条全中 → 它就是装饰，不接管。
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
  private computeAmbientPreview(
    video: HTMLVideoElement,
    rect: VideoRect,
    isTakenOverByUs: boolean,
  ): boolean {
    // 1–5：共享判定（ambientPreview.ts）—— 与 firstRunHint 用的是**同一份**规则。
    //
    // ⚠️ 这份规则曾经与 firstRunHint 各写一份，两份已经漂移：
    // videoRegistry 这份被重写成「六条证据」（当时是六条，后来又加了
    // 第 7 条「键盘刚命中过它」），firstRunHint 那份还停在
    // 最老的属性判据上，于是同一条视频「接管」与「弹引导」的结论相反 ——
    // 用户在一个用自制播放器的网站上看视频：键盘接管了（对的），
    // 但引导永远不出现（错的，唯一一次教学机会被白白烧掉）。
    //
    // ⚠️ 第 1 条（站点有没有点名它是主播放器）与 `isWatchedVideo` 第 2 档
    // 用的是**同一个**函数（ambientPreview.ts 的 `isSiteMainPlayerVideo`）。
    // 曾经这两处各写一份且**不等价**：一份是「唯一性」版（命中第一个有候选的
    // 选择器就停），一份是「是不是站点点名的」版（任何一条命中都算）。
    // 同一页面上「video.html5-main-video」与「.html5-video-player video」
    // 同时存在时，站在后者里的那条视频，一条判据说它不是主播放器，
    // 另一条说它是 —— 于是**本模块内部**对同一条视频给出两个相反的结论：
    // 「要不要接管它」说它是装饰物，「要不要给它弹引导」说它不是。
    // 那正是本轮要消灭的那类 bug，所以现在**只认一份**。
    //
    // 「我们接管着的」这条豁免必须传进来：进全屏时我们把
    // `video.controls = false`，那会**反射性地移除 `controls` 属性**，
    // 于是进全屏后视频会被判成装饰物 → **快捷键彻底失灵**（实测）。
    // 豁免的依据是**由 VideoRegistry 自己知道**哪些视频是我们接管的
    // （setFullscreenVideo 已经在记），而不是去猜 DOM 位置。
    if (!isDecorativeAutoplay(video, {
      isMainPlayer: isSiteMainPlayerVideo(video),
      isTakenOverByUs,
      wasChosenByUser: this.wasEverTouched(video),
      wasStartedBySite: this.wasStartedBySite(video),
    })) {
      return false;
    }

    // 6. 占满大半个视口 → 它是页面主角，不是装饰。
    if (isPageMainContent(video, rect)) {
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
    //    ⚠️ 「站点有没有点名它」只有**一份**判据（ambientPreview.ts 的
    //    isSiteMainPlayerVideo），与下面第 3 档里那条用的是同一个函数 ——
    //    两处曾经各写一份且不等价，于是本模块内部对同一条视频给出过
    //    两个相反的结论（见 computeAmbientPreview 的注释）。
    if (isSiteMainPlayerVideo(video)
      && (!hasReliableLayout(video.ownerDocument)
        || isInViewport(video, rect)
        || this.wasRecentlyChosen(video))) {
      return true;
    }

    // 3. 站点的装饰性预览：用户没要求过它，它自己播起来了。
    if (this.computeAmbientPreview(video, rect, this.isTakenOverByUs(video))) {
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
    return { video, rect: this.measureRect(video), style: this.measureStyle(video) };
  }

  /**
   * 量一个视频的矩形（帧内复用）。
   *
   * ⚠️ `getBoundingClientRect()` 会**强制排版** —— 它是整条候选路径里
   * 最贵的一次调用（见 rectCache 的注释）。所以每条用到矩形的路都走这里，
   * 不许自己调 `getBoundingClientRect`。
   */
  private measureRect(video: HTMLVideoElement): VideoRect {
    const cached = this.rectCache.get(video);
    if (cached
      && cached.measurement === this.measurementGeneration
      && cached.frame === currentFrame) {
      return cached.rect;
    }

    const rect = video.getBoundingClientRect();
    this.rectCache.set(video, {
      measurement: this.measurementGeneration,
      frame: currentFrame,
      rect,
    });
    return rect;
  }

  /** 量一个视频的计算样式（帧内复用）。 */
  private measureStyle(video: HTMLVideoElement) {
    const cached = this.styleCache.get(video);
    if (cached
      && cached.measurement === this.measurementGeneration
      && cached.frame === currentFrame) {
      return cached.style;
    }

    const style = video.ownerDocument.defaultView?.getComputedStyle(video);
    this.styleCache.set(video, {
      measurement: this.measurementGeneration,
      frame: currentFrame,
      style,
    });
    return style;
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
    // 「用户刚刚碰过它」—— 权重全场最高，但**有时限**。
    //
    // ⚠️ 为什么必须有时限：这个字段记的是「用户碰过的最后一个视频」，
    // 而「碰过」这件事会随着时间越来越不相关。用户半小时前点过一张
    // 320×180 的卡片预览，之后页面换成了大播放器 —— 那次点击**不再**说明
    // 用户此刻想动哪个视频。没有时限的话，它会以 +10000 一直霸占
    // 工具栏图标的目标（实测：图标进的全屏是那个早就滚走的小预览，
    // 同一时刻按 f 进的却是大播放器 —— 图标与快捷键表现不一致）。
    if (this.isRecentInteracted(video)) {
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
   * 「用户刚刚（用指针/焦点）碰过它」这个说法**现在**还成立吗。
   *
   * ⚠️ 窗口取 EXPLICIT_CHOICE_MS（60 秒），与「用户显式选过它」那一档同量级：
   * 60 秒覆盖的是「点一下播放/暂停，然后马上按 f」这一串动作；
   * 再长就不合理了 —— 那时用户多半早就划到下一条视频去了。
   *
   * ⚠️ 与 wasExplicitlyChosen 的区别：那一档认的是「用户**主动选过**」
   * （必须有手势做证据），这一档认的是「用户**碰过**」（指针或焦点）。
   * 后者证据更弱，所以它的时限不能比前者更长。
   */
  private isRecentInteracted(video: HTMLVideoElement): boolean {
    return video === this.lastInteractedVideo
      && Date.now() - this.lastInteractedAt < EXPLICIT_CHOICE_MS;
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

    // 被判成「页面预览」的候选：**不是**目标，但它是「为什么接管不了」的答案。
    //
    // ⚠️ 这里单独判一次（而不是让 isWatchedVideo 报出原因）：isWatchedVideo
    // 有五六个拒绝理由（看不见、滚出去了、太小、装饰物…），要把它们分开说
    // 就得改它的返回形状 —— 而那条判据链是全仓库最敏感的一处（七条证据的拼装）。
    // 装饰物这一条是**独立可判**的（computeAmbientPreview 就是它自己），
    // 所以在这里重算一次，代价只是几条属性检查。
    const ambientCandidates: { video: HTMLVideoElement; rect: VideoRect }[] = [];

    const scored = list
      .filter(({ video, rect, style }) => {
        if (this.isWatchedVideo(video, rect, style)) {
          return true;
        }
        if (this.computeAmbientPreview(video, rect, this.isTakenOverByUs(video))) {
          ambientCandidates.push({ video, rect });
        }
        return false;
      })
      .map(({ video, rect, style }) => ({
        video,
        score: this.scoreCandidate(video, rect, style, preferred),
      }))
      .sort((left, right) => right.score - left.score);

    const video = scored[0]?.video ?? null;

    // 登记判定结果（见 ambientPreview.ts 的「判定的对外一格」）：
    // 有目标 → 没有页面预览（登记 null）；没有目标但有页面预览 → 登记那一条。
    //
    // ⚠️ 登记 null 同样重要：否则上一轮的结论会留在那里，
    // 而「这条视频是不是页面预览」会被用来说错原因。
    publishAmbientPreview(video ? null : this.pickAmbientPreview(ambientCandidates));

    if (!video) {
      return null;
    }

    return {
      video,
      permission: this.resolvePermission(video),
    };
  }

  /**
   * 页面预览有好几条时，挑**最像「用户说的那条」**的那一条。
   *
   * 判据是面积：用户按快捷键时，心里想的多半是页面上**最大**的那块画面。
   * 提示会贴在那条视频旁边，所以挑得对，用户一眼就能对上号。
   */
  private pickAmbientPreview(
    candidates: { video: HTMLVideoElement; rect: VideoRect }[],
  ): HTMLVideoElement | null {
    let best: { video: HTMLVideoElement; rect: VideoRect } | null = null;
    for (const candidate of candidates) {
      const area = candidate.rect.width * candidate.rect.height;
      const bestArea = best ? best.rect.width * best.rect.height : -1;
      if (!best || area > bestArea) {
        best = candidate;
      }
    }
    return best?.video ?? null;
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
   * - 它**正在播** —— 用户此刻在跟一段正在进行的画面互动。
   * - 它**有原生 controls，且是页面主角**（见下）。
   *
   * 其余情况（暂停着、没有原生控件、不是主播放器、用户没碰过）
   * → 'no-space'：空格放行给页面。
   *
   * ⚠️ 「是不是站点点名的主播放器」与接管路径、装饰路径用的是
   * **同一个函数**（ambientPreview.ts 的 isSiteMainPlayerVideo）。
   * 曾经这里用的是「唯一性」那一份（命中第一个有候选的选择器就停），
   * 而接管路径用的是「是不是站点点名的」那一份 ——
   * 同一个模块内部对同一条视频给出两个相反的答案。
   *
   * ⚠️⚠️ 「有原生 controls」**不能单独**成为抢空格的依据。
   *
   * 实测（真实 Chromium）：一篇长文（正文 6000px）顶部放一个
   * `<video controls>`（640×360，**暂停着**），用户点正文想翻页 →
   * 按空格 → `scrollY` 纹丝不动（0），视频反而**开始播放**了。
   * 同一个页面把视频删掉 → 空格正常翻页（scrollY 760）。
   *
   * 也就是说「有 controls」这条判据在**任何带原生播放器的文章页上必现**，
   * 而「文章页里嵌个播放器」是极常见的页面形态。这是键盘类扩展的
   * 经典差评来源：「这扩展把我的空格抢走了，我没法翻页」。
   *
   * 根因是把「站点把它当播放器」误当成了「用户此刻在跟它互动」。
   * 一个**暂停着**的 controls 视频，在用户眼里是文章的一部分，不是
   * 一个正在看的影片。
   *
   * 所以 controls 这条要**再加一道**：它必须是**页面主角**（占视口 ≥ 40%）。
   * 正经播放器（打开就在看的那一个）满足这条；文章顶部那个小播放器
   * 不满足 —— 它在文章里是插图，不是主角。
   */
  private resolvePermission(video: HTMLVideoElement): TakeoverPermission {
    if (isSiteMainPlayerVideo(video)) {
      return 'full';
    }

    if (this.wasRecentlyChosen(video)) {
      return 'full';
    }

    // ⚠️ **我们自己的快捷键**刚刚把它按停了 → 'full'。
    //
    // 根因（实测，真实 Chromium）：`isRunning`（`!paused && !ended && readyState > 2`）
    // 是 'full' 的条件之一，而**扩展自己**按空格把视频暂停之后，
    // `isRunning` 立刻变 false → 权限从 'full' 掉到 'no-space' →
    // 键盘控制器把空格**还给页面**（`no-space` + `togglePlay` → 放行）→
    // 页面往下翻页，而视频一动不动。
    //
    // 用户看到的是「按空格暂停了视频，再按空格视频不动，页面却往下翻页」——
    // 看起来像「空格绑定坏了」。而 `=` 仍然生效（只有 togglePlay 这一条坏了），
    // 于是「这个扩展的空格键是坏的」这个结论特别牢固。
    //
    // ⚠️ 判据必须是「**是我们按停的**」，不能放宽成「键盘刚命中过它」：
    // 后者会把 no-space 的视频也一起升级（见 pausedByShortcut 的注释），
    // 直接违反判据 11（文章页里的预览视频不许抢空格）。
    //
    // ⚠️ 为什么这条**不能**写进 userTouchedVideos：那个集合的语义是
    // 「**用户真的用手碰过**它」，而键盘命中是我们自己打分的结果 ——
    // 写进去等于用结论证明结论（见 rememberKeyboardTarget 的注释）。
    if (this.pausedByShortcut.has(video)) {
      return 'full';
    }

    if (isRunning(video)) {
      return 'full';
    }

    // 有原生 controls = 站点把它当正经播放器给人用 —— 但**只有当它也是
    // 页面主角**时，它才可能是用户此刻在看的东西。
    if (video.hasAttribute('controls') && this.isPageDominant(video)) {
      return 'full';
    }

    return 'no-space';
  }

  /**
   * 这个视频是不是「页面主角」（占视口 ≥ 40%）。
   *
   * ⚠️ 40% 这条线与 isPageMainContent 的 60% 不是一回事：
   * 那条判「是不是装饰物」（要**排除**它），这条判「够不够像主角」
   * （决定**能不能**抢空格）。抢空格比「接管别的键」更霸道，
   * 所以门槛要**更低**才对 —— 但实测发现 60% 太严：很多正经播放器的
   * 容器四周有大量留白，视频本身占不到 60%，那样连「空格暂停视频」
   * 都会失灵。
   *
   * 40% 的依据：文章里嵌入的小播放器通常在 10%-20% 之间；
   * 而作为页面主体的播放器（哪怕四周有字幕区、评论区占位）很少低于 40%。
   *
   * ⚠️ 无布局引擎时（单测的 jsdom）量不出尺寸 → 判「是主角」，
   * 也就是「不因为这条判据收紧」。否则单测里所有 controls 视频都会
   * 突然变成 no-space，既有断言大面积翻红 —— 而那条翻红与真实行为无关。
   */
  private isPageDominant(video: HTMLVideoElement): boolean {
    if (!hasReliableLayout(video.ownerDocument)) {
      return true;
    }

    const rect = this.measureRect(video);
    const viewportArea = viewportAreaOf(video);
    if (viewportArea <= 0) {
      return true;
    }

    return (rect.width * rect.height) / viewportArea >= PAGE_DOMINANT_FRACTION;
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

    // ⚠️ 回退分支必须与快捷键路径**对齐**：快捷键路径有「在视口里」这道过滤
    // （isWatchedVideo 的第 5 条），回退分支原来**没有** ——
    // 于是「有尺寸、但早已滚出屏幕」的视频仍是有效候选，
    // 而 lastInteractedVideo 直接以 +10000 胜出。
    //
    // 实测（真实 Chromium）：几十秒前点过一张 320×180 的卡片预览，
    // 之后页面换成大播放器 → 点工具栏图标进的全屏是那个早就滚走的小预览
    // （或一块黑屏），而不是眼前的大播放器；同一时刻按 f 进的却是大播放器 ——
    // **图标与快捷键表现不一致**。
    //
    // 修法：有「在视口里」的候选时，只在它们里面挑；一个都没有时才退回全部。
    // 这样两条路径在「用户眼前是哪个视频」这件事上永远一致。
    const onScreen = candidates.filter(({ video, rect }) => isInViewport(video, rect));
    const pool = onScreen.length > 0 ? onScreen : candidates;

    const scored = pool
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
   * lastInteractedVideo —— 后者的窗口长得多（60 秒），而且它记的是
   * 「碰过」而不是「选过」。
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
   * 「测量依据变了之后」，缓存里的目标还站不站得住。
   *
   * ⚠️ 为什么需要它：class 变动**不**作废目标缓存（见 invalidateMeasurements），
   * 而 class 变动恰恰能改变可见性 —— 站点把视频 `display:none` 藏起来就是
   * 改 class。没有这道复核，缓存里的目标会**继续被接管最多 5 秒**
   * （WATCHED_CACHE_TTL_MS），哪怕视频已经不在屏幕上了。
   *
   * ⚠️ 为什么只复核**这一个**视频，而不是全页重扫：全页重扫在重渲染站点上
   * 每次按键都要 3ms（3 万节点），而长按加速时每 120ms 一次 ——
   * 那点开销全烧在这里了。复核一个视频 = 一次 getBoundingClientRect
   * + 一次 getComputedStyle，比全页重扫便宜两个数量级。
   *
   * 判据与 resolveWatchedTarget 用的是**同一套**（isUsableCandidate +
   * isWatchedVideo），否则「缓存说行、重扫说不行」，两条路径会打架。
   */
  private isStillUsable(video: HTMLVideoElement): boolean {
    if (!isConnected(video)) {
      return false;
    }

    const rect = this.measureRect(video);
    const style = this.measureStyle(video);

    if (!this.isUsableCandidate(video, rect, style)) {
      return false;
    }

    return this.isWatchedVideo(video, rect, style);
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
   *
   * ⚠️ 缓存按 **DOM 变更代次**失效，但**只改 class** 不推进那个代次
   * （见 invalidateMeasurements）—— 否则重渲染站点上每次按键都要全页重扫。
   * 代价是「目标被 class 藏起来」这件事不会立刻反映到缓存上，
   * 所以命中缓存时要**复核那一个视频**（见 isStillUsable）：
   * 复核一个视频 = 一次测量，比全页重扫便宜两个数量级。
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
        // ⚠️ 测量依据变了（多半是 class 变动）→ 目标可能已经被站点藏起来了。
        // 这里只**复核这一个视频**，不是全页重扫（见 isStillUsable 的注释）。
        //
        // 测量依据没变 → 直接命中缓存，一个测量都不做（静态页面的热路径）。
        if (target === null
          || cached.measurement === this.measurementGeneration
          || this.isStillUsable(target.video)) {
          return target;
        }
        // 目标已经站不住了 → 落到下面重新算一次。
      }
    }

    const target = this.resolveWatchedTarget();
    this.watchedCache = {
      generation: this.generation,
      measurement: this.measurementGeneration,
      target,
      at: Date.now(),
    };

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
   * 用户的指针选择（而且它带的是「用户碰过」的时限，不是键盘的时限）。
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
      this.lastInteractedAt = Date.now();
      this.invalidate();
    } else {
      // 同一个视频被再次操作：把「用户正在跟它互动」的新鲜度续上。
      // 不续的话，用户每分钟点它一次、每次都把 60 秒窗口重新打开才对。
      this.lastInteractedAt = Date.now();
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

    if (event.type === 'play') {
      // 它又开始播了 —— 不管是谁恢复的（我们自己的下一次空格、用户点了
      // 播放按钮、站点自己），「我们把它按停了」这条证据都已经过期。
      //
      // ⚠️ 必须清：留着的话，用户按停过的那条视频会**永远**是 'full'
      // （哪怕之后站点把它当预览反复播），空格在文章页里就再也翻不了页。
      this.pausedByShortcut.delete(video);
    }

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
    if (isGesture) {
      if (video !== this.lastInteractedVideo) {
        this.lastInteractedVideo = video;
        // 否则同一帧内紧随其后的查询会读到交互前的旧结果。
        this.invalidate();
      }
      // 时间戳**每次**都刷新：用户反复点同一个视频时，
      // 「刚刚碰过它」这件事一直是新的（见 isRecentInteracted 的窗口）。
      this.lastInteractedAt = Date.now();
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
      // ⚠️ 「closest 是不是函数」不用在这里判：closestSelector 自己处理
      // （页面把它删掉时判成「没有」）。
      if (!element) {
        continue;
      }

      // ⚠️ 必须走带 try/catch 的那份：页面可以把 Element.prototype.closest
      // 换成会抛异常的版本 —— 抛了，「用户当时点的是哪条视频」就找不到，
      // 那条视频永远拿不到「用户碰过它」「站点自己开的」两条证据，
      // 于是被判成装饰物：既不接管，也不弹引导。
      const nearest = closestSelector(element, VIDEO_SELECTOR);
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

    // ⚠️ 浏览器在用户**按住**某个键期间会持续派发 keydown（`event.repeat === true`）。
    //
    // 那些重复事件不带来任何新信息：还是同一个键、还是同一次手势。
    // 但每次都要重扫整页视频列表（见 candidateCache 的注释）——
    // 用户按住一个键一秒，就是 30 次全页扫描。
    //
    // 而真实用户按住键的时长恰恰是**最长的**（长按空格翻页、长按方向键快进），
    // 所以这一条是「按住键」这条路径上最划算的优化。
    //
    // ⚠️ 副作用是刻意的：`lastGestureAt` 不再被重复事件刷新，
    // 于是「用户按住键的同时站点把自己的预览视频播起来」不再被算成
    // 「用户按了播放」—— 那本来就更像站点在抢用户的意图。
    if (event.type === 'keydown' && (event as KeyboardEvent).repeat) {
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
      const rect = this.measureRect(video);
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
