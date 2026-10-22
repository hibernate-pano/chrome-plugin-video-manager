/**
 * 浮层的**唯一挂载点**。
 *
 * ## 为什么不能挂在 <body> 上
 *
 * 我们所有浮层（控制条、网页全屏背板、调速胶囊、提示卡）都是
 * `position: fixed`，靠它落在**视口**上。但 CSS 有一条规矩：
 * **祖先只要带 transform / filter / perspective / backdrop-filter /
 * contain / will-change（这些属性），它就成了 fixed 后代的包含块** ——
 * 于是 `fixed` 不再相对视口，而是相对那个祖先的盒子。
 *
 * ⚠️ 那份属性的**权威清单**在 `iframeExpansion.ts` 的
 * `CONTAINING_BLOCK_PROPERTIES`（那边要逐个属性按规范判断
 * 「有值是否真的形成包含块」，因为 `contain: size` 与
 * `will-change: opacity` 都不关）。本文件不需要那份清单 ——
 * 它靠**挂到 offending 祖先之外**来免疫，不靠逐个属性地判断。
 *
 * 而 <body> 恰恰是最常被这样处理的元素：`body { transform: translateZ(0) }`
 * 是站点做 GPU 加速的常见写法。于是：
 *
 *   - body 高 2400px、视口高 700px 时，背板铺成 2400px；
 *   - 视频（`position: fixed; inset: 0`）落在 850..1550px —— **完全在屏外**；
 *   - 控制条落在 2334px、收起态那枚唯一常驻退出钮落在 2360px —— **都在屏外**。
 *
 * 实测（真实 Chromium，1000×700 视口 + `body{transform:translateZ(0)}`）：
 * 用户看到的是**一片黑**，没有画面、没有控制条、没有退出按钮。
 * 网页全屏这个核心功能在这样的站点上**整个报废**。
 *
 * ## 为什么挂在 <html>（documentElement）上
 *
 * <html> 是 body 的祖先，也是 body 的**父**——但网页全屏这类东西
 * 本身是"页面级 UI"，它不属于站点的内容结构。
 *
 * 更实际的好处有三个：
 *
 *   1. **躲开 body 的 transform**。transform 只会让**它自己**成为
 *      fixed 后代的包含块，不会传染给它的父元素。挂到 <html> 上，
 *      body 带 transform 也影响不到我们（实测已验证）。
 *   2. **躲开站点把 body 清空**。有些 SPA 路由切换时会
 *      `document.body.innerHTML = ''`，我们挂在 body 里的节点会被一起带走，
 *      挂在 <html> 上则安然无恙。
 *   3. **躲开站点的 CSS**。`body > *` 这类选择器命中不到我们，
 *      少一条"站点的规则打穿我们的样式"的路径。
 *
 * ⚠️ **已知限制**：如果站点给 **<html>** 本身加 transform
 * （`html { transform: … }`），那我们也会被同样的机制困住。
 * 现实中几乎见不到 —— 给 <html> 加 transform 的站点，它自己的
 * sticky 头部和滚动条就已经全乱了，是它自己先坏。
 * 真遇到了也只能退化（见下方注释里的兜底说明）。
 *
 * ## 什么时候**不能**挂
 *
 * SVG / XML 文档里没有 <body>，`document.body === null`，
 * 而 <html> 是 <svg> —— 往 <svg> 里塞 HTML 元素不会渲染。
 * 这类文档直接放弃挂载（与原来的行为一致：宁可不显示，也不显示错位的东西）。
 */

/**
 * 拿到浮层该挂的宿主。
 *
 * @returns 宿主元素；该文档不适合挂浮层时返回 null。
 */
export const viewportRoot = (): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  // SVG / XML 文档：没有 <body>，而 <html> 是 <svg>，挂上去不渲染。
  // ⚠️ 但**不能**用 `!document.body` 一刀切 —— 内容脚本跑在
  // document_start，那时 body 还没建好，而 <html> 已经在了。
  // 所以判据是「这不是 HTML 文档」，而不是「body 还没出现」。
  if (!document.body && document.contentType !== 'text/html') {
    return null;
  }

  const root = document.documentElement;
  if (!root) {
    // 理论上 documentElement 总是有的（连 XML 文档也有）。
    // 真没有的话，退回 body —— 坏也比不显示强。
    return document.body;
  }

  return root;
};

/**
 * 把浮层挂到视口层。
 *
 * ⚠️ 调用前请确保**样式已经隔离好**（isolateNotice / 自己的 shadow root）：
 * 站点的一条全局 CSS 随时可能命中刚挂上去的节点。
 *
 * @returns 是否挂上了（该文档不适合时为 false）。
 */
export const mountViewportRoot = (element: HTMLElement): boolean => {
  const host = viewportRoot();
  if (!host) {
    return false;
  }
  host.appendChild(element);
  return true;
};
