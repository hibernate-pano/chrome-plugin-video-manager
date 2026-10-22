import { afterEach, describe, expect, it } from 'vitest';
import { mountViewportRoot, viewportRoot } from './viewportRoot';

/**
 * 浮层挂载点的守卫。
 *
 * ⚠️ 为什么这条要守：CSS 规定「祖先带 transform / filter / perspective /
 * contain / will-change 时，它就是 `position: fixed` 后代的包含块」。
 * 而 `body { transform: translateZ(0) }` 是站点做 GPU 加速的**常见写法** ——
 * 浮层挂在 body 上时，全屏画面、控制条、退出按钮**全部飘到视口之外**
 * （实测：视频 top=850、控制条 top=2334，而视口只有 700px 高）。
 * 用户看到的是一片黑，连退出按钮都没有。
 *
 * 挂到 `<html>` 上就免疫（transform 只会让自己成为后代的包含块，
 * 不会传染给父元素）。这条用例守的就是**挂载点**。
 */
describe('浮层的挂载点', () => {
  const cleanup: (() => void)[] = [];

  afterEach(() => {
    cleanup.splice(0).forEach((restore) => restore());
    document.body.innerHTML = '';
  });

  it('浮层挂在 <html> 上，而不是 <body> 上', () => {
    const element = document.createElement('div');
    element.id = 'vsc-probe';

    expect(mountViewportRoot(element)).toBe(true);

    // 父节点是 <html>：它是 body 的父元素，body 的 transform 影响不到它。
    expect(element.parentElement).toBe(document.documentElement);
    expect(element.parentElement).not.toBe(document.body);
  });

  it('SVG / XML 文档不挂（挂上去也不渲染）', () => {
    // 那些文档里没有 <body>，而 <html> 是 <svg> ——
    // 往 <svg> 里塞 HTML 元素不会显示。
    const originalType = Object.getOwnPropertyDescriptor(Document.prototype, 'contentType');
    const originalBody = Object.getOwnPropertyDescriptor(Document.prototype, 'body');
    Object.defineProperty(document, 'contentType', {
      value: 'image/svg+xml',
      configurable: true,
    });
    // SVG 文档里**没有** body —— 判据是「两者都不对」，
    // 只改 contentType 不够（jsdom 永远有 body）。
    Object.defineProperty(document, 'body', {
      value: null,
      configurable: true,
    });
    cleanup.push(() => {
      delete (document as unknown as { contentType?: string }).contentType;
      delete (document as unknown as { body?: HTMLElement | null }).body;
      if (originalType) {
        Object.defineProperty(Document.prototype, 'contentType', originalType);
      }
      if (originalBody) {
        Object.defineProperty(Document.prototype, 'body', originalBody);
      }
    });

    const element = document.createElement('div');
    expect(viewportRoot()).toBeNull();
    expect(mountViewportRoot(element)).toBe(false);
    expect(element.isConnected).toBe(false);
  });

  it('documentElement 拿不到时退回 body（坏也比不显示强）', () => {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'documentElement');
    Object.defineProperty(document, 'documentElement', {
      value: null,
      configurable: true,
    });
    cleanup.push(() => {
      delete (document as unknown as { documentElement?: Element | null }).documentElement;
      if (original) {
        Object.defineProperty(Document.prototype, 'documentElement', original);
      }
    });

    const element = document.createElement('div');
    expect(viewportRoot()).toBe(document.body);
    expect(mountViewportRoot(element)).toBe(true);
    expect(element.parentElement).toBe(document.body);
  });
});
