/**
 * 把「元素在自己文档里的视口坐标」换算到**提示所在文档**的视口坐标系。
 *
 * ⚠️ 换算的终点不是「顶层文档」，而是「提示挂在哪份文档里」——
 * 6.1.0 之后这两件事**不再是同一个**。
 *
 * 内容脚本注入到所有 frame 之后，提示（调速胶囊、接管提示）挂在**当前 realm
 * 自己的 document.body** 上（speedToast.ts / takeoverNotice.ts 里都是
 * `document.body.appendChild`），而 `position: fixed` 的参照系是**它自己那份
 * 文档的视口**。于是坐标必须换算到**当前 realm 的视口**：
 * - 当前 realm 是顶层 → 换算目标就是顶层文档（与 6.0.x 一样）；
 * - 当前 realm 是 iframe → 换算目标就是那个 iframe 自己的文档。
 *
 * ⚠️ 换算到顶层坐标是**错的**（实测，真实 Chromium）：
 * 内容脚本跑在 iframe 里时，提示也住在 iframe 里，而 iframe 的视口只有
 * 220px 高、视频在顶层 y=360 —— 换算到顶层会算出 `top = 376px`，
 * 胶囊被推到 iframe **之外**，用户什么也看不到；接管提示更糟：
 * 它的 `bottom` 是拿 `window.innerHeight`（iframe 的高度）减去视频的
 * **顶层**坐标算出来的，两套坐标系混用直接算出一个屏幕外的值。
 *
 * 沿 frameElement 逐层向上换算，直到元素所在文档就是**当前 realm 的 document**。
 * 跨域时 frameElement 取不到（访问即抛或为 null），退回未换算的坐标——跨域本来也
 * 下钻不进内容脚本，这里不能因此抛错。
 */

export interface TopLevelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * 元素在**提示所在文档的视口坐标系**里的矩形。
 *
 * ⚠️ 名字里的 "topLevel" 是历史包袱（6.0.x 时提示只挂在顶层文档）：
 * 现在的换算终点是「提示所在的那份文档」，见文件头。
 *
 * ⚠️ 为什么不只是「加偏移」：iframe 被 `transform: scale()` 缩放时，
 * 它内部的 CSS 像素与父文档的 CSS 像素**不是 1:1**。
 *
 * 实测（真实 Chromium）：顶层放 `iframe { width:700px; height:500px;
 * transform:scale(0.5) }`，iframe 内放一个 `margin-top:50px` 的视频 ——
 * 视频的真实视觉位置是 `top = 400 + 50×0.5 = 425`，
 * 而「只加偏移」的算法算出 `400 + 50 = 450`，**偏了 25px**。
 * 缩放比越小、iframe 离视口越远，偏得越多。
 *
 * 所以这里返回的是**换算后的完整矩形**（含宽高），
 * 而不是「原矩形 + 一个偏移量」—— 后者在有缩放时根本表达不了正确结果
 * （宽度也要跟着缩，而偏移量依赖矩形本身，算不出一个常数）。
 *
 * 换算公式（每一层）：
 *   父坐标 = frameRect.left + scale × (frame.clientLeft + 子坐标)
 *   scale  = frameRect.width / frame.offsetWidth
 * - `frame.offsetWidth` 是 iframe **未变换**的 border box 宽度，
 *   `frameRect.width` 是变换后的视觉宽度 → 两者之比就是有效缩放比
 *   （对 `transform: scale` 与 CSS `zoom` 都成立）。
 * - `frame.clientLeft` 是 iframe 内容区相对 border box 的内缩（border 宽度），
 *   内容坐标要从 border box 原点再往里挪这么多。
 *
 * 变换原点（`transform-origin`）不需要单独处理：
 * 它在「内容坐标 → 视觉坐标」的映射里会自己抵消掉。
 */
export const topLevelRect = (element: Element): TopLevelRect => {
  const rect = element.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;

  let currentDocument = element.ownerDocument;

  /**
   * 换算的终点：**提示所在的那份文档** = 当前 realm 的 document。
   *
   * ⚠️ 别写成「视频所在文档链的顶层」：那是**另一套**坐标系，与提示的
   * `position: fixed` 参照系对不上（见文件头的实测记录）。
   * 内容脚本跑在 iframe 里时，这一行就是「不换算」—— 那正是对的：
   * 提示与视频同处 iframe 的视口坐标系。
   */
  const hostDocument = document;

  while (currentDocument && currentDocument !== hostDocument) {
    const frame = currentDocument.defaultView?.frameElement;
    if (!frame) {
      break;
    }

    // frameElement 的类型是 Element，但**只有** <iframe> / <frame> 会有它 ——
    // 而这两个元素一定有布局盒（offsetWidth/clientLeft）。
    const frameBox = frame as HTMLElement;

    const frameRect = frame.getBoundingClientRect();
    const scaleX = frameBox.offsetWidth > 0 ? frameRect.width / frameBox.offsetWidth : 1;
    const scaleY = frameBox.offsetHeight > 0 ? frameRect.height / frameBox.offsetHeight : 1;
    const contentLeft = frameBox.clientLeft;
    const contentTop = frameBox.clientTop;

    const mapX = (value: number) => frameRect.left + scaleX * (contentLeft + value);
    const mapY = (value: number) => frameRect.top + scaleY * (contentTop + value);

    const nextLeft = mapX(left);
    const nextRight = mapX(right);
    const nextTop = mapY(top);
    const nextBottom = mapY(bottom);

    left = nextLeft;
    right = nextRight;
    top = nextTop;
    bottom = nextBottom;

    currentDocument = frame.ownerDocument;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};
