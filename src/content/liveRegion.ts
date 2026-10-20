/**
 * 读屏播报通道。
 *
 * 为什么需要它：这个产品**全部**的用户可见反馈都是视觉元素 —— 调速胶囊
 * 显示一个 "1.5x"、首次引导显示两行字、接管失败显示一句话。读屏用户从这些
 * 元素里得不到任何信息：它们要么是 `aria-hidden="true"`，要么只是一个
 * 没有语义的视觉节点。
 *
 * 而这恰恰是产品**唯一**的反馈通道：控制条 3 秒无操作就隐藏，键盘调速时它
 * 往往根本不在屏幕上。于是读屏用户按了 `=`，什么也听不到 —— 他无法确认
 * 任何操作生效了。这不是"体验差一点"，而是**功能对这一类用户不可用**。
 *
 * 做法：一个视觉上完全不可见（1px + clip）的 `role="status"` 区域，
 * 把同样的文本喂给屏幕阅读器。屏幕阅读器读的是 aria-live 区域的内容，
 * 与它在视觉上是否可见无关 —— 这正是 aria-live 存在的意义。
 *
 * 三个提示各自播报自己的内容，但共用这一个区域：屏幕上同时出现两条提示
 * 的概率极低，而多个 live region 会让读屏用户听到互相打断的播报。
 */

const LIVE_REGION_ID = 'vsc-live-region';

/** 重复同一句话时的重新播报延迟（毫秒）。 */
const REANNOUNCE_DELAY = 50;

let region: HTMLElement | null = null;
let announceTimer: number | null = null;

/**
 * 取（必要时重建）live region 节点。
 *
 * 自愈的必要性与其他注入节点相同：个别站点会主动清理不认识的外来 DOM，
 * 节点被摘走后若继续复用游离引用，播报会静默失效。
 */
const ensureRegion = (): HTMLElement | null => {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  if (region && region.isConnected) {
    return region;
  }

  const element = document.createElement('div');
  element.id = LIVE_REGION_ID;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  document.body.appendChild(element);
  region = element;
  return element;
};

/**
 * 播报一条文本。
 *
 * `role="status"` + `aria-live="polite"` 的组合是「非紧急、不打断当前朗读」
 * 的正确选择：用户正在读别的东西时，播报会排队等当前这句读完。
 *
 * 重复同一句话时需要重新播报：屏幕阅读器只在**内容发生变化**时才会播报，
 * 把同样的文字再写一遍不算变化。所以清空一次、隔一小段时间再写回去。
 */
export const announce = (text: string) => {
  const element = ensureRegion();
  if (!element) {
    return;
  }

  if (announceTimer !== null) {
    window.clearTimeout(announceTimer);
    announceTimer = null;
  }

  if (element.textContent !== text) {
    element.textContent = text;
    return;
  }

  element.textContent = '';
  announceTimer = window.setTimeout(() => {
    announceTimer = null;
    if (element.isConnected) {
      element.textContent = text;
    }
  }, REANNOUNCE_DELAY);
};

/** 清理。内容脚本卸载时调用，避免留下一个孤儿节点。 */
export const destroyLiveRegion = () => {
  if (announceTimer !== null) {
    window.clearTimeout(announceTimer);
    announceTimer = null;
  }

  region?.remove();
  region = null;
};
