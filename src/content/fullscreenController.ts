import { FullscreenControls } from './fullscreenControls';
import { findOverlayLayers, OverlayLayer } from './overlayLayers';

type FullscreenMode = 'reparent' | 'css-cover';

interface FullscreenSnapshot {
  video: HTMLVideoElement | null;
  mode: FullscreenMode | null;
  originalParent: ParentNode | null;
  originalNextSibling: Node | null;
  originalStyle: string;
  originalControls: boolean;
  originalBodyOverflow: string;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  muted: boolean;
  /** 跟着视频一起搬进 overlay 的浮层，退出时按原位放回。 */
  overlayLayers: OverlayLayer[];
}

interface PlaybackSnapshot {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  muted: boolean;
}

const OVERLAY_ID = 'vsc-page-fullscreen-overlay';
const STAGE_ID = 'vsc-page-fullscreen-stage';

export class FullscreenController {
  private state: FullscreenSnapshot = {
    video: null,
    mode: null,
    originalParent: null,
    originalNextSibling: null,
    originalStyle: '',
    originalControls: false,
    originalBodyOverflow: '',
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    muted: false,
    overlayLayers: [],
  };

  private healthTimer: number | null = null;
  private controls: FullscreenControls | null = null;

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

  toggle(video: HTMLVideoElement | null) {
    if (this.isActive()) {
      this.exit();
      return true;
    }

    if (!video) {
      return false;
    }

    return this.enter(video);
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
      document.body.appendChild(overlay);
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
   * 方案 3 兜底：页面上有字幕层、但**一个都搬不动**时，退回 css-cover。
   *
   * 这条路径解决的是"识别到了却仍然被盖住"的情况——比如字幕层在
   * 别的插件生成、几何形态恰好落在字幕判据之外。此时与其让用户得到一个
   * "全屏了但字幕不见了、且看起来一切正常"的结果，不如让视频留在页面原位：
   * 全屏没那么干净，但字幕一定还在。
   *
   * ⚠️ 只对**字幕层**成立。弹幕被背板挡住是预期行为（满屏弹幕比没有字幕
   * 吵得多），绝不能因此牺牲全屏——早先的版本把"有任何浮层"当成降级理由，
   * 结果每个开着弹幕的 B站 页面都拿不到真正的全屏。
   *
   * @param layersToAttach 搬运前已探明的字幕层；非空说明增强方案能生效，
   *                        此时全屏与字幕可以兼得，没有任何理由降级。
   */
  private shouldDegradeForOverlays(video: HTMLVideoElement, layersToAttach: OverlayLayer[]): boolean {
    if (layersToAttach.length > 0) {
      return false;
    }

    // 搬运列表为空，但页面上确实存在字幕层：它们搬不动。
    return findOverlayLayers(video).some((layer) => layer.kind === 'subtitle');
  }

  /**
   * 把字幕层搬进 stage，紧贴视频之后。
   *
   * 字幕原本靠 `position:absolute; bottom:2%` 相对**播放器容器**定位，
   * 容器不动时它在原地、跟着满屏的视频错开。搬进 stage 后它的定位参照物
   * 变成了 stage（同样铺满视口），`bottom:2%` 仍然把字幕按在画面底部——
   * 相对关系被保留，不需要改它的任何样式。
   *
   * 顺序很关键：字幕必须在视频**之后**插入，否则 z-index 低的字幕会被
   * 视频（z-index 2147483646）盖住，变成"搬进来了但看不见"。
   */
  private attachOverlayers(stage: HTMLElement, layers: OverlayLayer[]) {
    for (const { element } of layers) {
      if (element.isConnected) {
        stage.appendChild(element);
      }
    }
  }

  /** 退出时把浮层放回它们原来的父节点与兄弟位置。 */
  private restoreOverlayers(layers: OverlayLayer[]) {
    for (const { element, originalParent, originalNextSibling } of layers) {
      if (!originalParent) {
        continue;
      }

      // 与视频同一个道理：全屏期间页面可能把这个节点连同它的原兄弟一起
      // 移走或重建，insertBefore 指向已脱离的节点会抛 NotFoundError
      // 打断整个退出流程，让视频永久卡在全屏里。sibling 失效就退回 append。
      const siblingStillValid =
        originalNextSibling !== null && originalNextSibling.parentNode === originalParent;
      originalParent.insertBefore(element, siblingStillValid ? originalNextSibling : null);
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

    if (!snapshot.paused && video.paused) {
      void video.play().catch(() => {
        // Best effort.
      });
    }
  }

  private applyFullscreenLayout(video: HTMLVideoElement, mode: FullscreenMode) {
    video.classList.add('vsc-page-fullscreen-video', `vsc-page-fullscreen-video--${mode}`);
    video.style.setProperty('position', 'fixed', 'important');
    video.style.setProperty('inset', '0', 'important');
    video.style.setProperty('margin', 'auto', 'important');
    video.style.setProperty('width', '100vw', 'important');
    video.style.setProperty('height', '100vh', 'important');
    video.style.setProperty('max-width', '100vw', 'important');
    video.style.setProperty('max-height', '100vh', 'important');
    video.style.setProperty('object-fit', 'contain', 'important');
    video.style.setProperty('z-index', '2147483646', 'important');
    video.style.setProperty('background', '#000', 'important');
  }

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
    // 浮层已经被搬进 overlay 了：回退到 css-cover 必须先把它们放回页面，
    // 否则字幕会被永久留在 overlay 里，而视频已经回到站点 DOM ——
    // 字幕从此再也不跟着视频走，且没有任何提示。
    this.restoreOverlayers(this.state.overlayLayers);
    this.state.overlayLayers = [];
    this.restoreToOriginalSlot(video);
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
        // 浮层仍要放回页面：视频节点虽然没了，但字幕是站点自己的节点，
        // 把它留在马上要删除的 overlay 里等于让字幕凭空消失。
        this.restoreOverlayers(this.state.overlayLayers);
        this.state.overlayLayers = [];
        this.release();
      }
    }, 500);
  }

  enter(video: HTMLVideoElement) {
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
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Best effort.
      });
    }
    // 进入本方法前已用 canEnter() 提前 return，而所有适配器的
    // shouldTryReparent 都是同一个判断，因此这里恒为 reparent；css-cover 只在
    // fallbackToCssCover() 的回退路径上赋值。
    const mode: FullscreenMode = 'reparent';

    // 搬运浮层之前先把它们的位置记下来：collectLayersToAttach 依赖
    // getBoundingClientRect，而那时视频还没被搬走，坐标才是对的。
    const layersToAttach = this.collectLayersToAttach(video);
    // 有浮层却一个字幕层都没识别出来：与其让字幕在满屏里消失得无声无息，
    // 不如直接走 css-cover，让视频留在页面原位、字幕保持可见。
    const degradeForOverlays = this.shouldDegradeForOverlays(video, layersToAttach);

    this.state = {
      video,
      mode: degradeForOverlays ? 'css-cover' : mode,
      originalParent: video.parentNode,
      originalNextSibling: video.nextSibling,
      originalStyle: video.getAttribute('style') ?? '',
      originalControls: video.controls,
      originalBodyOverflow: document.body.style.overflow,
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      paused: video.paused,
      muted: video.muted,
      overlayLayers: degradeForOverlays ? [] : layersToAttach,
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

    if (!degradeForOverlays) {
      const playbackSnapshot = this.capturePlaybackSnapshot(video);
      this.applyFullscreenLayout(video, 'reparent');
      stage.appendChild(video);
      // 视频之后：字幕的 z-index 通常远低于 2147483646，插在视频前面会被盖住。
      this.attachOverlayers(stage, layersToAttach);
      this.restoreIfLost(video, playbackSnapshot);

      window.setTimeout(() => {
        if (!this.state.video || this.state.video !== video || this.state.mode !== 'reparent') {
          return;
        }

        const rect = video.getBoundingClientRect();
        const lostPlaybackPosition = this.state.currentTime > 0.5 && video.currentTime < 0.1;
        const lostPlaybackState = !this.state.paused && video.paused;
        const lostLayout = rect.width < 32 || rect.height < 32 || !stage.contains(video);

        if (lostPlaybackPosition || lostPlaybackState || lostLayout) {
          this.fallbackToCssCover();
        }
      }, 180);
    } else {
      this.applyCssCover(video);
    }

    this.startHealthCheck();
    return true;
  }

  // 只清理、不碰视频在页面里的位置。给「节点已经不在文档里」的路径用：
  // 还原 class/style/controls 对游离节点是 no-op，无副作用。
  private release() {
    const video = this.state.video;
    if (!video) {
      return;
    }

    this.controls?.unmount();
    this.controls = null;

    video.classList.remove('vsc-page-fullscreen-video', 'vsc-page-fullscreen-video--reparent', 'vsc-page-fullscreen-video--css-cover');
    video.controls = this.state.originalControls;
    video.setAttribute('style', this.state.originalStyle);

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

    this.state = {
      video: null,
      mode: null,
      originalParent: null,
      originalNextSibling: null,
      originalStyle: '',
      originalControls: false,
      originalBodyOverflow: '',
      currentTime: 0,
      playbackRate: 1,
      paused: true,
      muted: false,
      overlayLayers: [],
    };
  }

  // sibling 守卫：全屏期间页面可能把 originalNextSibling 移走了（重排 DOM），
  // 此时 insertBefore(video, 已脱离的节点) 会抛 NotFoundError 打断流程，
  // 让视频卡死在 overlay、body 滚动锁死。sibling 不再是原父节点的孩子时改用 append。
  private restoreToOriginalSlot(video: HTMLVideoElement) {
    const parent = this.state.originalParent;
    if (!parent) {
      return;
    }

    const sibling = this.state.originalNextSibling;
    const siblingStillValid = sibling !== null && sibling.parentNode === parent;
    parent.insertBefore(video, siblingStillValid ? sibling : null);
  }

  exit() {
    const video = this.state.video;
    if (!video) {
      return;
    }

    // 还原顺序：浮层先、视频后。
    //
    // 字幕原本就排在视频后面（`video, subtitle, …`），所以视频记录的
    // originalNextSibling 正是字幕本身。若先还原视频，`insertBefore(video, 字幕)`
    // 会把字幕顶到视频**前面** —— 页面上看不出异样，但字幕从此不再跟随视频，
    // 而且没有任何报错。先把字幕按自己的原位放回去，再还原视频，
    // 视频的 originalNextSibling 校验就会因为字幕已归位而正确落位。
    this.restoreOverlayers(this.state.overlayLayers);
    this.state.overlayLayers = [];

    // isConnected 守卫：页面若已把视频连同 originalNextSibling 一起丢弃，
    // 插回去要么插入一张已经被页面丢弃的节点，要么直接抛 NotFoundError 让退出流程中断。
    if (this.state.mode === 'reparent' && this.state.originalParent && video.isConnected) {
      const playbackSnapshot = this.capturePlaybackSnapshot(video);
      this.restoreToOriginalSlot(video);
      this.restoreIfLost(video, playbackSnapshot);
    }

    this.release();
  }

  destroy() {
    this.exit();
  }
}
