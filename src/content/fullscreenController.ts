import { observeBody, type BodyObserver } from './bodyObserver';
import { FullscreenControls } from './fullscreenControls';
import { FULLSCREEN_VIDEO_CLASS } from './fullscreenSession';
import { FrameExpander } from './iframeExpansion';
import { findOverlayLayers, findOverlayLayersIn, OverlayLayer } from './overlayLayers';
import { restoreSubtitleOffset } from './subtitleOffset';
import {
  isolateFullscreenOverlay,
  setOverlayActive,
  SUBTITLE_Z_INDEX,
  VIDEO_Z_INDEX,
} from './runtimeStyles';
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
  /**
   * 全屏布局那组属性在**搬运前**的内联值与优先级。
   *
   * ⚠️ 为什么退出时只能**逐属性**还原，不能把整个 style 属性写回去：
   * 站点在全屏期间会往视频上写它自己的样式（滤镜、圆角、Video.js 那种
   * width/height/left/top）。整块写回会把这些**统统抹掉** ——
   * 用户退出全屏后看到的是「播放器样式整个被重置了」。
   *
   * 所以：只动我们当初写过的那些属性，而且只在「当前值仍是我们写的那份」
   * 时才动 —— 站点自己后来改的值一个字都不碰。
   */
  originalInlineStyles: Map<string, InlineValue>;
  /**
   * 我们写进视频的那份内联值与优先级（浏览器归一化之后的）。
   *
   * 用来判断「这个属性现在还是不是我们写的」—— 浏览器会把 `inset: 0`
   * 归一化成 `0px`，直接拿常量比对会永远不相等。
   */
  appliedInlineStyles: Map<string, InlineValue>;
  /**
   * 进全屏那一刻，视频在页面里的位置。
   *
   * 用途只有一个：**晚到的字幕**要靠它当参照框。
   * 字幕是相对播放器容器定位的，进全屏后视频被搬进我们的 stage，
   * 拿满屏的视频框去比，覆盖率与重心那几条判据全都不成立。
   */
  originalVideoRect: DOMRect | null;
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
    originalInlineStyles: new Map(),
    appliedInlineStyles: new Map(),
    originalVideoRect: null,
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
   * 「这一轮全屏会话结束了」的通知。
   *
   * ⚠️ 为什么必须有它，而且必须由控制器来发：
   *
   * 全屏会话有**若干条**结束路径 —— 控制条上的退出钮、Esc、站点把视频
   * 拿回去了、站点把我们的背板摘了 —— 而「我们还在接管这个视频」这件事
   * 在注册表那边**也有一份**。以前只有 Esc 那条路径会去通知注册表，
   * 于是从控制条的退出钮退出之后，注册表仍然以为「我们接管着这个视频」：
   * - 点工具栏图标 → 注册表把**那个已经退出全屏**的视频交回去（错的视频）；
   * - 按空格 → 注册表认为那个视频是「我们自己接管的」，于是不再把它当成
   *   页面预览，空格被它吃掉，页面翻不动了。
   *
   * 而在**第二个调用点**补一行通知是治标不治本：下一条退出路径还会漏。
   * 所以出口只有一个 —— release()，也就是「会话真正结束」的那一处。
   * 谁触发的退出**不重要**，重要的是会话结束了。
   */
  private readonly onSessionEnd: (() => void) | undefined;

  /**
   * 「这一轮全屏会话正在进行」。
   *
   * ⚠️ 它存在的唯一理由：让「会话结束」的通知**恰好一次**。
   *
   * release() 有一条「state.video 为空就提前返回」的路径 —— 那条路径
   * 只会发生在**第二次** release()（第一次已经把 state 清空了），
   * 而那时会话**早就结束过了**。如果通知直接写在 release() 的末尾，
   * 第二次 release() 就会再通知一次。
   */
  private sessionActive = false;

  /**
   * 我们自己挂上去的那块全屏背板。
   *
   * ⚠️ 为什么必须留着这个引用（而不是每次用 `getElementById` 重新找）：
   * 背板被站点摘掉之后，它在**文档里**就查不到了 ——
   * `document.getElementById('vsc-page-fullscreen-overlay')` 会返回 null。
   * 而「背板还在不在」正是判断「视频是不是被站点一起带走了」的唯一依据，
   * 判据不能建立在「文档里还能不能找到它」之上。
   *
   * 这个引用指向那棵**游离的树**，游离树上 `contains()` 照样成立 ——
   * 于是「视频还在不在我们手上」这个问题，在背板脱文档之后依然答得出来。
   */
  private overlayElement: HTMLElement | null = null;

  /**
   * 盯着「站点把我们的背板摘掉了」的观察器。
   *
   * 观察点是 **<html> 的直接子节点**（见 bodyObserver.ts 的说明）：
   * 背板正是 <html> 的直接子节点（viewportRoot.ts），站点把它摘掉时
   * 这一层才会收到通知 —— 而且这一层**不喂给 body 回调**，
   * 所以只能显式订 `onHostMutation`。
   */
  private hostWatcher: BodyObserver | null = null;

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

  /**
   * 盯着「站点在进全屏之后才把字幕放进来」。
   *
   * ⚠️ 为什么不能只在 enter() 里取一次快照：
   * 字幕轨道是**异步加载**的（也可能中途换语言、换清晰度而重建字幕层）。
   * 进全屏那一刻字幕往往还不存在 —— 那一瞬间取到的浮层列表是空的，
   * 于是后来出现的字幕永远留在站点的播放器容器里，被我们的不透明背板
   * 整个盖住。用户看到的是「一按 f 字幕就没了」。
   *
   * ⚠️ 为什么不做「每次 DOM 变化都全量重扫」：
   * 全量重扫 = 遍历整棵子树并逐个量几何，在信息流页面上每秒几十次，
   * 而收益只在于「字幕层刚出现或刚被填上文字」这一种变化。
   * 这里只盯**站点播放器容器**这一棵小树，而且只在「有可能是字幕的变化」
   * 时才重扫（已经搬进 stage 的字幕层内部的文字变化直接跳过 ——
   * 那种变化每秒能来几十次，而重扫它什么也找不到）。
   */
  private layerWatcher: MutationObserver | null = null;
  private layerProbeTimer: number | null = null;

  constructor(options: { onSessionEnd?: () => void } = {}) {
    this.onSessionEnd = options.onSessionEnd;
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
    const created = !overlay;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.innerHTML = `<div id="${STAGE_ID}"></div>`;
    }

    const stage = overlay.querySelector(`#${STAGE_ID}`);
    if (!(stage instanceof HTMLElement)) {
      throw new Error('Fullscreen overlay stage missing');
    }

    // ⚠️ 隔离必须**在挂上页面之前**做完：背板与舞台都是挂在页面里的普通
    // 节点，站点一条 `html > div { display: none !important }` 就能打掉它们
    // （实测症状：视频回退成 css-cover、页面滚动锁死，却没有控制条与退出按钮）。
    // 内联 !important 赢过任何作者 !important —— 机制见 runtimeStyles.ts。
    //
    // ⚠️ 每次都重做一遍（不只在新建时）：背板可能已经存在于 DOM 里
    // （上一轮全屏的遗留），站点也可能已经改过它的内联样式。
    isolateFullscreenOverlay(overlay, stage);

    // 舞台要能接住焦点：键盘进全屏时焦点落在它上面（而不是控制条里）。
    //
    // ⚠️ 为什么焦点不能留在控制条里：
    // 1. 焦点在控制条里 →「焦点在里面就别藏控制条」那条守卫恒真 →
    //    控制条**永远不消失**（屏幕上永远留着一整条控制条，挡住字幕与画面）；
    // 2. 扩展的键盘拦截按**事件路径**判定，路径里有 #vsc-controls 就把
    //    空格与方向键让给自己的控件 → 键盘用户的播放/暂停与快进全废。
    //
    // 舞台在 `#vsc-controls` **之外**（它是 overlay 里的元素），
    // 两条毛病都不成立；而且它与控制条宿主在 <html> 里前后相邻，
    // 一次 Tab 就能落到「永远在的退出入口」。
    //
    // tabindex="-1" = 可以被程序聚焦，但**不进 Tab 序列**：
    // 舞台不是交互控件，用户不该在 Tab 遍历时停在它上面。
    stage.tabIndex = -1;

    if (created) {
      // ⚠️ 挂到 <html> 而不是 <body>：body 带 transform 时它会变成
      // fixed 后代的包含块，背板就会铺成 body 那么高（而不是视口高），
      // 视频与控制条全部落到屏外 —— 网页全屏直接报废。
      // 详见 viewportRoot.ts。
      mountViewportRoot(overlay);
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
   * 站点播放器容器 —— 字幕层的落点。
   *
   * ⚠️ 为什么每次都要重新取：`originalParent` 可能是 ParentNode（类型上），
   * 而观察器的观察目标必须是 **Node**。这里做一次收窄，
   * 免得把「不是节点」的东西喂给 MutationObserver（会抛 TypeError）。
   */
  private layerHost(): (ParentNode & Node) | null {
    const parent = this.state.originalParent;
    return parent instanceof Node ? parent : null;
  }

  /** 我们的 stage（字幕要搬进去的那个容器）。 */
  private getStage(): HTMLElement | null {
    const stage =
      this.overlayElement?.querySelector(`#${STAGE_ID}`) ?? document.getElementById(STAGE_ID);
    return stage instanceof HTMLElement ? stage : null;
  }

  /**
   * 开始盯着「站点后来才放进来的字幕层」。
   *
   * ⚠️ 观察点是**站点播放器容器**（视频原来的父节点），不是整棵文档：
   * 字幕插件几乎总是把字幕挂在播放器容器里（它要相对视频定位），
   * 而盯整棵文档等于「每次 DOM 变化都全量重扫」——
   * 信息流页面上那是每秒几十次全页几何测量。
   */
  private startLayerWatch() {
    this.stopLayerWatch();
    const host = this.layerHost();
    if (!host) {
      return;
    }

    this.layerWatcher = new MutationObserver((records) => {
      for (const record of records) {
        if (this.mayAffectLayers(record)) {
          this.scheduleLayerProbe();
          return;
        }
      }
    });
    this.layerWatcher.observe(host, {
      childList: true,
      // 字幕层「本来就在，只是后来被填上文字」也要看得见：
      // characterData 必须配 subtree 才看得到更深处的文本节点。
      subtree: true,
      characterData: true,
    });
  }

  private stopLayerWatch() {
    this.layerWatcher?.disconnect();
    this.layerWatcher = null;
    if (this.layerProbeTimer !== null) {
      window.clearTimeout(this.layerProbeTimer);
      this.layerProbeTimer = null;
    }
  }

  /**
   * 这次 DOM 变化**有可能**带来新的字幕层吗？
   *
   * 已经搬进 stage 的字幕层内部发生的文字变化（每换一句字幕就来一次）
   * 不算 —— 那种变化每秒能来几十次，而重扫它什么也找不到。
   */
  private mayAffectLayers(record: MutationRecord): boolean {
    const attached = this.state.overlayLayers;
    const insideAttached = (node: Node | null): boolean => {
      let current: Node | null = node;
      while (current) {
        for (const layer of attached) {
          if (layer.element === current) {
            return true;
          }
        }
        current = current.parentNode;
      }
      return false;
    };

    if (record.type === 'characterData') {
      // 文字变了：它所在的那个元素是不是已经搬进来了？
      return !insideAttached(record.target);
    }

    // 节点增删：新增的节点是不是已经搬进来了？
    for (const node of record.addedNodes) {
      if (!insideAttached(node)) {
        return true;
      }
    }
    return false;
  }

  /** 把重扫合并成一次（站点常常一口气改好几处）。 */
  private scheduleLayerProbe() {
    if (this.layerProbeTimer !== null) {
      return;
    }
    this.layerProbeTimer = window.setTimeout(() => {
      this.layerProbeTimer = null;
      this.probeOverlayLayers();
    }, 50);
  }

  /**
   * 重扫一次浮层，把**新出现的字幕**搬进 stage。
   *
   * ⚠️ 参照框用的是**进全屏前**那个视频框（originalVideoRect）：
   * 字幕是相对播放器容器定位的，拿满屏的视频框当参照，
   * 覆盖率与重心那几条判据全都不成立 —— 晚到的字幕于是永远搬不进来。
   */
  private probeOverlayLayers() {
    const video = this.state.video;
    const host = this.layerHost();
    const reference = this.state.originalVideoRect;
    if (!video || !host || !reference) {
      return;
    }
    // 站点把播放器容器整个换掉了（重渲染）：我们认识的落点已经没了，
    // 再探也是白探（那个容器里的东西已经不是这个视频的字幕了）。
    if (!host.isConnected) {
      return;
    }

    const stage = this.getStage();
    if (!stage) {
      return;
    }

    const fresh = findOverlayLayersIn(host, video, reference)
      .filter((layer) => layer.kind === 'subtitle')
      .filter(
        (layer) =>
          !this.state.overlayLayers.some((existing) => existing.element === layer.element),
      );
    if (fresh.length === 0) {
      return;
    }

    this.attachOverlayers(stage, fresh);
    this.state.overlayLayers.push(...fresh);
    // 控制条要为新来的字幕让位（控制条与字幕都贴着画面底部）。
    this.controls?.setSubtitleLayers(this.state.overlayLayers);
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
    // ⚠️ 用 fullscreenSession.ts 导出的那一份常量，不写字符串：
    // 角标与引导读的就是它，两边对不上这套机制会**静默**失效。
    video.classList.add(FULLSCREEN_VIDEO_CLASS, `vsc-page-fullscreen-video--${mode}`);
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
   * 这个节点现在还在**我们**手上吗？
   *
   * 为什么要问：`video.isConnected` 挡不住「站点把视频拿回去了」这一种情况 ——
   * 全屏时视频在我们的 overlay 里，connected 恒为 true；而站点重渲染后
   * 把节点插回它的新播放器容器时，视频同样 connected，却已经不在我们手上了。
   *
   * ⚠️ 判据必须用**我们手里那个背板元素的引用**，不能用
   * `document.getElementById(STAGE_ID)`：
   * 背板被站点摘掉之后，那个 id 在文档里就查不到了 ——
   * 于是「视频还在 stage 里」会被误判成「站点把视频拿回去了」。
   * 而这两件事的处理方式**完全相反**：
   * 前者要把视频**还给站点**（它是我们带走的），后者一个字都不能碰
   * （动了就等于把站点刚建好的播放器掏空）。
   */
  private isInsideOurOverlay(node: Node): boolean {
    if (this.overlayElement) {
      return this.overlayElement.contains(node);
    }
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

    // ⚠️ 视频已经不连着文档 —— 先分清**是谁**造成的，别急着把它插回去：
    //
    // - 我们的**背板**也不在文档里了 → 背板带着视频一起脱了文档。
    //   那是「站点摘掉背板」，该把视频**还给站点**（走恢复路径），
    //   而不是降级成 css-cover —— 那样视频会以 fixed 铺满视口，
    //   页面上看着根本不像「回到了原来的位置」。
    // - 背板还在 → 站点把**视频**丢了 → 复活它是错的（见下）。
    //
    // ⚠️ 这一档以前是「照常降级」的：restoreToOriginalSlot 会把站点
    // 已经丢弃的节点插回页面（页面上多一个没人要的幽灵视频），
    // 还会对着没人看的游离节点调 play()。
    if (!video.isConnected) {
      if (this.overlayElement && !this.overlayElement.isConnected) {
        this.recoverDetachedOverlay();
        return;
      }
      this.release();
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
    // 摘掉 vsc-active 并把内联 display 写成 none，一个像素都不画。
    // overlay 此刻仍在 DOM 里（只有 exit 会 remove 它），不清掉就会留下一层
    // 98% 不透明的深色背板，把可能被页面祖先压住的视频整个盖住。
    //
    // ⚠️ display 必须**内联写**：样式表里的 `.vsc-active { display: block }`
    // 只是普通作者声明，撤掉 class 未必能让背板真的消失
    // （站点一条 `html > div { display: block !important }` 就能把它钉住）。
    const overlayElement = document.getElementById(OVERLAY_ID);
    if (overlayElement) {
      setOverlayActive(overlayElement, false);
    }
    this.applyCssCover(video);
    this.restoreIfLost(video, playbackSnapshot);
  }

  private startHealthCheck() {
    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
    }

    this.healthTimer = window.setInterval(() => {
      const video = this.state.video;
      if (!video) {
        // 已经收摊了（退出/释放都会把这个定时器清掉，这里只是兜底）。
        return;
      }

      // 我们的**背板**被站点摘掉了 → 视频可能被它一起带离了文档。
      // （这条以前排在「视频连不连着文档」之后，于是「站点先摘背板、
      //   再把视频搬走」这种顺序会被漏掉，扩展卡在半脱离状态。）
      if (this.overlayElement && !this.overlayElement.isConnected) {
        this.recoverDetachedOverlay();
        return;
      }

      // ⚠️ 「视频已经不在我们的 stage 里」—— 站点把视频**拿回了它自己的容器**。
      //
      // 这一条以前没有（健康检查只在 `!video.isConnected` 时才动手），
      // 于是站点重渲染（切清晰度、换播放列表、插广告）把 <video> 插回
      // 它的新容器时，扩展卡在一个**半脱离**状态：
      //   - 视频已经不在 stage 里，却仍被钉成视口大小
      //     （站点 320×180 的容器里浮着一个 1280×900 的 position:fixed 元素）；
      //   - 不透明背板还盖着整页；
      //   - body 的滚动锁死没解。
      // 页面在用户按 Esc 之前完全不可用，而且没有任何提示。
      //
      // 收摊方式：release() —— 只清理、**不搬运**。
      // 视频是站点自己放回去的，再把它搬到「原位置」等于把站点刚建好的
      // 播放器掏空（见 exit() 里那条「千万别再动它的位置」）。
      if (this.state.mode === 'reparent' && !this.isInsideOurOverlay(video)) {
        this.release();
        return;
      }

      if (video.isConnected) {
        return;
      }

      // 视频不在文档里了 —— 但要分清**是谁**造成的：
      //
      // - 我们的**背板**被摘了 → 视频是被**我们**带走的（它还在背板里），
      //   应该还给站点，否则用户的视频从此人间蒸发；
      // - 视频自己被站点丢掉了 → 只做清理。
      //
      // ⚠️ 以前这两种情况都走 release()（只清理、不搬运），
      // 于是「站点摘掉背板」时用户的视频**从此人间蒸发，而且再也回不来**。
      //
      // 页面已经把这个节点从文档里丢掉了：不能走 exit()，否则会把废弃节点
      // 重新插回它原来的父节点（originalNextSibling 也可能已被移除 → NotFoundError），
      // 还会对没人看的游离节点调 play()。这里只做清理。
      //
      // 浮层由 release() 统一还原：视频节点虽然没了，但字幕是站点自己的节点，
      // 把它留在马上要删除的 overlay 里等于让字幕凭空消失。
      this.release();
    }, 500);
  }

  /**
   * 开始盯着「我们的背板是不是还在文档里」。
   *
   * ⚠️ 观察点必须是 **<html> 的直接子节点**：背板挂在 <html> 上
   * （viewportRoot.ts），站点把它摘掉时这一层才会响。
   * 而这一层**不喂给 body 回调**（bodyObserver 的设计如此），
   * 所以只能显式订 `onHostMutation`。
   */
  private startHostWatch() {
    this.stopHostWatch();
    this.hostWatcher = observeBody({
      // 只看 body 的**直接子节点**：我们要的信号来自 <html> 那一层，
      // body 里塞什么都不与全屏有关。
      bodyInit: { childList: true },
      onHostMutation: () => this.reconcileOverlayMount(),
    });
  }

  private stopHostWatch() {
    this.hostWatcher?.disconnect();
    this.hostWatcher = null;
  }

  /**
   * 背板还在不在文档里？
   *
   * 站点把背板摘掉时，**我们带走的视频也跟着消失了** ——
   * 它还好好地待在 stage 里（我们还没放手），只是整块背板脱离了文档。
   * 这时候必须把它还给站点：否则用户的视频从此人间蒸发，
   * 而且再也回不来（release() 只做清理，不会把节点插回去）。
   */
  private reconcileOverlayMount() {
    const overlay = this.overlayElement;
    const video = this.state.video;
    if (!overlay || !video) {
      return;
    }
    if (overlay.isConnected) {
      // 背板还在 —— 站点只是动了 <html> 的其它子节点。
      return;
    }
    this.recoverDetachedOverlay();
  }

  /**
   * 背板被站点摘掉了 —— 收摊，把视频还给站点。
   *
   * 三种情况，分得很清楚：
   *
   * 1. **视频还在我们的背板里**（`overlay.contains(video)`）：
   *    视频是**我们**带走的，它只是跟着背板一起脱离了文档。
   *    → 必须把它插回 originalParent —— 用户还要接着看。
   * 2. **视频还连着文档，但不在我们的背板里**：
   *    站点重渲染时把视频拿回了它的新播放器容器。
   *    → 一个字都别碰（动了就等于把站点刚建好的播放器掏空）。
   * 3. **视频不连着文档，也不在我们的背板里**：
   *    站点自己把视频丢了。
   *    → 不复活（复活一个没人要的节点只会多一个幽灵视频），只做清理。
   */
  private recoverDetachedOverlay() {
    const overlay = this.overlayElement;
    const video = this.state.video;
    if (!overlay || !video) {
      return;
    }

    const plan = this.resolveRestorePlan();

    if (overlay.contains(video)) {
      // 情况 1：视频是我们带走的 → 还给站点。
      const playbackSnapshot = this.capturePlaybackSnapshot(video);

      // 字幕先回原位：字幕也是**站点自己的节点**，同样被背板带走了。
      // 顺序不能反 —— 视频的 originalNextSibling 往往就是它，
      // 字幕先归位，那次 insertBefore 才会落对位置（见 exit() 的说明）。
      this.restoreOverlayers(this.state.overlayLayers, plan);
      this.state.overlayLayers = [];

      // 视频回原位。
      //
      // ⚠️ 顺序要紧：先插回去，它才重新连着文档；之后 restoreIfLost 才敢
      // 调 play() —— 游离节点上的 play() 毫无意义（用户看不见），
      // 连着文档之后才有意义。
      this.restoreToOriginalSlot(video, plan);
      if (plan.fallback) {
        this.ensureRestoredVisible(video);
      }
      this.restoreIfLost(video, playbackSnapshot);
      this.release();
      return;
    }

    // 情况 2 / 3：视频已经不在我们手上了 —— 只做清理，绝不搬运。
    this.release();
  }

  /**
   * 进入网页全屏。
   *
   * @param options.focusControls 是否把焦点送进全屏的落点（播放器表面）。
   *   **只在键盘发起时为 true** —— 纯键盘用户需要知道焦点在哪，
   *   而鼠标用户没在用键盘，把焦点抢进全屏只会让他原来的输入目标丢掉。
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
    // 留住背板的引用：它被站点摘掉之后，文档里就再也找不到了，
    // 而「背板还在不在」是我们判断「视频是不是被一起带走了」的唯一依据。
    this.overlayElement = overlay;
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

    // 同一个时刻把视频在页面里的位置记下来：晚到的字幕要靠它当参照框
    // （字幕是相对播放器容器定位的，拿满屏的视频框去比，判据全都不成立）。
    const originalVideoRect = video.getBoundingClientRect();

    // 搬运前先记下全屏布局那组属性的内联值：站点可能在全屏期间重渲染并
    // 改掉它们，退出时必须**逐属性**精确还原（见 restoreLayoutProperties）。
    const originalInlineStyles = this.captureInlineStyles(video);

    this.state = {
      video,
      mode,
      originalParent: video.parentNode,
      originalNextSibling: video.nextSibling,
      originalInlineStyles,
      appliedInlineStyles: new Map(),
      originalVideoRect,
      originalControls: video.controls,
      originalBodyOverflow: document.body.style.overflow,
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      paused: video.paused,
      muted: video.muted,
      readyState: video.readyState,
      overlayLayers: layersToAttach,
    };
    // 会话开始：这一次全屏要有一个「结束」通知等着它。
    this.sessionActive = true;

    // ⚠️ class 与内联 display 必须**一起**切：class 只能改样式表里的规则，
    // 而那是普通作者声明 —— 站点的 `html > div { display: none !important }`
    // 赢。setOverlayActive 两者都管（class 是「此刻在全屏」的标记，
    // 单测与 e2e 都按它判断）。
    setOverlayActive(overlay, true);
    document.body.style.overflow = 'hidden';
    // 用我们自己的控制条取代浏览器原生控件：原生控件样式不可控，
    // 且在 reparent 后位置会跳（视频搬进了 overlay，原生 UI 不会跟过来）。
    video.controls = false;

    this.controls = new FullscreenControls(video, {
      onExit: () => this.exit(),
      // 传函数而不是快照值：180ms 探测可能把模式从 reparent 降级到 css-cover，
      // 降级后视频回到站点 DOM，点击必须交还给站点，否则一次点击被切换两次。
      ownsVideoSurface: () => this.state.mode === 'reparent' && this.state.video === video,
      // 焦点的休息位 = 播放器表面。控制条不持有焦点时焦点就待在这里。
      restingTarget: stage,
    });
    this.controls.mount();
    // 把焦点送进全屏的落点 —— **只在键盘发起时**。
    //
    // 为什么：进全屏后视频接管了用户的注意力，而控制条 3 秒就自动隐藏。
    // 纯键盘用户此刻若不知道焦点在哪，Tab 会从页面开头重新遍历 ——
    // 他根本不知道自己能操作控制条，更不知道「永远在的退出入口」在哪。
    //
    // ⚠️ 落点是**舞台**（播放器表面），不是控制条里的播放键 ——
    // 焦点停在控制条里会同时坏掉两件事：
    //   1. 「焦点在里面就别藏控制条」那条守卫恒真 → 控制条永远不消失；
    //   2. 扩展的键盘拦截按事件路径判定，路径里有 #vsc-controls 就把
    //      空格与方向键让给自己的控件 → 键盘用户的播放/暂停与快进全废。
    // 舞台在 #vsc-controls 之外，两条都不成立；而且它与控制条宿主在
    // <html> 里前后相邻，一次 Tab 就能落到收起态的退出入口。
    //
    // ⚠️ 为什么只给键盘用户：鼠标用户没在用键盘，把焦点抢进全屏里
    // 只会让他原来的输入目标丢掉（而且违背产品最核心的承诺
    // 「鼠标静止 3 秒后自动隐藏」）。
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
    // 盯着站点的播放器容器：字幕是异步加载的，进全屏那一刻往往还没有 ——
    // 后来出现的那些要补搬进 stage（见 probeOverlayLayers）。
    // 必须在 attachOverlayers **之后**开始盯：搬运本身就是一次 DOM 变化，
    // 先盯上会立刻被自己刚才的动作触发一次没必要的重扫。
    this.startLayerWatch();
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

      // ⚠️ 「站点把视频**拿回了自己的容器**」是**会话结束**，不是「我们的布局坏了」。
      //
      // 以前它被并进 lostLayout，于是走的是 fallbackToCssCover()：
      //   - 视频被搬回**原位置**（把站点刚建好的播放器掏空）；
      //   - 降级成 fixed 铺满视口，body 照样锁死。
      // 而这一档**永远等不到收摊** —— 健康检查的判据只认 reparent 模式，
      // css-cover 模式里没有任何机制会发现「站点已经把视频拿回去了」。
      // 结果就是同一个症状（页面卡死到用户按 Esc）换了一条门进来。
      //
      // 判据：视频**还连着文档**，却已经不在我们的 stage 里 ——
      // 那就是站点自己把它拿走了，会话到此为止（release() 只清理、不搬运：
      // 视频在站点手里，位置归站点管）。
      //
      // ⚠️ `video.isConnected` 这个前提必需：视频整个被站点丢掉时，
      // 它同样不在 stage 里，但那是「节点死了」，走 release() 之外的
      // 恢复路径（recoverDetachedOverlay）才对。
      if (video.isConnected && !stage.contains(video)) {
        this.release();
        return;
      }

      const lostLayout = rect.width < 32 || rect.height < 32;

      if (lostPlaybackPosition || lostMedia || lostLayout) {
        this.fallbackToCssCover();
      }
    }, 180);

    this.startHealthCheck();
    // 盯着「站点把我们的背板摘掉了」：摘掉的那一刻我们要把视频还给站点。
    this.startHostWatch();
    return true;
  }

  // 只清理、不碰视频在页面里的位置。给「节点已经不在文档里」的路径用：
  // 还原 class/style/controls 对游离节点是 no-op，无副作用。
  //
  // ⚠️ 这是「全屏会话结束」的**唯一出口**：
  // 无论是谁触发的结束（控制条的退出钮、Esc、站点把视频拿回去、
  // 站点把背板摘了），最终都会走到这里。
  private release() {
    // ⚠️ 必须在最前面：撑大与还原必须**成对**。
    // 父文档那边被撑大的 iframe 元素若不还原，用户页面就被永久改成
    // 「一个巨大的 iframe」，而且顶层页面再也滚不动。
    // 放在最前面是因为这一行在「视频已经被页面丢弃」（state.video 为 null）
    // 的路径上也要执行 —— 那条路径同样需要把撑大撤销掉。
    this.frameExpander.setOwnFullscreen(false);
    // 同样必须无条件卸掉：监听器在 enter() 里注册，release() 是它的对称操作。
    document.removeEventListener('fullscreenchange', this.boundHandleFullscreenChange);
    // ⚠️ 收摊的这几件事必须**无条件**做：即使下面 `state.video` 为空而提前返回，
    // 它们也必须执行 ——
    // - 宿主观察器不关，它会一直盯着 <html> 的子节点变化；
    // - 健康检查不关，它会每 500ms 空转一次（视频早就没了，什么也干不了）。
    this.stopHostWatch();
    this.stopLayerWatch();
    if (this.healthTimer !== null) {
      window.clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    // 这一轮全屏用的那块背板。
    //
    // ⚠️ 必须在这里取出来并清空字段：它可能**已经被站点摘掉**了
    // （恢复路径），那时 getElementById 找不到它 —— 只有这个引用还在。
    const overlay = this.overlayElement;
    this.overlayElement = null;

    const video = this.state.video;
    if (!video) {
      this.finishSession();
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

    video.classList.remove(
      FULLSCREEN_VIDEO_CLASS,
      'vsc-page-fullscreen-video--reparent',
      'vsc-page-fullscreen-video--css-cover',
    );
    video.controls = this.state.originalControls;
    // ⚠️ **逐属性**还原，不整块写回 style 属性。
    //
    // 站点在全屏期间会往视频上写它自己的样式（滤镜、圆角、Video.js/Plyr
    // 那种 width/height/left/top）。整块写回会把这些统统抹掉 ——
    // 用户退出全屏后看到的是「播放器样式整个被重置了」。
    //
    // 而「站点把视频拿回了自己的容器」那条路径早就是逐属性还原的，
    // 两条出口对**同一件事**给出相反的结果（同一个 style 属性，
    // 一条留着站点写的样式，一条全抹掉）—— 那不是两种策略，
    // 是同一个 bug 的两副面孔。
    this.restoreLayoutProperties(video);

    // 背板：正常退出时它还挂在文档里（摘掉）；恢复路径上它**已经被站点摘掉了**
    // （摘不掉，但那个游离节点也不能留在我们手里）。
    (overlay ?? document.getElementById(OVERLAY_ID))?.remove();
    // 正常情况下 body 必然存在（enter 已用 ensureOverlay 守过）；这里额外
    // 判空只为兜住「全屏中途文档把 body 移除」的极端情况，不让退出流程中断。
    if (document.body) {
      document.body.style.overflow = this.state.originalBodyOverflow;
    }

    this.state = {
      video: null,
      mode: null,
      originalParent: null,
      originalNextSibling: null,
      originalInlineStyles: new Map(),
      appliedInlineStyles: new Map(),
      originalVideoRect: null,
      originalControls: false,
      originalBodyOverflow: '',
      currentTime: 0,
      playbackRate: 1,
      paused: true,
      muted: false,
      readyState: 0,
      overlayLayers: [],
    };

    this.finishSession();
  }

  /**
   * 「这一轮全屏会话结束了」—— 通知订阅方。
   *
   * ⚠️ 必须**恰好一次**：
   * 订阅方（注册表）据此把「我们接管着哪个视频」清掉，
   * 而那份状态留在那里会让注册表把一个**已经退出全屏**的视频当成
   * 当前目标（症状见 onSessionEnd 的注释）。
   *
   * ⚠️ 为什么单独一个方法，而不是把通知写在 release() 的末尾：
   * release() 有一条「state.video 为空就提前返回」的路径（视频早被站点
   * 丢掉了），那条路径同样代表「会话结束了」—— 通知放在末尾就会被跳过。
   */
  private finishSession() {
    if (!this.sessionActive) {
      // 会话已经结束过了（第二次 release）—— 不重复通知。
      return;
    }
    this.sessionActive = false;
    this.onSessionEnd?.();
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

      // ⚠️ 判据是「**视频还在不在我们手上**」，不是「视频连不连着文档」。
      //
      // 这两件事本来是一致的 —— 直到站点把**我们的背板**摘掉：
      // 视频会跟着背板一起脱离文档（isConnected 变 false），
      // 但它仍然是**我们带走的**那个节点，站点并没有丢弃它。
      // 那种情况下不还回去 = 用户的视频从此人间蒸发。
      //
      // 顺序也不能反：先判「在不在我们手上」，再判「站点是不是自己丢了它」。
      if (this.isInsideOurOverlay(video)) {
        // 我们还占着它 → 必须把它还给站点。
        //
        // ⚠️ 这里**不看** video.isConnected：它不连着文档可能只是因为
        // 我们的背板脱了文档。它照样能被插回 originalParent ——
        // 插回去之后自然就重新连着文档了。
        this.restoreToOriginalSlot(video, plan);
        this.restoreIfLost(video, playbackSnapshot);
      } else if (video.isConnected) {
        // 站点已经把视频拿回去了（重渲染时插回了它的新播放器容器）。
        //
        // ⚠️ 千万别再动它的位置：把它从站点刚建好的播放器里拔出来，
        // 等于把站点的新播放器掏空 —— 那正是「站点变成空壳」的做法。
        // 位置一个字都不碰，只在 release() 里撤掉我们写在它身上的样式
        // （而且是**逐属性**撤：站点自己在这期间写下的样式不碰）。
      }
      // 视频不连着文档、也不在我们的背板里 → 站点自己把它丢了：
      // 不复活（把废弃节点插回 originalParent 会抛 NotFoundError，
      // 还会对着没人看的游离节点调 play()）。只做清理。
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
