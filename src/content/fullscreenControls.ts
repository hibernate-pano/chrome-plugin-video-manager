import { t } from '../shared/i18n';
import { SPEED_CHANGE_EVENT } from '../shared/types';
import { formatRate } from '../shared/rate';
import { togglePlayback } from './playback';
import { controlsStyles } from './controlsStyles';
import { setSubtitleOffset } from './subtitleOffset';
import type { OverlayLayer } from './overlayLayers';

const CONTROLS_ID = 'vsc-controls';
const IDLE_HIDE_DELAY = 3000;

/**
 * 跳转「钉住」滑块的最长时间。
 *
 * pendingSeek 的存在是为了防回弹：提交 seek 后播放器会有一小段时间继续报旧的
 * currentTime（媒体还没跳过去），照它渲染会把滑块拽回原位。所以在 seeked 之前
 * 必须让滑块钉在目标位。
 *
 * 但 seeked **不一定来**。请求浏览器无法寻址的位置时（流不连续、直播时移边界、
 * 目标落在可寻址范围之外）Chrome 会拒绝这次跳转且不派发 seeked——此时若只靠
 * seeked 解除钉住，滑块会永久冻结在目标位、拒绝跟随真实播放进度，比回弹更糟：
 * 用户以为跳转成功了。所以钉住必须有上限，到点无条件回到真实位置。
 */
const SEEK_PIN_TIMEOUT = 3000;

/**
 * 倍速档位。
 *
 * 为什么最低是 0.5 而不是 playback.ts 允许的 0.1：
 * 10 倍慢放几乎必然音画不同步（人耳对一百多毫秒的偏移就会察觉），
 * 0.5x 才是「慢看」的真实下限。档位是给鼠标用户的快捷入口，
 * 键盘的 0.1 步进仍然保留 —— 这里不改变 playback.ts 的上下限。
 */
const SPEED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

/**
 * 进度条滑块的步长（秒）。
 *
 * 与全局快进快捷键一致（shared/types.ts 的 SEEK_STEP_SECONDS = 5）：
 * 早先这里是 0.1，于是「聚焦进度条按方向键」只挪 0.1 秒，
 * 而不聚焦时按同一个键却快进 5 秒 —— 同一个产品里两套步长。
 */
const PROGRESS_STEP_SECONDS = 5;

/**
 * PageUp / PageDown 在进度条上跳的秒数。
 *
 * ⚠️ 原生 range 控件的 PageUp/PageDown 是按**范围的百分比**跳的
 * （实测 max=7200 时一次跳 720 秒 = 10%）—— 两小时的视频一次就跳 12 分钟，
 * 完全不像「翻一页」。这里改成固定秒数。
 */
const PROGRESS_PAGE_SECONDS = 30;

/**
 * 音量滑块的步长。
 *
 * 0.01（1%）太小：长按方向键几乎看不出变化。0.05（5%）是常见的粒度。
 */
const VOLUME_STEP = 0.05;

/**
 * 字幕底边与控制条顶边之间至少留出的间隙（px）。
 *
 * 不是 0：贴着控制条上沿的字幕仍会被渐变的最上沿压到一点。
 */
const SUBTITLE_CLEARANCE_GAP = 4;

/**
 * 控制条的图标。
 *
 * ⚠️ 播放/暂停、静音/取消静音是**两个图标叠在一起**，靠 class 切换显示
 * 哪一个 —— 不能用 innerHTML 换。
 *
 * 原因（实测 Chromium）：innerHTML 换掉按钮里的 SVG 后，光标下的元素变了，
 * 浏览器会在**光标不动**的情况下重新派发 mouseover/mouseenter；
 * 控制条的 mouseenter 处理器会取消待触发的隐藏计时器，
 * 而光标没动就没有 pointermove 来重新计时 —— 控制条从此永远不再自动隐藏。
 * （实测：点一次播放按钮，控制条再也不消失。）
 */
const ICONS = {
  play: '<svg class="icon icon--play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg class="icon icon--pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  volume: '<svg class="icon icon--volume" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h3l4 3V6L7 9z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg>',
  muted: '<svg class="icon icon--muted" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h3l4 3V6L7 9z"/><path d="M16 10l5 5"/><path d="M21 10l-5 5"/></svg>',
  exit: '<svg class="icon icon--exit" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v6H4"/><path d="M14 4v6h6"/><path d="M10 20v-6H4"/><path d="M14 20v-6h6"/></svg>',
};

/** 秒 -> "1:05" / "1:02:03"；不可用时返回 "--:--"。 */
export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

interface ControlsElements {
  /** 挂在页面上的宿主节点（只有一个 shadow root，本身不显示）。 */
  host: HTMLDivElement;
  /** shadow root 里的控制条本体。 */
  root: HTMLDivElement;
  playButton: HTMLButtonElement;
  muteButton: HTMLButtonElement;
  exitButton: HTMLButtonElement;
  progress: HTMLInputElement;
  volume: HTMLInputElement;
  /** 时间标签整体（"0:30 / 2:00"）。 */
  time: HTMLSpanElement;
  /** 时间标签里的「当前时间」部分：宽度必须固定，否则控制条会横向抖动。 */
  timeNow: HTMLSpanElement;
  /** 时间标签里的「总时长」部分。 */
  timeTotal: HTMLSpanElement;
  /** 倍速徽标：同时是档位菜单的触发器。 */
  speed: HTMLButtonElement;
  /** 倍速徽标外面那层（定位菜单用）。 */
  speedWrap: HTMLSpanElement;
  speedMenu: HTMLDivElement;
}

export interface FullscreenControlsOptions {
  onExit: () => void;
  ownsVideoSurface?: () => boolean;
  /**
   * 选中档位后的回调。
   *
   * 不传时控制条会把 `SPEED_CHANGE_EVENT` 派发到宿主节点上（冒泡到 document），
   * 由运行时订阅。两条路是**互斥**的：给了回调就不发事件，
   * 避免同一个动作触发两次反馈（两遍 toast、两遍读屏播报）。
   */
  onSpeedChange?: (rate: number) => void;
}

/**
 * 全屏控制条：播放/暂停、进度、时间、音量、当前速度、退出。
 * 鼠标静止 3 秒后整条淡出，移入指针再出现——用户不想看它时它就真的不在。
 */
export class FullscreenControls {
  private readonly video: HTMLVideoElement;
  private readonly onExit: () => void;
  private readonly onSpeedChange?: (rate: number) => void;
  /**
   * 视频表面此刻归不归我们管。
   *
   * reparent 模式下视频被搬进我们自己的 overlay，站点播放器的祖先链
   * （YouTube 的 #movie_player、B 站的 .bpx-player-container）随之断开，
   * 站点挂在那些祖先上的「点击切换播放」监听器再也收不到事件——实测 YouTube
   * 网页全屏里左键点击毫无反应，而空格正常，因为键盘走的是我们自己的通道。
   * 既然接管了表面，点击语义就得由我们补上。
   *
   * css-cover 模式相反：视频留在站点 DOM 原位，站点监听器照常工作，
   * 我们再切一次就是双重切换（点一下 = 暂停又播放 = 看起来没反应）。
   * 所以这里必须是一个函数而不是常量——模式会在 180ms 探测后动态降级。
   */
  private readonly ownsVideoSurface: () => boolean;
  private elements: ControlsElements | null = null;
  /** 被搬进 stage 的字幕层：控制条出现时要给它们让位。 */
  private subtitleLayers: OverlayLayer[] = [];
  private idleTimer: number | null = null;
  private draggingProgress = false;
  private pendingSeek: number | null = null;
  private pendingSeekTimer: number | null = null;
  /** 档位菜单是否开着。开着时控制条不能因为 idle 计时器消失。 */
  private menuOpen = false;
  /**
   * 当前给字幕加的位移（px，向下为正）。
   *
   * 必须自己记着：字幕元素的 getBoundingClientRect() 里**已经含**了这份位移，
   * 想知道字幕「自然位置」的底边就得把它加回去。
   */
  private subtitleOffset = 0;
  /**
   * 滑块上一次的变更是不是**键盘**驱动的。
   *
   * `change` 事件分不出来源（键盘调滑块同样会触发它），但「键盘驱动」
   * 这件事可以自己听见：滑块上的 keydown 就是证据。
   *
   * 有了它，键盘用户每按一次方向键就不会被甩掉焦点 ——
   * 没有焦点就没有按键重复（长按方向键只动一下），焦点环也会消失。
   */
  private sliderKeyboardDriven = false;
  /** focusFirst() 之前的焦点，unmount 时还回去。 */
  private previousFocus: HTMLElement | null = null;
  private readonly boundPointerMove = () => this.show();
  /** 任何按键都唤醒控制条 —— 纯键盘用户没有鼠标可动。 */
  private readonly boundHandleKeyWake = () => this.show();
  private readonly boundScheduleHide = () => this.scheduleHide();
  /**
   * 指针移入控制条：**重新计时**，不是取消计时。
   *
   * ⚠️ 这里不能是 cancelHide()：Chromium 在光标不动的情况下也会重新派发
   * mouseenter（图标被 innerHTML 换掉之后光标下的元素变了），
   * 一旦把待触发的计时器取消掉，光标不动就没有 pointermove 来重新计时 ——
   * 控制条从此**永远**不再自动隐藏。
   */
  private readonly boundKeepVisible = () => this.scheduleHide();
  private readonly boundHandlePointerUp = () => {
    this.draggingProgress = false;
  };
  private readonly boundHandleVideoClick = (event: MouseEvent) => this.handleVideoClick(event);
  private readonly boundHandleMenuKeyDown = (event: KeyboardEvent) => this.handleMenuKeyDown(event);
  private readonly boundHandleDocumentPointerDown = (event: Event) => {
    this.handleDocumentPointerDown(event);
  };

  constructor(video: HTMLVideoElement, options: FullscreenControlsOptions) {
    this.video = video;
    this.onExit = options.onExit;
    this.onSpeedChange = options.onSpeedChange;
    // 直接构造（不经 FullscreenController）时默认认为表面归我们：
    // 控制条存在本身就意味着视频已被接管。
    this.ownsVideoSurface = options.ownsVideoSurface ?? (() => true);
  }

  /**
   * 接管视频表面的左键点击 = 切换播放/暂停，对齐站点原生语义。
   *
   * 双击不做特殊处理：浏览器在一次双击里会派发两个 click（detail=1 与 detail=2），
   * 两次切换正好互相抵消、播放状态不变——这与 YouTube 原生双击的表现一致
   * （实测原生双击后 paused 不变、只进全屏），无需引入去抖定时器。
   */
  private handleVideoClick(event: MouseEvent) {
    if (!this.ownsVideoSurface()) {
      return;
    }

    // 只认左键；右键（菜单）与中键（新标签页）不属于播放控制。
    if (event.button !== 0) {
      return;
    }

    // 站点已经处理过这次点击（直接挂在 video 上的监听器抢先 preventDefault）
    // 就让位，否则同样会双重切换。
    if (event.defaultPrevented) {
      return;
    }

    togglePlayback(this.video);
    this.show();
  }

  /**
   * 把字幕抬到控制条上方。
   *
   * 控制条是贴着视口底部的（还带一层向上的黑色渐变），而字幕恰好在画面
   * 底部 —— 两者争夺同一块区域。控制条出现时字幕被它压住，用户看到的就是
   * 「字幕时有时无」。
   *
   * 做法：控制条可见时给字幕加一个底部内边距，把字幕内容顶上去；
   * 控制条隐藏后立刻撤销，字幕回到它原本的位置。
   *
   * 字幕是站点自己的节点，动它的 padding 会改到站点样式 —— 所以这里
   * 用 `transform: translateY()` 而不是改布局属性：位移不影响布局，
   * 退出全屏时撤销 transform 即可完整还原。
   */
  /** 把位移写给一批字幕层。还原逻辑放在 subtitleOffset 里：它记得站点自己
   * 写在字幕上的 transform，撤位移时**只撤我们加的那部分**。 */
  private applySubtitleOffset(layers: OverlayLayer[], pixels: number) {
    for (const layer of layers) {
      if (!layer.element.isConnected) {
        continue;
      }

      setSubtitleOffset(layer.element, pixels);
    }
  }

  private setSubtitleOffset(pixels: number) {
    // 位移没变就别再写 DOM：写一次 transform 就让浏览器重排一次，
    // 而 show() 是被 pointermove 驱动的（每秒能触发几十次）。
    if (pixels === this.subtitleOffset) {
      return;
    }

    this.subtitleOffset = pixels;
    this.applySubtitleOffset(this.subtitleLayers, pixels);
  }

  /**
   * 记录被搬进 stage 的字幕层，供控制条避让使用。
   *
   * 由 FullscreenController 在搬运字幕后调用。传入时控制条通常已经可见
   * （mount() 里会先 show() 一次），所以这里要**立刻**补一次避让 ——
   * 只存引用不生效的话，字幕会一直压在控制条底下。
   */
  setSubtitleLayers(layers: OverlayLayer[]) {
    // 新层还没被我们位移过：先把旧层上的位移撤掉、记账归零，
    // 「自然位置」的算法（rect.bottom + 当前位移）才成立。
    if (this.subtitleLayers.length > 0) {
      this.applySubtitleOffset(this.subtitleLayers, 0);
    }
    this.subtitleOffset = 0;
    this.subtitleLayers = layers;

    const root = this.elements?.root;
    if (root?.classList.contains('bar--visible')) {
      this.setSubtitleOffset(this.getSubtitleClearance());
    }
  }

  /**
   * 控制条的上边缘（视口坐标）。
   *
   * ⚠️ 不用 getBoundingClientRect().top：控制条淡入时有 180ms 的
   * translateY 过渡，动画进行中量到的是**动画中途**的位置，会差 8px。
   * offsetHeight 与 innerHeight 给的是**布局值**，与动画无关。
   */
  private getBarTopEdge(): number {
    const root = this.elements?.root;
    if (!root) {
      return Number.NaN;
    }

    // jsdom 没有布局引擎：offsetHeight 恒为 0 —— 此时没有可用的上边缘。
    const height = root.offsetHeight;
    if (!height) {
      return Number.NaN;
    }

    return window.innerHeight - height;
  }

  /**
   * 控制条可见时字幕需要上抬的高度。
   *
   * ⚠️ 不能用「控制条高度 × 固定系数」：字幕离画面底边的距离各不相同，
   * 固定抬 46px 对「bottom: 4%」的字幕是浪费，对「bottom: 0」的字幕却**不够**
   * —— 实测字幕底边 674、控制条顶边 654，重叠 20px，最后一行被压暗
   * （rgb(209,207,207) vs rgb(255,253,253)）。
   *
   * 现在按**字幕的实际位置**算：量出字幕的自然底边，让它落在控制条顶边之上。
   */
  private getSubtitleClearance(): number {
    const elements = this.elements;
    if (!elements) {
      return 0;
    }

    const barTop = this.getBarTopEdge();
    if (!Number.isFinite(barTop)) {
      return 0;
    }

    let needed = 0;
    for (const layer of this.subtitleLayers) {
      if (!layer.element.isConnected) {
        continue;
      }

      const rect = layer.element.getBoundingClientRect();
      if (rect.height <= 0) {
        continue;
      }

      // 当前 rect 里**已经含**了我们之前加的位移（向上 = 减去），
      // 加回去才是字幕「自然位置」的底边。
      const naturalBottom = rect.bottom + this.subtitleOffset;
      const overlap = naturalBottom - barTop + SUBTITLE_CLEARANCE_GAP;
      if (overlap > needed) {
        needed = overlap;
      }
    }

    return Math.round(needed);
  }

  mount() {
    if (this.elements) {
      return;
    }

    // 与 overlay 同样：非 HTML 文档（SVG/foreignObject）里没有可挂载的宿主。
    // enter() 已会提前拒绝这类文档，这里是直接调用 mount() 时的防御。
    if (!document.body) {
      return;
    }

    // 控制条住在 shadow root 里：站点的全局 CSS 进不来，我们的样式也出不去。
    // 这是唯一能挡住站点 `!important` 的结构性保证（见 controlsStyles.ts 的说明）。
    const host = document.createElement('div');
    host.id = CONTROLS_ID;

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = controlsStyles;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'bar';
    // role="group" + aria-label：读屏用户需要知道「这一组是播放控制」，
    // 否则他们听到的只是一串没有上下文的裸按钮和裸数字。
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', t('ctlGroup', '视频播放控制'));
    root.innerHTML = `
      <button type="button" class="button" data-role="play" aria-label="${t('ctlPlay', '播放/暂停')}">${ICONS.play}${ICONS.pause}</button>
      <span class="time" data-role="time"><span class="time__now" data-role="time-now">0:00</span><span class="time__sep" data-role="time-sep"> / </span><span class="time__total" data-role="time-total">0:00</span></span>
      <input type="range" class="range progress" data-role="progress" min="0" max="0" step="${PROGRESS_STEP_SECONDS}" value="0" aria-label="${t('ctlProgress', '播放进度')}" />
      <button type="button" class="button" data-role="mute" aria-label="${t('ctlMute', '静音')}">${ICONS.volume}${ICONS.muted}</button>
      <input type="range" class="range volume" data-role="volume" min="0" max="1" step="${VOLUME_STEP}" value="1" aria-label="${t('ctlVolume', '音量')}" />
      <span class="speed-wrap" data-role="speed-wrap">
        <button type="button" class="speed" data-role="speed" aria-haspopup="menu" aria-expanded="false" aria-live="polite" aria-label="${t('ctlSpeed', '播放速度')}">1x</button>
        <div class="speed-menu" data-role="speed-menu" role="menu" hidden aria-label="${t('ctlSpeed', '播放速度')}"></div>
      </span>
      <button type="button" class="button" data-role="exit" aria-label="${t('ctlExit', '退出全屏 (Esc)')}">${ICONS.exit}</button>
    `;
    shadow.appendChild(root);

    document.body.appendChild(host);

    const query = <T extends HTMLElement>(role: string) =>
      root.querySelector<T>(`[data-role="${role}"]`);

    const elements: ControlsElements = {
      host,
      root,
      playButton: query<HTMLButtonElement>('play')!,
      muteButton: query<HTMLButtonElement>('mute')!,
      exitButton: query<HTMLButtonElement>('exit')!,
      progress: query<HTMLInputElement>('progress')!,
      volume: query<HTMLInputElement>('volume')!,
      time: query<HTMLSpanElement>('time')!,
      timeNow: query<HTMLSpanElement>('time-now')!,
      timeTotal: query<HTMLSpanElement>('time-total')!,
      speed: query<HTMLButtonElement>('speed')!,
      speedWrap: query<HTMLSpanElement>('speed-wrap')!,
      speedMenu: query<HTMLDivElement>('speed-menu')!,
    };
    this.elements = elements;

    // 档位菜单的每一项都是真正的 <button role="menuitem">：
    // 原生按钮自带 Enter 激活、焦点环与禁用态语义，比 div + 手写键盘逻辑可靠。
    for (const rate of SPEED_RATES) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'speed-menu__item';
      item.setAttribute('role', 'menuitem');
      // 菜单项不进 Tab 序列（ARIA menu 模式：一次只有一个可聚焦项）。
      // 否则用户按 Tab 要穿过 10 个档位才能到退出按钮。
      item.tabIndex = -1;
      item.dataset.rate = String(rate);
      item.textContent = `${formatRate(rate)}x`;
      item.addEventListener('click', (event) => {
        // detail === 0 表示这次 click 由键盘触发（Enter）：此时把焦点还给
        // 倍速按钮，键盘用户不至于在菜单消失后丢失位置。
        // 鼠标点击（detail > 0）不还焦点：否则焦点一直留在控制条里，
        // scheduleHide() 会让控制条永远不消失。
        this.selectSpeed(rate, { restoreFocus: event.detail === 0 });
      });
      elements.speedMenu.appendChild(item);
    }

    elements.playButton.addEventListener('click', (event) => {
      togglePlayback(this.video);
      // 失焦是有意为之：焦点留在按钮上，scheduleHide() 就会一直把控制条
      // 算作「用户正在操作」，它从此不再自动隐藏。
      //
      // ⚠️ 只有**鼠标点击**才失焦（detail > 0）。键盘激活（Enter / 空格）
      // 的 detail === 0 —— 那种情况下必须保住焦点，否则键盘用户每按一次
      // 键就在控制条里「丢一次位置」。
      if (event.detail !== 0) {
        elements.playButton.blur();
      }
      this.show();
    });
    elements.muteButton.addEventListener('click', (event) => {
      this.video.muted = !this.video.muted;
      if (event.detail !== 0) {
        elements.muteButton.blur();
      }
      this.show();
    });
    elements.exitButton.addEventListener('click', () => {
      this.onExit();
    });
    elements.speed.addEventListener('click', (event) => {
      if (this.menuOpen) {
        // 鼠标路径（detail > 0）不还焦点 —— 还焦点就等于把控制条钉住，
        // 它从此不再自动隐藏。键盘路径（detail === 0）必须还，
        // 否则键盘用户在菜单收起后丢失位置。
        this.closeSpeedMenu(event.detail === 0);
        if (event.detail !== 0) {
          this.releaseFocusToPage();
        }
      } else {
        this.openSpeedMenu();
      }
    });
    elements.speed.addEventListener('keydown', (event) => {
      // 菜单按钮的常规键盘入口：上下箭头直接展开。
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.openSpeedMenu();
      }
    });
    elements.speedMenu.addEventListener('keydown', this.boundHandleMenuKeyDown);
    // 点菜单外面要收起菜单。挂在 document 上而不是 bar 上：
    // 用户点视频、点页面任意位置都算「外面」。
    document.addEventListener('pointerdown', this.boundHandleDocumentPointerDown, true);

    // 点击视频本身也要能暂停：控制条 3 秒就自动隐藏，藏起来之后
    // 鼠标点击是用户唯一还在手的播放控制手段。
    this.video.addEventListener('click', this.boundHandleVideoClick);

    // 拖动/点击进度条：input 只移动滑块并预览目标时间，绝不逐帧 seek。
    // 一次拖动会触发几十个 input，每个都写 currentTime 会让流媒体播放器
    // （YouTube/B 站这类 MSE）反复中断并重新缓冲——表现就是「快进快退不干脆、
    // 进度条点了跳不过去」。真正的跳转放到 change（松手/点定/键盘确定）提交一次。
    elements.progress.addEventListener('input', () => {
      this.draggingProgress = true;
      this.previewScrub();
      this.show();
    });
    elements.progress.addEventListener('change', () => {
      this.commitProgressSeek();
      this.releaseSliderFocus();
      this.show();
    });

    elements.volume.addEventListener('input', () => {
      const value = Number(elements.volume.value);
      if (Number.isFinite(value)) {
        this.video.volume = value;
        if (value > 0 && this.video.muted) {
          this.video.muted = false;
        }
      }
      this.show();
    });

    // 滑块松手后把焦点放掉，让控制条能重新自动隐藏。
    //
    // ⚠️ 为什么不能放在 `input` 里失焦：实测（真实 Chromium）的事件顺序是
    // **input 先于 focus** —— 浏览器在 input 之后才把焦点落到滑块上。
    // 于是 input 里 blur 掉的东西，浏览器紧接着又 focus 回来，
    // 焦点永远甩不掉。
    //
    // ⚠️ 为什么要在**松手**时才放：拖动过程中控制条**就该**一直显示
    // （用户正在操作它）。拖完就该按 idle 规则隐藏了 ——
    // 而「焦点还在滑块上」会让 scheduleHide 无限续期。
    //
    // ⚠️ 滑块曾经完全忘记处理这件事（只有播放/静音按钮做了），
    // 于是用户拖过一次音量条之后，控制条就**永远**不再自动隐藏：
    // 实测点过音量滑块 5 秒后控制条仍然可见。
    // 这直接违背产品最核心的承诺（「鼠标静止 3 秒后自动隐藏」），
    // 而且是**每个用户第一次拖滑块**就会遇到。
    //
    // ⚠️ 但**键盘**驱动的变更必须保住焦点：甩掉焦点之后，按键重复就断了
    // （实测长按方向键 1.2 秒只前进 0.1 秒），焦点环也会消失。
    // 键盘与指针的区别我们自己听得见 —— 滑块上的 keydown 就是证据。
    elements.volume.addEventListener('change', this.releaseSliderFocus);
    // change 在键盘操作滑块时也会触发；而鼠标拖动时 change 在松手时触发。
    // pointerup 兜住「拖到原值、change 不触发」的情况。
    elements.progress.addEventListener('pointerup', this.releaseSliderFocus);
    elements.volume.addEventListener('pointerup', this.releaseSliderFocus);

    // 记录「这次交互是键盘还是指针」。
    // pointerdown 会先于 change 发生；keydown 也先于它引发的 change。
    const markKeyboardDriven = () => {
      this.sliderKeyboardDriven = true;
    };
    const markPointerDriven = () => {
      this.sliderKeyboardDriven = false;
    };
    elements.progress.addEventListener('keydown', markKeyboardDriven);
    elements.volume.addEventListener('keydown', markKeyboardDriven);
    elements.progress.addEventListener('pointerdown', markPointerDriven);
    elements.volume.addEventListener('pointerdown', markPointerDriven);

    // PageUp / PageDown：原生 range 是按**范围的 10%** 跳的
    // （实测 max=7200 时一次跳 720 秒），两小时的视频一次就跳 12 分钟。
    // 这里换成固定秒数，并把跳转一次提交掉。
    elements.progress.addEventListener('keydown', (event) => {
      if (event.key !== 'PageUp' && event.key !== 'PageDown') {
        return;
      }

      const duration = this.video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      event.preventDefault();
      const current = Number(elements.progress.value);
      if (!Number.isFinite(current)) {
        return;
      }

      const delta = event.key === 'PageUp' ? PROGRESS_PAGE_SECONDS : -PROGRESS_PAGE_SECONDS;
      const next = Math.min(Math.max(current + delta, 0), duration);
      elements.progress.value = String(next);
      this.previewScrub();
      this.commitProgressSeek();
      this.show();
    });

    root.addEventListener('mouseenter', this.boundKeepVisible);
    root.addEventListener('mouseleave', this.boundScheduleHide);
    window.addEventListener('pointermove', this.boundPointerMove, true);
    window.addEventListener('pointerup', this.boundHandlePointerUp, true);
    // ⚠️ 键盘也要能唤醒控制条。
    //
    // 控制条 3 秒无操作就淡出，鼠标一动就回来 —— 但**纯键盘用户**没有鼠标。
    // 实测：控制条淡出后，按方向键/空格/任何键都唤不回来，
    // 键盘用户就此失去了对进度条、音量、退出按钮的访问。
    //
    // 监听挂在 **window 的捕获阶段**：内容脚本的键盘拦截也跑在捕获阶段，
    // 顺序上我们必须**先于**它拿到事件，否则按键被扩展吞掉之后
    // 根本到不了这里。
    window.addEventListener('keydown', this.boundHandleKeyWake, true);

    // 视频事件 -> UI 同步。
    this.video.addEventListener('timeupdate', this.syncProgress);
    this.video.addEventListener('durationchange', this.syncProgress);
    this.video.addEventListener('loadedmetadata', this.syncProgress);
    this.video.addEventListener('seeked', this.handleSeeked);
    this.video.addEventListener('play', this.syncPlayState);
    this.video.addEventListener('pause', this.syncPlayState);
    this.video.addEventListener('ratechange', this.syncSpeed);
    this.video.addEventListener('volumechange', this.syncVolume);

    this.syncAll();
    this.show();
  }

  private syncAll() {
    this.syncProgress();
    this.syncPlayState();
    this.syncSpeed();
    this.syncVolume();
  }

  private speedMenuItems(): HTMLButtonElement[] {
    const menu = this.elements?.speedMenu;
    if (!menu) {
      return [];
    }

    return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  }

  private openSpeedMenu() {
    const elements = this.elements;
    if (!elements || this.menuOpen) {
      return;
    }

    this.menuOpen = true;
    elements.speedMenu.hidden = false;
    elements.speed.setAttribute('aria-expanded', 'true');

    // 菜单是绝对定位在按钮上方的，指针移上去会离开控制条本体。
    // 立刻重新 show() 一次 + scheduleHide 的 menuOpen 守卫，
    // 保证菜单开着的时候控制条不会因为 idle 计时器跟着消失。
    this.show();

    // 焦点落在当前档位上：一打开就知道自己现在在哪一档。
    const items = this.speedMenuItems();
    const current = items.find((item) => item.getAttribute('aria-current') === 'true');
    (current ?? items[0])?.focus();
  }

  private closeSpeedMenu(restoreFocus = true) {
    const elements = this.elements;
    if (!elements || !this.menuOpen) {
      return;
    }

    this.menuOpen = false;
    elements.speedMenu.hidden = true;
    elements.speed.setAttribute('aria-expanded', 'false');

    if (restoreFocus) {
      elements.speed.focus({ preventScroll: true });
    }

    // 菜单收起后重新开始 idle 计时，否则控制条会一直挂着。
    this.show();
  }

  /**
   * 滑块变更之后处理焦点。
   *
   * 指针驱动（拖动、点定）→ 把焦点放掉，控制条才能重新自动隐藏。
   * 键盘驱动 → **保住焦点**：焦点一丢，按键重复就断了
   * （实测长按方向键 1.2 秒只前进 0.1 秒），焦点环也会消失。
   */
  private readonly releaseSliderFocus = () => {
    if (!this.sliderKeyboardDriven) {
      this.releaseFocusToPage();
    }
    this.show();
  };

  /**
   * 把焦点从控制条里放掉，让它能重新自动隐藏。
   *
   * ⚠️ 为什么需要它：scheduleHide() 在「焦点还在控制条里」时会无限续期 ——
   * 那是为了保护键盘用户（控制条藏了而焦点还在里面，键盘用户就瞎了）。
   * 但**鼠标**用户点完控件之后，焦点还留在那个控件上（浏览器的默认行为），
   * 于是控制条再也不消失。
   *
   * 实测（真实 Chromium）：点过音量滑块 5 秒后，控制条仍然可见。
   * 这直接违背产品最核心的承诺（「鼠标静止 3 秒后自动隐藏」）——
   * 而且是**每个用户第一次拖滑块**就会遇到。
   *
   * ⚠️ 必须用 shadow root 里的 activeElement：
   * 焦点在 shadow tree 内部时，document.activeElement 会被重定向成**宿主节点**，
   * 对宿主 blur() 未必能清掉内部那个元素的焦点。直接对内部元素 blur() 才行。
   *
   * ⚠️ 为什么不在 closeSpeedMenu 里无条件 blur：键盘路径需要把焦点还回倍速按钮，
   * 否则键盘用户在菜单收起后就丢失了位置（那正是 restoreFocus 的用途）。
   * 所以「鼠标路径失焦、键盘路径保留焦点」是刻意的区分。
   */
  private releaseFocusToPage() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const inner = elements.host.shadowRoot?.activeElement;
    if (inner instanceof HTMLElement) {
      inner.blur();
      return;
    }

    // 焦点在宿主上（shadow 之外还有焦点逻辑时的兜底）。
    const active = document.activeElement;
    if (active instanceof HTMLElement && elements.host.contains(active)) {
      active.blur();
    }
  }

  /**
   * 选中一个档位。
   *
   * 直接写 playbackRate：档位全部落在 playback.ts 的 [0.1, 16] 安全区间内，
   * 不需要再走 clamp。
   */
  private selectSpeed(rate: number, options: { restoreFocus: boolean }) {
    const elements = this.elements;

    this.video.playbackRate = rate;
    this.closeSpeedMenu(options.restoreFocus);
    // 鼠标选的档位：焦点原本留在菜单项上（菜单项一藏，焦点就落在
    // 一个看不见的地方）。必须放掉，否则控制条再也不自动隐藏。
    if (!options.restoreFocus) {
      this.releaseFocusToPage();
    }
    this.show();

    if (this.onSpeedChange) {
      this.onSpeedChange(rate);
      return;
    }

    // 没有外部回调时，用事件把「倍速变了」送出去。
    // 事件派发在宿主节点上并冒泡 —— 宿主在 light DOM 里，document 收得到。
    elements?.host.dispatchEvent(new CustomEvent(SPEED_CHANGE_EVENT, {
      bubbles: true,
      detail: { rate, video: this.video },
    }));
  }

  private handleMenuKeyDown(event: KeyboardEvent) {
    if (!this.menuOpen) {
      return;
    }

    const items = this.speedMenuItems();
    if (items.length === 0) {
      return;
    }

    const current = items.indexOf(event.target as HTMLButtonElement);
    const focusAt = (index: number) => {
      const wrapped = ((index % items.length) + items.length) % items.length;
      items[wrapped]?.focus();
    };

    switch (event.key) {
      case 'Escape':
        // Esc 关菜单而不是退出全屏：键盘控制器在 window 捕获阶段会先一步
        // 拦下 Escape（见 runtime.ts 里 isFullscreenActive 的说明），
        // 这里能收到就说明它让行了。
        event.preventDefault();
        event.stopPropagation();
        this.closeSpeedMenu();
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusAt(current < 0 ? 0 : current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(current < 0 ? items.length - 1 : current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Tab':
        // 菜单不困住 Tab：收起菜单、把焦点交还倍速按钮，
        // 随后浏览器的默认 Tab 会从按钮继续往后走。
        this.closeSpeedMenu();
        break;
      default:
        break;
    }
  }

  /** 点击菜单与倍速按钮之外的任何地方都收起菜单。 */
  private handleDocumentPointerDown(event: Event) {
    const elements = this.elements;
    if (!elements || !this.menuOpen) {
      return;
    }

    // composedPath 能穿过 shadow 边界；拿不到时退回 target（会被重定向成宿主）。
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const clickedInside = path.length > 0
      ? path.includes(elements.speedWrap)
      : event.target instanceof Node && elements.host.contains(event.target);

    if (clickedInside) {
      return;
    }

    this.closeSpeedMenu(false);
    // 点页面别处一定是鼠标操作：焦点若留在控制条里，它就永远不消失。
    this.releaseFocusToPage();
  }

  private readonly syncProgress = () => {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const duration = this.video.duration;
    const current = this.video.currentTime;
    const hasDuration = Number.isFinite(duration) && duration > 0;

    elements.progress.max = hasDuration ? String(duration) : '0';
    elements.progress.disabled = !hasDuration;

    // 松手兜底：正常路径由 change 清 draggingProgress；个别情况下 change 未到达
    // （如拖到控件外释放）时，pointerup 保证滑块不会被永久卡在拖动态。
    if (this.draggingProgress) {
      return; // 拖动中由 previewScrub 渲染，不用真实 currentTime 覆盖。
    }

    // 跳转已提交但尚未落地：滑块钉在目标位，避免被旧 currentTime 拉回（回弹）。
    const shown = this.pendingSeek !== null && hasDuration ? this.pendingSeek : Math.min(current, duration);
    elements.progress.value = hasDuration ? String(shown) : '0';
    elements.progress.style.setProperty('--vsc-progress', hasDuration ? `${(shown / duration) * 100}%` : '0%');
    this.renderTimeLabel(
      formatTime(hasDuration ? shown : current),
      hasDuration ? formatTime(duration) : '--:--',
    );
    // 读屏念裸数字（"108"）毫无意义 —— 它得念成 "1:48 / 30:00"。
    elements.progress.setAttribute('aria-valuetext', elements.time.textContent);
  };

  /**
   * 渲染时间标签。
   *
   * 「当前时间」与「总时长」分成两个元素：前者的宽度会随播放进度变化
   * （"0:00" → "59:59" → "1:00:00"），两者挤在一个元素里的话，
   * 整个控制条会跟着横向抖动（实测进度条宽度在 871.6px 与 851.7px 之间跳）。
   * 分开之后给「当前时间」一个固定的 min-width，抖动就没有了。
   */
  private renderTimeLabel(current: string, total: string) {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    elements.timeNow.textContent = current;
    elements.timeTotal.textContent = total;
  }

  /**
   * 提交一次跳转：滑块当前的值就是目标时间。
   *
   * 拖动结束（change）与 PageUp/PageDown 都走这里，保证「一次操作一次跳转」。
   */
  private commitProgressSeek() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const time = Number(elements.progress.value);
    if (Number.isFinite(time)) {
      // 记住提交的目标：跳转落地前 timeupdate 仍报旧 currentTime，
      // 用它同步会把滑块拉回去（回弹）。pendingSeek 让滑块钉在目标位。
      this.pinSeek(time);
      this.video.currentTime = time;
    }
    this.draggingProgress = false;
  }

  /** 跳转落地：清除 pendingSeek 并回到真实位置渲染。 */
  private readonly handleSeeked = () => {
    this.releaseSeekPin();
    this.syncProgress();
  };

  /**
   * 钉住滑块并起一个上限计时器（见 SEEK_PIN_TIMEOUT）。seeked 正常到达时由
   * handleSeeked 提前解除，计时器一并取消。
   */
  private pinSeek(time: number) {
    this.releaseSeekPin();
    this.pendingSeek = time;
    this.pendingSeekTimer = window.setTimeout(() => {
      this.pendingSeekTimer = null;
      // seeked 始终没来：这次跳转多半被播放器拒绝了。解除钉住、回到真实位置，
      // 否则进度条会永久冻结在一个假的进度上。
      this.pendingSeek = null;
      this.syncProgress();
    }, SEEK_PIN_TIMEOUT);
  }

  private releaseSeekPin() {
    if (this.pendingSeekTimer !== null) {
      window.clearTimeout(this.pendingSeekTimer);
      this.pendingSeekTimer = null;
    }

    this.pendingSeek = null;
  }

  /** 拖动时把时间标签与填充同步到滑块目标位置，让 scrub 立刻有反馈（不触发 seek）。 */
  private previewScrub() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const duration = this.video.duration;
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const target = Number(elements.progress.value);
    const clamped = hasDuration ? Math.min(Math.max(target, 0), duration) : 0;
    elements.progress.style.setProperty('--vsc-progress', hasDuration ? `${(clamped / duration) * 100}%` : '0%');
    this.renderTimeLabel(
      formatTime(clamped),
      hasDuration ? formatTime(duration) : '--:--',
    );
    elements.progress.setAttribute('aria-valuetext', elements.time.textContent);
  }

  private readonly syncPlayState = () => {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const playing = !this.video.paused;
    // ⚠️ 图标**不换 DOM**：两个 SVG 叠在一起，靠 class 切换显示哪一个。
    // 用 innerHTML 换会让 Chromium 在光标下重新派发 mouseover/mouseenter，
    // 控制条的 mouseenter 处理器随即取消隐藏计时器 —— 光标不动就没有
    // pointermove 来重新计时，控制条从此永不自动隐藏（见 ICONS 的说明）。
    elements.playButton.classList.toggle('is-playing', playing);
    // 图标会随状态变，可访问名也必须跟着变。
    // 只换图标的话，读屏用户永远听到「播放/暂停」，分不清当前到底是哪一种。
    elements.playButton.setAttribute(
      'aria-label',
      playing ? t('ctlPause', '暂停') : t('ctlPlay', '播放/暂停'),
    );
  };

  private readonly syncSpeed = () => {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const rate = this.video.playbackRate;
    elements.speed.textContent = `${formatRate(rate)}x`;
    // 可访问名里带上倍率：按钮本身开了 aria-live，
    // 名字一变读屏就会播报 —— 这是倍速变化的第二条播报通道，
    // 与控制条在不在屏幕上无关。
    elements.speed.setAttribute('aria-label', `${t('ctlSpeed', '播放速度')} ${formatRate(rate)}x`);

    for (const item of this.speedMenuItems()) {
      const value = Number(item.dataset.rate);
      if (Number.isFinite(value) && Math.abs(value - rate) < 0.001) {
        item.setAttribute('aria-current', 'true');
      } else {
        item.removeAttribute('aria-current');
      }
    }
  };

  private readonly syncVolume = () => {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const volume = this.video.volume;
    const muted = this.video.muted || volume === 0;

    elements.muteButton.classList.toggle('is-muted', muted);
    elements.muteButton.setAttribute(
      'aria-label',
      muted ? t('ctlUnmute', '取消静音') : t('ctlMute', '静音'),
    );

    // 滑块永远显示**真实音量**，静音只体现在喇叭图标上。
    //
    // 原来的写法在静音时把滑块拉到 0：用户看到的是「音量被调到 0 了」，
    // 可 volume 其实还是 1 —— 一取消静音音量直接跳到满格，看起来像 bug。
    // 原生播放器（YouTube 等）都是这么做的：静音是「暂时不出声」，
    // 不是「把音量旋钮拧到底」。
    elements.volume.value = String(volume);
    elements.volume.style.setProperty('--vsc-progress', `${volume * 100}%`);
    elements.volume.setAttribute(
      'aria-valuetext',
      this.video.muted ? t('ctlMuted', '已静音') : `${Math.round(volume * 100)}%`,
    );
  };

  private show() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    elements.root.classList.add('bar--visible');
    this.setSubtitleOffset(this.getSubtitleClearance());
    this.scheduleHide();
  }

  private cancelHide() {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * 焦点是否在控制条里。
   *
   * 焦点在 shadow tree 内部时，document.activeElement 会被重定向成宿主节点，
   * 所以判宿主就够了（Node.contains 包含自身）。
   */
  private hasFocusInside(): boolean {
    const elements = this.elements;
    if (!elements) {
      return false;
    }

    const active = document.activeElement;
    return active !== null && elements.host.contains(active);
  }

  private scheduleHide() {
    this.cancelHide();
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;

      if (this.draggingProgress) {
        this.scheduleHide();
        return;
      }

      // 菜单开着时控制条不能消失：菜单是控制条的一部分，
      // 控制条一藏，菜单也跟着没了。
      if (this.menuOpen) {
        this.scheduleHide();
        return;
      }

      // 焦点在控制条里时不隐藏。
      // opacity: 0 + visibility: hidden 的元素如果还拿着焦点，
      // 键盘用户盯着屏幕什么也看不到，只能盲按。
      if (this.hasFocusInside()) {
        this.scheduleHide();
        return;
      }

      this.elements?.root.classList.remove('bar--visible');
      // 控制条藏了，字幕立刻回到它原本的位置。
      this.setSubtitleOffset(0);
    }, IDLE_HIDE_DELAY);
  }

  /**
   * 把焦点送进控制条。
   *
   * ⚠️ 只在「用户明确要用键盘操作控制条」时调用。
   * 不要在每次进入全屏时无条件调用：焦点一旦落在控制条里，
   * scheduleHide() 就会一直把它算作「用户正在操作」，控制条将不再自动隐藏
   * （这正是本方法存在的意义，但也是无条件调用会踩的坑）。
   */
  focusFirst() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    // 记下原焦点，unmount 时还回原处。
    const active = document.activeElement;
    if (active instanceof HTMLElement && !elements.host.contains(active)) {
      this.previousFocus = active;
    }

    elements.playButton.focus({ preventScroll: true });
  }

  unmount() {
    this.releaseSeekPin();
    // 顺序有讲究：closeSpeedMenu 内部会 show()，那会重新排一个 idle 计时器。
    // 必须在它之后再 cancelHide，否则控制条拆了还留着一个待触发的定时器。
    this.closeSpeedMenu(false);
    this.cancelHide();
    // 退出全屏前把字幕的位移撤销：字幕要原样回到站点 DOM。
    this.setSubtitleOffset(0);
    this.subtitleLayers = [];
    window.removeEventListener('pointermove', this.boundPointerMove, true);
    window.removeEventListener('pointerup', this.boundHandlePointerUp, true);
    window.removeEventListener('keydown', this.boundHandleKeyWake, true);
    document.removeEventListener('pointerdown', this.boundHandleDocumentPointerDown, true);

    this.video.removeEventListener('timeupdate', this.syncProgress);
    this.video.removeEventListener('durationchange', this.syncProgress);
    this.video.removeEventListener('loadedmetadata', this.syncProgress);
    this.video.removeEventListener('seeked', this.handleSeeked);
    this.video.removeEventListener('play', this.syncPlayState);
    this.video.removeEventListener('pause', this.syncPlayState);
    this.video.removeEventListener('ratechange', this.syncSpeed);
    this.video.removeEventListener('volumechange', this.syncVolume);
    // 摘干净：unmount 后视频要交回站点，我们的点击切换必须一起走，
    // 否则退出全屏后站点自己的点击监听器会和这个残留监听器双重切换。
    this.video.removeEventListener('click', this.boundHandleVideoClick);

    // 宿主移除后焦点会掉到 body：如果焦点本来在控制条里，
    // 还回 focusFirst() 之前的位置，键盘用户不至于凭空丢失位置。
    const restoreTarget = this.previousFocus;
    this.previousFocus = null;
    if (restoreTarget?.isConnected && this.elements?.host.contains(document.activeElement)) {
      restoreTarget.focus({ preventScroll: true });
    }

    // 摘掉整个宿主：shadow root 随之消失，内部元素一并清理。
    this.elements?.host.remove();
    this.elements = null;
  }
}
