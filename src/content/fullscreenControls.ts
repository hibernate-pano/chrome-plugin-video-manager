import { t } from '../shared/i18n';
import { togglePlayback } from './playback';

const CONTROLS_ID = 'vsc-controls';
const IDLE_HIDE_DELAY = 3000;

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

const formatRate = (value: number) =>
  value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

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
  private elements: ControlsElements | null = null;
  private idleTimer: number | null = null;
  private draggingProgress = false;
  private readonly boundPointerMove = () => this.show();
  private readonly boundScheduleHide = () => this.scheduleHide();
  private readonly boundKeepVisible = () => this.cancelHide();
  private readonly boundHandlePointerUp = () => {
    this.draggingProgress = false;
  };

  constructor(video: HTMLVideoElement, options: { onExit: () => void }) {
    this.video = video;
    this.onExit = options.onExit;
  }

  mount() {
    if (this.elements) {
      return;
    }

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

    elements.progress.addEventListener('input', () => {
      this.draggingProgress = true;
      const time = Number(elements.progress.value);
      if (Number.isFinite(time)) {
        this.video.currentTime = time;
      }
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

    if (!this.draggingProgress) {
      elements.progress.value = hasDuration ? String(Math.min(current, duration)) : '0';
      elements.progress.style.setProperty('--vsc-progress', hasDuration ? `${(current / duration) * 100}%` : '0%');
    }

    elements.time.textContent = `${formatTime(current)} / ${hasDuration ? formatTime(duration) : '--:--'}`;
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
    window.removeEventListener('pointermove', this.boundPointerMove, true);
    window.removeEventListener('pointerup', this.boundHandlePointerUp, true);

    this.video.removeEventListener('timeupdate', this.syncProgress);
    this.video.removeEventListener('durationchange', this.syncProgress);
    this.video.removeEventListener('loadedmetadata', this.syncProgress);
    this.video.removeEventListener('play', this.syncPlayState);
    this.video.removeEventListener('pause', this.syncPlayState);
    this.video.removeEventListener('ratechange', this.syncSpeed);
    this.video.removeEventListener('volumechange', this.syncVolume);

    this.elements?.root.remove();
    this.elements = null;
  }
}
