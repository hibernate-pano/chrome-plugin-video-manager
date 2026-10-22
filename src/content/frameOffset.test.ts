import { describe, expect, it } from 'vitest';
import { topLevelRect } from './frameOffset';

/**
 * 坐标换算：把元素在自己文档里的视口坐标换算到顶层文档坐标系。
 *
 * 同源 iframe 里的元素，getBoundingClientRect() 返回的是相对 **iframe 自己视口**
 * 的坐标；而扩展的提示挂在顶层文档、position:fixed。
 *
 * ⚠️ 这里量的是**矩形**，不是「原矩形 + 一个偏移量」——
 * iframe 被缩放时，偏移量依赖矩形本身，算不出一个常数（见下面「被缩放」那条）。
 */

const mockRect = (
  element: Element,
  left: number,
  top: number,
  size: { width: number; height: number } = { width: 400, height: 300 },
) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      width: size.width,
      height: size.height,
      top,
      left,
      right: left + size.width,
      bottom: top + size.height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
};

/** jsdom 没有布局引擎，offsetWidth/clientLeft 恒为 0 —— 这里手动造出来。 */
const mockFrameBox = (
  element: Element,
  box: { offsetWidth: number; offsetHeight: number; clientLeft: number; clientTop: number },
) => {
  Object.defineProperty(element, 'offsetWidth', { value: box.offsetWidth, configurable: true });
  Object.defineProperty(element, 'offsetHeight', { value: box.offsetHeight, configurable: true });
  Object.defineProperty(element, 'clientLeft', { value: box.clientLeft, configurable: true });
  Object.defineProperty(element, 'clientTop', { value: box.clientTop, configurable: true });
};

describe('topLevelRect', () => {
  it('顶层文档里的元素：矩形不变', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    mockRect(element, 10, 20, { width: 100, height: 50 });

    expect(topLevelRect(element)).toEqual({
      left: 10,
      top: 20,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
    });
  });

  it('一层 iframe 里的元素要加上 iframe 自己的偏移', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const framedElement = frame.contentDocument!.createElement('div');
    frame.contentDocument!.body.appendChild(framedElement);

    mockRect(frame, 50, 400);
    mockRect(framedElement, 0, 0, { width: 100, height: 100 });

    expect(topLevelRect(framedElement)).toEqual({
      left: 50,
      top: 400,
      right: 150,
      bottom: 500,
      width: 100,
      height: 100,
    });
  });

  it('嵌套 iframe 里的元素要逐层累加', () => {
    // 顶层 → 外层 iframe（100, 200）→ 内层 iframe（相对外层视口 30, 40）
    // → 元素（相对内层视口 5, 6）。
    // 顶层坐标 = 100 + 30 + 5 = 135，200 + 40 + 6 = 246。
    //
    // ⚠️ 只换算一层的话，内层元素会落在 (30, 40) —— 提示会整整偏掉
    // 一整个外层 iframe 的位置。
    const outer = document.createElement('iframe');
    document.body.appendChild(outer);
    const outerDocument = outer.contentDocument!;

    const inner = outerDocument.createElement('iframe');
    outerDocument.body.appendChild(inner);
    const innerDocument = inner.contentDocument!;

    const element = innerDocument.createElement('div');
    innerDocument.body.appendChild(element);

    mockRect(outer, 100, 200);
    mockRect(inner, 30, 40);
    mockRect(element, 5, 6, { width: 20, height: 10 });

    expect(topLevelRect(element)).toEqual({
      left: 135,
      top: 246,
      right: 155,
      bottom: 256,
      width: 20,
      height: 10,
    });
  });

  it('iframe 被缩放时，内容坐标要跟着缩放比一起换算', () => {
    // 实测（真实 Chromium）：顶层放 iframe { width:700px; height:500px;
    // transform:scale(0.5) }，iframe 内放一个 margin-top:50px 的视频。
    // 视频的真实视觉位置是 top = 400 + 50×0.5 = 425，
    // 而「只加偏移」的算法算出 400 + 50 = 450 —— 偏了 25px。
    //
    // ⚠️ 这条是**端到端量出来的**：ground truth 来自截图里那圈绿色边框
    // （tests/e2e/frame-scale.spec.js），不是拿公式的输出验公式。
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;

    const element = frameDocument.createElement('div');
    frameDocument.body.appendChild(element);

    // 变换后的视觉边框盒：700×500 被缩到 350×250，放在 (0, 400)。
    mockRect(frame, 0, 400, { width: 350, height: 250 });
    // 未变换的布局尺寸：700×500 → 缩放比 0.5。
    mockFrameBox(frame, {
      offsetWidth: 700,
      offsetHeight: 500,
      clientLeft: 0,
      clientTop: 0,
    });

    // 元素在 iframe 自己的视口里：(0, 50)，600×338。
    mockRect(element, 0, 50, { width: 600, height: 338 });

    expect(topLevelRect(element)).toEqual({
      left: 0,
      top: 425,
      right: 300,
      bottom: 594,
      width: 300,
      height: 169,
    });
  });

  it('iframe 有 border 时，内容坐标要跳过 border 宽度', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;

    const element = frameDocument.createElement('div');
    frameDocument.body.appendChild(element);

    mockRect(frame, 0, 400, { width: 700, height: 500 });
    mockFrameBox(frame, {
      offsetWidth: 700,
      offsetHeight: 500,
      clientLeft: 2,
      clientTop: 3,
    });

    mockRect(element, 0, 50, { width: 100, height: 100 });

    // 无缩放：top = 400 + (3 + 50) = 453，left = 0 + (2 + 0) = 2。
    expect(topLevelRect(element)).toEqual({
      left: 2,
      top: 453,
      right: 102,
      bottom: 553,
      width: 100,
      height: 100,
    });
  });

  /**
   * 内容脚本跑在 **iframe 里**时的坐标系。
   *
   * 6.1.0 之后内容脚本注入到所有 frame：iframe 里也有一份运行时，
   * 提示（调速胶囊、接管提示）挂在**那份运行时自己的 document.body** 上，
   * 而 `position: fixed` 的参照系是**它自己那份文档的视口**。
   *
   * 所以换算的终点是「当前 realm 的 document」—— iframe 里跑着就是不换算。
   *
   * ⚠️ 换算到顶层坐标是**错的**（实测，真实 Chromium）：
   * iframe 高 220px、视频在顶层 y=360 时，换算到顶层会算出 `top = 376px`，
   * 胶囊被推到 iframe **之外**（用户什么也看不到）；接管提示更糟 ——
   * 它的 `bottom` 是拿 `window.innerHeight`（iframe 的高度）减去视频的
   * **顶层**坐标算出来的，两套坐标系混用直接算到屏幕外。
   */
  it('内容脚本跑在 iframe 里时，坐标停在 iframe 自己的视口（提示也住在 iframe 里）', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;

    const element = frameDocument.createElement('div');
    frameDocument.body.appendChild(element);

    // iframe 在顶层页面里的位置 (300, 400)；元素在 iframe 视口里的位置 (40, 50)。
    mockRect(frame, 300, 400, { width: 700, height: 500 });
    mockRect(element, 40, 50, { width: 100, height: 100 });

    // 把全局 document 换成 iframe 的 document —— 等价于「内容脚本跑在 iframe 里」。
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      value: frameDocument,
      configurable: true,
    });

    try {
      expect(topLevelRect(element)).toEqual({
        left: 40,
        top: 50,
        right: 140,
        bottom: 150,
        width: 100,
        height: 100,
      });
    } finally {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        configurable: true,
      });
    }
  });

  it('内容脚本跑在 iframe 里时，iframe 内嵌 iframe 的坐标仍要逐层换算', () => {
    // 换算不是「一律不换算」：iframe 里**再套一层** iframe 时，
    // 视频在里层 iframe 的视口里，而提示挂在外层 iframe 的文档上 ——
    // 中间那一层必须换算，否则提示会偏掉一整个内层 iframe 的位置。
    const outer = document.createElement('iframe');
    document.body.appendChild(outer);
    const outerDocument = outer.contentDocument!;

    const inner = outerDocument.createElement('iframe');
    outerDocument.body.appendChild(inner);
    const innerDocument = inner.contentDocument!;

    const element = innerDocument.createElement('div');
    innerDocument.body.appendChild(element);

    mockRect(outer, 100, 200, { width: 700, height: 500 });
    mockRect(inner, 30, 40, { width: 700, height: 500 });
    mockRect(element, 5, 6, { width: 20, height: 10 });

    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      value: outerDocument,
      configurable: true,
    });

    try {
      // 外层 iframe 的视口坐标：内层 iframe 在外层里的位置 (30, 40) + 元素 (5, 6)。
      expect(topLevelRect(element)).toEqual({
        left: 35,
        top: 46,
        right: 55,
        bottom: 56,
        width: 20,
        height: 10,
      });
    } finally {
      Object.defineProperty(globalThis, 'document', {
        value: originalDocument,
        configurable: true,
      });
    }
  });
});
