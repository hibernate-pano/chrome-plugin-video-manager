/**
 * React Testing Library 测试工具函数
 * @module shared/utils/__tests__/test-utils
 */

import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import i18n from '../../lib/i18n';

/**
 * 所有 Provider 的包装组件
 */
interface AllProvidersProps {
  children: ReactNode;
}

function AllProviders({ children }: AllProvidersProps) {
  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}

/**
 * 自定义 render 函数，自动包装必要的 Provider
 * @param ui - 要渲染的 React 组件
 * @param options - React Testing Library 的渲染选项
 * @returns render 函数的返回值
 */
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// 重新导出所有 React Testing Library 的工具
export * from '@testing-library/react';

// 导出自定义 render 函数，覆盖默认的 render
export { customRender as render };

/**
 * 创建带有 Zustand store 的自定义 render 函数
 * 用于测试需要访问 store 的组件
 */
interface RenderWithStoreOptions extends Omit<RenderOptions, 'wrapper'> {
  // 可以在这里添加初始 store 状态
  initialStoreState?: Record<string, unknown>;
}

export function renderWithStore(
  ui: ReactElement,
  options?: RenderWithStoreOptions
) {
  // 如果需要初始化 store 状态，可以在这里处理
  const { initialStoreState, ...renderOptions } = options || {};

  return customRender(ui, renderOptions);
}

/**
 * 等待元素消失的辅助函数
 * @param element - 要等待消失的元素
 * @param timeout - 超时时间（毫秒）
 */
export async function waitForElementToBeRemoved(
  element: HTMLElement | null,
  timeout = 3000
): Promise<void> {
  if (!element) return;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (!document.body.contains(element)) {
        clearInterval(checkInterval);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error('Element was not removed within timeout'));
      }
    }, 50);
  });
}

/**
 * 创建 mock 的 HTMLMediaElement
 * 用于测试媒体相关功能
 */
export function createMockMediaElement(
  overrides?: Partial<HTMLMediaElement>
): HTMLMediaElement {
  const mockElement = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    playbackRate: 1.0,
    volume: 1.0,
    currentTime: 0,
    duration: 100,
    paused: true,
    muted: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    ...overrides,
  } as unknown as HTMLMediaElement;

  return mockElement;
}

/**
 * 创建 mock 的 Chrome Storage API
 * 用于测试 Chrome 扩展功能
 */
export function createMockChromeStorage() {
  const storage = new Map<string, unknown>();

  return {
    get: vi.fn((keys: string | string[] | Record<string, unknown>) => {
      return Promise.resolve(
        typeof keys === 'string'
          ? { [keys]: storage.get(keys) }
          : Array.isArray(keys)
            ? Object.fromEntries(keys.map((k) => [k, storage.get(k)]))
            : Object.fromEntries(
                Object.keys(keys).map((k) => [k, storage.get(k) ?? keys[k]])
              )
      );
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.entries(items).forEach(([key, value]) => {
        storage.set(key, value);
      });
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach((key) => storage.delete(key));
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      storage.clear();
      return Promise.resolve();
    }),
  };
}
