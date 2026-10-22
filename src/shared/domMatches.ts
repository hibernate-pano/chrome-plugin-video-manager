/**
 * 元素与 CSS 选择器的匹配 —— **一份**，带退化路径。
 *
 * ⚠️ 为什么住在 `src/shared/`：内容脚本与扩展页面都会用得上，而
 * 「页面可以把 `Element.prototype.matches` 改坏」这件事对两边都成立。
 *
 * ⚠️ 为什么必须带 try/catch：页面脚本可以把 `Element.prototype.matches`
 * 换成会抛异常的版本（也可以直接把它删掉）。而这条判定在「装饰性预览」的
 * **核心路径**上 —— 它一旦抛异常，`computeAmbientPreview` 抛 →
 * 整条候选扫描抛 → 快捷键彻底失灵（整个扩展等于没装）。
 *
 * ⚠️ 退化方向：**判不出来就当「不匹配」**。那是**保守**方向 ——
 * 「站点有没有点名它」判不出来时，只少一条豁免（多接管一点、多提示一点），
 * 而不会把一条正经的内容视频误判成装饰物。
 */

/** 页面（或测试）可以挂在元素上的「安全 matches」。 */
export type SafeMatcher = Element & { safeMatches?: (selector: string) => boolean };

/**
 * 这个元素是不是匹配这条选择器。**判不出来就当不匹配。**
 *
 * ⚠️ 页面可以把 `Element.prototype.matches` 改坏（换成会抛异常的版本，
 * 或者直接删掉）。所以这里必须套一层 try —— 而且**两条路径都退化**：
 * 页面提供的 `safeMatches` 自己抛异常时也一样当「不匹配」。
 *
 * ⚠️ 为什么以前有一份**没有** try/catch 的副本（videoRegistry 那份）：
 * 那条链路当时还没进「装饰性判定」的核心路径，抛了也只是「这一档判定失败」；
 * 现在它进了核心路径 —— 一个改坏 `matches` 的站点能让整条候选扫描抛掉。
 * 两份副本必须收成这一份，否则「健壮性」又变成「看哪份代码先写的」。
 */
export const matchesSelector = (element: Element, selector: string): boolean => {
  const safeMatches = (element as SafeMatcher).safeMatches;
  if (safeMatches) {
    try {
      return safeMatches.call(element, selector) === true;
    } catch {
      return false;
    }
  }

  try {
    return element.matches?.(selector) === true;
  } catch {
    return false;
  }
};

/**
 * 沿祖先链找**第一个**匹配这条选择器的元素。**判不出来就当「没有」。**
 *
 * ⚠️ 与 `matchesSelector` 是**同一类**问题：页面可以把
 * `Element.prototype.closest` 换成会抛异常的版本（也可以直接删掉它）。
 *
 * 而它出现在两条**核心路径**上，抛了就会让功能静默消失：
 *
 *   - 记手势时找「用户当时点的是哪条视频」→ 抛了，那条视频就永远拿不到
 *     「用户碰过它」「站点自己开的」两条证据 → 它被判成装饰物 →
 *     **既不接管、也不弹引导**（产品等于没装）；
 *   - 首次引导的 pointerdown → 抛了，「用户点过预览」记不上 →
 *     引导**永远不出现**（而引导是这个产品全部的可见入口）。
 *
 * 退化方向与 `matchesSelector` 一致：**判不出来就当「没有」** ——
 * 少一条证据，而不是把整条链路带崩。
 */
export const closestSelector = (element: Element, selector: string): Element | null =>
  probe(element, selector).element;

/**
 * `closest` 的三态判定：**找到了 / 确实没有 / 判不出来**。
 *
 * ⚠️ 为什么需要「判不出来」这一态：有的调用方要的答案不是「有没有」，
 * 而是「**能不能排除掉**」。
 *
 * 例：字幕层探测时要排除「我们自己那些浮层」——
 * 判不出来时**保守**当成「排除不掉」（于是不搬那一层），
 * 因为把全屏背板或控制条搬进画面里，比少搬一层字幕严重得多。
 * 而「用户点的是哪条视频」那条路径要的恰恰相反：
 * 判不出来就当「没点中」（少一条证据，而不是崩）。
 *
 * 两种方向都是「保守」，只是保守的**内容**不同 ——
 * 所以这里给三态，让调用方自己决定。
 */
export type ClosestProbe = 'found' | 'absent' | 'unknown';

interface ClosestResult {
  status: ClosestProbe;
  element: Element | null;
}

/**
 * 探针本体：**只调一次** closest，同时给出状态与命中的元素。
 *
 * ⚠️ 为什么强调「只调一次」：页面可以把 closest 换成「第一次调用返回对的、
 * 第二次就抛」的版本 —— 调两次等于给自己开一个抛异常的入口。
 */
const probe = (element: Element, selector: string): ClosestResult => {
  try {
    const closest = element.closest;
    if (typeof closest !== 'function') {
      return { status: 'unknown', element: null };
    }
    const found = closest.call(element, selector);
    return found ? { status: 'found', element: found } : { status: 'absent', element: null };
  } catch {
    return { status: 'unknown', element: null };
  }
};

export const probeClosest = (element: Element, selector: string): ClosestProbe =>
  probe(element, selector).status;
