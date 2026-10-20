/**
 * 字幕避让：控制条出现时把字幕往上抬，隐藏时放回去。
 *
 * 单独成模块的原因：**位移必须可精确还原**。
 *
 * 字幕是**站点自己的节点**。我们在它身上加的位移，退出全屏时必须**一模一样地撤掉**，
 * 且不能顺手抹掉站点自己写的位移 —— 很多站点的字幕/弹幕容器都带
 * `transform: translateY(-50%)`（用来做垂直居中）或 `scale()`。
 *
 * ⚠️ 早先的实现是 `element.style.removeProperty('transform')`：这会把站点自己的
 * transform 一起抹掉，于是退出全屏后字幕的位置就变了 —— 站点里好好的字幕，
 * 退出一趟全屏就歪了。
 *
 * ⚠️⚠️ 但"记计算值、还原时把计算值写回去"是**错的**，而且错得更隐蔽。
 *
 * 计算值里的百分比**已经被解析成像素**了：
 *   站点写 `transform: translateX(-50%)`（视频站字幕居中的标准写法）
 *   → 计算值是 `matrix(1, 0, 0, 1, -320, 0)`（按 640px 容器算）
 *   → 把它写回内联，站点样式表里那条百分比规则就被**永久顶掉**了。
 *   容器一变宽（进全屏后画面框是 960px），站点本该算出的 -480 永远不会再出现。
 *
 * 实测：容器 640px → 进全屏（960px）→ 退出，字幕**向左偏 80px**（640px 的 12.5%）。
 * 换行时更糟：站点想用 -50% 跟着新高度重算，我们冻住的是旧高度的一半。
 * 站点样式表里带 `!important`、或者字幕有 CSS 入场动画时，同样会被永久冻住。
 *
 * 所以这里的规则是：
 * - **加位移时**用**计算值**当基准 —— 站点的 transform 可能写在样式表里，
 *   只看内联值会拿到空串，那样我们写出去的内联会盖掉样式表那条，
 *   字幕在全屏里就丢了站点自己的位移（比如 translateX(-50%) 的居中）。
 * - **撤位移时**绝不写回计算值：站点自己写了内联 transform 就**原样写回**
 *   （那是它自己的百分比，仍然会跟着容器重算）；没写就**把属性整个删掉**，
 *   让样式表重新接管。
 *
 * 一句话：**我们只负责"临时覆盖"，不负责"还原"** —— 撤掉覆盖，站点的一切自动复原。
 */

/** 每个字幕节点的原始状态。 */
interface OriginalTransform {
  element: HTMLElement;
  /**
   * 加位移**之前**的基准 transform（计算值）。
   *
   * 必须记下来，不能每次重算：第一次加位移后，元素上已经有我们写的
   * `translateY(-40px)`，此时再读计算值会把它一起读进来 ——
   * 第二次调位移就变成 -40 与 -25 叠加，字幕会一路飘上去。
   */
  base: string;
  /** 站点自己写的内联 transform（原样，不是计算值）。 */
  inlineTransform: string;
  /** 内联 transform 的优先级（'' 或 'important'）。 */
  inlinePriority: string;
}

const originals = new Map<HTMLElement, OriginalTransform>();

const computedTransform = (element: HTMLElement): string => {
  try {
    const view = element.ownerDocument.defaultView;
    if (!view) {
      return element.style.transform;
    }
    return view.getComputedStyle(element).transform || 'none';
  } catch {
    return element.style.transform || 'none';
  }
};

/**
 * 给字幕加一个向上的位移。
 *
 * @param pixels 位移像素数，0 表示撤销。
 */
export const setSubtitleOffset = (element: HTMLElement, pixels: number): void => {
  if (!element.isConnected) {
    return;
  }

  if (pixels === 0) {
    restoreSubtitleOffset(element);
    return;
  }

  if (!originals.has(element)) {
    originals.set(element, {
      element,
      // 基准取**计算值**：站点的 transform 常常写在样式表里，只看内联值会拿到
      // 空串 —— 那样我们写出去的内联会盖掉样式表那条，字幕在全屏里丢了居中。
      base: computedTransform(element),
      inlineTransform: element.style.getPropertyValue('transform'),
      inlinePriority: element.style.getPropertyPriority('transform'),
    });
  }

  // 基准用**登记时记下的那个**，不能重读：第一次加位移后元素上已经有我们写的
  // translateY，重读会把它一起读进来，第二次调位移就变成叠加。
  //
  // 写回用 !important：站点的 transform 可能带 !important（主题切换、
  // 媒体查询都会这么写），普通内联压不过它 —— 我们的位移会被整条吃掉。
  const base = originals.get(element)?.base ?? 'none';
  const offset = `translateY(-${Math.round(pixels)}px)`;
  const combined = base === 'none' ? offset : `${base} ${offset}`;
  element.style.setProperty('transform', combined, 'important');
};

/**
 * 撤销我们加的位移。
 *
 * ⚠️ 这里**绝不能**把"动之前的计算值"写回去（原因见文件头的说明）：
 * 计算值里的百分比已经变成像素，写回去等于永久顶掉站点样式表里那条规则。
 *
 * 正确做法是"撤掉覆盖，让站点自己接管"：
 * - 站点写了内联 transform → 原样写回（它自己的百分比仍会跟着容器重算）
 * - 站点没写内联 transform → 把属性整个删掉，样式表重新接管
 */
export const restoreSubtitleOffset = (element: HTMLElement): void => {
  const original = originals.get(element);
  if (!original) {
    return;
  }

  originals.delete(element);

  if (original.inlineTransform) {
    element.style.setProperty('transform', original.inlineTransform, original.inlinePriority);
  } else {
    // 站点本来就没有内联 transform：整个属性删掉，让样式表重新接管。
    element.style.removeProperty('transform');
  }
};

/** 撤销所有已登记字幕的位移（全屏结束时统一调用）。 */
export const restoreAllSubtitleOffsets = (): void => {
  for (const { element } of [...originals.values()]) {
    restoreSubtitleOffset(element);
  }
};
