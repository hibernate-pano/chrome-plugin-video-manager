/**
 * Chrome Storage 工具函数测试
 * @module shared/utils/__tests__/chromeStorage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
  safeStorageClear,
  safeStorageGetMultiple,
  safeStorageSetMultiple,
} from '../chromeStorage';

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
  onChanged: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

global.chrome = {
  storage: mockChromeStorage,
  runtime: {
    lastError: undefined,
  },
} as any;

describe('chromeStorage utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.chrome.runtime as any).lastError = undefined;
  });

  describe('safeStorageGet', () => {
    it('应该成功获取存储的值', async () => {
      const testValue = { speed: 1.5 };
      mockChromeStorage.sync.get.mockImplementation((_key, callback) => {
        callback({ [_key as string]: testValue });
      });

      const result = await safeStorageGet('settings', {});
      expect(result).toEqual(testValue);
    });

    it('当键不存在时应该返回默认值', async () => {
      mockChromeStorage.sync.get.mockImplementation((_key, callback) => {
        callback({});
      });

      const defaultValue = { speed: 1.0 };
      const result = await safeStorageGet('settings', defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it('当发生错误时应该返回默认值', async () => {
      mockChromeStorage.sync.get.mockImplementation((_key: any, callback: any) => {
        (global.chrome.runtime as any).lastError = new Error('Storage error');
        callback({});
      });

      const defaultValue = { speed: 1.0 };
      const result = await safeStorageGet('settings', defaultValue);
      expect(result).toEqual(defaultValue);

      // 清理
      (global.chrome.runtime as any).lastError = undefined;
    });

    it('当 sync 失败时应该降级到 local storage', async () => {
      const testValue = { speed: 1.5 };

      // sync 失败
      mockChromeStorage.sync.get.mockImplementation((_key, callback) => {
        (global.chrome.runtime as any).lastError = new Error('Sync error');
        callback({});
      });

      // local 成功
      mockChromeStorage.local.get.mockImplementation((_key, callback) => {
        (global.chrome.runtime as any).lastError = undefined;
        callback({ [_key as string]: testValue });
      });

      const result = await safeStorageGet('settings', {}, { useFallback: true });
      expect(result).toEqual(testValue);
      expect(mockChromeStorage.local.get).toHaveBeenCalled();
    });
  });

  describe('safeStorageSet', () => {
    it('应该成功设置存储的值', async () => {
      mockChromeStorage.sync.set.mockImplementation((_items, callback) => {
        callback();
      });

      const result = await safeStorageSet('settings', { speed: 1.5 });
      expect(result).toBe(true);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(
        { settings: { speed: 1.5 } },
        expect.any(Function)
      );
    });

    it('当发生错误时应该返回 false', async () => {
      mockChromeStorage.sync.set.mockImplementation((_items: any, callback: any) => {
        (global.chrome.runtime as any).lastError = new Error('Storage error');
        callback();
      });

      const result = await safeStorageSet('settings', { speed: 1.5 });
      expect(result).toBe(false);

      // 清理
      (global.chrome.runtime as any).lastError = undefined;
    });

    it('当 sync 失败时应该降级到 local storage', async () => {
      // sync 失败
      mockChromeStorage.sync.set.mockImplementation((_items, callback) => {
        (global.chrome.runtime as any).lastError = new Error('Sync error');
        callback();
      });

      // local 成功
      mockChromeStorage.local.set.mockImplementation((_items, callback) => {
        (global.chrome.runtime as any).lastError = undefined;
        callback();
      });

      const result = await safeStorageSet('settings', { speed: 1.5 }, { useFallback: true });
      expect(result).toBe(true);
      expect(mockChromeStorage.local.set).toHaveBeenCalled();
    });
  });

  describe('safeStorageRemove', () => {
    it('应该成功删除存储的键', async () => {
      mockChromeStorage.sync.remove.mockImplementation((_key, callback) => {
        callback();
      });

      const result = await safeStorageRemove('settings');
      expect(result).toBe(true);
      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(
        'settings',
        expect.any(Function)
      );
    });

    it('应该支持删除多个键', async () => {
      mockChromeStorage.sync.remove.mockImplementation((_keys, callback) => {
        callback();
      });

      const result = await safeStorageRemove(['key1', 'key2']);
      expect(result).toBe(true);
      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(
        ['key1', 'key2'],
        expect.any(Function)
      );
    });
  });

  describe('safeStorageClear', () => {
    it('应该成功清空所有存储', async () => {
      mockChromeStorage.sync.clear.mockImplementation((callback) => {
        callback();
      });

      const result = await safeStorageClear();
      expect(result).toBe(true);
      expect(mockChromeStorage.sync.clear).toHaveBeenCalled();
    });
  });

  describe('safeStorageGetMultiple', () => {
    it('应该成功获取多个键的值', async () => {
      const testData = { speed: 1.5, volume: 0.8 };
      mockChromeStorage.sync.get.mockImplementation((_keys, callback) => {
        callback(testData);
      });

      const defaults = { speed: 1.0, volume: 1.0, language: 'en' };
      const result = await safeStorageGetMultiple(['speed', 'volume'], defaults);

      expect(result).toEqual({
        speed: 1.5,
        volume: 0.8,
        language: 'en', // 默认值
      });
    });
  });

  describe('safeStorageSetMultiple', () => {
    it('应该成功设置多个键值对', async () => {
      mockChromeStorage.sync.set.mockImplementation((_items, callback) => {
        callback();
      });

      const items = { speed: 1.5, volume: 0.8 };
      const result = await safeStorageSetMultiple(items);

      expect(result).toBe(true);
      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith(
        items,
        expect.any(Function)
      );
    });
  });
});
