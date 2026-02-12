/**
 * Chrome Storage API 测试
 * 使用 Jest 测试 Chrome 扩展 API
 */

import { chromeMock, setStorageData, getStorageData } from '../mocks/chrome';

describe('Chrome Storage API', () => {
  beforeEach(() => {
    // 每个测试前重置 mock
    chromeMock.__reset();
  });

  describe('chrome.storage.sync', () => {
    it('应该能够保存和获取数据', async () => {
      // 保存数据
      await chrome.storage.sync.set({ key1: 'value1', key2: 'value2' });

      // 获取数据
      const result = await chrome.storage.sync.get(['key1', 'key2']);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('应该能够获取单个键', async () => {
      await chrome.storage.sync.set({ testKey: 'testValue' });

      const result = await chrome.storage.sync.get('testKey');

      expect(result).toEqual({ testKey: 'testValue' });
    });

    it('应该能够获取所有数据', async () => {
      await chrome.storage.sync.set({ key1: 'value1', key2: 'value2' });

      const result = await chrome.storage.sync.get(null);

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('应该支持默认值', async () => {
      const result = await chrome.storage.sync.get({
        existingKey: 'default1',
        nonExistingKey: 'default2',
      });

      expect(result).toEqual({
        existingKey: 'default1',
        nonExistingKey: 'default2',
      });

      // 设置一个键
      await chrome.storage.sync.set({ existingKey: 'actualValue' });

      const result2 = await chrome.storage.sync.get({
        existingKey: 'default1',
        nonExistingKey: 'default2',
      });

      expect(result2).toEqual({
        existingKey: 'actualValue',
        nonExistingKey: 'default2',
      });
    });

    it('应该能够删除数据', async () => {
      await chrome.storage.sync.set({ key1: 'value1', key2: 'value2' });

      await chrome.storage.sync.remove('key1');

      const result = await chrome.storage.sync.get(null);

      expect(result).toEqual({ key2: 'value2' });
    });

    it('应该能够删除多个键', async () => {
      await chrome.storage.sync.set({ key1: 'value1', key2: 'value2', key3: 'value3' });

      await chrome.storage.sync.remove(['key1', 'key2']);

      const result = await chrome.storage.sync.get(null);

      expect(result).toEqual({ key3: 'value3' });
    });

    it('应该能够清空所有数据', async () => {
      await chrome.storage.sync.set({ key1: 'value1', key2: 'value2' });

      await chrome.storage.sync.clear();

      const result = await chrome.storage.sync.get(null);

      expect(result).toEqual({});
    });

    it('应该能够获取存储大小', async () => {
      await chrome.storage.sync.set({ key1: 'value1' });

      const bytesInUse = await chrome.storage.sync.getBytesInUse(null);

      expect(bytesInUse).toBeGreaterThan(0);
    });
  });

  describe('chrome.storage.local', () => {
    it('应该能够保存和获取数据', async () => {
      await chrome.storage.local.set({ localKey: 'localValue' });

      const result = await chrome.storage.local.get('localKey');

      expect(result).toEqual({ localKey: 'localValue' });
    });

    it('应该与 sync 存储隔离', async () => {
      await chrome.storage.sync.set({ key: 'syncValue' });
      await chrome.storage.local.set({ key: 'localValue' });

      const syncResult = await chrome.storage.sync.get('key');
      const localResult = await chrome.storage.local.get('key');

      expect(syncResult).toEqual({ key: 'syncValue' });
      expect(localResult).toEqual({ key: 'localValue' });
    });
  });

  describe('辅助函数', () => {
    it('setStorageData 应该能够设置测试数据', () => {
      setStorageData({ testKey: 'testValue' }, 'sync');

      const data = getStorageData();

      expect(data.sync).toEqual({ testKey: 'testValue' });
    });

    it('getStorageData 应该能够获取当前存储数据', async () => {
      await chrome.storage.sync.set({ key1: 'value1' });
      await chrome.storage.local.set({ key2: 'value2' });

      const data = getStorageData();

      expect(data.sync).toEqual({ key1: 'value1' });
      expect(data.local).toEqual({ key2: 'value2' });
    });
  });
});
