import { FULLSCREEN_OVERLAY_ID } from './runtimeStyles';
import { observeBody } from './bodyObserver';
import type { BodyObserver } from './bodyObserver';

/**
 * 控制器给「正在网页全屏里的那个视频」打的 class。
 *
 * ⚠️ 必须与 fullscreenController.applyFullscreenLayout() 写进去的**完全一致**：
 * 那边加、这边读，两边对不上这套机制就静默失效（而且不会有任何报错）。
 *
 * 它是**控制器的会话账本**：
 * - fullscreenController.enter() → applyFullscreenLayout() 把它加上；
 * - fullscreenController.release() → 把它摘掉。
 *
 * 也就是说：它在 DOM 上的存续期 = 「网页全屏会话」的存续期，
 * 而且它是**属性**变化（不是节点增删），所以盯它不会漏。
 */
export const FULLSCREEN_VIDEO_CLASS = 'vsc-page-fullscreen-video';

/** 会话观察器的配置。 */
export interface FullscreenSessionOptions {
  /**
   * 意图指向的那个视频（可以随时间变化 —— 用户换了视频）。
   *
   * 为什么是「意图指向的」而不是「当前页面上的任意一个视频」：
   * 判据要回答的是「**这个**视频是不是正在全屏里」，
   * 而各订阅方关心的都是自己关心的那个视频。
   */
  getVideo: () => HTMLVideoElement | null;
  /**
   * 会话状态变化时回调：进全屏一次、退全屏一次。
   *
   * ⚠️ 只在**变化**时回调（幂等）：页面自己改 DOM 不会把订阅方叫醒。
   */
  onChange: (active: boolean) => void;
}

/** 会话观察器的句柄。 */
export interface FullscreenSession {
  /** 上一次观察到的状态（缓存值）。 */
  readonly active: boolean;
  /** 此刻是否在网页全屏里（读当前事实，不靠缓存）。 */
  isActive(): boolean;
  /** 目标视频换了之后要调一次（把 class 观察器挪到新视频上）。 */
  refresh(): void;
  /** 收摊。 */
  dispose(): void;
}

/**
 * 盯着「网页全屏会话」的开始与结束。
 *
 * ## 判据：看**控制器的账本**，不看 DOM 的形状
 *
 * 旧判据是「全屏背板（#vsc-page-fullscreen-overlay）在不在 DOM 里」。
 * 那是**间接**信号 —— 背板是我们自己的浮层，它在不在，取决于
 * 「这一轮全屏会话有没有收摊」，而收摊有若干条路径，其中一条
 * （release() 在 state.video 为空时提前返回）会让背板赖在 DOM 里。
 * 于是判据与事实对不上：会话已经结束，判据却说「还在全屏里」。
 *
 * 现在的主判据是**控制器自己写在视频身上的那个 class**
 * （FULLSCREEN_VIDEO_CLASS）：
 * - 它在 enter() 时加上、在 release() 时摘掉 —— 存续期与会话**完全重合**；
 * - 它是**属性**变化，观察它不会漏；
 * - 它跟站点的 DOM 变化**完全无关** —— 站点每秒塞一个广告节点，
 *   这个 class 纹丝不动，角标的计时也就不会被推后。
 *
 * 背板在不在只作为**兜底**：目标视频从来不是全屏视频时
 * （用户给 A 调速、进的全屏却是 B），那个 class 不会出现，
 * 这时只能以背板为准。
 *
 * ## 两条观察线
 *
 * 1. **class 观察器**（目标视频自己的 class 属性）—— 主判据的信号源。
 * 2. **表面观察器**（body 的直接子节点 + <html> 的直接子节点）—— 兜底判据的信号源，
 *    同时也是「进全屏」的第一条信号（背板被挂上）。
 *
 * 两条线都只喂同一个 `check()`，而 `check()` 是幂等的：
 * 状态没变就直接返回，不会重排任何计时。
 */
export const watchFullscreenSession = (options: FullscreenSessionOptions): FullscreenSession => {
  let disposed = false;
  /** 上一次观察到的会话状态。 */
  let active = false;
  /**
   * 「目标视频确实当过全屏视频」这件事。
   *
   * 为什么需要它：主判据是「目标视频身上还有没有那个 class」，
   * 但目标视频**换了**之后（新的一次调速指向了另一个视频），
   * 新视频身上本来就不会有那个 class —— 那时不能因为「它没有 class」
   * 就断言「不在全屏里」。这个标记记的是「这个视频当过全屏视频，
   * 它的 class 消失 = 会话结束」，而不是「它现在有没有 class」。
   */
  let targetWasFullscreen = false;
  /** 正在被观察 class 变化的那个视频。 */
  let observedVideo: HTMLVideoElement | null = null;
  let classObserver: MutationObserver | null = null;

  /**
   * 判据：此刻还在网页全屏里吗？
   *
   * ⚠️ 它有副作用（会记下 targetWasFullscreen）—— 那不是「读」了，
   * 是「读到了一条新事实」。所以它只能由 check() / isActive() 调用，
   * 不能拿去做纯查询。
   */
  const read = (): boolean => {
    const video = options.getVideo();
    if (video) {
      if (video.classList.contains(FULLSCREEN_VIDEO_CLASS)) {
        // 控制器的账本：这个视频正在全屏里。
        targetWasFullscreen = true;
        return true;
      }
      if (targetWasFullscreen) {
        // 这个视频确实当过全屏视频，而它身上的标记已经没了 ——
        // 会话结束了（哪怕背板节点还赖在 DOM 里没被摘掉）。
        return false;
      }
    }

    // 目标视频不是全屏视频（用户给 A 调速、进的全屏是 B）：
    // 那个 class 不会出现，这时只能以背板在不在为准。
    return document.getElementById(FULLSCREEN_OVERLAY_ID) !== null;
  };

  /** 状态变了才叫醒订阅方。 */
  const check = () => {
    if (disposed) {
      return;
    }

    const next = read();
    if (next === active) {
      // 状态没变 —— 这次变化与全屏无关（站点自己改了 DOM）。
      // ⚠️ 这里**不能**重排任何计时：否则页面每隔一秒塞一个广告节点，
      // 角标的 3 秒计时就会被一直推后，永远出不来。
      return;
    }

    active = next;
    options.onChange(next);
  };

  /**
   * 把 class 观察器挪到当前的目标视频上。
   */
  const syncClassObserver = () => {
    const video = options.getVideo();
    if (video === observedVideo) {
      return;
    }

    classObserver?.disconnect();
    classObserver = null;
    observedVideo = video;
    // 目标视频换了 → 「它当过全屏视频」这件事重新算。
    targetWasFullscreen = false;

    if (!video) {
      return;
    }

    classObserver = new MutationObserver(() => {
      check();
    });
    // ⚠️ 只看 class 属性这一个：控制器只在「进/出全屏」时动它。
    // 站点自己改视频的 class（playing / ended / 清晰度标记…）也会触发回调，
    // 但那时状态没变 → check() 直接返回，不会重排任何计时。
    classObserver.observe(video, { attributes: true, attributeFilter: ['class'] });
  };

  const surfaceWatcher: BodyObserver = observeBody({
    // 只看 body 的**直接子节点**：body 上的其它增删（站点自己塞个广告位）
    // 与全屏无关。
    bodyInit: { childList: true },
    onBodyMutation: () => check(),
    // ⚠️ <html> 这一层才是「背板增删」真正会发生的地方 ——
    // 网页全屏背板挂在 <html> 上（fullscreenController.ensureOverlay →
    // mountViewportRoot，见 viewportRoot.ts）。
    onHostMutation: () => check(),
  });

  // 起点必须与事实对齐：观察者可能是在用户**已经**进了全屏之后才挂上的
  // （比如进全屏后才第一次调速），此时真实状态已经是「在全屏里」。
  // 若这里留成 false，等到退出全屏时「false → false」不算变化，
  // 订阅方就永远等不到那次「回来」的信号。
  syncClassObserver();
  active = read();

  return {
    get active() {
      return active;
    },
    isActive: () => (disposed ? false : read()),
    refresh() {
      if (disposed) {
        return;
      }
      syncClassObserver();
      check();
    },
    dispose() {
      disposed = true;
      classObserver?.disconnect();
      classObserver = null;
      observedVideo = null;
      surfaceWatcher.disconnect();
    },
  };
};
