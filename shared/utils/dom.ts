/**
 * DOM操作相关工具函数
 * @module utils/dom
 */

/**
 * 检查元素是否在视口内
 * @param el - 要检查的元素
 * @param visibilityMap - 可见性缓存
 * @param observer - 交叉观察器
 * @returns 元素是否在视口内
 */
export function isElementInViewport(
  el: HTMLElement,
  visibilityMap?: WeakMap<HTMLElement, boolean>,
  observer?: IntersectionObserver | null
): boolean {
  try {
    // 如果有缓存的可见性信息，优先使用
    if (visibilityMap && visibilityMap.has(el)) {
      return visibilityMap.get(el) ?? false;
    }

    // 如果支持IntersectionObserver，添加到观察列表
    if (observer) {
      observer.observe(el);
    }

    // 手动计算可见性
    const rect = el.getBoundingClientRect();
    const isVisible =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth);

    // 缓存结果
    if (visibilityMap) {
      visibilityMap.set(el, isVisible);
    }
    return isVisible;
  } catch (e) {
    return false;
  }
}

/**
 * 检查元素是否在iframe中
 * @param el - 要检查的元素
 * @returns 元素是否在iframe中
 */
export function isInIframe(el: HTMLElement): boolean {
  try {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc && iframeDoc.contains(el)) {
          return true;
        }
      } catch (e) {
        // 跨域iframe会抛出错误，忽略
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 查询所有元素，包括Shadow DOM中的元素
 * @param selector - CSS选择器
 * @param shadowElements - Shadow DOM元素缓存
 * @param isStale - 缓存是否过期
 * @returns 匹配的元素数组
 */
export function querySelectorAllIncludingShadowDOM(
  selector: string,
  shadowElements?: HTMLElement[],
  isStale?: boolean
): HTMLElement[] {
  try {
    // 检查是否已有缓存结果
    if (!isStale && shadowElements && shadowElements.length > 0) {
      return shadowElements;
    }

    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

    // 优先检查视口内的元素
    const allElements = document.querySelectorAll('*');
    const visibleElements = Array.from(allElements)
      .filter((el) => {
        try {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        } catch (e) {
          return false;
        }
      })
      .slice(0, 100); // 限制数量，避免过度处理

    for (const element of visibleElements) {
      if ((element as HTMLElement).shadowRoot) {
        elements.push(
          ...Array.from(
            (element as HTMLElement).shadowRoot!.querySelectorAll<HTMLElement>(selector)
          )
        );
      }
    }

    return elements;
  } catch (e) {
    console.error('Shadow DOM查询失败:', e);
    return [];
  }
}

/**
 * 检查元素是否为可编辑元素
 * @param el - 要检查的元素
 * @returns 元素是否可编辑
 */
function isEditableElement(el: HTMLElement | null): boolean {
  if (!el || el.nodeType !== 1) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return false;
}

/**
 * 判断是否正在可编辑区域输入
 * @param event - 键盘事件
 * @returns 是否在可编辑区域
 */
export function isTypingInEditable(event: KeyboardEvent): boolean {
  try {
    if (!event) return false;
    // 输入法合成期间不处理快捷键
    if (event.isComposing) return true;

    const editableSelectors = [
      'input',
      'textarea',
      'select',
      '[contenteditable]',
      '[role="textbox"]',
      '.monaco-editor',
      '.ace_editor',
      '.cm-editor',
      '.cm-content',
      '.CodeMirror',
      '.ProseMirror',
      '[data-lexical-editor]',
    ].join(',');

    const target = event.target as HTMLElement;
    const activeEl = document.activeElement as HTMLElement;

    // 通过 composedPath 捕获 Shadow DOM 内的可编辑元素
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [target];
    for (const node of path) {
      if (node && (node as HTMLElement).nodeType === 1 && isEditableElement(node as HTMLElement)) {
        return true;
      }
    }

    if (isEditableElement(target)) return true;
    if (isEditableElement(activeEl)) return true;

    // 检查是否在特定选择器的元素内
    if (target && target.closest) {
      if (target.closest(editableSelectors)) return true;
    }

    // 如果焦点在同源 iframe 内，检查其内部的 activeElement
    if (activeEl && activeEl.tagName === 'IFRAME') {
      try {
        const iframeDoc =
          (activeEl as HTMLIFrameElement).contentDocument ||
          (activeEl as HTMLIFrameElement).contentWindow?.document;
        const innerActive = iframeDoc?.activeElement as HTMLElement;
        if (isEditableElement(innerActive)) return true;
      } catch (e) {
        // 跨域 iframe，忽略
      }
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * 兼容性处理：确保Element.prototype.matches方法可用
 */
export function ensureMatchesPolyfill(): void {
  if (!Element.prototype.matches) {
    Element.prototype.matches =
      (Element.prototype as any).matchesSelector ||
      (Element.prototype as any).mozMatchesSelector ||
      (Element.prototype as any).msMatchesSelector ||
      (Element.prototype as any).oMatchesSelector ||
      (Element.prototype as any).webkitMatchesSelector ||
      function (this: Element, s: string) {
        const doc = (this as any).document || this.ownerDocument;
        const matches = doc.querySelectorAll(s);
        let i = matches.length;
        while (--i >= 0) {
          if (matches.item(i) === this) {
            return true;
          }
        }
        return false;
      };
  }
}
