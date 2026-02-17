/**
 * Vitest 测试环境设置
 * @module shared/utils/__tests__/setup
 */

import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// 每个测试后自动清理
afterEach(() => {
  cleanup();
});

// Mock Chrome API
const mockChromeStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    getBytesInUse: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    getBytesInUse: vi.fn(),
  },
  managed: {
    get: vi.fn(),
  },
  session: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

global.chrome = {
  storage: mockChromeStorage,
  runtime: {
    lastError: undefined,
    id: 'test-extension-id',
  },
} as any;

// 导出 mock 以便测试中使用
export { mockChromeStorage };
