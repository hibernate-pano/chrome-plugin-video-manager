import { describe, expect, it } from 'vitest';
import { topLevelOffset } from './frameOffset';

/**
 * 坐标换算：把元素在自己文档里的视口坐标换算到顶层文档坐标系。
 *
 * 同源 iframe 里的元素，getBoundingClientRect() 返回的是相对 **iframe 自己视口**
 * 的坐标；扩展的提示挂在顶层文档、position:fixed。直接拿这个坐标用，
 * 提示会偏离视频整整一个 iframe 的偏移量。
 */

const mockRect = (element: Element, left: number, top: number) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      width: 400,
      height: 300,
      top,
      left,
      right: left + 400,
      bottom: top + 300,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
};

describe('topLevelOffset', () => {
  it('顶层文档里的元素没有偏移', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);

    expect(topLevelOffset(element)).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('一层 iframe 里的元素要加上 iframe 自己的偏移', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const framedElement = frame.contentDocument!.createElement('div');
    frame.contentDocument!.body.appendChild(framedElement);

    mockRect(frame, 50, 400);

    expect(topLevelOffset(framedElement)).toEqual({ offsetX: 50, offsetY: 400 });
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

    expect(topLevelOffset(element)).toEqual({ offsetX: 130, offsetY: 240 });
  });
});
