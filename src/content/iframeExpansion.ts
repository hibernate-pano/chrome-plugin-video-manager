import { setImportant } from './runtimeStyles';

/**
 * 「iframe 里的网页全屏」—— 父子文档之间的那套约定。
 *
 * ## 要解决的问题
 *
 * VSC 的网页全屏是**自绘覆盖层**（不是原生 fullscreen）：视频被搬进
 * `#vsc-page-fullscreen-overlay`（position: fixed; inset: 0），画面按
 * 100vw/100vh 铺开。这两样的参照系都是「**当前文档的视口**」。
 *
 * 于是视频在 iframe 里时，覆盖层铺满的是 **iframe 自己那块视口**
 * （真实 Chromium 实测：overlayRect 320×220 === innerViewport 320×220，
 * 而 topViewport 是 1280×720）—— 用户点了「网页全屏」却只在那块小框里
 * 全屏，顶层页面原样不动，「网页全屏」名不副实。
 *
 * ## 修法
 *
 * 让**父文档**把「装着这个视频的那个 <iframe> 元素」撑满自己的视口。
 * iframe 内部的覆盖层是 fixed + inset: 0（相对 iframe 自己的视口），
 * 视频是 100vw/100vh（vw/vh 同样相对 iframe 自己的视口）——
 * iframe 元素一旦铺满顶层视口，里头的覆盖层与画面自然就铺满整个页面。
 * 连站点自己写的 iframe 尺寸样式都不用管（我们带 !important 压过去）。
 *
 * ## 为什么请求发给直接父文档，而不是 window.top
 *
 * 「撑满父文档的视口」与「覆盖层铺满自己这一层的视口」是同一层级的事：
 * 每一层只认领**自己文档里**的那个 iframe 元素。若中间层自己也在 iframe 里，
 * 它撑大子 frame 之后会**再向上一级**请求一次（链式，见 syncUpstream），
 * 于是最外层的 iframe 也被撑开 —— 但每一跳都只发给 window.parent，
 * 从来没有谁跨级去动 window.top 里的元素。
 */

/**
 * 子文档 → 父文档：「请把装着我的那个 <iframe> 元素撑满你的视口」。
 *
 * 消息体只有这一个 type 字段，**不带任何指向目标的信息**。
 *
 * ⚠️ 故意不带上「我要你撑大哪个 iframe」：那种写法等于让页面可以自报家门、
 * 指名道姓地让父文档去撑大任意一个 iframe。父文档必须靠 **event.source 与
 * 各 <iframe>.contentWindow 的同一性**自己认领（见 findFrameBySource）。
 */
export const FRAME_EXPAND_MESSAGE = 'vsc-expand-frame';

/** 子文档 → 父文档：「把那个 <iframe> 元素恢复原样」。 */
export const FRAME_RESTORE_MESSAGE = 'vsc-restore-frame';

/**
 * 撑大的 iframe 要压过页面里的一切。
 *
 * 2147483647 是 32 位有符号整数的上限 —— CSS 的 z-index 用的是有符号
 * 32 位整数，写成 2147483648 会溢出成 -2147483648（变成最底层）。
 */
const EXPANDED_FRAME_Z_INDEX = 2147483647;

/**
 * 撑大之后 iframe 元素要写死的那组样式。
 *
 * 为什么必须压 `position: fixed; inset: 0` 而不是只给 `width: 100%`：
 * 被撑大的对象是一个**被站点摆布过的元素** —— 它可能有 transform、有
 * max-width、有 margin:auto 居中。fixed + inset:0 + 100vw/100vh 一次性把
 * 这些全压过去，剩下的只需要把 transform 清掉。
 *
 * ⚠️ `width: 100vw` 而不是 `100%`：vw 相对的是**父文档的视口**，
 * 与顶层文档自己进全屏时视频用的 100vw/100vh 是同一个参照系，
 * 两者的画面尺寸才会一致。
 */
const EXPANDED_FRAME_STYLES: Record<string, string> = {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  margin: '0',
  border: '0',
  padding: '0',
  // 站点的 iframe 常带 max-width/max-height（自适应布局），不清掉就撑不满。
  'max-width': 'none',
  'max-height': 'none',
  'min-width': '0',
  'min-height': '0',
  // ⚠️ transform 必须清掉：站点很爱给 iframe 加 transform: scale(...)
  // （见 tests/e2e/frame-scale.spec.js 的夹具）。留着它，撑大的是
  // 「缩放后的那个框」，铺不满视口 —— 而缩放是站点自己的布局选择，
  // 用户点「网页全屏」要的显然是铺满。
  transform: 'none',
  'z-index': String(EXPANDED_FRAME_Z_INDEX),
};

/**
 * 会让「position: fixed 的后代」被关进自己盒子的属性。
 *
 * ## 为什么需要这一组
 *
 * 撑大的 iframe 是 `position: fixed; inset: 0; width: 100vw; height: 100vh`。
 * fixed 元素的包含块**默认**是视口 —— 但只要**祖先**上有这些属性之一，
 * 包含块就换成那个祖先，撑大的 iframe 于是被关在祖先的盒子里：
 *
 *   祖先 transform: translateY(0)  →  iframe 的包含块 = 祖先的 padding box
 *   → fixed 的 inset:0 变成「铺满祖先」而不是「铺满视口」
 *   → 撑大的只有播放器卡片那么大一块，「全屏」名不副实。
 *
 * 动画播放器卡片极其常见（transform 做 hover 位移 / 入场动画），
 * 嵌套两层时症状叠加：每一层都被自己的祖先裁一次。
 *
 * ⚠️ 只清 iframe **自身**的 transform 是不够的 —— 那正是这个 bug 的根因。
 */
const CONTAINING_BLOCK_PROPERTIES = [
  'transform',
  'perspective',
  'filter',
  'backdrop-filter',
  'contain',
  'will-change',
  'translate',
  'scale',
  'rotate',
  'container-type',
  'content-visibility',
] as const;

/**
 * 把这些属性恢复成「不形成包含块」的值。
 *
 * ⚠️ transform 的原值只能**整个丢掉**：transform 是单个属性，
 * 没有「保留位移只去掉缩放」这种写法。代价是站点自己的动画/位移在全屏期间失效，
 * 退出时精确还原（见 restoreAncestorContainingBlocks）。
 */
const CONTAINING_BLOCK_RESET_VALUES: Record<string, string> = {
  transform: 'none',
  perspective: 'none',
  filter: 'none',
  'backdrop-filter': 'none',
  contain: 'none',
  'will-change': 'auto',
  translate: 'none',
  scale: 'none',
  rotate: 'none',
  'container-type': 'normal',
  'content-visibility': 'visible',
};

/**
 * 这个值是否让元素成为 fixed 后代的包含块。
 *
 * ⚠️ 不是所有这些属性只要「有值」就形成包含块：
 * - `contain: size` 只锁尺寸，不关住 fixed 后代；`paint`/`layout`/`strict` 才关。
 * - `will-change: opacity` 不关；只有预告 transform/perspective/filter 才关。
 * - `contain: none` / `will-change: auto` 是默认值，都不关。
 * 判错的方向不一样：多清一个属性 = 多破坏一点站点布局；
 * 少清一个 = 全屏铺不满。所以这里逐个属性按规范判。
 */
const formsContainingBlock = (property: string, rawValue: string): boolean => {
  const value = rawValue.trim().toLowerCase();
  if (!value) {
    return false;
  }

  switch (property) {
    case 'transform':
    case 'perspective':
    case 'filter':
    case 'backdrop-filter':
    case 'translate':
    case 'scale':
    case 'rotate':
      // 这些属性只有取 `none` 时才不形成包含块。
      return value !== 'none';
    case 'contain':
      return /\b(paint|layout|strict|content)\b/.test(value);
    case 'will-change':
      return /\b(transform|perspective|filter|backdrop-filter|contain)\b/.test(value);
    case 'container-type':
      // size / inline-size 会带上布局包含（layout containment）。
      return value === 'size' || value === 'inline-size';
    case 'content-visibility':
      // auto / hidden 隐含包含（containment）。
      return value === 'auto' || value === 'hidden';
    default:
      return false;
  }
};

/**
 * 读一个属性的「实际生效值」。
 *
 * ⚠️ 优先读**计算值**：站点写在样式表里的 transform 才是常见情况，
 * 只看内联样式会漏掉一大半（那样就等于没修）。
 * 计算值读不到时（jsdom 对部分属性不实现计算样式）退回内联值 ——
 * 真实浏览器里两者至少有一个是对的。
 */
const readEffectiveValue = (element: HTMLElement, property: string): string => {
  try {
    const view = element.ownerDocument.defaultView;
    const computed = view?.getComputedStyle(element).getPropertyValue(property);
    if (computed) {
      return computed;
    }
  } catch {
    // 读不到就退回内联值。
  }
  return element.style.getPropertyValue(property);
};

/**
 * 找出「发出这条消息的那个子文档」对应的 <iframe> 元素。
 *
 * ⚠️ 只能靠 contentWindow 的同一性来认领：跨源 iframe 里
 * `window.frameElement` 恒为 null（跨源访问直接抛 SecurityError），
 * 而 **contentWindow 跨源可读**（读不到的是它的 `.document`）。
 *
 * @param doc 父文档
 * @param source MessageEvent.source
 * @param expanded 我们已经撑大过的 frame。
 *   它们**不在 DOM 里**也仍然算数：站点把 iframe 摘掉时会连带销毁子文档，
 *   子文档在 pagehide 里发来的「还原」请求必须还能被认领。
 *   ⚠️ 这时不能靠 `frame.contentWindow` 认领 —— 元素被摘掉后
 *   它的 contentWindow 立刻变成 null（实测），而 event.source 仍指向
 *   那个**旧的**窗口对象。所以认领要跟我们**当初记下的**那个窗口比。
 */
const findFrameBySource = (
  doc: Document,
  source: MessageEventSource | null,
  expanded: Map<Element, ExpandedFrame>,
): HTMLElement | null => {
  if (!source) {
    return null;
  }

  // 先看已经撑大过的那些：它们的元素引用与窗口引用我们一直握着，
  // 哪怕已经被站点从 DOM 里摘掉也还在。
  for (const [frame, record] of expanded) {
    if (record.contentWindow === source) {
      return frame as HTMLElement;
    }
  }

  const frames = doc.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame');
  for (const frame of frames) {
    if (frame.contentWindow === source) {
      return frame;
    }
  }

  return null;
};

/** 从 message.data 里取出 type —— 只认字符串，其它一律当不是我们的消息。 */
const readMessageType = (data: unknown): string | null => {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const type = (data as { type?: unknown }).type;
  return typeof type === 'string' ? type : null;
};

/**
 * 我们撑大过的一个子 frame 的原始状态。
 *
 * ⚠️ `contentWindow` 必须**在撑大那一刻**就记下来：iframe 元素一旦被站点
 * 从 DOM 里摘掉，它的 contentWindow 立刻变成 null（真实 Chromium 实测），
 * 而子文档在 pagehide 里发来的还原请求的 event.source 仍指向那个**旧的**
 * 窗口对象。记下当时的窗口引用，认领才还成立。
 */
interface ExpandedFrame {
  /** 站点原本写的内联 style（null = 原本没有 style 属性）。 */
  originalStyle: string | null;
  /** 撑大那一刻这个 frame 的 contentWindow。 */
  contentWindow: Window | null;
}

/**
 * 一个属性在被我们清掉之前的内联值与优先级。
 *
 * ⚠️ 只记内联值，不记计算值：计算值里的百分比已经被解析成像素，
 * 写回去等于永久顶掉站点样式表里那条规则（subtitleOffset.ts 里踩过同样的坑）。
 */
interface InlineValue {
  value: string;
  priority: string;
}

/**
 * 「撑大 / 还原一个 iframe」这件事的完整实现。
 *
 * 一个实例同时扮演两个角色：
 *
 * - **子文档侧**：我们自己在 iframe 里 → 请求父文档把装着我们的那个
 *   <iframe> 元素撑满它的视口（setOwnFullscreen）。
 * - **父文档侧**：我们/document 里有别人的 iframe → 认领来自子 frame 的
 *   请求并照做（install 装上的 message 监听）。
 *
 * 两个角色在同一个文档里可以同时成立（我们自己被嵌在 A 里，A 里又嵌着 B，
 * 而 B 在请求撑大）—— 那时 B 的请求由 A 处理，A 自己那份撑大请求则由 A 的
 * 父文档处理。
 */
export class FrameExpander {
  /** 被我们撑大过的子 frame → 它的原始状态。 */
  private readonly expandedChildren = new Map<Element, ExpandedFrame>();

  /**
   * 我们临时清掉的祖先属性 → 它原来的内联值与优先级。
   *
   * 为什么按「祖先 + 属性」记，而不是按 frame 记：同一个祖先可能被两个
   * 被撑大的 frame 共用（页面上两个播放器卡片在同一个容器里），
   * 按 frame 记会让「还原」互相踩 —— 先还原的那个把 transform 放回去，
   * 另一个还在全屏的 iframe 立刻又被裁回小盒子。
   */
  private readonly ancestorOverrides = new Map<Element, Map<string, InlineValue>>();

  /** 被我们撑大的 frame → 我们在它身上动过的那些祖先。 */
  private readonly frameAncestors = new Map<Element, HTMLElement[]>();

  /** 我们是否已经让父文档撑大过「装着我们的那个 frame」。 */
  private upstreamExpanded = false;

  /** 我们自己有没有正在全屏的内容。 */
  private ownFullscreen = false;

  /** 我们改过的 body overflow 的原值；null = 当前没有锁滚动。 */
  private originalBodyOverflow: string | null = null;

  private listening = false;

  private readonly win: Window;
  private readonly doc: Document;

  constructor(win: Window = window, doc: Document = document) {
    this.win = win;
    this.doc = doc;
  }

  /**
   * 装上「父文档侧」的监听器。
   *
   * ⚠️ 每一个文档都要装（不只是顶层）：嵌套时中间那一层才是子 frame 的
   * 直接父文档，它不装就没人认领子 frame 的请求。装上并不代表会有动作 ——
   * 没有子 frame 发来消息时它一秒钟都不会醒。
   */
  install(): void {
    if (this.listening) {
      return;
    }

    this.listening = true;
    this.win.addEventListener('message', this.boundHandleMessage);
    this.win.addEventListener('pagehide', this.boundHandlePageHide);
  }

  /** 卸掉监听器，并把撑大过的 frame 全部还原。 */
  uninstall(): void {
    if (!this.listening) {
      return;
    }

    this.listening = false;
    this.win.removeEventListener('message', this.boundHandleMessage);
    this.win.removeEventListener('pagehide', this.boundHandlePageHide);
    this.restoreAllChildren();
    this.syncUpstream();
  }

  /**
   * 告诉我们「我们自己正在全屏」。
   *
   * 只有身处 iframe 里才有意义：顶层文档的网页全屏是老路径，
   * 不需要任何人帮忙（也不该被任何消息改变）。
   */
  setOwnFullscreen(active: boolean): void {
    if (this.ownFullscreen === active) {
      return;
    }

    this.ownFullscreen = active;
    this.syncUpstream();
  }

  /**
   * 父文档侧：认领并处理来自子 frame 的请求。
   *
   * ⚠️ **安全边界**：页面理论上能伪造这种消息。
   *
   * 后果分析：伪造者最多只能让**它自己页面里的某个 iframe 元素**变成满屏 ——
   * 而页面本来就能用自己的 JS 改自己的 iframe 样式（它对那个元素有完全
   * 控制权），所以这不构成提权：能让这条消息生效的前提，是「页面自己本来
   * 就做得到这件事」。
   *
   * 真正挡住「顶层窗口自己发消息」这类伪造的是 **event.source 同一性比对**：
   * - 顶层窗口给自己发消息 → source 是顶层 window，而顶层文档里没有任何
   *   iframe 的 contentWindow 等于顶层 window → 比对不上 → 忽略；
   * - 别的窗口/页面发消息 → source 不是本页任何 iframe 的 contentWindow → 忽略；
   * - 只有**真的从某个 iframe 文档里发出来**的消息才会被认领。
   *
   * 消息里也不带「撑大哪个 iframe」这种可自报门家的字段（见
   * FRAME_EXPAND_MESSAGE 的注释），所以即使页面伪造了消息，它也说不清
   * 自己要的是哪个 iframe —— 父文档只认 event.source 认出来的那一个。
   *
   * 更强的校验（例如经 background 换一次性票据）需要把消息路由到 background，
   * 复杂度与收益不成比例：票据能挡掉的「伪造」，等价于页面改自己的 iframe
   * 样式，那本来就是它允许自己做的事。
   */
  private readonly boundHandleMessage = (event: MessageEvent): void => {
    const type = readMessageType(event.data);
    if (type !== FRAME_EXPAND_MESSAGE && type !== FRAME_RESTORE_MESSAGE) {
      return;
    }

    const frame = findFrameBySource(this.doc, event.source, this.expandedChildren);
    if (!frame) {
      // 不是我们任何一个 iframe 发来的（顶层窗口自己发的、外站发来的）→ 忽略。
      return;
    }

    if (type === FRAME_EXPAND_MESSAGE) {
      this.expandChild(frame);
    } else {
      this.restoreChild(frame);
    }
  };

  /**
   * 我们（作为子文档）即将离开：让父文档把 frame 还原。
   *
   * 没有这一条，iframe 被站点移除或导航走时，父文档里那个 frame 会永远
   * 保持「满屏」，父文档的滚动锁也跟着不放 —— 用户会发现页面突然滚不动了。
   */
  private readonly boundHandlePageHide = (): void => {
    if (!this.upstreamExpanded) {
      return;
    }

    this.upstreamExpanded = false;
    this.postToParent(FRAME_RESTORE_MESSAGE);
  };

  /** 把某个子 frame 撑满我们的视口。 */
  private expandChild(frame: HTMLElement): void {
    if (this.expandedChildren.has(frame)) {
      // 已经撑过了。⚠️ 绝不能把「撑大后的 style」当成原样记下来 ——
      // 那样退出时就还原不回站点自己的内联样式了。
      return;
    }

    // 先记下原样（null = 站点压根没写内联 style）与当时的 contentWindow。
    this.expandedChildren.set(frame, {
      originalStyle: frame.getAttribute('style'),
      contentWindow: (frame as HTMLIFrameElement).contentWindow,
    });

    // 必须带 !important：站点一条全局 CSS（iframe { width: 320px !important }）
    // 就能压住普通的内联样式；而 style 属性上的 !important 又压得住任何
    // 选择器上的 !important（见 runtimeStyles.ts「样式隔离」那一节）。
    Object.entries(EXPANDED_FRAME_STYLES).forEach(([property, value]) => {
      setImportant(frame, property, value);
    });

    // 祖先的包含块必须一起清掉，否则撑大的只是「祖先盒子里的一块」。
    this.neutralizeAncestorContainingBlocks(frame);

    this.lockScroll();
    // 链式：我们的子 frame 现在要铺满**我们的**视口，而我们自己可能也只是
    // 顶层页面里的一块小 iframe —— 那就得请上一级把我们也撑大。
    this.syncUpstream();
  }

  /**
   * 沿 `parentElement` 链向上找出「形成包含块」的祖先，临时清掉那些属性。
   *
   * 为什么必须做：撑大的 iframe 是 `position: fixed`，它的包含块默认是视口，
   * 但祖先上的 transform / filter / contain / will-change 会把包含块换成那个祖先 ——
   * 于是 iframe 被关在卡片那么大的盒子里，铺不满（嵌套两层时症状叠加）。
   *
   * ⚠️ 只清**真正形成包含块**的那些属性：把祖先的 transform 换成 none 已经在
   * 破坏站点的布局了，能少改一个属性就少改一个。
   *
   * ⚠️ 每一层只动**自己文档里**的祖先：跨文档的祖先我们够不着，
   * 也不该够着（每一层各自负责自己那一跳，见文件头的说明）。
   */
  private neutralizeAncestorContainingBlocks(frame: HTMLElement): void {
    const ancestors: HTMLElement[] = [];
    let node: HTMLElement | null = frame.parentElement;
    while (node) {
      ancestors.push(node);
      node = node.parentElement;
    }

    const touched: HTMLElement[] = [];

    for (const ancestor of ancestors) {
      let overrides = this.ancestorOverrides.get(ancestor);
      const knownBefore = overrides !== undefined;
      if (!overrides) {
        overrides = new Map();
      }

      let touchedThisAncestor = false;

      for (const property of CONTAINING_BLOCK_PROPERTIES) {
        // ⚠️ 我们**自己**已经清过这个属性 → 它对**这个** frame 同样是要紧的。
        //
        // 踩过的坑：第二个 frame 共用同一个祖先时，那个祖先的 transform 已经是
        // 'none' 了（我们上一步清的），于是「它还形成包含块吗」的判断为否 →
        // 这个祖先没被记进本 frame 的依赖表 → 先还原第一个 frame 时祖先被
        // 提前放回去 → 还在全屏的第二个 frame 立刻被裁回小盒子。
        if (overrides.has(property)) {
          touchedThisAncestor = true;
          continue;
        }

        if (!formsContainingBlock(property, readEffectiveValue(ancestor, property))) {
          continue;
        }

        // 第一次动这个属性时记下它原来的内联值与优先级 —— 退出时精确还原。
        // 已经记过的不重记：否则第二次记下来的会是**我们写的那一份**。
        overrides.set(property, {
          value: ancestor.style.getPropertyValue(property),
          priority: ancestor.style.getPropertyPriority(property),
        });

        // 带 !important：站点给这些属性写 !important 很常见（动画卡片）。
        setImportant(ancestor, property, CONTAINING_BLOCK_RESET_VALUES[property]);

        touchedThisAncestor = true;
      }

      if (touchedThisAncestor) {
        if (!knownBefore) {
          this.ancestorOverrides.set(ancestor, overrides);
        }
        if (!touched.includes(ancestor)) {
          touched.push(ancestor);
        }
      }
    }

    if (touched.length > 0) {
      this.frameAncestors.set(frame, touched);
    }
  }

  /**
   * 把祖先上被我们清掉的属性精确还原。
   *
   * ⚠️ 两条铁律：
   *
   * 1. 只还原**当初被我们改过的那几个属性** —— 不能把祖先的整个 style 属性
   *    写回去，那样会把站点在这期间自己改的样式一起抹掉。
   * 2. 只在「当前值仍是我们写的那份」时才还原 —— 站点自己在这期间改过的值
   *    不能被我们覆盖回去（那是站点对新布局的意图，不是我们的残留）。
   */
  private restoreAncestorContainingBlocks(frame: HTMLElement): void {
    const ancestors = this.frameAncestors.get(frame);
    if (!ancestors) {
      return;
    }
    this.frameAncestors.delete(frame);

    for (const ancestor of ancestors) {
      // 同一个祖先可能被两个被撑大的 frame 共用：还有别人依赖它就先不还原。
      const stillNeeded = [...this.expandedChildren.keys()].some((other) =>
        (this.frameAncestors.get(other) ?? []).includes(ancestor),
      );
      if (stillNeeded) {
        continue;
      }

      const overrides = this.ancestorOverrides.get(ancestor);
      if (!overrides) {
        continue;
      }
      this.ancestorOverrides.delete(ancestor);

      for (const [property, original] of overrides) {
        if (ancestor.style.getPropertyValue(property) !== CONTAINING_BLOCK_RESET_VALUES[property]) {
          continue;
        }
        if (ancestor.style.getPropertyPriority(property) !== 'important') {
          continue;
        }
        if (original.value) {
          ancestor.style.setProperty(property, original.value, original.priority);
        } else {
          ancestor.style.removeProperty(property);
        }
      }
    }
  }

  /** 把某个子 frame 恢复原样。 */
  private restoreChild(frame: HTMLElement): void {
    const record = this.expandedChildren.get(frame);
    if (!record) {
      // 我们从没撑大过它 → 不许碰它的样式（免得把站点自己的内联样式抹掉）。
      return;
    }

    this.expandedChildren.delete(frame);

    // ⚠️ 还原**不**看 isConnected。
    //
    // iframe 元素被站点从 DOM 里摘掉时（换播放器、销毁广告位），
    // 它仍然是个活着的节点 —— 站点随时可能把它插回去。
    // 若这时跳过还原，那个节点会带着「满屏」样式回来，
    // 用户看到的是一个突然铺满整页的 iframe。
    // 给一个游离节点写 style 属性完全无害（它不渲染）。
    this.applyOriginalStyle(frame, record.originalStyle);

    // 祖先的包含块也要还原 —— 撑大与还原必须成对。
    // 否则站点的 transform / filter 会一直被我们按着，页面布局永久变形
    // （「鼠标移上去卡片不再位移」这类用户一眼看得见的损坏）。
    this.restoreAncestorContainingBlocks(frame);

    if (this.expandedChildren.size === 0) {
      this.unlockScroll();
    }

    this.syncUpstream();
  }

  /** 把我们撑大过的子 frame 全部还原（页面卸载 / 控制器销毁时）。 */
  private restoreAllChildren(): void {
    const records = [...this.expandedChildren.entries()];

    // ⚠️ 必须**先清空**再还原：restoreAncestorContainingBlocks 会用
    // expandedChildren 判断「还有没有别的 frame 依赖同一个祖先」。
    // 不先清空的话，共用祖先会被当成「还有人依赖」而永远还原不了。
    this.expandedChildren.clear();

    for (const [frame, record] of records) {
      this.applyOriginalStyle(frame as HTMLElement, record.originalStyle);
      this.restoreAncestorContainingBlocks(frame as HTMLElement);
    }

    this.unlockScroll();
  }

  /** 把一个 frame 元素的内联样式恢复成它原来的样子。 */
  private applyOriginalStyle(frame: HTMLElement, originalStyle: string | null): void {
    if (originalStyle === null) {
      // 站点原本压根没写内联 style → 还原成「没有 style 属性」，
      // 而不是留一个空的 style=""（那会让 CSS 选择器命中方式悄悄变样）。
      frame.removeAttribute('style');
      return;
    }

    frame.setAttribute('style', originalStyle);
  }

  /**
   * 撑大期间顶层页面不该出现滚动条/抖动。
   *
   * body 上的 overflow 会被**传播到视口**（当 html 的 overflow 是 visible 时），
   * 于是滚动条消失，100vw 也就等于可见宽度 —— 否则撑大的 iframe 会比
   * 顶层自己的全屏画面宽出一个滚动条的宽度。
   */
  private lockScroll(): void {
    if (this.originalBodyOverflow !== null) {
      return;
    }

    const body = this.doc.body;
    if (!body) {
      return;
    }

    this.originalBodyOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
  }

  /** 还原滚动锁。 */
  private unlockScroll(): void {
    if (this.originalBodyOverflow === null) {
      return;
    }

    if (this.doc.body) {
      this.doc.body.style.overflow = this.originalBodyOverflow;
    }

    this.originalBodyOverflow = null;
  }

  /**
   * 决定要不要请父文档撑大「装着我们的那个 frame」。
   *
   * 条件是「我们自己全屏」**或**「我们有个子 frame 正被撑大」——
   * 后者就是链式传递：子 frame 铺满我们的视口之后，如果我们自己也在
   * iframe 里，那我们的视口本身还是那一小块，必须让上一级把我们撑开。
   */
  private syncUpstream(): void {
    if (!this.hasParent()) {
      // 顶层文档没有父文档可求。顶层自己的网页全屏是老路径，一行都不该变。
      this.upstreamExpanded = false;
      return;
    }

    const shouldExpand = this.ownFullscreen || this.expandedChildren.size > 0;
    if (shouldExpand === this.upstreamExpanded) {
      return;
    }

    this.upstreamExpanded = shouldExpand;
    this.postToParent(shouldExpand ? FRAME_EXPAND_MESSAGE : FRAME_RESTORE_MESSAGE);
  }

  /** 我们是不是被嵌在别人的 frame 里。 */
  private hasParent(): boolean {
    try {
      return this.win.parent !== this.win;
    } catch {
      // 拿不到 parent（极端的跨源场景）→ 当自己没被嵌，不去麻烦任何人。
      return false;
    }
  }

  /**
   * 发消息给**直接父文档**。
   *
   * ⚠️ targetOrigin 只能是 '*'：父文档的 origin 我们并不知道（跨源时连
   * location.href 都读不到），而这条消息里没有任何敏感内容 —— 它只说
   * 「请把装着我的那个 iframe 撑大」，真正的授权靠的是父文档自己那套
   * event.source 同一性比对。
   */
  private postToParent(type: string): void {
    if (!this.hasParent()) {
      return;
    }

    try {
      this.win.parent.postMessage({ type }, '*');
    } catch {
      // 父窗口已经被销毁（用户关了标签页）—— 忽略即可。
    }
  }
}
