/**
 * 一次性文字提示的公共骨架。
 *
 * 全屏接管失败与首次使用引导的形态完全一样：挂一个自己的节点、淡入、到点淡出、
 * 被页面摘掉后能自愈、销毁时清干净。差别只在文案、位置与停留时长，所以把骨架
 * 抽出来，两处各自不再重复「判空宿主 / 自愈 / 计时 / 清理」这四件事。
 */

import { announce } from './liveRegion';

export interface TransientPillOptions {
  /** DOM id；也是 runtimeStyles 里选择器的锚点。 */
  id: string;
  /** 可见类名，由 runtimeStyles 定义过渡。 */
  visibleClass: string;
  /** 停留时长（毫秒）。 */
  duration: number;
  /**
   * 是否同时用读屏播报。
   *
   * 默认 true：这两个提示都是**产品唯一的告知渠道**（首次引导是整个扩展的
   * 发现机制，接管失败是"为什么没反应"的唯一解释），视觉上只是一块深色底、
   * 白字的贴片，读屏用户从中得不到任何信息。所以它们必须有一条读屏通道。
   *
   * 视觉节点本身仍然保持 aria-hidden：播报走的是独立的 live region，
   * 保留 aria-hidden 可以避免某些读屏器在 DOM 变化时重复念一遍。
   */
  announce?: boolean;
}

export class TransientPill {
  private readonly options: TransientPillOptions;
  private root: HTMLDivElement | null = null;
  private hideTimer: number | null = null;

  constructor(options: TransientPillOptions) {
    this.options = options;
  }

  /**
   * 显示一条文字。返回是否真的显示出来了——没有可挂载的宿主（SVG/foreignObject
   * 等 document.body === null 的文档）时返回 false，调用方据此决定要不要记「已展示」。
   */
  show(text: string, duration = this.options.duration): boolean {
    const root = this.ensureRoot();
    if (!root) {
      return false;
    }

    root.textContent = text;

    // 先移除再强制回流：连续触发时淡入动画每次都能重新开始。
    root.classList.remove(this.options.visibleClass);
    void root.offsetWidth;
    root.classList.add(this.options.visibleClass);

    if (this.options.announce !== false) {
      announce(text);
    }

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
    }

    this.hideTimer = window.setTimeout(() => this.hide(), duration);
    return true;
  }

  /** 立即淡出。计时器一起取消，避免第二次 hide 打乱后续一次 show。 */
  hide() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.root?.classList.remove(this.options.visibleClass);
  }

  destroy() {
    this.hide();
    this.root?.remove();
    this.root = null;
  }

  private ensureRoot(): HTMLDivElement | null {
    // SVG/foreignObject 等文档里 document.body === null，没有可挂载的宿主；
    // 裸调 appendChild 会抛 TypeError。
    if (!document.body) {
      return null;
    }

    // 自愈：站点会主动清理不认识的外来节点，root 被摘走后继续复用游离引用
    // 会让提示静默失效。
    if (this.root && this.root.isConnected) {
      return this.root;
    }

    const root = document.createElement('div');
    root.id = this.options.id;
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
    this.root = root;
    return root;
  }
}
