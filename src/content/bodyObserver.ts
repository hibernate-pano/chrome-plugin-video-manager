/**
 * 「body 会被站点换掉」这件事的**唯一**观察入口。
 *
 * ## 要解决的问题
 *
 * MutationObserver 绑在**元素**上，不是绑在文档上。
 * 站点只要 `document.body.replaceWith(newBody)`（SPA 重建页面），
 * 观察者就还挂在**已经脱离文档的旧 body** 上 ——
 * 新 body 里的增删它一概看不见，而旧 body 再也不会变化。
 *
 * 实测（真实 Chromium）：注册表的观察者当初就是这么绑的，
 * 于是「DOM 变更代次」永远不前进 → 快捷键路径缓存里的 `null` 永不过期
 * → **所有快捷键静默失灵**，直到用户碰一下视频
 * （用户手势会顺带触发一次作废，于是症状是「点一下就好了」）。
 * 而工具栏图标那条路是按帧重算的，不受影响 ——
 * 于是症状自相矛盾：「图标能点、快捷键没反应」。
 *
 * ## 怎么做
 *
 * 两个观察器，各管一段：
 *
 * 1. **body 级观察器**（`bodyInit` 配置）：body 内部的一切变化。
 *    subtree 覆盖 body 里的所有后代 —— 视频进出、class 变化都在里面。
 * 2. **<html> 级观察器**（只看 documentElement 的**直接子节点**）：
 *    唯一的职责是发现「body 换人了」，
 *    然后把 body 级观察器**重新挂到新 body 上**，并通知订阅方。
 *
 * ## ⚠️ 为什么 <html> 级观察器只看直接子节点、且不喂给 body 回调
 *
 * 我们自己的浮层（控制条、网页全屏背板、调速胶囊、提示卡）全都挂在
 * **<html>** 上（见 viewportRoot.ts）。若去观察 documentElement 的**子树**，
 * 我们自己挂/摘浮层就会被算成「DOM 变化」——
 * 注册表的「DOM 变更代次」每次浮层显隐都前进一次，
 * 6.2.0 那套「测量结果按帧复用」的优化就被打回原形
 * （每次按键都要全页重扫，实测 3 万节点的页面约 3ms，长按时每 120ms 一次）。
 *
 * 所以：只看**直接子节点**，且这一层的记录**不**转发给 body 回调。
 * 订阅方要用这一层信号，只能显式订 `onHostMutation`。
 */

/** 观察器的配置。 */
export interface BodyObserverOptions {
  /**
   * body 级观察器的配置。
   *
   * 默认 `{ childList: true, subtree: true }` —— body 里的一切增删。
   * 需要看属性（controls / autoplay / class / style）就自己写进 attributeFilter。
   */
  bodyInit?: MutationObserverInit;
  /**
   * body 内部发生了变化（记录来自 body 级观察器）。
   *
   * ⚠️ 这一层**不包含**「body 被换掉」这件事 ——
   * 新 body 里的内容在换之前就已经存在，观察者看不到它们的「加入」。
   * 那件事走 `onBodyReplaced`。
   */
  onBodyMutation?: (records: MutationRecord[]) => void;
  /**
   * body 被换成了另一个元素（新的 body 已经重新挂上观察；新 body 为 null
   * 表示 body 被整个拿掉了）。
   *
   * ⚠️ 「body 从**没有**变成有」也算一次（`document_start` 早期 body 还没建好，
   * 建好那一刻就是一次「换人」）—— 那时同样要重新挂上观察、通知订阅方。
   *
   * 订阅方通常要做的事：**把依赖旧 body 的缓存全部作废**。
   */
  onBodyReplaced?: (body: HTMLElement | null) => void;
  /**
   * **<html> 这一层**（documentElement 的直接子节点）发生了变化。
   *
   * 两种订阅理由：
   *
   * 1. 「我们的浮层被站点摘掉了，要重建」——
   *    浮层挂在 <html> 上（见 viewportRoot.ts），
   *    站点整片抹掉时这里会收到通知，订阅方检查自己的节点还在不在、重新挂上。
   *    （目前还没有订阅方 —— 见文件末尾的「P4」说明。）
   * 2. 「网页全屏背板被挂上/摘掉了」——
   *    背板也挂在 <html> 上（fullscreenController.ensureOverlay → mountViewportRoot），
   *    进出全屏只能从这一层看见。
   *
   * ⚠️ 这一层**不代表**「页面内容变了」——
   * 它对 body 内部的任何变化都无感，只看 <html> 的直接子节点。
   */
  onHostMutation?: (records: MutationRecord[]) => void;
}

/** 观察器的句柄。 */
export interface BodyObserver {
  /** 停掉全部观察（body 级与 <html> 级）。 */
  disconnect(): void;
  /** 此刻正被观察着的 body；没有 body 时为 null。 */
  readonly body: HTMLElement | null;
}

/**
 * 开始观察 body。
 *
 * @param options 配置与回调。
 * @returns 句柄：调用 `disconnect()` 收摊。
 */
export const observeBody = (options: BodyObserverOptions = {}): BodyObserver => {
  const bodyInit = options.bodyInit ?? { childList: true, subtree: true };

  /** 此刻正被观察的 body。 */
  let currentBody: HTMLElement | null = null;
  let stopped = false;

  const bodyObserver = new MutationObserver((records) => {
    if (stopped) {
      return;
    }
    options.onBodyMutation?.(records);
  });

  const hostObserver = new MutationObserver((records) => {
    if (stopped) {
      return;
    }

    // body 换人了吗？
    //
    // ⚠️ 这一步是整个工具存在的理由：观察者绑在**元素**上，
    // body 被换掉之后旧观察者就成了孤儿（它再也收不到任何通知）。
    const next = document.body;
    if (next !== currentBody) {
      currentBody = next;
      // observe() 不会顶掉旧目标，必须先 disconnect 再 observe。
      bodyObserver.disconnect();
      if (next) {
        bodyObserver.observe(next, bodyInit);
      }
      options.onBodyReplaced?.(next);
    }

    options.onHostMutation?.(records);
  });

  const root = document.documentElement;
  if (root) {
    // 只看**直接子节点**：body 是 <html> 的直接子节点，
    // 而我们在 <html> 上挂的浮层也是 —— 两者都在这一层，
    // 但订阅方各自决定要不要理会（见 onHostMutation 的说明）。
    hostObserver.observe(root, { childList: true });
  }

  currentBody = document.body;
  if (currentBody) {
    bodyObserver.observe(currentBody, bodyInit);
  }

  return {
    disconnect() {
      stopped = true;
      bodyObserver.disconnect();
      hostObserver.disconnect();
      currentBody = null;
    },
    get body() {
      return currentBody;
    },
  };
};

/*
 * ---------------------------------------------------------------------------
 * 📌 关于 P4：「站点重建 <html> 时，挂在 <html> 上的浮层被整片抹掉」
 * ---------------------------------------------------------------------------
 *
 * 本工具的 `onHostMutation` 正是那个通知口：<html> 的直接子节点变了 ——
 * 我们的浮层若被站点摘掉（`documentElement.innerHTML = ''` 之类），
 * 订阅方在这里检查自己的节点还在不在、重新挂上即可。
 *
 * ⚠️ 但「站点把 **<html> 本身**换掉」这一档**不在**本工具的覆盖范围内：
 * 本工具观察的是 documentElement，而它一旦被换掉，观察者就成了孤儿
 * （与 body 被换掉一模一样的病，只是高了一层）。
 * 那一档要观察的是 **document**（documentElement 是 document 的唯一子节点），
 * 是另一件事 —— 建议单独修，不要混进本工具。
 */
