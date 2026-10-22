/**
 * 测试专用的清场工具。
 *
 * ⚠️ 为什么不能只写 `document.body.innerHTML = ''`：
 *
 * 扩展注入页面的浮层现在挂在 **<html>**（`document.documentElement`）上，
 * 而不是 <body> —— 理由见 `viewportRoot.ts`（body 带 transform 时，
 * 挂在 body 上的 `position: fixed` 会相对 body 的盒子定位，
 * 于是全屏画面与退出按钮一起飘到视口之外）。
 *
 * 于是 `document.body.innerHTML = ''` **清不掉它们**。
 * 残留的宿主会让下一个用例拿到**上一个**用例留下的节点
 * （`getElementById` 返回文档里的第一个），于是点击打在死节点上 ——
 * 症状是「整组用例莫名其妙全失灵」，而不是「少了一个节点」。
 *
 * 这个函数把 <html> 下除了 <head> 与 <body> 之外的东西全摘掉：
 * 扩展的浮层都在那里，而 <head>/<body> 是用例自己要的。
 *
 * ⚠️ 本文件**只给测试用**，不会被任何构建入口引用 —— 它不进 dist。
 */

/** 把扩展注入页面的节点全部摘掉，顺带清空 <body>。 */
export const resetExtensionDom = (): void => {
  document.body.innerHTML = '';

  const root = document.documentElement;
  if (!root) {
    return;
  }

  for (const child of [...root.children]) {
    if (child !== document.head && child !== document.body) {
      child.remove();
    }
  }
};
