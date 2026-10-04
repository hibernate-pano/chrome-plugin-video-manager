import { t } from '../shared/i18n';
import { togglePlayback } from './playback';
import { installRuntimeStyles } from './runtimeStyles';
import { formatRate } from './speedToast';

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

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h3l4 3V6L7 9z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h3l4 3V6L7 9z"/><path d="M16 10l5 5"/><path d="M21 10l-5 5"/></svg>',
  exit: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4v6H4"/><path d="M14 4v6h6"/><path d="M10 20v-6H4"/><path d="M14 20v-6h6"/></svg>',
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
  root: HTMLDivElement;
  playButton: HTMLButtonElement;
  muteButton: HTMLButtonElement;
  exitButton: HTMLButtonElement;
  progress: HTMLInputElement;
  volume: HTMLInputElement;
  time: HTMLSpanElement;
  speed: HTMLSpanElement;
}

/**
 * 全屏控制条：播放/暂停、进度、时间、音量、当前速度、退出。
 * 鼠标静止 3 秒后整条淡出，移入指针再出现——用户不想看它时它就真的不在。
 */
export class FullscreenControls {
  private readonly video: HTMLVideoElement;
  private readonly onExit: () => void;
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
  private idleTimer: number | null = null;
  private draggingProgress = false;
  private pendingSeek: number | null = null;
  private pendingSeekTimer: number | null = null;
  private readonly boundPointerMove = () => this.show();
  private readonly boundScheduleHide = () => this.scheduleHide();
  private readonly boundKeepVisible = () => this.cancelHide();
  private readonly boundHandlePointerUp = () => {
    this.draggingProgress = false;
  };
  private readonly boundHandleVideoClick = (event: MouseEvent) => this.handleVideoClick(event);

  constructor(
    video: HTMLVideoElement,
    options: { onExit: () => void; ownsVideoSurface?: () => boolean },
  ) {
    this.video = video;
    this.onExit = options.onExit;
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

  mount() {
    if (this.elements) {
      return;
    }

    // 控制条 / overlay 依赖 runtimeStyles 里的定位与配色；进入全屏这条路径必须
    // 确保样式在场。页面若在全屏期间把样式节点摘走，这里也能顺带补回。
    installRuntimeStyles();

    const root = document.createElement('div');
    root.id = CONTROLS_ID;
    root.className = 'vsc-ctl';
    root.innerHTML = `
      <button type="button" class="vsc-ctl__button" data-role="play" aria-label="${t('ctlPlay', '播放/暂停')}">${ICONS.play}</button>
      <span class="vsc-ctl__time" data-role="time">0:00 / 0:00</span>
      <input type="range" class="vsc-ctl__range vsc-ctl__progress" data-role="progress" min="0" max="0" step="0.1" value="0" aria-label="${t('ctlProgress', '播放进度')}" />
      <button type="button" class="vsc-ctl__button" data-role="mute" aria-label="${t('ctlMute', '静音')}">${ICONS.volume}</button>
      <input type="range" class="vsc-ctl__range vsc-ctl__volume" data-role="volume" min="0" max="1" step="0.01" value="1" aria-label="${t('ctlVolume', '音量')}" />
      <span class="vsc-ctl__speed" data-role="speed">1x</span>
      <button type="button" class="vsc-ctl__button" data-role="exit" aria-label="${t('ctlExit', '退出全屏')}">${ICONS.exit}</button>
    `;

    // 与 overlay 同样：非 HTML 文档（SVG/foreignObject）里没有可挂载的宿主。
    // enter() 已会提前拒绝这类文档，这里是直接调用 mount() 时的防御。
    if (!document.body) {
      return;
    }

    document.body.appendChild(root);

    const query = <T extends HTMLElement>(role: string) =>
      root.querySelector<T>(`[data-role="${role}"]`);

    const elements: ControlsElements = {
      root,
      playButton: query<HTMLButtonElement>('play')!,
      muteButton: query<HTMLButtonElement>('mute')!,
      exitButton: query<HTMLButtonElement>('exit')!,
      progress: query<HTMLInputElement>('progress')!,
      volume: query<HTMLInputElement>('volume')!,
      time: query<HTMLSpanElement>('time')!,
      speed: query<HTMLSpanElement>('speed')!,
    };
    this.elements = elements;

    elements.playButton.addEventListener('click', () => {
      togglePlayback(this.video);
      elements.playButton.blur();
      this.show();
    });
    elements.muteButton.addEventListener('click', () => {
      this.video.muted = !this.video.muted;
      elements.muteButton.blur();
      this.show();
    });
    elements.exitButton.addEventListener('click', () => {
      this.onExit();
    });

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
      const time = Number(elements.progress.value);
      if (Number.isFinite(time)) {
        // 记住提交的目标：跳转落地前 timeupdate 仍报旧 currentTime，
        // 用它同步会把滑块拉回去（回弹）。pendingSeek 让滑块钉在目标位。
        this.pinSeek(time);
        this.video.currentTime = time;
      }
      this.draggingProgress = false;
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

    root.addEventListener('mouseenter', this.boundKeepVisible);
    root.addEventListener('mouseleave', this.boundScheduleHide);
    window.addEventListener('pointermove', this.boundPointerMove, true);
    window.addEventListener('pointerup', this.boundHandlePointerUp, true);

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
    elements.time.textContent = `${formatTime(hasDuration ? shown : current)} / ${hasDuration ? formatTime(duration) : '--:--'}`;
  };

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
    elements.time.textContent = `${formatTime(clamped)} / ${hasDuration ? formatTime(duration) : '--:--'}`;
  };

  private readonly syncPlayState = () => {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const playing = !this.video.paused;
    elements.playButton.innerHTML = playing ? ICONS.pause : ICONS.play;
  };

  private readonly syncSpeed = () => {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    elements.speed.textContent = `${formatRate(this.video.playbackRate)}x`;
  };

  private readonly syncVolume = () => {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const muted = this.video.muted || this.video.volume === 0;
    elements.muteButton.innerHTML = muted ? ICONS.muted : ICONS.volume;
    elements.volume.value = String(muted ? 0 : this.video.volume);
    elements.volume.style.setProperty('--vsc-progress', `${(muted ? 0 : this.video.volume) * 100}%`);
  };

  private show() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    elements.root.classList.add('vsc-ctl--visible');
    this.scheduleHide();
  }

  private cancelHide() {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleHide() {
    this.cancelHide();
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      if (this.draggingProgress) {
        this.scheduleHide();
        return;
      }
      this.elements?.root.classList.remove('vsc-ctl--visible');
    }, IDLE_HIDE_DELAY);
  }

  unmount() {
    this.cancelHide();
    this.releaseSeekPin();
    window.removeEventListener('pointermove', this.boundPointerMove, true);
    window.removeEventListener('pointerup', this.boundHandlePointerUp, true);

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

    this.elements?.root.remove();
    this.elements = null;
  }
}
