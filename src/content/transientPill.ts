/**
 * 一次性文字提示的公共骨架。
 *
 * 全屏接管失败与首次使用引导的形态完全一样：挂一个自己的节点、淡入、到点淡出、
 * 被页面摘掉后能自愈、销毁时清干净。差别只在文案、位置与停留时长，所以把骨架
 * 抽出来，两处各自不再重复「判空宿主 / 自愈 / 计时 / 清理」这四件事。
 */

export interface TransientPillOptions {
  /** DOM id；也是 runtimeStyles 里选择器的锚点。 */
  id: string;
  /** 可见类名，由 runtimeStyles 定义过渡。 */
  visibleClass: string;
  /** 停留时长（毫秒）。 */
  duration: number;
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
