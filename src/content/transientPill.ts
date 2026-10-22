/**
 * 一次性文字提示的公共骨架。
 *
 * 全屏接管失败与首次使用引导的形态完全一样：挂一个自己的节点、淡入、到点淡出、
 * 被页面摘掉后能自愈、销毁时清干净。差别只在文案、位置与停留时长，所以把骨架
 * 抽出来，两处各自不再重复「判空宿主 / 自愈 / 计时 / 清理」这四件事。
 */

import { announce } from './liveRegion';
import { hideNotice, isolateNotice, showNotice } from './runtimeStyles';
import { mountViewportRoot } from './viewportRoot';

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
  /**
   * 这个提示自己的外观（叠在共用外壳之上）。
   *
   * ⚠️ 之所以是**内联样式**而不是 runtimeStyles 里的 CSS 规则：
   * 提示挂在页面里，站点的 `div { ... !important }` 会打穿样式表里的
   * 任何普通声明。隔离机制见 runtimeStyles.ts 的「页面级提示的样式隔离」。
   */
  styles?: Record<string, string>;
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
    if (!this.prepare(text)) {
      return false;
    }

    return this.present(duration);
  }

  /**
   * 准备好一条文字（**不显示**），返回可测量的节点。
   *
   * 为什么要「先准备、后显示」：有些提示要**先量出它有多高**，才知道放不放得下
   * （见 firstRunHint.ts 的选文案逻辑）。量的时候提示必须是「存在但看不见」的：
   * 节点在 DOM 里（否则量不到高度），但透明（否则用户会看到它闪一下）。
   *
   * ⚠️ 外壳样式本来就是 `opacity: 0`（见 runtimeStyles.ts 的 NOTICE_SHELL_STYLES），
   * 而 opacity 不影响布局 —— 所以刚建好的节点是「有尺寸、看不见」的，正好用来量。
   */
  prepare(text: string): HTMLElement | null {
    const root = this.ensureRoot();
    if (!root) {
      return null;
    }

    root.textContent = text;
    return root;
  }

  /**
   * 让准备好的提示显形。
   *
   * 与 prepare 配对使用：先量尺寸、确认放得下，再显形。
   *
   * @param announceText 读屏播报的文本。默认播**屏幕上显示的那份**；
   *   空间不够时可以显示精简版、播完整版 —— 舍弃的只是视觉版面，
   *   信息不该跟着一起被舍弃（见 firstRunHint.ts 的档位说明）。
   */
  present(duration = this.options.duration, announceText?: string): boolean {
    const root = this.root;
    if (!root) {
      return false;
    }

    // 先移除再强制回流：连续触发时淡入动画每次都能重新开始。
    showNotice(root, this.options.visibleClass);

    if (this.options.announce !== false) {
      announce(announceText ?? root.textContent ?? '');
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

    if (this.root) {
      hideNotice(this.root, this.options.visibleClass);
    }
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
    // 隔离必须**在挂上页面之前**做完：站点的一条全局 CSS 随时可能命中它，
    // 而提示是要贴在视频旁边的，样式被打穿就没有「位置」可言了。
    isolateNotice(root, this.options.styles);
    // 挂到 <html>：body 带 transform 时 fixed 会相对 body 的盒子定位，
    // 胶囊就会飘到视口之外。详见 viewportRoot.ts。
    mountViewportRoot(root);
    this.root = root;
    return root;
  }
}
