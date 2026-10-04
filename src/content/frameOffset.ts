/**
 * 把「元素在自己文档里的视口坐标」换算到顶层文档坐标系。
 *
 * 同源 iframe 内元素的 getBoundingClientRect() 返回的是相对 **iframe 自己视口**
 * 的坐标，而扩展的 toast / 提示挂在顶层文档、position:fixed。直接拿这个坐标用，
 * 提示会偏离视频整整一个 iframe 的偏移量（实测视频在 y≈400 时提示出现在 y=16，
 * 也就是被钳到了屏幕角落）。
 *
 * 沿 frameElement 逐层向上累加每个 iframe 相对其父视口的偏移，直到元素所在文档
 * 就是顶层 document。跨域时 frameElement 取不到（访问即抛或为 null），退回未换算
 * 的坐标——跨域本来也下钻不进内容脚本，这里不能因此抛错。
 */
export const topLevelOffset = (element: Element) => {
  let offsetX = 0;
  let offsetY = 0;
  let currentDocument = element.ownerDocument;

  while (currentDocument && currentDocument !== document) {
    const frame = currentDocument.defaultView?.frameElement;
    if (!frame) {
      break;
    }

    const frameRect = frame.getBoundingClientRect();
    offsetX += frameRect.left;
    offsetY += frameRect.top;
    currentDocument = frame.ownerDocument;
  }

  return { offsetX, offsetY };
};
