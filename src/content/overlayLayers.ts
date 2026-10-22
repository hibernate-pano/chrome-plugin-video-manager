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

import { probeClosest } from '../shared/domMatches';

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
   * 文字实际占据的范围（容器度量的是排版方式，不是内容）。
   *
   * 搬运时需要用它给字幕一个**高于视频**的 z-index：视频的 z-index 是
   * 2147483646，而字幕原本是 `z-index: auto`。即使 DOM 顺序排在视频之后，
   * 一个 auto 的定位元素依然会输给那个显式高层级的视频 —— 实测字幕被
   * 100% 盖住，一个像素都看不见（6.0.8 号称修好的问题，实测并未生效）。
   */
  ink: InkBounds | null;
  /**
   * 搬运前的原父节点与原兄弟位置。
   *
   * 必须像视频自己那样把位置**记下来**：元素被搬进 overlay 之后再问
   * `element.parentElement`，拿到的是 overlay 而不是站点播放器容器，
   * 退出时就会把字幕塞进一个马上要删除的节点里 —— 字幕从此消失。
   */
  originalParent: ParentNode | null;
  originalNextSibling: Node | null;
  /** 搬运前的内联 z-index，退出时原样还原。 */
  originalZIndex: string;
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
 * 字幕的几何指纹：**墨水**宽度不超过视频的 70%、**墨水**高度不超过视频的 30%、
 * 且重心落在视频下半部分，行盒不超过 2 行。
 *
 * 早先这里量的是**容器**宽度，那是排版方式的度量：字幕容器普遍写
 * `left:0; right:0; text-align:center`，铺满播放器（实测 100%），
 * 于是所有正常字幕都被判成「太宽」而排除在外 —— 6.0.8 号称修好的
 * 「字幕跟着视频进全屏」实测根本没生效（详见 measureInkBounds 的注释）。
 *
 * 阈值偏保守是故意的：漏判的代价只是字幕不进全屏（用户仍可退出后看到），
 * 而误判的代价是把整块弹幕搬进全屏，比字幕缺失更糟。
 */
const SUBTITLE_MAX_WIDTH_RATIO = 0.7;
const SUBTITLE_MAX_HEIGHT_RATIO = 0.3;
/** 字幕最多两行：原文 + 译文。超过就是弹幕或列表。 */
const SUBTITLE_MAX_LINES = 2;
/**
 * ⚠️ 这里数的是**视觉行数**，不是排版片段数。
 *
 * 早先用 Range 的矩形个数当行数：任何被行内标签包住的文字都会多出矩形，
 * 于是 YouTube / B 站双语字幕的典型结构（每行包一个 span）被判成 4 行、
 * 整块出局 —— 全屏里字幕彻底消失。见 measureInkBounds 的说明。
 */

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

/**
 * 测量元素里**文字实际占据**的范围。
 *
 * 为什么需要它：字幕容器的宽度是**排版方式**决定的，不是内容决定的。
 * 绝大多数字幕容器写的是 `left:0; right:0; text-align:center` —— 容器铺满
 * 整个播放器宽度（实测 100%），文字却只有中间一小段。拿容器宽度去和视频比，
 * 100% 宽的字幕必然被判成「太宽 → 不是字幕」，于是它不搬进全屏，
 * 用户看到的就是「一按 f 字幕就没了」——这正是 6.0.8 号称修好的那个问题。
 *
 * 墨水宽度（文字实际占的宽度）才是内容的度量：字幕的墨水窄而居中，
 * 弹幕的墨水宽且分散。实测（720×405 的视频）：
 *   100% 宽居中字幕 → 墨水 380px（53%）
 *   50% 宽居中字幕 → 墨水 60px（8%）
 *   左侧字幕       → 墨水 80px（11%）
 *   弹幕容器       → 墨水 544px（76%），且散在 8 个不连续的行盒上
 *
 * ⚠️ 只量**文本节点**，不量元素盒子。
 *
 * `Range.selectNodeContents(element).getClientRects()` 返回的是**排版片段**，
 * 它把行内元素自己的盒子也算进来（实测 Chromium）：
 *   `<span>行1</span><span>行2</span>`（span 是 display:block）
 *     → 4 个矩形：2 个整宽的 span 盒子 + 2 个文字盒
 *   `<span>行1<br>行2</span>`
 *     → 3 个矩形：1 个横跨两行的 span 盒子 + 2 个文字盒
 *   `文字<em>强调</em>`
 *     → 3 个矩形：1 个文字盒 + 2 个 em 的盒子
 * 后果有两个，都是致命的：
 *   ① 「最多两行」的判据被撑爆 —— 双语字幕（每行一个 span）被判成 4 行，
 *      于是被判成「不是字幕」，全屏里字幕彻底消失。
 *   ② 整宽的 span 盒子把墨水**宽度**也撑成播放器的宽度，
 *      「墨水不超过视频宽度的 70%」这条同样过不去。
 * 逐个文本节点量就没有这两个问题：文字盒天然就是「内容」的度量。
 */
export interface InkBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  /** **视觉**行数：字幕通常 1–2 行，弹幕常有 8 行以上。 */
  lines: number;
}

/** NodeFilter.SHOW_TEXT —— 不依赖全局 NodeFilter，内容脚本里也能用。 */
const SHOW_TEXT = 4;

/**
 * 数出**视觉行数**。
 *
 * ⚠️ 不能用矩形的个数当行数（理由见 InkBounds 的说明）。
 *
 * 做法：把文字盒按**顶部位置**聚类。同一视觉行里各文字盒的顶部只差几个
 * 像素（字体不同、行内元素按基线对齐），而行与行之间至少差一个行高。
 * 容差取「盒高中位数的一半」—— 盒高的中位数就是行高量级。
 *
 * 实测（720 宽的字幕容器）：
 *   每行一个 span（display:block）→ 文字盒 2 个、顶部差 28px → 2 行 ✓
 *   span 内含 <br>             → 文字盒 2 个、顶部差 28px → 2 行 ✓
 *   单行 + 尾部强调 span       → 文字盒 2 个、顶部相同     → 1 行 ✓
 *   8 行弹幕                  → 文字盒 8 个              → 8 行 ✓
 */
const countVisualLines = (boxes: DOMRect[]): number => {
  const heights = boxes.map((box) => box.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;
  const tolerance = Math.max(2, medianHeight * 0.5);

  const tops = boxes.map((box) => box.top).sort((a, b) => a - b);
  let lines = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const top of tops) {
    if (top - previous > tolerance) {
      lines += 1;
    }
    previous = top;
  }

  return lines;
};

const measureInkBounds = (element: HTMLElement): InkBounds | null => {
  const doc = element.ownerDocument;
  if (typeof doc.createRange !== 'function' || typeof doc.createTreeWalker !== 'function') {
    return null;
  }

  const rects: DOMRect[] = [];
  try {
    // 只量文本节点：元素盒子（行内标签、整块换行的标签）不是文字，
    // 还会把「容器铺满播放器宽度」的假象带进墨水宽高。
    const walker = doc.createTreeWalker(element, SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node as Text;
      // 纯空白文本节点没有矩形，提前跳过（省一次 Range）。
      if (text.nodeValue && text.nodeValue.trim().length > 0) {
        const range = doc.createRange();
        range.selectNodeContents(text);
        for (const rect of Array.from(range.getClientRects())) {
          rects.push(rect);
        }
        range.detach?.();
      }
      node = walker.nextNode();
    }
  } catch {
    return null;
  }

  // 过滤掉零尺寸的矩形（空的行盒、纯空白文本节点）。
  const boxes = rects.filter((rect) => rect.width > 0.5 && rect.height > 0.5);
  if (boxes.length === 0) {
    return null;
  }

  const left = Math.min(...boxes.map((rect) => rect.left));
  const right = Math.max(...boxes.map((rect) => rect.right));
  const top = Math.min(...boxes.map((rect) => rect.top));
  const bottom = Math.max(...boxes.map((rect) => rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    lines: countVisualLines(boxes),
  };
};

/**
 * 判断一个浮层是不是字幕。
 *
 * 判据全部基于**内容**而不是容器：
 * - 墨水宽度不超过视频宽度的 70%（字幕是几行短句，弹幕是满屏散字）
 * - 墨水高度不超过视频高度的 30%
 * - **视觉**行数不超过 2 行（原文 + 译文）
 * - 墨水重心落在视频下半部分
 *
 * 量不到墨水时退回**容器**判据。这条退路只在两种情况下生效：
 * 元素里根本没有文字（纯图形浮层，它本来也不该是字幕），
 * 或环境没有布局引擎（jsdom 单测）。真实浏览器里带文字的元素一定量得到墨水。
 */
const looksLikeSubtitle = (ink: InkBounds | null, layer: DOMRect, video: DOMRect): boolean => {
  if (!ink) {
    // 容器判据（历史上的那条）：宽度 70%、高度 30%、重心在下半部分。
    if (layer.width > video.width * SUBTITLE_MAX_WIDTH_RATIO) {
      return false;
    }
    if (layer.height > video.height * SUBTITLE_MAX_HEIGHT_RATIO) {
      return false;
    }
    const centerY = layer.top + layer.height / 2;
    return centerY >= video.top + video.height * SUBTITLE_MIN_CENTER_RATIO;
  }

  if (ink.width > video.width * SUBTITLE_MAX_WIDTH_RATIO) {
    return false;
  }

  if (ink.height > video.height * SUBTITLE_MAX_HEIGHT_RATIO) {
    return false;
  }

  // 字幕最多两行（原文 + 译文）；三行以上基本是弹幕或列表。
  if (ink.lines > SUBTITLE_MAX_LINES) {
    return false;
  }

  // 墨水重心必须落在视频下半部分。
  const centerY = ink.top + ink.height / 2;
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
  //
  // ⚠️ 接管提示（#vsc-takeover-notice）也必须排除，而且它**曾经真的被误判过**：
  // 它挂在 body 上，而 body 里的顶层 <video> 恰好也是 body 的直接子节点 ——
  // 两者成了兄弟。提示挪到视频左下角之后（6.0.9，为了不再压住调速胶囊），
  // 它的墨水重心正好落在视频下半部分、宽度不到视频的 70%、只有一行 ——
  // 字幕判据的每一条都满足，于是它被判成「字幕」并被搬进全屏 overlay。
  //
  // 后果不是「位置怪一点」，而是**接管提示被搬走了**：它在 overlay 里
  // 跟着满屏视频走，退出全屏时又被塞回 body —— 用户看到的提示位置整个乱掉，
  // 而且它在 overlay 里的 z-index 会被抬到字幕那一档（2147483644），
  // 压在真正的字幕上面。
  //
  // 早先提示贴左上角时侥幸没触发（重心在视频上半部分，不满足重心判据），
  // 所以这个洞一直没人看见 —— 直到它被挪到左下角。
  //
  // ⚠️ 页面可以把 `Element.prototype.closest` 换成会抛异常的版本。
  // 这里抛了会一路冒到 `enter()` —— **网页全屏整个进不去**
  // （用户按 f 什么反应也没有）。
  //
  // 判不出来时**保守**处理：当成「是我们自己的浮层」→ 不搬。
  // 宁可少搬一层字幕，也不能把控制条或全屏背板搬进画面里
  // （背板被搬走 = 画面没了）。
  const ownOverlayProbe = probeClosest(
    element,
    '#vsc-page-fullscreen-overlay, #vsc-controls, #vsc-speed-toast, #vsc-takeover-notice',
  );
  if (ownOverlayProbe !== 'absent') {
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

  // 墨水是内容的度量：字幕容器可能铺满播放器，但文字只有中间一小段。
  const ink = measureInkBounds(element);

  return {
    element,
    kind: looksLikeSubtitle(ink, rect, videoRect) ? 'subtitle' : 'overlay',
    rect,
    ink,
    originalParent: element.parentNode,
    originalNextSibling: element.nextSibling,
    originalZIndex: element.style.zIndex,
  };
};

/**
 * 在 `container` 里找出覆盖在 `referenceRect` 之上的浮层。
 *
 * ⚠️ 为什么要有这个「指定容器 + 指定参照框」的版本：
 *
 * 进全屏之后视频已经被搬进我们自己的 stage，而站点的字幕仍然留在它原来的
 * 播放器容器里。要把**后来才出现**的字幕搬进 stage，就得对着「进全屏前
 * 那个视频框」去判 —— 字幕是相对播放器容器定位的，拿满屏的视频框当参照，
 * 覆盖率（≥ 视频面积的 2%）与重心（落在下半部）那几条判据全都不成立，
 * 晚到的字幕于是永远搬不进来。
 *
 * 判据本身只有这一份（isOverlayCandidate）：两套判据迟早会漂移，
 * 而漂移过的判据已经出过事故（见本文件开头）。
 */
export const findOverlayLayersIn = (
  container: ParentNode | null,
  video: HTMLVideoElement,
  referenceRect: DOMRect,
): OverlayLayer[] => {
  if (!container) {
    return [];
  }
  if (!isVisibleBox(referenceRect)) {
    return [];
  }

  const layers: OverlayLayer[] = [];
  for (const child of container.children) {
    if (child === video) {
      continue;
    }

    const layer = isOverlayCandidate(child, video, referenceRect);
    if (layer) {
      layers.push(layer);
    }
  }

  return layers;
};

/**
 * 找出覆盖在 `video` 之上的浮层。
 *
 * 只看视频的**直接兄弟节点**与同父容器下的元素：字幕与弹幕几乎总是播放器
 * 容器的直接子元素。递归整棵子树会在大页面上付出 O(N) 代价（videoRegistry
 * 已经为选视频付过一次），而收益为零——没有任何字幕插件会把字幕挂在
 * `<html>` 或 `<body>` 下的深层位置来相对视频定位。
 */
export const findOverlayLayers = (video: HTMLVideoElement): OverlayLayer[] =>
  findOverlayLayersIn(video.parentElement, video, video.getBoundingClientRect());
