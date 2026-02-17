/**
 * Jest 测试设置文件
 * 在所有测试运行之前执行
 *
 * 主要功能：
 * 1. 配置 Chrome API mocks
 * 2. 设置全局测试工具
 * 3. 配置测试环境
 */

import '@testing-library/jest-dom';
import { chromeMock } from './mocks/chrome';

// 设置 Chrome API mock
global.chrome = chromeMock as any;

// 设置 window.chrome（某些代码可能使用 window.chrome）
(global as any).window.chrome = chromeMock;

// Mock console 方法以减少测试输出噪音（可选）
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// 设置 matchMedia mock（用于响应式设计测试）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // 已废弃
    removeListener: jest.fn(), // 已废弃
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// 设置 IntersectionObserver mock
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// 设置 ResizeObserver mock
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// 设置 requestAnimationFrame mock
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(callback, 0) as any;
};

global.cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};

// 清理函数（在每个测试后运行）
afterEach(() => {
  // 清理所有 mock 调用记录
  jest.clearAllMocks();
});
