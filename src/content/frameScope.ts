/**
 * 「这个 frame 是不是当前用户焦点所在」—— 显式操作（点工具栏图标）该由谁执行。
 *
 * 背景：内容脚本注入到**所有** frame 之后，同一个「点一下扩展图标」的意图会
 * 同时送到页面里的每一个 frame。谁都执行 = 进好几次全屏、弹好几个提示。
 * 但浏览器只把焦点给一个 frame —— 焦点所在的那个 frame 才是「用户正在操作的地方」。
 *
 * 判据（真实 Chromium 实测，见 tests/e2e/frame-scale.spec.js 与
 * docs/ARCHITECTURE.md「帧的归属」一节）：
 *
 * - 焦点在顶层文档里 → 顶层 frame 的 `document.hasFocus()` 为 true，
 *   且 `document.activeElement` **不是** iframe 元素。
 * - 焦点在某个 iframe 里 → 顶层 frame 的 `activeElement` 是那个 `<iframe>` 元素
 *   （浏览器把焦点代理到 iframe 元素上），而**那个 iframe 自己的**
 *   `document.hasFocus()` 为 true、`activeElement` 是它内部的元素。
 * - 其余 iframe：`hasFocus()` 为 false。
 *
 * 所以规则是两条：
 * 1. `document.hasFocus()` 为 false → 不是我（焦点在别处）。
 * 2. `document.activeElement` 是 `<iframe>` / `<frame>` → 也不是我
 *    （焦点在那个子 frame 里，由它执行）。
 */

/** 焦点是不是落在了某个子 frame 里（那它就不是当前 frame 的活）。 */
const activeIsNestedFrame = (active: Element | null): boolean => {
  if (!active) {
    return false;
  }

  // ⚠️ 用 tagName 而不是 instanceof：子 frame 里的元素属于**别的 realm**，
  // 本 realm 的 HTMLIFrameElement 构造器认不出它们。
  const tag = active.tagName;
  return tag === 'IFRAME' || tag === 'FRAME';
};

/**
 * 用户当前的焦点是不是在这个文档里（且不在它的子 frame 里）。
 *
 * @param doc 目标文档，默认当前文档。
 */
export const ownsUserFocus = (doc: Document = document): boolean => {
  if (!doc.hasFocus()) {
    return false;
  }

  return !activeIsNestedFrame(doc.activeElement);
};

/**
 * 这个文档是不是顶层文档。
 *
 * ⚠️ 跨域时访问 `window.top` 会抛 SecurityError —— 必须 try/catch，
 * 否则在一个跨域 iframe 里读这个标记就会把整个内容脚本炸掉。
 */
export const isTopDocument = (win: Window = window): boolean => {
  try {
    return win.top === win;
  } catch {
    // 拿不到 top 就当自己不是顶层（保守：少做顶层专属的事）。
    return false;
  }
};
