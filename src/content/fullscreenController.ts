import { FullscreenControls } from './fullscreenControls';
import { FrameExpander } from './iframeExpansion';
import { findOverlayLayers, OverlayLayer } from './overlayLayers';
import { restoreSubtitleOffset } from './subtitleOffset';
import { SUBTITLE_Z_INDEX, VIDEO_Z_INDEX } from './runtimeStyles';
import { mountViewportRoot } from './viewportRoot';

type FullscreenMode = 'reparent' | 'css-cover';

/**
 * 退出全屏时，视频与字幕要回到哪里。
 *
 * ⚠️ 为什么要单独算：站点在**全屏期间**重渲染（React/Vue 换清晰度、
 * SPA 虚拟列表）会把旧的播放器容器丢掉 —— 那时原来的父节点已经**不在文档里**。
 * 往那个游离容器里插 = 节点还在，但没人看得见：站点播放器变成黑框，
 * 字幕从此永久消失。所以落点必须先判一次「原父节点还在不在文档里」。
 */
interface RestorePlan {
  /** 视频与字幕的落点。null = 没有可用落点（极端情况）。 */
  host: ParentNode | null;
  /** 落点是「可见兜底」而不是站点原来的位置吗？ */
  fallback: boolean;
}

interface FullscreenSnapshot {
  video: HTMLVideoElement | null;
  mode: FullscreenMode | null;
  originalParent: ParentNode | null;
  originalNextSibling: Node | null;
  originalStyle: string;
  /**
   * 全屏布局那组属性在**搬运前**的内联值与优先级。
   *
   * 为什么单独记：正常退出时把整个 style 属性还原成 originalStyle 就够了。
   * 但「站点在全屏期间把视频拿回去了」（重渲染时把节点插回新的播放器容器）
   * 这时整个 style 属性已经是**站点自己的新样式**了，照原样还原会把站点刚写
   * 的样式抹掉。于是那条路径改成**逐属性**还原：只动我们当初写过的那些属性，
   * 而且只在「当前值仍是我们写的那份」时才动 —— 站点自己后来改的值不碰。
   */
  originalInlineStyles: Map<string, InlineValue>;
  /**
   * 我们写进视频的那份内联值与优先级（浏览器归一化之后的）。
   *
   * 用来判断「这个属性现在还是不是我们写的」—— 浏览器会把 `inset: 0`
   * 归一化成 `0px`，直接拿常量比对会永远不相等。
   */
  appliedInlineStyles: Map<string, InlineValue>;
  originalControls: boolean;
  originalBodyOverflow: string;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  muted: boolean;
  /**
   * 进入全屏那一刻的媒体就绪状态。
   *
   * 用来判断「reparent 之后媒体是不是被站点弄丢了」：只有**原本有**媒体
   * （readyState > 0）而现在没了，才算丢。页面本来就没有源时 readyState
   * 一直是 0，拿它当丢失信号会把每一张空视频都误判成故障。
   */
  readyState: number;
  /** 跟着视频一起搬进 overlay 的浮层，退出时按原位放回。 */
  overlayLayers: OverlayLayer[];
}

/** 一个内联属性的值与优先级。 */
interface InlineValue {
  value: string;
  priority: string;
}

interface PlaybackSnapshot {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  muted: boolean;
}

const OVERLAY_ID = 'vsc-page-fullscreen-overlay';
const STAGE_ID = 'vsc-page-fullscreen-stage';

/**
 * 撑满画面时我们写进视频内联样式的那组属性。
 *
 * 退出时要**逐个**精确还原（见 FullscreenSnapshot.originalInlineStyles）：
 * 整块写回 style 属性会把站点在这期间自己写下的样式一起抹掉。
 */
const FULLSCREEN_LAYOUT_PROPERTIES: Record<string, string> = {
  position: 'fixed',
  inset: '0',
  margin: 'auto',
  width: '100vw',
  height: '100vh',
  'max-width': '100vw',
  'max-height': '100vh',
  'object-fit': 'contain',
  'z-index': String(VIDEO_Z_INDEX),
  background: '#000',
};

export class FullscreenController {
  private state: FullscreenSnapshot = {
    video: null,
    mode: null,
    originalParent: null,
    originalNextSibling: null,
    originalStyle: '',
    originalInlineStyles: new Map(),
    appliedInlineStyles: new Map(),
    originalControls: false,
    originalBodyOverflow: '',
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    muted: false,
    readyState: 0,
    overlayLayers: [],
  };

  private healthTimer: number | null = null;
  private controls: FullscreenControls | null = null;

  /**
   * 站点在全屏期间把视频**拿回去了**吗？
   *
   * 站点重渲染时可能把 <video> 节点插回它的新播放器容器 —— 那时视频仍然
   * connected（`video.isConnected` 挡不住这种情况），但它已经不在我们手上了。
   * 这时候再把它「还原」到原位置，等于把站点刚建好的播放器掏空。
   */
  private videoTakenBackBySite = false;

  /**
   * 「iframe 里的网页全屏」：把装着这个视频的那个 <iframe> 元素撑满顶层视口。
   *
   * 为什么它住在控制器里、而不是 runtime.ts：
   * - 进/出全屏时正是**发起与撤销**这次撑大的那一方，控制器天然知道时机；
   * - 父文档侧要处理「子 frame 请求撑大」的消息，而消息处理的落点也正是
   *   「全屏」这件事本身（撑大 = 让全屏铺满页面）；
   * - runtime.ts 正在被别的地方改动，把这块自成一体的新机制留在控制器里，
   *   两边就不会互相踩。
   */
  private readonly frameExpander = new FrameExpander();

  constructor() {
    // 父文档侧的消息监听装在这里：控制器在每个文档里都有一个（内容脚本
    // 注入到所有 frame），于是任何一个「装着别人 iframe 的文档」都能认领
    // 子 frame 的撑大请求 —— 顶层文档是其中最常见的一个。
    this.frameExpander.install();
  }

  isActive() {
    return this.state.video !== null;
  }

  getActiveVideo() {
    return this.state.video;
  }

  /**
   * 能否进入全屏。keyboardController 在吞键之前必须先问这里：跨 document
   * （同源 iframe）的视频 enter() 会失败，若先吞键再失败，用户既失去按键
   * 又得不到任何反馈。enter() 复用同一判断，避免两处守卫漂移。
   */
  canEnter(video: HTMLVideoElement | null): boolean {
    return video !== null && video.ownerDocument === document;
  }

  toggle(video: HTMLVideoElement | null, options: { focusControls?: boolean } = {}) {
    if (this.isActive()) {
      this.exit();
      return true;
    }

    if (!video) {
      return false;
    }

    return this.enter(video, options);
  }

  private ensureOverlay() {
    // SVG/foreignObject 等文档里 document.body === null，没有可挂载的宿主。
    // 此时无法提供 overlay 与控制条，只能返回 null 让 enter() 干净地放弃，
    // 绝不能裸调 document.body.appendChild 抛 TypeError。
    if (!document.body) {
      return null;
    }

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.innerHTML = `<div id="${STAGE_ID}"></div>`;
      // ⚠️ 挂到 <html> 而不是 <body>：body 带 transform 时它会变成
      // fixed 后代的包含块，背板就会铺成 body 那么高（而不是视口高），
      // 视频与控制条全部落到屏外 —— 网页全屏直接报废。
      // 详见 viewportRoot.ts。
      mountViewportRoot(overlay);
    }

    const stage = overlay.querySelector(`#${STAGE_ID}`);
    if (!(stage instanceof HTMLElement)) {
      throw new Error('Fullscreen overlay stage missing');
    }

    return { overlay, stage };
  }

  /**
   * 选择要跟着视频一起搬进 overlay 的浮层。
   *
   * 字幕（`kind === 'subtitle'`）搬：它是视频内容的一部分，离开视频就失去意义。
   * 弹幕（`kind === 'overlay'`）**不搬**：满屏弹幕比没有字幕吵得多，
   * 而且弹幕通常自带动画与自己的定位逻辑，搬进 overlay 反而容易错位。
   * 留在原地的弹幕会被 overlay 的不透明背板挡住——这正是我们想要的。
   *
   * 只在这两个分支之间做选择，不引入第三种行为：要么字幕跟着走，
   * 要么页面在背后保持原样但字幕不可见（见 `attachOverlayers` 的调用条件）。
   */
  private collectLayersToAttach(video: HTMLVideoElement): OverlayLayer[] {
    return findOverlayLayers(video).filter((layer) => layer.kind === 'subtitle');
  }

  /**
   * 把字幕层搬进 stage 里那个**与画面等大的居中容器**。
   *
   * 字幕原本靠 `position:absolute; bottom:2%` 相对**播放器容器**定位。
   * 视频在 reparent 后是 `100vw × 100vh` + `object-fit: contain`：宽高比与
   * 视口不一致时画面会等比缩放并居中，上下或左右留出黑边。若字幕直接挂在
   * 铺满视口的 stage 上，`bottom: 2%` 就是相对**视口**算的 —— 字幕会掉进
   * 黑边里，飘在画面之外（实测 16:9 视频放进 4:3 视口，字幕掉到画面下方
   * 约 130px 处）。
   *
   * 所以字幕进的是一个与**画面框等大**的容器（alignStageToVideo 负责对齐
   * 它），`bottom: 2%` 相对画面算，位置与站点里完全一致。
   *
   * ⚠️ 顺序**不足以**保证字幕可见，必须同时抬 z-index。
   *
   * 视频在 reparent 后带 z-index: 2147483643（inline !important），而字幕
   * 原本是 z-index: auto。DOM 顺序只对**同一层级**的元素决定先后，
   * 一个 auto 的定位元素仍然会输给显式高层级的视频 —— 实测字幕被 100% 盖住，
   * 满屏里一个像素都看不见。6.0.8 的变更日志写「字幕排在视频之后就不会被盖住」，
   * 这条断言在真实浏览器里是错的。
   *
   * 所以搬运时给字幕一个比视频更高的 z-index，退出时原样还原。
   */
  private attachOverlayers(stage: HTMLElement, layers: OverlayLayer[]) {
    if (layers.length === 0) {
      return;
    }

    // 字幕容器：与画面等大、居中。stage 保持铺满视口（它不能带 transform，
    // 否则会把 fixed 的视频关进去裁掉）。
    let host = stage.querySelector<HTMLElement>('[data-vsc-caption-host]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-vsc-caption-host', '');
      // 字幕容器是**定位参照物**：站点字幕的 `position:absolute; bottom:2%`
      // 相对它定位，于是 bottom 百分比相对的是画面框而不是视口。
      host.style.setProperty('position', 'relative');
      host.style.setProperty('inset', '0');
      host.style.setProperty('display', 'block');
      // ⚠️ 尺寸必须显式给 100%。
      //
      // stage 是 flex 容器（display:flex; align-items:center; justify-content:center），
      // 而 host 是它的 flex item。flex item 的宽度默认由内容决定 —— host 里
      // 只有绝对定位的字幕（不参与布局），于是 host 的内容宽度是 0，
      // **host 自身塌成 0 宽**。站点字幕写的是 `left:0; right:0`，
      // 相对于一个 0 宽的包含块 → 字幕自己的宽度也是 0 → 一个像素都看不见。
      //
      // 实测（720×405 的视频 + 100% 宽字幕）：字幕 rect 宽 0、高 196，
      // elementFromPoint 在字幕中心点返回的是视频本身。
      //
      // inset: 0 对 `position: relative` 的元素是**偏移量**而不是尺寸，
      // 它不会把 host 撑开 —— 这正是踩坑的地方。
      host.style.setProperty('width', '100%');
      host.style.setProperty('height', '100%');
      host.style.setProperty('pointer-events', 'none');
      host.style.setProperty('z-index', String(SUBTITLE_Z_INDEX));
      stage.appendChild(host);
    }

    for (const { element } of layers) {
      if (element.isConnected) {
        host.appendChild(element);
        // 字幕必须比视频（2147483643）高，才不会被它整个盖住。
        element.style.setProperty('z-index', String(SUBTITLE_Z_INDEX), 'important');
      }
    }
  }

  /**
   * 退出时把浮层放回它们原来的父节点与兄弟位置。
   *
   * @param plan 落点方案（见 RestorePlan）。
   */
  private restoreOverlayers(layers: OverlayLayer[], plan: RestorePlan) {
    for (const { element, originalParent, originalNextSibling, originalZIndex } of layers) {
      // z-index 一定要还原：字幕带着 2147483647 回到站点播放器里，
      // 会盖住站点自己的控件（音量气泡、播放按钮），退出全屏后页面就花了。
      if (originalZIndex) {
        element.style.setProperty('z-index', originalZIndex);
      } else {
        element.style.removeProperty('z-index');
      }

      // 同样要还原 transform：控制条避让时我们给字幕加过 translateY，
      // 站点自己写的 transform 必须原样保留 —— 抹掉的话，退出全屏后
      // 站点里原本居中的字幕就歪了。
      restoreSubtitleOffset(element);

      // ⚠️ 原父节点可能已经**不在文档里**了：站点在全屏期间重渲染，
      // 旧的播放器容器被丢掉。往那个游离容器里插 = 字幕从此消失
      // （节点没丢，但没人看得见）—— 那正是我们要修的故障。
      //
      // 所以：原父节点还在文档里 → 回原位；已经游离 → 退到**可见的兜底落点**
      // （与视频同一个落点，绝不让字幕单独消失）。
      const parentStillVisible = originalParent !== null && originalParent.isConnected;
      const host = parentStillVisible ? originalParent : plan.host;
      if (!host) {
        continue;
      }

      // 与视频同一个道理：全屏期间页面可能把这个节点连同它的原兄弟一起
      // 移走或重建，insertBefore 指向已脱离的节点会抛 NotFoundError
      // 打断整个退出流程，让视频永久卡在全屏里。sibling 失效就退回 append。
      const siblingStillValid =
        originalNextSibling !== null && originalNextSibling.parentNode === host;
      try {
        host.insertBefore(element, siblingStillValid ? originalNextSibling : null);
      } catch {
        // 兜底：退出全屏**必须**成功，抛出去就等于全屏退不干净
        // （overlay 残留、body 滚动锁死、isActive 卡在 true）。
      }

      // 可见性兜底：只在「我们把它放到了一个它不熟悉的位置」时做 ——
      // 站点的 CSS 可能给那个位置准备了隐藏规则，那时节点在、用户看不见，
      // 与「字幕消失」是同一种故障。
      if (!parentStillVisible) {
        this.ensureRestoredVisible(element);
      }
    }
  }

  /**
   * 可见性兜底：还原之后自检一次「这个节点是不是真的看得见」。
   *
   * 只在**兜底落点**上做：正常还原时样式是站点自己的，我们一个字都不该碰。
   */
  private ensureRestoredVisible(element: HTMLElement) {
    // 页面已经把它丢弃了 —— 不复活（复活一个没人要的节点只会多一个幽灵视频）。
    if (!element.isConnected) {
      return;
    }

    const view = element.ownerDocument.defaultView;
    if (!view) {
      return;
    }

    let style: CSSStyleDeclaration;
    try {
      style = view.getComputedStyle(element);
    } catch {
      return;
    }

    if (style.display === 'none') {
      element.style.setProperty('display', 'block', 'important');
    }
    if (style.visibility === 'hidden') {
      element.style.setProperty('visibility', 'visible', 'important');
    }
  }

  private capturePlaybackSnapshot(video: HTMLVideoElement): PlaybackSnapshot {
    return {
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      paused: video.paused,
      muted: video.muted,
    };
  }

  /**
   * 同文档内移动一个正在播放的 video 不会丢失任何播放状态（隔离实验验证过），
   * 所以搬运后绝不能无条件写回播放位置：写 currentTime（哪怕同值）会触发 seek，
   * 浏览器重新加载媒体分段 -> 可见卡顿；seek 元数据不全的媒体还会回落到 0 ->
   * 进度条跳零。因此只在状态真的丢失时补偿（例如个别站点在 reparent 时
   * 用自己的 observer 重载了媒体元素）。
   */
  private restoreIfLost(video: HTMLVideoElement, snapshot: PlaybackSnapshot) {
    // 容忍漂移：capture 到 restore 之间视频一直在播，正常漂移是几十毫秒级；
    // 超过 0.5s 才视为真的丢了播放位置。
    if (Math.abs(video.currentTime - snapshot.currentTime) > 0.5) {
      try {
        video.currentTime = snapshot.currentTime;
      } catch {
        // Best effort.
      }
    }

    if (video.playbackRate !== snapshot.playbackRate) {
      video.playbackRate = snapshot.playbackRate;
    }

    if (video.muted !== snapshot.muted) {
      video.muted = snapshot.muted;
    }

    // 这里**不需要**「用户主动暂停过」的豁免，而且加了反而是错的。
    //
    // 本函数的三处调用点（enter / fallbackToCssCover / exit）都是
    // 「拍快照 → 同步搬节点 → 立刻补偿」，中间不给用户任何插手的空隙。
    // 所以 snapshot 与 video 之间那点差异只可能来自**搬运过程本身**，
    // 而 reparent 实测不会暂停视频（搬节点派发 0 个媒体事件，
    // readyState 与 currentTime 原样保留）—— 真出现 paused 翻转，
    // 就是站点在搬运动作里动了媒体，该恢复。
    //
    // 早先这里挂着 `!this.userPaused`，而 userPaused 一旦置真就再也不会
    // 复位：用户「暂停 → 继续播 → 退出全屏」，退出时的补偿会被这条
    // 陈旧的标记永久跳过，视频卡在暂停状态。
    if (!snapshot.paused && video.paused) {
      void video.play().catch(() => {
        // Best effort.
      });
    }
  }

  private applyFullscreenLayout(video: HTMLVideoElement, mode: FullscreenMode) {
    video.classList.add('vsc-page-fullscreen-video', `vsc-page-fullscreen-video--${mode}`);
    Object.entries(FULLSCREEN_LAYOUT_PROPERTIES).forEach(([property, value]) => {
      video.style.setProperty(property, value, 'important');
    });
  }

  /**
   * 记下某组属性在**此刻**的内联值与优先级。
   *
   * 搬运前记一次（原样），写完布局再记一次（我们写下的那份）——
   * 退出时靠后者判断「这个属性现在还是不是我们写的」。
   */
  private captureInlineStyles(
    video: HTMLVideoElement,
  ): Map<string, InlineValue> {
    const styles = new Map<string, InlineValue>();
    for (const property of Object.keys(FULLSCREEN_LAYOUT_PROPERTIES)) {
      styles.set(property, {
        value: video.style.getPropertyValue(property),
        priority: video.style.getPropertyPriority(property),
      });
    }
    return styles;
  }

  /**
   * 逐属性还原我们在视频上写过的全屏布局样式。
   *
   * ⚠️ 只在「当前值仍是我们写的那份」时才还原：站点自己在这期间改过的值
   * 不能被我们覆盖回去（那是站点对新播放器的布局，不是我们的残留）。
   *
   * ⚠️ 只动**我们当初写过的那些属性**：整个 style 属性写回去会把站点
   * 在这期间写下的新样式一起抹掉。
   */
  private restoreLayoutProperties(video: HTMLVideoElement) {
    for (const property of Object.keys(FULLSCREEN_LAYOUT_PROPERTIES)) {
      const applied = this.state.appliedInlineStyles.get(property);
      if (!applied) {
        continue;
      }
      if (video.style.getPropertyValue(property) !== applied.value) {
        continue;
      }
      if (video.style.getPropertyPriority(property) !== applied.priority) {
        continue;
      }

      const original = this.state.originalInlineStyles.get(property);
      if (original && original.value) {
        video.style.setProperty(property, original.value, original.priority);
      } else {
        video.style.removeProperty(property);
      }
    }
  }

  /**
   * 视频现在还在我们自己的 stage 里吗？
   *
   * 为什么要问：`video.isConnected` 挡不住「站点把视频拿回去了」这一种情况 ——
   * 全屏时视频在我们的 overlay 里，connected 恒为 true；而站点重渲染后
   * 把节点插回它的新播放器容器时，视频同样 connected，却已经不在我们手上了。
   */
  private isInsideOurStage(node: Node): boolean {
    const stage = document.getElementById(STAGE_ID);
    return stage ? stage.contains(node) : false;
  }

  /**
   * 算好退出时的落点。
   *
   * ⚠️ 核心判据是 **`originalParent.isConnected`**，不是「非空」：
   * 站点在全屏期间重渲染会把旧的播放器容器丢掉，那个容器**非空**，
   * 却已经不在文档里了。往它里面插 = 视频与字幕从此没人看得见。
   */
  private resolveRestorePlan(): RestorePlan {
    const parent = this.state.originalParent;
    if (parent && parent.isConnected) {
      return { host: parent, fallback: false };
    }

    // 兜底落点必须是**用户看得见**的地方：body 是页面里唯一一直可见的容器。
    const body = document.body;
    if (body && body.isConnected) {
      return { host: body, fallback: true };
    }

    return { host: null, fallback: false };
  }

  /**
   * 让 stage 的尺寸对齐视频**实际显示的画面**，而不是整个视口。
   *
   * 视频是 `object-fit: contain`：宽高比与视口不一致时，画面会等比缩放并
   * **居中**，上下或左右留出黑边。此时 stage 若铺满视口，字幕的
   * `bottom: 2%` 就是相对视口算的 —— 字幕会掉进黑边里，飘在画面之外。
   *
   * 实测：16:9 的视频放进 4:3 的视口，字幕会掉到画面下方约 130px 处，
   * 用户眼里就是「全屏了，但字幕不见了 / 字幕跑到画面外面去了」。
   *
   * 所以这里按视频的固有宽高比（videoWidth/videoHeight）与视口尺寸算出
   * contain 之后的真实画面框，把 stage 收缩到那个框，字幕的定位参照物
   * 就和画面重新对齐了。
   */
  private alignStageToVideo(stage: HTMLElement, video: HTMLVideoElement) {
    const view = video.ownerDocument.defaultView ?? window;
    const viewportWidth = view.innerWidth;
    const viewportHeight = view.innerHeight;

    const naturalWidth = video.videoWidth;
    const naturalHeight = video.videoHeight;

    // 拿不到固有尺寸（媒体还没加载出来、或元数据不可用）时退回铺满视口：
    // 那时也无法算出更准的框，退回原行为比猜一个更好。
    //
    // ⚠️ 必须**显式**退回，不能只是 return。
    // 这个函数是幂等更新的：上一轮可能已经把参照物写成了具体的 px
    // （960px 之类）。换了源、元数据还没到的那一瞬间，只 return 的话
    // 参照物会停留在**旧视频**的尺寸上 —— 字幕参照的是一个已经不存在的
    // 画面框，比"按视口算"更糟。
    if (!naturalWidth || !naturalHeight) {
      const captionLayer = stage.querySelector<HTMLElement>('[data-vsc-caption-host]');
      if (captionLayer) {
        captionLayer.style.setProperty('width', '100%');
        captionLayer.style.setProperty('height', '100%');
        captionLayer.style.removeProperty('margin');
      }
      return;
    }

    const scale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;

    // ⚠️ 这里**绝不能**用 transform 居中。
    //
    // transform 会让 stage 成为其后代 `position: fixed` 元素的**包含块**。
    // 视频正是 `position: fixed; width: 100vw; height: 100vh`，一旦 stage 带上
    // transform，视频就被关进 stage 的框里并被 `overflow: hidden` 裁掉 ——
    // 实测 4:3 视频在 16:9 视口里右边整整 320px 是页面背景色，
    // 用户看到的是「全屏了但右边一条是黑的」。
    //
    // 正确做法：stage 保持 `position: absolute; inset: 0`（铺满视口），
    // 用 flex + auto margin 居中一个**固定尺寸**的子盒来承载字幕。
    //
    // 换句话说：stage 本身不动，动的应该是它**里面的字幕容器**。
    const captionLayer = stage.querySelector<HTMLElement>('[data-vsc-caption-host]');
    if (captionLayer) {
      captionLayer.style.setProperty('width', `${width}px`);
      captionLayer.style.setProperty('height', `${height}px`);
      captionLayer.style.setProperty('margin', 'auto');
    }
  }

  /** 视频的固有尺寸变化（换了清晰度、换了源）时重新对齐 stage。 */
  private readonly boundHandleMetadataChange = () => {
    const video = this.state.video;
    const stage = document.getElementById(STAGE_ID);
    if (video && stage) {
      this.alignStageToVideo(stage, video);
    }
  };

  /**
   * 视口尺寸变化时重新对齐字幕参照物。
   *
   * ⚠️ 这条监听是**必需**的，不是锦上添花。
   *
   * 字幕参照物（caption host）被写死成画面框的 px 尺寸（`alignStageToVideo`
   * 里算出来的那一组数）。而画面框是 `object-fit: contain` 的结果，取决于
   * **视口**尺寸：视口一变，画面框就变，参照物必须跟着变。
   *
   * 漏掉它的实测后果：1280×720 视口下的 4:3 视频，参照物是 960×720。
   * 把视口缩到 900×600 后画面框变成 800×600，但参照物还停在 960×720 ——
   * 字幕的 `bottom: 5%` 相对 720px 算，字幕底边落在 635px，**已经超出
   * 600px 的视口**，字幕被推到画面之外（甚至被裁掉）。
   *
   * 之前只绑了 video 自己的 `loadedmetadata` / `resize`（那是**媒体**尺寸
   * 变化），视口变化两者都不触发，所以永远对不上。
   *
   * 用 `visualViewport` 的 resize 是为了覆盖移动端地址栏收起/展开；
   * 桌面端只有 `window.resize`，但两个都挂上成本可忽略。
   */
  private readonly boundHandleViewportChange = () => {
    const video = this.state.video;
    const stage = document.getElementById(STAGE_ID);
    if (video && stage) {
      this.alignStageToVideo(stage, video);
    }
  };

  // css-cover 模式下视频留在页面自己的树里（靠 fixed + 最高 z-index 盖全屏），
  // 跨不过页面祖先的层叠上下文：transform / filter / opacity / contain /
  // position+z-index 都会在祖先上新建一个，把 fixed 视频关在里面。
  // 所以这一模式下绝不能靠 overlay 提供不透明背板——背板反而会盖住视频。
  // 视频自身已有 background:#000 与 object-fit:contain（见 applyFullscreenLayout），
  // 退化成「浮在真实页面上」依然可看。
  private applyCssCover(video: HTMLVideoElement) {
    this.applyFullscreenLayout(video, 'css-cover');
  }

  private fallbackToCssCover() {
    const video = this.state.video;
    if (!video || this.state.mode !== 'reparent' || !this.state.originalParent) {
      return;
    }

    const playbackSnapshot = this.capturePlaybackSnapshot(video);
    // 落点一次算好：视频与字幕必须落在**同一个**地方。
    const plan = this.resolveRestorePlan();
    // 浮层已经被搬进 overlay 了：回退到 css-cover 必须先把它们放回页面，
    // 否则字幕会被永久留在 overlay 里，而视频已经回到站点 DOM ——
    // 字幕从此再也不跟着视频走，且没有任何提示。
    //
    // 这里必须**立刻**还原（而不是等 release()）：视频此刻就要回到站点 DOM，
    // 字幕必须先回到它自己的容器，否则两者会短暂错位。
    this.restoreOverlayers(this.state.overlayLayers, plan);
    this.state.overlayLayers = [];
    this.restoreToOriginalSlot(video, plan);
    this.state.mode = 'css-cover';
    // 摘掉 vsc-active 即彻底 display:none（runtimeStyles.ts:4-16），一个像素都不画。
    // overlay 此刻仍在 DOM 里（只有 exit 会 remove 它），不清掉就会留下一层
    // 98% 不透明的深色背板，把可能被页面祖先压住的视频整个盖住。
    document.getElementById(OVERLAY_ID)?.classList.remove('vsc-active');
    this.applyCssCover(video);
    this.restoreIfLost(video, playbackSnapshot);
  }

  private startHealthCheck() {
    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
    }

    this.healthTimer = window.setInterval(() => {
      const video = this.state.video;
      if (!video || !video.isConnected) {
        // 页面已经把这个节点从文档里丢掉了：不能走 exit()，否则会把废弃节点
        // 重新插回它原来的父节点（originalNextSibling 也可能已被移除 → NotFoundError），
        // 还会对没人看的游离节点调 play()。这里只做清理。
        //
        // 浮层由 release() 统一还原：视频节点虽然没了，但字幕是站点自己的节点，
        // 把它留在马上要删除的 overlay 里等于让字幕凭空消失。
        this.release();
      }
    }, 500);
  }

  /**
   * 进入网页全屏。
   *
   * @param options.focusControls 是否把焦点送进控制条。
   *   **只在键盘发起时为 true** —— 焦点进控制条会让 scheduleHide 无限续期
   *   （控制条于是不再自动隐藏），那是给键盘用户的保护，不该强加给鼠标用户。
   */
  enter(video: HTMLVideoElement, options: { focusControls?: boolean } = {}) {
    if (!this.canEnter(video)) {
      return false;
    }

    if (this.state.video === video) {
      return true;
    }

    if (this.isActive()) {
      this.exit();
    }

    const overlayState = this.ensureOverlay();
    if (!overlayState) {
      return false;
    }

    const { overlay, stage } = overlayState;
    // 若页面正处于系统原生全屏（如之前点了站点自己的全屏按钮），先退出：
    // 否则后续按 ESC 会被浏览器拿去退系统全屏，keydown 不再派发给页面，
    // 我们的 overlay 盖在最上层，看起来就像“按 ESC 没反应”。
    //
    // ⚠️ 还必须退，否则「扩展的全屏」与「站点的原生全屏」会**同时存在**：
    // 原生全屏的元素被渲染在浏览器的 top layer，压在一切普通内容（包括
    // 我们的 overlay）之上。用户看到的会是站点的原生全屏 —— 而那个播放器里的
    // 视频已经被我们搬走了，屏幕上是一个黑框。
    if (document.fullscreenElement) {
      try {
        void document.exitFullscreen().catch(() => {
          // Best effort：退不掉也不该打断我们自己的全屏。
        });
      } catch {
        // 极端环境（文档不是 active）下 exitFullscreen 可能直接抛 —— 忽略。
      }
    }
    // 进入本方法前已用 canEnter() 提前 return，而所有适配器的
    // shouldTryReparent 都是同一个判断，因此这里恒为 reparent；css-cover 只在
    // fallbackToCssCover() 的回退路径上赋值。
    const mode: FullscreenMode = 'reparent';

    // 搬运浮层之前先把它们的位置记下来：collectLayersToAttach 依赖
    // getBoundingClientRect，而那时视频还没被搬走，坐标才是对的。
    const layersToAttach = this.collectLayersToAttach(video);

    // 搬运前先记下全屏布局那组属性的内联值：站点可能在全屏期间重渲染并
    // 改掉它们，退出时必须**逐属性**精确还原（见 restoreLayoutProperties）。
    const originalInlineStyles = this.captureInlineStyles(video);

    this.state = {
      video,
      mode,
      originalParent: video.parentNode,
      originalNextSibling: video.nextSibling,
      originalStyle: video.getAttribute('style') ?? '',
      originalInlineStyles,
      appliedInlineStyles: new Map(),
      originalControls: video.controls,
      originalBodyOverflow: document.body.style.overflow,
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      paused: video.paused,
      muted: video.muted,
      readyState: video.readyState,
      overlayLayers: layersToAttach,
    };

    overlay.classList.add('vsc-active');
    document.body.style.overflow = 'hidden';
    // 用我们自己的控制条取代浏览器原生控件：原生控件样式不可控，
    // 且在 reparent 后位置会跳（视频搬进了 overlay，原生 UI 不会跟过来）。
    video.controls = false;

    this.controls = new FullscreenControls(video, {
      onExit: () => this.exit(),
      // 传函数而不是快照值：180ms 探测可能把模式从 reparent 降级到 css-cover，
      // 降级后视频回到站点 DOM，点击必须交还给站点，否则一次点击被切换两次。
      ownsVideoSurface: () => this.state.mode === 'reparent' && this.state.video === video,
    });
    this.controls.mount();
    // 把焦点送进控制条 —— **只在键盘发起时**。
    //
    // 为什么：进全屏后视频接管了用户的注意力，而控制条 3 秒就自动隐藏。
    // 纯键盘用户此刻若不知道焦点在哪，Tab 会从页面开头重新遍历 ——
    // 他根本不知道自己能操作控制条。
    //
    // ⚠️ 为什么只给键盘用户：焦点进控制条后，scheduleHide() 会一直把它算作
    // 「用户正在操作」，控制条因此**不再自动隐藏**。那是保护键盘用户
    // （控制条藏了而焦点还在里面，键盘用户盯着屏幕什么也看不到），
    // 但强加给鼠标用户就违背了产品最核心的承诺「鼠标静止 3 秒后自动隐藏」。
    // 实测（真实 Chromium）：鼠标进全屏后控制条一直挂着不消失。
    if (options.focusControls) {
      this.controls.focusFirst();
    }

    const playbackSnapshot = this.capturePlaybackSnapshot(video);
    this.applyFullscreenLayout(video, 'reparent');
    // 记下**我们写下的**那一份（浏览器会归一化值，`inset: 0` 可能变成 `0px`）：
    // 退出时靠它判断「这个属性现在还是不是我们写的」。
    this.state.appliedInlineStyles = this.captureInlineStyles(video);
    stage.appendChild(video);
    // 先建字幕容器（与画面等大、居中），再对齐它 —— 顺序反了尺寸就对不上。
    this.attachOverlayers(stage, layersToAttach);
    this.alignStageToVideo(stage, video);
    // 控制条出现时要给字幕让位（两者都贴着画面底部）。
    this.controls?.setSubtitleLayers(layersToAttach);
    // 固有尺寸在媒体加载完成后才可知，loadedmetadata 之后再对齐一次。
    video.addEventListener('loadedmetadata', this.boundHandleMetadataChange);
    video.addEventListener('resize', this.boundHandleMetadataChange);
    // 视口变了，画面框就变了，字幕参照物必须跟着重新算（见 boundHandleViewportChange）。
    window.addEventListener('resize', this.boundHandleViewportChange);
    window.visualViewport?.addEventListener('resize', this.boundHandleViewportChange);
    // 站点在我们的全屏期间进原生全屏时，两层会叠在一起 —— 让位（见 boundHandleFullscreenChange）。
    document.addEventListener('fullscreenchange', this.boundHandleFullscreenChange);
    // iframe 里的视频：覆盖层与画面参照的都是**iframe 自己的视口**，
    // 只有请父文档把那个 iframe 元素撑满顶层视口，网页全屏才名副其实。
    //
    // ⚠️ 放在监听器注册**之后**：撑大会改变 iframe 的视口尺寸，随之而来
    // 的 resize 事件必须有人接（字幕参照物要按新的画面框重算）。
    this.frameExpander.setOwnFullscreen(true);
    this.restoreIfLost(video, playbackSnapshot);

    window.setTimeout(() => {
      if (!this.state.video || this.state.video !== video || this.state.mode !== 'reparent') {
        return;
      }

      const rect = video.getBoundingClientRect();
      const lostPlaybackPosition = this.state.currentTime > 0.5 && video.currentTime < 0.1;
      // ⚠️ 「媒体没了」只能看 readyState，**不能看 paused**。
      //
      // reparent 本身一个媒体事件都不发、readyState 与 currentTime 原样保留
      // （实测：搬节点前后都是 readyState=4 / t=0.26）。真正会让媒体消失的是
      // 站点在我们的 180ms 窗口里调用 load() —— 实测派发
      // `abort` → `emptied` → `loadstart`，readyState 从 4 掉到 0。
      //
      // 早先这里用的是 `!state.paused && video.paused`，把「暂停」当成
      // 「媒体丢了」。可是**用户按暂停**同样会把 paused 变 true，而且完全
      // 不改变 readyState —— 于是每个「进全屏后顺手按了空格/点了画面」的用户
      // 都会在 180ms 后被悄悄降级成 css-cover：视频从满屏弹回页面原位、
      // 我们的控制条消失、点击也不再归我们处理。用户看到的是
      // 「全屏挺好的，停一下之后自己退出了，然后再点画面没反应」。
      //
      // `readyState > 0` 这个前提同样必需：页面本来就没有源的 <video>
      // （占位符、还没挂 src）readyState 恒为 0，不加前提会把它们全部误判。
      const lostMedia = this.state.readyState > 0 && video.readyState === 0;
      const lostLayout = rect.width < 32 || rect.height < 32 || !stage.contains(video);

      if (lostPlaybackPosition || lostMedia || lostLayout) {
        this.fallbackToCssCover();
      }
    }, 180);

    this.startHealthCheck();
    return true;
  }

  // 只清理、不碰视频在页面里的位置。给「节点已经不在文档里」的路径用：
  // 还原 class/style/controls 对游离节点是 no-op，无副作用。
  private release() {
    // ⚠️ 必须在最前面：撑大与还原必须**成对**。
    // 父文档那边被撑大的 iframe 元素若不还原，用户页面就被永久改成
    // 「一个巨大的 iframe」，而且顶层页面再也滚不动。
    // 放在最前面是因为这一行在「视频已经被页面丢弃」（state.video 为 null）
    // 的路径上也要执行 —— 那条路径同样需要把撑大撤销掉。
    this.frameExpander.setOwnFullscreen(false);
    // 同样必须无条件卸掉：监听器在 enter() 里注册，release() 是它的对称操作。
    document.removeEventListener('fullscreenchange', this.boundHandleFullscreenChange);

    const video = this.state.video;
    if (!video) {
      return;
    }

    this.controls?.unmount();
    this.controls = null;

    // 浮层还原收在这里，而不是散在各个调用点。
    //
    // 字幕是**站点自己的节点**，不是我们的：把它留在马上要删除的 overlay 里，
    // 等于让字幕凭空消失 —— 用户退出全屏后页面上再也看不到字幕，而且
    // 没有任何报错。之前有三处调用点各自手动还原浮层，其中两处忘了，
    // 于是「退出后字幕不见了」是一个真实发生过的 bug。
    //
    // 还原必须先于删除 overlay：字幕要回到它的原父节点（原站点播放器容器），
    // 而不是留在 overlay 里。
    this.restoreOverlayers(this.state.overlayLayers, this.resolveRestorePlan());
    this.state.overlayLayers = [];

    // 摘掉元数据监听：视频已经交回站点，它再改尺寸不该再牵动我们的 stage。
    video.removeEventListener('loadedmetadata', this.boundHandleMetadataChange);
    video.removeEventListener('resize', this.boundHandleMetadataChange);
    window.removeEventListener('resize', this.boundHandleViewportChange);
    window.visualViewport?.removeEventListener('resize', this.boundHandleViewportChange);

    video.classList.remove('vsc-page-fullscreen-video', 'vsc-page-fullscreen-video--reparent', 'vsc-page-fullscreen-video--css-cover');
    video.controls = this.state.originalControls;
    if (this.videoTakenBackBySite && video.isConnected) {
      // 站点把视频拿回去了 → 只撤掉**我们**写的那几个属性，
      // 站点自己在这期间写下的样式一个字都不碰。
      this.restoreLayoutProperties(video);
    } else {
      video.setAttribute('style', this.state.originalStyle);
    }

    document.getElementById(OVERLAY_ID)?.remove();
    // 正常情况下 body 必然存在（enter 已用 ensureOverlay 守过）；这里额外
    // 判空只为兜住「全屏中途文档把 body 移除」的极端情况，不让退出流程中断。
    if (document.body) {
      document.body.style.overflow = this.state.originalBodyOverflow;
    }

    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    this.videoTakenBackBySite = false;
    this.state = {
      video: null,
      mode: null,
      originalParent: null,
      originalNextSibling: null,
      originalStyle: '',
      originalInlineStyles: new Map(),
      appliedInlineStyles: new Map(),
      originalControls: false,
      originalBodyOverflow: '',
      currentTime: 0,
      playbackRate: 1,
      paused: true,
      muted: false,
      readyState: 0,
      overlayLayers: [],
    };
  }

  // sibling 守卫：全屏期间页面可能把 originalNextSibling 移走了（重排 DOM），
  // 此时 insertBefore(video, 已脱离的节点) 会抛 NotFoundError 打断流程，
  // 让视频卡死在 overlay、body 滚动锁死。sibling 不再是原父节点的孩子时改用 append。
  private restoreToOriginalSlot(video: HTMLVideoElement, plan: RestorePlan) {
    const host = plan.host;
    if (!host) {
      return;
    }

    // sibling 守卫：全屏期间页面可能把 originalNextSibling 移走了（重排 DOM），
    // 此时 insertBefore(video, 已脱离的节点) 会抛 NotFoundError 打断流程，
    // 让视频卡死在 overlay、body 滚动锁死。sibling 不再是落点的孩子时改用 append。
    const sibling = this.state.originalNextSibling;
    const siblingStillValid = sibling !== null && sibling.parentNode === host;
    try {
      host.insertBefore(video, siblingStillValid ? sibling : null);
    } catch {
      // 兜底：退出全屏**必须**成功 —— 抛出去就等于全屏退不干净。
    }
  }

  /**
   * 站点在**我们**的全屏期间进了原生全屏 → 两层会叠在一起。
   *
   * 原生全屏的元素被渲染在浏览器的 top layer，压在一切普通内容之上，
   * 于是用户看到的是站点的原生全屏 —— 而那个播放器里的视频已经被我们搬走了，
   * 屏幕上是一个黑框。
   *
   * 站点主动进原生全屏是用户的明确手势（点了站点自己的全屏按钮），
   * 与其跟它抢，不如让位：退出我们的网页全屏，把视频还给站点，
   * 站点的原生全屏于是能正常显示。
   *
   * ⚠️ 只在 `document.fullscreenElement` **非空**时才动：我们自己进全屏时
   * 主动调用 exitFullscreen() 也会触发这个事件（那时 fullscreenElement 是 null），
   * 不区分的话，我们刚进全屏就会立刻把自己退掉。
   */
  private readonly boundHandleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      return;
    }
    if (!this.isActive()) {
      return;
    }

    // ⚠️ 绝不能在这里退掉原生全屏：那是站点自己的全屏，用户要的是它。
    // 让位的方式是退出**我们**的全屏（exit 里不会碰原生全屏）。
    this.exit();
  };

  exit() {
    const video = this.state.video;
    if (!video) {
      return;
    }

    // 落点一次算好，视频与字幕必须落在**同一个**地方 ——
    // 否则会出现「视频回到页面、字幕留在 overlay」这种半吊子状态。
    const plan = this.resolveRestorePlan();

    // 还原顺序：浮层先、视频后。
    //
    // 字幕原本就排在视频后面（`video, subtitle, …`），所以视频记录的
    // originalNextSibling 正是字幕本身。若先还原视频，`insertBefore(video, 字幕)`
    // 会把字幕顶到视频**前面** —— 页面上看不出异样，但字幕从此不再跟随视频，
    // 而且没有任何报错。先把字幕按自己的原位放回去，再还原视频，
    // 视频的 originalNextSibling 校验就会因为字幕已归位而正确落位。
    //
    // 这里必须**先**还原浮层：下面的 restoreToOriginalSlot 依赖
    // originalNextSibling 仍然有效，而字幕就是那个 sibling。
    // release() 里还有一次还原，那是给「没走 exit() 的路径」兜底的 ——
    // 它看到 overlayLayers 已空就不会重复动作。
    this.restoreOverlayers(this.state.overlayLayers, plan);
    this.state.overlayLayers = [];

    if (this.state.mode === 'reparent' && this.state.originalParent) {
      const playbackSnapshot = this.capturePlaybackSnapshot(video);

      // isConnected 守卫：页面若已把视频连同 originalNextSibling 一起丢弃，
      // 插回去要么插入一张已经被页面丢弃的节点，要么直接抛 NotFoundError 让退出流程中断。
      if (video.isConnected) {
        if (this.isInsideOurStage(video)) {
          // 我们还占着它 → 必须把它还给站点。
          this.restoreToOriginalSlot(video, plan);
          this.restoreIfLost(video, playbackSnapshot);
        } else {
          // 站点已经把视频拿回去了（重渲染时插回了它的新播放器容器）。
          //
          // ⚠️ 千万别再动它的位置：把它从站点刚建好的播放器里拔出来，
          // 等于把站点的新播放器掏空 —— 那正是「站点变成空壳」的做法。
          // 位置一个字都不碰，只在 release() 里撤掉我们写在它身上的样式。
          this.videoTakenBackBySite = true;
        }
      }
    }

    // 可见性兜底：只在**兜底落点**上做（正常还原时样式是站点自己的，不能碰）。
    if (plan.fallback && video.isConnected) {
      this.ensureRestoredVisible(video);
    }

    this.release();
  }

destroy() {
  this.exit();
  // 卸掉父文档侧的监听器，并把还撑大着的 iframe 元素全部还原。
  // （exit() 覆盖的是「我们自己还在全屏」这条路径；这里兜住
  //  「我们自己没在全屏、但某个子 frame 的请求还挂着」的情况。）
  this.frameExpander.uninstall();
}
}
