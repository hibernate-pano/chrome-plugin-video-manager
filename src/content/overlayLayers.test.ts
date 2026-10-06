import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findOverlayLayers, hasBlockingOverlay } from './overlayLayers';

/**
 * jsdom 不做布局：getBoundingClientRect 与 getComputedStyle 的定位值
 * 都是空的，所以这里把两者都桩掉，**每个用例自己写出矩形**。
 * 测的是判据逻辑，不是浏览器的布局引擎。
 */
const stubRect = (element: Element, rect: Partial<DOMRect>) => {
  const full: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  };
  element.getBoundingClientRect = () => full;
};

/**
 * getComputedStyle 的桩必须**按元素**生效：早先用 vi.spyOn(...).mockReturnValue
 * 会让最后一次调用同时服务所有元素，样式互相串味——video 被写成
 * position:absolute 之后，它自己的父容器判定就跟着变了。
 * 这里改成一张 Map 派生的实现，每个元素各答各的。
 */
const stubStyle = (element: HTMLElement, style: Partial<CSSStyleDeclaration>) => {
  const table = stubStyle.table;
  table.set(element, {
    display: 'block',
    visibility: 'visible',
    position: 'absolute',
    ...style,
  } as CSSStyleDeclaration);
  if (!stubStyle.installed) {
    stubStyle.installed = true;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((target) => {
      const override = stubStyle.table.get(target as HTMLElement);
      if (override) {
        return override;
      }
      // 未被桩住的元素（如 video 自己）给一份"普通流"的真实默认值。
      return {
        display: 'block',
        visibility: 'visible',
        position: 'static',
      } as CSSStyleDeclaration;
    });
  }
};

stubStyle.table = new Map<Element, CSSStyleDeclaration>();
stubStyle.installed = false;

/** 视频矩形：1000×600，起点 (0,0)。 */
const VIDEO_RECT = { top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600 };

describe('findOverlayLayers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    stubStyle.table.clear();
    vi.restoreAllMocks();
    stubStyle.installed = false;
  });

  const setup = (layerStyles: Array<{ rect: Partial<DOMRect>; style?: Partial<CSSStyleDeclaration> }>) => {
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    stubRect(video, VIDEO_RECT);
    stubStyle(video, {});

    const elements: HTMLElement[] = [];
    layerStyles.forEach(({ rect, style }, index) => {
      const layer = document.createElement('div');
      layer.id = `layer-${index}`;
      parent.appendChild(layer);
      stubRect(layer, rect);
      stubStyle(layer, style ?? {});
      elements.push(layer);
    });

    return { video, elements };
  };

  it('识别出贴在视频底部的字幕层', () => {
    const { video } = setup([
      // 窄、矮、贴底 —— 典型双语字幕
      { rect: { top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80 } },
    ]);

    const layers = findOverlayLayers(video);

    expect(layers).toHaveLength(1);
    expect(layers[0].kind).toBe('subtitle');
    expect(layers[0].element.id).toBe('layer-0');
  });

  it('把宽而高的弹幕层判为普通 overlay，而不是字幕', () => {
    const { video } = setup([
      // 几乎横跨整个视频、高度也大 —— 这是弹幕的形态
      { rect: { top: 100, left: 20, right: 980, bottom: 500, width: 960, height: 400 } },
    ]);

    const layers = findOverlayLayers(video);

    expect(layers).toHaveLength(1);
    expect(layers[0].kind).toBe('overlay');
  });

  it('忽略普通流里的元素（不浮在视频上）', () => {
    const { video } = setup([
      {
        rect: { top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80 },
        style: { position: 'static' },
      },
    ]);

    expect(findOverlayLayers(video)).toEqual([]);
  });

  it('忽略 display:none 的隐藏字幕层', () => {
    const { video } = setup([
      {
        rect: { top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80 },
        style: { display: 'none' },
      },
    ]);

    expect(findOverlayLayers(video)).toEqual([]);
  });

  it('忽略完全落在视频之外的元素', () => {
    const { video } = setup([
      // 页面顶部的导航条：与视频不相交
      { rect: { top: 10, left: 10, right: 300, bottom: 50, width: 290, height: 40 } },
    ]);

    expect(findOverlayLayers(video)).toEqual([]);
  });

  it('忽略只擦到视频边角的小装饰', () => {
    const { video } = setup([
      // 与视频有交集，但覆盖面积不到 1% —— 典型的角标 / 音量气泡
      { rect: { top: 500, left: 20, right: 80, bottom: 545, width: 60, height: 45 } },
    ]);

    expect(findOverlayLayers(video)).toEqual([]);
  });

  it('忽略 video 自身的祖先节点', () => {
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    stubRect(video, VIDEO_RECT);
    // 父容器通常比视频大得多，但它不是"覆盖在视频上的浮层"
    stubRect(parent, { top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600 });

    expect(findOverlayLayers(video)).toEqual([]);
  });

  it('忽略我们自己的控制条与 overlay 节点', () => {
    const { video } = setup([
      {
        rect: { top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80 },
        style: {},
      },
    ]);

    // 把其中一个节点标记成我们自己的控制条
    const controls = document.createElement('div');
    controls.id = 'vsc-controls';
    stubRect(controls, { top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80 });
    video.parentElement?.appendChild(controls);

    const ids = findOverlayLayers(video).map((layer) => layer.element.id);
    expect(ids).not.toContain('vsc-controls');
  });

  it('hasBlockingOverlay 对纯视频页面返回 false', () => {
    const { video } = setup([]);
    expect(hasBlockingOverlay(video)).toBe(false);
  });

  it('hasBlockingOverlay 对有字幕的页面返回 true', () => {
    const { video } = setup([
      { rect: { top: 480, left: 200, right: 800, bottom: 560, width: 600, height: 80 } },
    ]);
    expect(hasBlockingOverlay(video)).toBe(true);
  });

  it('视频本身不可见时不返回任何层', () => {
    const parent = document.createElement('div');
    const video = document.createElement('video');
    parent.appendChild(video);
    document.body.appendChild(parent);
    stubRect(video, { width: 0, height: 0 });

    expect(findOverlayLayers(video)).toEqual([]);
  });
});
