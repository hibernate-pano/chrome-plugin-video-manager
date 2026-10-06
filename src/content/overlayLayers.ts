/**
 * 探测页面上覆盖在视频之上的浮层（字幕、弹幕等）。
 *
 * 为什么需要它：网页全屏的 reparent 模式会把 `<video>` 从站点播放器容器里
 * 搬进我们自己的 overlay。字幕这类浮层通常是**视频的兄弟节点**——挂在
 * `.html5-video-player` 里、靠 `position:absolute` 相对视频容器定位。
 * 视频被搬走后它们留在原地，与满屏的视频错开，于是"字幕消失"。
 *
 * 这里刻意**不认任何插件的类名**：沉浸式翻译用 `.imt-caption-container`，
 * 但下一个字幕插件可能是别的名字，弹幕又完全是另一套。认类名等于和某个
 * 插件耦合，它一改类名就又坏了，而且我们没法提前知道还有哪些插件。
 *
 * 判据只用 DOM 关系与几何位置——这两件事对所有"贴在视频旁边的浮层"都成立。
 */

export interface OverlayLayer {
  element: HTMLElement;
  /**
   * 是不是字幕型浮层。
   *
   * 字幕与弹幕的区别不在结构（两者都是 video 的兄弟节点、都绝对定位在视频上），
   * 而在**形态**：字幕窄、矮、贴在视频底部、主要承载文本；弹幕宽、分散、
   * 可能在垂直方向任意位置飘。只搬字幕、不搬弹幕，是"字幕要跟着走、
   * 满屏弹幕反而吵"这个取舍下的唯一解。
   */
  kind: 'subtitle' | 'overlay';
  rect: DOMRect;
  /**
   * 搬运前的原父节点与原兄弟位置。
   *
   * 必须像视频自己那样把位置**记下来**：元素被搬进 overlay 之后再问
   * `element.parentElement`，拿到的是 overlay 而不是站点播放器容器，
   * 退出时就会把字幕塞进一个马上要删除的节点里 —— 字幕从此消失。
   */
  originalParent: ParentNode | null;
  originalNextSibling: Node | null;
}

/** 浮层相对视频矩形的允许超出比例：字幕可能略微溢出视频边缘。 */
const OVERFLOW_TOLERANCE = 0.12;
/**
 * 浮层相对视频的最小覆盖面积下限，用来过滤角标之类的小装饰。
 *
 * 0.02 不是随手取的：一条典型双语字幕（1000×600 的视频上约 600×80）
 * 覆盖率只有 0.08，而"比视频小得多的方形角标"通常在 0.01 以下。
 * 早先这里写的是 0.2，结果把**所有正常字幕都挡在外面**——字幕本来就只占
 * 画面底部一条窄带，要求它覆盖 20% 面积等于要求它是一块巨幕。
 */
const MIN_COVERAGE = 0.02;

/**
 * 字幕的几何指纹：宽度不超过视频的 70%、高度不超过视频的 30%、
 * 且重心落在视频下半部分。
 *
 * 这三条同时成立才能把一个"飘在画面中间的大面板"排除掉——B站弹幕正好违反。
 * 阈值偏保守是故意的：漏判的代价只是字幕不进全屏（用户仍可退出后看到），
 * 而误判的代价是把整块弹幕搬进全屏，比字幕缺失更糟。
 */
const SUBTITLE_MAX_WIDTH_RATIO = 0.7;
const SUBTITLE_MAX_HEIGHT_RATIO = 0.3;
/**
 * 字幕重心的纵向位置下限（相对视频顶部，0=顶部 1=底部）。
 *
 * 早先用"底边落在视频 55% 以下"，在真实页面上把字幕判成了非字幕：
 * 站点给播放器的 CSS 尺寸（如 640×360）通常小于视频被全屏放大后的尺寸
 * （实测 1280×720），字幕按 `bottom: 8%` 定位在**原尺寸**的播放器里，
 * 换算到全屏视频的坐标系后底边只落在 46% 处 —— 明明就在画面下方，
 * 却被判据挡在门外。重心比底边更稳：字幕整体都在下半部，底边受容器尺寸
 * 缩放影响更大。
 */
const SUBTITLE_MIN_CENTER_RATIO = 0.55;

const ABSOLUTE_OR_FIXED = new Set(['absolute', 'fixed', 'sticky']);

const isVisibleBox = (rect: DOMRect) =>
  rect.width > 0 && rect.height > 0 && rect.width < 1e5 && rect.height < 1e5;

const intersects = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** 覆盖面积占视频面积的比例，用来过滤掉只擦边的小装饰。 */
const coverageRatio = (layer: DOMRect, video: DOMRect) => {
  const width = Math.min(layer.right, video.right) - Math.max(layer.left, video.left);
  const height = Math.min(layer.bottom, video.bottom) - Math.max(layer.top, video.top);
  if (width <= 0 || height <= 0) {
    return 0;
  }

  const videoArea = video.width * video.height;
  return videoArea > 0 ? (width * height) / videoArea : 0;
};

/** 浮层是否整体（或大部分）落在视频范围内，允许 subtitle 略微溢出。 */
const fitsWithinVideo = (layer: DOMRect, video: DOMRect) => {
  const slackX = video.width * OVERFLOW_TOLERANCE;
  const slackY = video.height * OVERFLOW_TOLERANCE;
  return (
    layer.left >= video.left - slackX &&
    layer.right <= video.right + slackX &&
    layer.top >= video.top - slackY &&
    layer.bottom <= video.bottom + slackY
  );
};

const looksLikeSubtitle = (layer: DOMRect, video: DOMRect) => {
  if (layer.width > video.width * SUBTITLE_MAX_WIDTH_RATIO) {
    return false;
  }

  if (layer.height > video.height * SUBTITLE_MAX_HEIGHT_RATIO) {
    return false;
  }

  const centerY = layer.top + layer.height / 2;
  return centerY >= video.top + video.height * SUBTITLE_MIN_CENTER_RATIO;
};

const isOverlayCandidate = (
  element: Element,
  video: HTMLVideoElement,
  videoRect: DOMRect,
): OverlayLayer | null => {
  if (!(element instanceof HTMLElement) || element === video) {
    return null;
  }

  // 我们自己的节点永远不参与：控制条、overlay、背板都会被误判成字幕。
  if (element.closest('#vsc-page-fullscreen-overlay, #vsc-controls, #vsc-speed-toast') !== null) {
    return null;
  }

  // <video> 的祖先也不可能覆盖在视频之上（容器通常反而是它自己可见的前提）。
  if (element.contains(video) || video.contains(element)) {
    return null;
  }

  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return null;
  }

  // 必须是浮层：绝对/固定/粘性定位。普通流里的元素随页面布局走，不需要管。
  if (!ABSOLUTE_OR_FIXED.has(style.position)) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (!isVisibleBox(rect) || !intersects(rect, videoRect)) {
    return null;
  }

  if (!fitsWithinVideo(rect, videoRect) || coverageRatio(rect, videoRect) < MIN_COVERAGE) {
    return null;
  }

  return {
    element,
    kind: looksLikeSubtitle(rect, videoRect) ? 'subtitle' : 'overlay',
    rect,
    originalParent: element.parentNode,
    originalNextSibling: element.nextSibling,
  };
};

/**
 * 找出覆盖在 `video` 之上的浮层。
 *
 * 只看视频的**直接兄弟节点**与同父容器下的元素：字幕与弹幕几乎总是播放器
 * 容器的直接子元素。递归整棵子树会在大页面上付出 O(N) 代价（videoRegistry
 * 已经为选视频付过一次），而收益为零——没有任何字幕插件会把字幕挂在
 * `<html>` 或 `<body>` 下的深层位置来相对视频定位。
 */
export const findOverlayLayers = (video: HTMLVideoElement): OverlayLayer[] => {
  const videoRect = video.getBoundingClientRect();
  if (!isVisibleBox(videoRect)) {
    return [];
  }

  const parent = video.parentElement;
  if (!parent) {
    return [];
  }

  const layers: OverlayLayer[] = [];
  for (const child of parent.children) {
    if (child === video) {
      continue;
    }

    const layer = isOverlayCandidate(child, video, videoRect);
    if (layer) {
      layers.push(layer);
    }
  }

  return layers;
};

export const hasBlockingOverlay = (video: HTMLVideoElement): boolean =>
  findOverlayLayers(video).length > 0;
