import { t } from '../shared/i18n';
import { formatShortcut } from '../shared/shortcuts';
import { markFirstRunHintShown, wasFirstRunHintShown } from '../shared/settings';
import type { ShortcutSettings } from '../shared/types';
import { TransientPill } from './transientPill';

const HINT_ID = 'vsc-first-run-hint';
const HINT_DURATION = 12000;
/** 播放多久之后才算「真的在看视频」。避开自动播放的广告位与悬停预览。 */
const WATCH_DELAY = 2500;

export interface FirstRunHintOptions {
  getShortcuts: () => ShortcutSettings;
  wasShown: () => Promise<boolean>;
  markShown: () => Promise<void>;
}

/**
 * 拼出引导文案。
 *
 * 只列「用户不知道就永远不会发现」的动作，并且用**用户当前真实的绑定**渲染：
 * 照默认值写死的话，用户改过键之后这条提示就是在教一个错误的键。
 * 播放/暂停刻意不列——用户刚刚按了播放或点了播放，这个键他不需要被教。
 */
export const buildGuideText = (shortcuts: ShortcutSettings): string | null => {
  const labels: string[] = [];

  // i18n 键是 camelCase（hintFullscreen），动作 id 是小写（fullscreen），
  // 拼接时必须显式映射并给出中文回落：写错键名会静默地把**键名本身**渲染给用户
  // （曾经就这样把 "fullscreen" 当成动作名显示了出来）。
  if (shortcuts.fullscreen) {
    labels.push(`${t('hintFullscreen', '网页全屏')} ${formatShortcut(shortcuts.fullscreen)}`);
  }

  if (shortcuts.increaseSpeed && shortcuts.decreaseSpeed) {
    labels.push(
      t('hintSpeed', '{up} / {down} 调速')
        .replace('{up}', formatShortcut(shortcuts.increaseSpeed))
        .replace('{down}', formatShortcut(shortcuts.decreaseSpeed)),
    );
  }

  if (labels.length === 0) {
    return null;
  }

  // 用明确的间隔符而不是连续空格：提示是塞进 innerHTML 的，HTML 会把连续空格
  // 折叠成一个，靠空格排版会渲染成「网页全屏 F = / - 调速」这种挤在一起的样
  // （视觉验收时真的这样出来过）。
  return `${labels.join('  ·  ')}\n${t('hintMore', '全部快捷键可在扩展设置里改绑')}`;
};

/**
 * 首次使用引导：一次性、不打扰。
 *
 * 装完扩展后页面上什么都没有是这个产品最大的缺口——整个界面只有键盘，
 * 新用户不按对键就永远发现不了功能。但「常驻提示」会直接违背产品的减法原则，
 * 所以取交集：**等用户真的开始看视频之后，再出现一次，然后永远消失。**
 *
 * 三条自我约束：
 * - 只在播放持续到 WATCH_DELAY 之后才出现（自动播放的广告位不该触发引导）
 * - 展示即落盘「已展示」，绝不重复打扰
 * - 任何按键/点击立即消失——用户已经开始操作了，提示就完成了使命
 */
export class FirstRunHint {
  private readonly options: FirstRunHintOptions;
  /** 尚未展示过；null 表示还没问出来（查存储是异步的）。 */
  private eligible: boolean | null = null;
  private shownThisSession = false;
  private delayTimer: number | null = null;
  private watchedVideo: HTMLVideoElement | null = null;
  private readonly pill = new TransientPill({
    id: HINT_ID,
    visibleClass: 'vsc-visible',
    duration: HINT_DURATION,
  });
  private readonly boundHandlePlay = (event: Event) => this.handlePlay(event);
  /**
   * 用户在等待窗口里按了暂停、或视频播完了。
   *
   * 判定「还在看」必须靠真实的 pause/ended **事件**，不能去轮询 `video.paused`：
   * 状态读取回答的是「这一刻是不是暂停」，而我们要回答的是「这段时间里有没有
   * 停下来」。事件是唯一诚实的信号——顺带一提，这也让 E2E 里派发合成的 play
   * 事件能验证这条路径，因为播放器的真实状态读取在隔离世界里不可伪造。
   */
  private readonly boundCancelWatch = () => this.cancelPendingReveal();
  private readonly boundDismiss = () => this.dismiss();

  constructor(options: FirstRunHintOptions) {
    this.options = options;
  }

  start() {
    // 监听器挂在 document 上：视频可能在同源 iframe 里，也可能中途被换成另一个节点。
    document.addEventListener('play', this.boundHandlePlay, true);
    document.addEventListener('pause', this.boundCancelWatch, true);
    document.addEventListener('ended', this.boundCancelWatch, true);
    document.addEventListener('keydown', this.boundDismiss, true);
    document.addEventListener('pointerdown', this.boundDismiss, true);

    void this.options
      .wasShown()
      .then((shown) => {
        this.eligible = !shown;
      })
      .catch(() => {
        // 读不到「是否已展示」时按「已展示」处理：宁可少打扰一次，
        // 也不要因为存储异常把提示变成每次刷新都弹。
        this.eligible = false;
      });
  }

  private handlePlay(event: Event) {
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    // 已经在等、或这一轮已经出过，就不要再排一个计时器。
    if (this.delayTimer !== null || this.shownThisSession) {
      return;
    }

    this.watchedVideo = event.target;
    this.delayTimer = window.setTimeout(() => {
      this.delayTimer = null;
      void this.reveal(this.watchedVideo);
    }, WATCH_DELAY);
  }

  private cancelPendingReveal() {
    if (this.delayTimer === null) {
      return;
    }

    window.clearTimeout(this.delayTimer);
    this.delayTimer = null;
    this.watchedVideo = null;
  }

  /**
   * 等待期间视频被换掉（切集）或从文档里移走，那一次播放就不该再触引导。
   * 节点存活是这里唯一还需要复查的条件。
   */
  private async reveal(video: HTMLVideoElement | null) {
    if (this.eligible === null) {
      this.eligible = await this.options.wasShown().then((shown) => !shown).catch(() => false);
    }

    if (!this.eligible || this.shownThisSession) {
      return;
    }

    if (!video || !video.isConnected) {
      return;
    }

    const text = buildGuideText(this.options.getShortcuts());
    if (!text) {
      // 三个动作全被禁用的用户不需要这条引导，也不该因此被记成「已展示」——
      // 他改回绑定之后仍应该看到一次。
      return;
    }

    if (!this.pill.show(text)) {
      // 没有可挂载的宿主（非 HTML 文档）：什么都没显示出来，不算已展示。
      return;
    }

    this.shownThisSession = true;
    this.eligible = false;
    void this.options.markShown().catch(() => {
      // 落盘失败只会导致下次再提示一次，不值得打断用户。
    });
  }

  private dismiss() {
    if (this.delayTimer !== null) {
      window.clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }

    this.pill.hide();
  }

  destroy() {
    this.dismiss();
    document.removeEventListener('play', this.boundHandlePlay, true);
    document.removeEventListener('pause', this.boundCancelWatch, true);
    document.removeEventListener('ended', this.boundCancelWatch, true);
    document.removeEventListener('keydown', this.boundDismiss, true);
    document.removeEventListener('pointerdown', this.boundDismiss, true);
    this.pill.destroy();
  }
}

/** 生产环境用的一组默认依赖：状态存在 storage.local。 */
export const createFirstRunHint = (getShortcuts: () => ShortcutSettings) =>
  new FirstRunHint({
    getShortcuts,
    wasShown: wasFirstRunHintShown,
    markShown: markFirstRunHintShown,
  });
