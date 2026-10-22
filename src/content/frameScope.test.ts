import { afterEach, describe, expect, it } from 'vitest';
import { isTopDocument, ownsUserFocus } from './frameScope';

/**
 * 帧的归属：显式操作（点工具栏图标）该由哪一个 frame 执行。
 *
 * 判据来自真实 Chromium 的实测（焦点在 iframe 里时，顶层文档的
 * `activeElement` 是那个 `<iframe>` 元素，而 iframe 自己的 `hasFocus()` 为 true），
 * 这里用 jsdom 把那几种状态摆出来，守住判据本身。
 */

const originalHasFocus = document.hasFocus;

const setHasFocus = (value: boolean) => {
  Object.defineProperty(document, 'hasFocus', {
    value: () => value,
    configurable: true,
  });
};

afterEach(() => {
  Object.defineProperty(document, 'hasFocus', {
    value: originalHasFocus,
    configurable: true,
  });
  document.body.innerHTML = '';
});

describe('ownsUserFocus', () => {
  it('文档有焦点、焦点在普通元素上时归我', () => {
    setHasFocus(true);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    expect(ownsUserFocus()).toBe(true);
  });

  it('文档没有焦点时不归我（焦点在别的 frame 里）', () => {
    setHasFocus(false);

    expect(ownsUserFocus()).toBe(false);
  });

  it('焦点落在子 iframe 上时不归我 —— 那个 iframe 才是主角', () => {
    setHasFocus(true);
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    // 浏览器在焦点进入 iframe 时会把顶层文档的 activeElement 换成 iframe 元素。
    frame.focus();

    expect(document.activeElement).toBe(frame);
    expect(ownsUserFocus()).toBe(false);
  });

  it('判据不能被「同名的假 iframe」骗过 —— 用 tagName 而不是 instanceof', () => {
    setHasFocus(true);
    // 一个来自别的 realm 的 iframe 元素：tagName 仍是 IFRAME。
    const fake = { tagName: 'IFRAME' } as unknown as Element;
    Object.defineProperty(document, 'activeElement', {
      value: fake,
      configurable: true,
    });

    expect(ownsUserFocus()).toBe(false);
  });
});

describe('isTopDocument', () => {
  it('单窗口环境里自己就是顶层', () => {
    expect(isTopDocument()).toBe(true);
  });

  it('访问 top 抛异常时不能把内容脚本带崩', () => {
    const hostile = {
      get top() {
        throw new Error('SecurityError: cross-origin');
      },
    } as unknown as Window;

    expect(isTopDocument(hostile)).toBe(false);
  });
});
