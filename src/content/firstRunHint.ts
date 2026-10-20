import { t } from '../shared/i18n';
import { formatShortcut } from '../shared/shortcuts';
import { markFirstRunHintShown, wasFirstRunHintShown } from '../shared/settings';
import type { ShortcutSettings } from '../shared/types';
import { getSiteAdapter } from './siteAdapters';
import { TransientPill } from './transientPill';

const HINT_ID = 'vsc-first-run-hint';
const HINT_DURATION = 12000;
/**
 * 播放多久之后才算「真的在看视频」。
 *
 * ⚠️ 这条只能回答「用户是不是看了一会儿」，**不能**回答「这是不是用户在看的
 * 那个视频」—— 装饰性预览同样会播过 2.5 秒。后者由 isAmbientAutoplay 判，
 * 两道判据各管各的，不能互相顶替。
 */
const WATCH_DELAY = 2500;

/**
 * 「用户亲手选过它」在多久之内算数。
 *
 * 量级与 videoRegistry 里的 RECENT_CHOICE_MS 一致（10 秒）：点击到站点
 * 调 play() 的间隔通常在毫秒级，10 秒足够宽裕。
 *
 * 再长就会露出另一个洞：用户点一下那个吵人的预览（把它暂停）然后继续读
 * 文章 —— 那次点击不该让他接下来半小时都享受「用户选过」的待遇。
 */
const CHOICE_GRACE_MS = 10_000;

/**
 * 这个视频是不是「站点摆在那儿的装饰性自动播放视频」。
 *
 * 判据是**两个信号同时成立**：有 `autoplay` 属性 + 没有原生 `controls`。
 *
 * - `autoplay` 表达的是**站点的意图**：这条视频会自动开始播，用户没要求过。
 * - 没有 `controls` 说明站点没打算让用户把它当「一个可以操作的播放器」。
 *
 * ⚠️ **不要**再加「静音」这一条：浏览器本来就只允许静音自动播，于是
 * 「自动播放」几乎蕴含「静音」，这条判据形同虚设。
 * ⚠️ **不要**用尺寸判据：装饰视频有的大有的小，尺寸不是本质区别。
 *
 * ⚠️⚠️ 这份规则与 src/content/videoRegistry.ts 里的 isAmbientPreview 是
 * **同一条规则**，但这里必须**各写一份**：那边是模块内私有的（还多带
 * 「站点主播放器」「我们自己接管着」两个参数），要复用就得改
 * videoRegistry.ts —— 那个文件此刻正被别人的改动碰着，改它会冲突。
 * 抄一份的代价是「改一处忘一处」，所以这里把规则写成了显式契约：
 * 改这边的时候记得那边一起改。
 */
const isAmbientAutoplay = (video: HTMLVideoElement): boolean =>
  video.hasAttribute('autoplay') && !video.hasAttribute('controls');

type SafeMatcher = HTMLVideoElement & { safeMatches?: (selector: string) => boolean };

/**
 * 选择器匹配（与 videoRegistry 里的同名 helper 同一套退化路径）。
 *
 * 页面可以把 Element.prototype.matches 改坏，所以套一层 try；
 * 判不出来就当「不是主播放器」—— 那只是少一条豁免，不会把装饰视频
 * 误判成内容视频。
 */
const matchesSelector = (video: HTMLVideoElement, selector: string): boolean => {
  const safeMatches = (video as SafeMatcher).safeMatches;
  if (safeMatches) {
    return safeMatches.call(video, selector) === true;
  }

  try {
    return video.matches?.(selector) === true;
  } catch {
    return false;
  }
};

/**
 * 站点自己点名的主播放器（YouTube 的 video.html5-main-video 之类）。
 *
 * ⚠️ 这条豁免是**必须的**：YouTube 的主播放器恰恰就是静音自动播的
 * （浏览器只允许静音自动播），而它的 <video> 上**没有**原生 controls ——
 * 于是它的形状与装饰性预览一模一样。没有这条豁免，引导在 YouTube 上
 * 永远不出现，整个扩展的发现机制死在最该工作的站点上。
 *
 * 与 videoRegistry 的差别（那边要求「命中第一个有候选的选择器就停」，
 * 保证主播放器的**唯一性**）：这里只问「这个视频是不是站点点名的」，
 * 所以任何一条 mainSelector 命中都算。多认一两个主播放器不影响后果 ——
 * 豁免只是「不当成装饰物」，而它本来就该被当成内容。
 */
const isSiteMainPlayer = (video: HTMLVideoElement): boolean => {
  const { mainSelectors } = getSiteAdapter(window.location.hostname);
  return mainSelectors.some((selector) => matchesSelector(video, selector));
};

export interface FirstRunHintOptions {
  getShortcuts: () => ShortcutSettings;
  wasShown: () => Promise<boolean>;
  markShown: () => Promise<void>;
  /**
   * 这个事件是不是「用户真的交互了」。
   *
   * 默认读 `event.isTrusted`。注入它只是为了**测试**：
   * jsdom 造出来的事件 isTrusted 恒为 false，而且 `isTrusted` 在 jsdom 里是
   * 实例上的 non-configurable 属性（连原型上的 getter 都没有）——
   * 所以单测**无法**造出可信事件。
   *
   * 与 VideoRegistry 的同名选项是同一套理由。
   */
  isTrustedEvent?: (event: Event) => boolean;
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
    // 显式传 replacements，而不是让调用方自己对返回串做 `.replace('{up}', x)`。
    //
    // 两种写法**渲染结果完全相同**（旧写法靠 t() 把 token 本身当替换值传给
    // Chrome，Chrome 把 "$1" 填成 "{up}"，调用方后面对返回串做的 replace 恰好
    // 能接上）。改成显式不是为了修 bug，是为了让**意图**直白：
    // locale 里的 $1/$2 就是这两个键，不必让人推断「谁把 token 换成了什么」。
    //
    // 顺带解掉一处脆弱：旧写法要求调用方的 replace 与 t() 内部的 token
    // 提取顺序一致，两边各写一遍 '{up}' / '{down}'，改一处忘另一处就会
    // 露出字面量。
    labels.push(
      t('hintSpeed', '$1 / $2 调速', [
        formatShortcut(shortcuts.increaseSpeed),
        formatShortcut(shortcuts.decreaseSpeed),
      ]),
    );
  }

  if (labels.length === 0) {
    return null;
  }

  // 用明确的间隔符而不是连续空格：提示是塞进 innerHTML 的，HTML 会把连续空格
  // 折叠成一个，靠空格排版会渲染成「网页全屏 F = / - 调速」这种挤在一起的样
  // （视觉验收时真的这样出来过）。
  // 只写「可以改绑」等于什么都没说 —— 用户还得自己去找设置在哪。
  // 补上具体路径，第一次看到这条提示的人当场就能改。
  return `${labels.join('  ·  ')}\n${t('hintMore', '全部快捷键可在扩展设置里改绑（右键扩展图标 → 选项）')}`;
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
 *
 * ⚠️ 第一条自我约束原先是**错的**：它以为「播够 2.5 秒」就能排除自动播放。
 * 装饰性预览视频同样会播超过 2.5 秒，于是引导会在长文的顶部凭空弹出，
 * 用户随手按一下键就把**唯一一次**机会烧掉（markShown 已落盘）——
 * 等他真正打开网课时，扩展再也不会开口了。
 * 判据因此改成「这**条**视频是不是站点摆在那儿的装饰物」（见 isAmbientAutoplay）。
 */
export class FirstRunHint {
  private readonly options: FirstRunHintOptions;
  private readonly isTrustedEvent: (event: Event) => boolean;
  /** 尚未展示过；null 表示还没问出来（查存储是异步的）。 */
  private eligible: boolean | null = null;
  private shownThisSession = false;
  private delayTimer: number | null = null;
  private watchedVideo: HTMLVideoElement | null = null;
  /**
   * 用户**亲手选过**的视频，和选它的时间。
   *
   * 为什么需要它：装饰性预览视频在用户点它之后就不再是「装饰的」了 ——
   * 用户亲手选了它 = 那可能正是他要看的视频。
   *
   * ⚠️ 时间戳必须与视频**绑定**（只记时间的话字段会漂移）：用户点了视频 A，
   * 随后站点让预览视频 B 自动播 → B 会白继承 A 的「新鲜度」，
   * 于是装饰视频又混进来了 —— 那正是文章页预览的形状。
   */
  private chosenVideo: HTMLVideoElement | null = null;
  private chosenAt = 0;
  /**
   * 此刻正在播的视频（由 play / pause / ended 事件维护）。
   *
   * 为什么自己维护而不用 `video.paused`：状态读取回答的是「这一刻是不是暂停」，
   * 而这里要回答的是「它是不是**正在**播」。事件是唯一诚实的信号 ——
   * 这也是本文件其余部分一贯的做法（见 boundCancelWatch 的注释）。
   *
   * ⚠️ 用 WeakSet 而不是 Set：视频节点被站点换掉之后仍被强引用着，
   * 就等于不让它被回收（信息流页面上的视频一多就是实打实的泄漏）。
   *
   * 用途只有一个：用户点了一条**正在播**的视频 —— 自动播的预览在用户点它
   * **之前**就已经在播了，它不会再因为这次点击派发 play 事件，所以
   * 「用户点了它」是那条路径上唯一的入口。
   */
  private readonly playingVideos = new WeakSet<HTMLVideoElement>();
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
  private readonly boundCancelWatch = (event: Event) => this.handleWatchEnd(event);
  private readonly boundDismiss = () => this.dismiss();
  /**
   * 记一次「用户亲手点了某个视频」。
   *
   * ⚠️ 合成事件不算「用户的交互」：扩展在 document_start 抢注捕获阶段
   * 监听器，页面脚本能 `dispatchEvent(new PointerEvent('pointerdown'))`
   * 打在自己的预览视频上，把它伪装成「用户选过的」—— 那等于给了页面一个
   * 遥控器，能随时把引导骗出来。页面能伪造事件，但伪造不了 isTrusted。
   *
   * 与 videoRegistry 的 handleInteraction 是**同一套理由**；那边还多一层
   * 「手势必须指向这个视频」的约束，这里不需要：引导关心的是
   * 「用户是否亲手碰过这条视频」，而 pointerdown 落在 video 上
   * 本身就是最直接的证据。
   */
  private readonly boundHandlePointerDown = (event: Event) => this.handlePointerDown(event);

  constructor(options: FirstRunHintOptions) {
    this.options = options;
    this.isTrustedEvent = options.isTrustedEvent ?? ((event) => event.isTrusted);
  }

  start() {
    // 监听器挂在 document 上：视频可能在同源 iframe 里，也可能中途被换成另一个节点。
    document.addEventListener('play', this.boundHandlePlay, true);
    document.addEventListener('pause', this.boundCancelWatch, true);
    document.addEventListener('ended', this.boundCancelWatch, true);
    document.addEventListener('keydown', this.boundDismiss, true);
    document.addEventListener('pointerdown', this.boundDismiss, true);
    // 同一个 pointerdown 还要记「用户亲手选过哪条视频」——两条监听器互不干扰：
    // 一条管「提示消失」，一条管「哪些视频还有资格触发提示」。
    document.addEventListener('pointerdown', this.boundHandlePointerDown, true);

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
    const target = event.target;
    if (!(target instanceof HTMLVideoElement)) {
      return;
    }

    this.playingVideos.add(target);

    // ⚠️ 装饰性自动播放视频直接跳过，**不排计时器**。
    //
    // 「播够 2.5 秒」这个门槛挡不住它：文章里那种边滚动边播的小预览
    // 照样会播过 2.5 秒，于是引导会在长文顶部凭空弹出。用户随手按一下
    // 键，提示消失 + markShown 落盘 —— **唯一一次**机会就这么烧掉了，
    // 等他真正打开网课时，扩展再也不会开口。
    if (this.isDecorativeAutoplay(target)) {
      return;
    }

    this.scheduleReveal(target);
  }

  /**
   * 排一个「看完 2.5 秒就出提示」的计时器。
   *
   * 已经在等、或这一轮已经出过，就不要再排一个 —— 一次等待只认一条视频。
   */
  private scheduleReveal(video: HTMLVideoElement) {
    if (this.delayTimer !== null || this.shownThisSession) {
      return;
    }

    this.watchedVideo = video;
    this.delayTimer = window.setTimeout(() => {
      this.delayTimer = null;
      void this.reveal(this.watchedVideo);
    }, WATCH_DELAY);
  }

  /**
   * 这条视频是不是「站点摆在那儿的装饰物，用户从没选过它」。
   *
   * 三条豁免（任何一条成立就**不是**装饰物）：
   * 1. 有原生 controls —— 站点把它当成一个正经播放器给人用。
   * 2. 站点点名它是主播放器 —— YouTube 的主播放器恰恰就是静音自动播的
   *    （浏览器只允许静音自动播），而它的 <video> 上**没有** controls，
   *    形状与装饰预览一模一样。没有这条豁免，引导在 YouTube 上永远不出现。
   * 3. 用户**亲手选过**它 —— 用户点了 = 用户主动选了它 = 那可能正是
   *    他要看的视频。这时它就不再是「装饰的」了。
   */
  private isDecorativeAutoplay(video: HTMLVideoElement): boolean {
    if (!isAmbientAutoplay(video)) {
      return false;
    }

    if (isSiteMainPlayer(video)) {
      return false;
    }

    if (this.wasChosenByUser(video)) {
      return false;
    }

    return true;
  }

  /**
   * 用户是不是**亲手**选过这条视频（且还在新鲜期内）。
   *
   * 时间窗必须有：用户点一下那个吵人的预览（把它暂停）然后继续读文章，
   * 那次点击不该让他接下来半小时都享受「用户选过」的待遇。
   */
  private wasChosenByUser(video: HTMLVideoElement): boolean {
    if (this.chosenVideo !== video) {
      return false;
    }

    return Date.now() - this.chosenAt < CHOICE_GRACE_MS;
  }

  /**
   * 记一次「用户亲手点了某个视频」。
   *
   * ⚠️ 只认**可信**事件：页面脚本能派发合成的 pointerdown 打在预览视频上，
   * 把自己伪装成「用户选过的」—— 那等于给了页面一个遥控器，能随时把引导骗出来。
   */
  private handlePointerDown(event: Event) {
    if (!this.isTrustedEvent(event)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    // 点在视频上（或者点它的任何后代，比如站点自绘的播放按钮）。
    const video = target.closest('video');
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    this.chosenVideo = video;
    this.chosenAt = Date.now();

    // ⚠️ 用户点了一条**正在播**的视频 —— 这就是「开始看视频」的时刻。
    //
    // 为什么这一条不能省：自动播的预览在用户点它**之前**就已经在播了，
    // 它不会因为用户的点击再派发一次 play 事件。所以「用户点了它」这条
    // 路径是唯一能让引导出现的入口 —— 只靠 play 事件的话，用户点了预览
    // 之后引导永远不会来。
    //
    // 而用户点它这件事本身已经说明了「他要看这条视频」：他点了。
    //
    // ⚠️ 只在「它本来就在播」时才排计时器。用户点一条**还没开始**播的视频，
    // 站点会在点击之后派发 play 事件 —— 那条路径已经覆盖了，不必在这里
    // 提前排（提前排会让「点了但站点没播」的瞬间就开始等 2.5 秒）。
    if (!this.playingVideos.has(video)) {
      return;
    }

    this.scheduleReveal(video);
  }

  /**
   * 视频暂停或播完了。
   *
   * 两件事：从「正在播」集合里摘掉它（它不播了），以及取消这一次的等待。
   */
  private handleWatchEnd(event: Event) {
    if (event.target instanceof HTMLVideoElement) {
      this.playingVideos.delete(event.target);
    }

    this.cancelPendingReveal();
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
    document.removeEventListener('pointerdown', this.boundHandlePointerDown, true);
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
