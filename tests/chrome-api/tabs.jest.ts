/**
 * Chrome Tabs API 测试
 * 测试 Chrome 标签页 API
 */

import { chromeMock } from '../mocks/chrome';

describe('Chrome Tabs API', () => {
  beforeEach(() => {
    chromeMock.__reset();
  });

  describe('chrome.tabs.query', () => {
    it('应该能够查询标签页', async () => {
      const tabs = await chrome.tabs.query({ active: true });

      expect(tabs).toHaveLength(1);
      expect(tabs[0]).toEqual({
        id: 1,
        url: 'https://example.com',
        active: true,
        windowId: 1,
      });
    });

    it('应该支持回调函数', (done) => {
      chrome.tabs.query({ active: true }, (tabs) => {
        expect(tabs).toHaveLength(1);
        expect(tabs[0].active).toBe(true);
        done();
      });
    });
  });

  describe('chrome.tabs.sendMessage', () => {
    it('应该能够向标签页发送消息', async () => {
      const tabId = 1;
      const message = { type: 'UPDATE_SPEED', speed: 1.5 };

      const response = await chrome.tabs.sendMessage(tabId, message);

      expect(response).toEqual({ success: true });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(tabId, message);
    });

    it('应该支持回调函数', (done) => {
      chrome.tabs.sendMessage(1, { type: 'TEST' }, (response) => {
        expect(response).toEqual({ success: true });
        done();
      });
    });
  });

  describe('chrome.tabs 事件监听器', () => {
    it('应该能够添加 onUpdated 监听器', () => {
      const listener = jest.fn();

      chrome.tabs.onUpdated.addListener(listener);

      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(listener);
    });

    it('应该能够添加 onActivated 监听器', () => {
      const listener = jest.fn();

      chrome.tabs.onActivated.addListener(listener);

      expect(chrome.tabs.onActivated.addListener).toHaveBeenCalledWith(listener);
    });

    it('应该能够移除监听器', () => {
      const listener = jest.fn();

      chrome.tabs.onUpdated.removeListener(listener);

      expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener);
    });
  });
});
