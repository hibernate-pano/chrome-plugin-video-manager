/**
 * Chrome Runtime API 测试
 * 测试 Chrome 扩展运行时 API
 */

import { chromeMock, setRuntimeError, clearRuntimeError } from '../mocks/chrome';

describe('Chrome Runtime API', () => {
  beforeEach(() => {
    chromeMock.__reset();
    clearRuntimeError();
  });

  describe('chrome.runtime.sendMessage', () => {
    it('应该能够发送消息', async () => {
      const message = { type: 'TEST', data: 'test data' };
      const response = await chrome.runtime.sendMessage(message);

      expect(response).toEqual({ success: true });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(message);
    });

    it('应该支持回调函数', (done) => {
      const message = { type: 'TEST' };

      chrome.runtime.sendMessage(message, (response) => {
        expect(response).toEqual({ success: true });
        done();
      });
    });
  });

  describe('chrome.runtime.lastError', () => {
    it('应该能够设置和读取 lastError', () => {
      expect(chrome.runtime.lastError).toBeUndefined();

      setRuntimeError('Test error message');

      expect(chrome.runtime.lastError).toBeDefined();
      expect(chrome.runtime.lastError?.message).toBe('Test error message');
    });

    it('应该能够清除 lastError', () => {
      setRuntimeError('Test error');
      expect(chrome.runtime.lastError).toBeDefined();

      clearRuntimeError();
      expect(chrome.runtime.lastError).toBeUndefined();
    });
  });

  describe('chrome.runtime.getURL', () => {
    it('应该返回扩展资源的完整 URL', () => {
      const url = chrome.runtime.getURL('icons/icon48.png');

      expect(url).toBe('chrome-extension://mock-extension-id/icons/icon48.png');
    });

    it('应该处理不同的路径格式', () => {
      expect(chrome.runtime.getURL('test.html')).toBe('chrome-extension://mock-extension-id/test.html');
      expect(chrome.runtime.getURL('/test.html')).toBe('chrome-extension://mock-extension-id//test.html');
    });
  });

  describe('chrome.runtime.getManifest', () => {
    it('应该返回 manifest 信息', () => {
      const manifest = chrome.runtime.getManifest();

      expect(manifest).toEqual({
        manifest_version: 3,
        name: 'Video Speed Controller',
        version: '2.0.0',
      });
    });
  });

  describe('chrome.runtime.id', () => {
    it('应该返回扩展 ID', () => {
      expect(chrome.runtime.id).toBe('mock-extension-id');
    });
  });

  describe('chrome.runtime.onMessage', () => {
    it('应该能够添加消息监听器', () => {
      const listener = jest.fn();

      chrome.runtime.onMessage.addListener(listener);

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
    });

    it('应该能够移除消息监听器', () => {
      const listener = jest.fn();

      chrome.runtime.onMessage.removeListener(listener);

      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
    });
  });
});
