/**
 * Chrome i18n API 测试
 * 测试 Chrome 国际化 API
 */

import { chromeMock } from '../mocks/chrome';

describe('Chrome i18n API', () => {
  beforeEach(() => {
    chromeMock.__reset();
  });

  describe('chrome.i18n.getMessage', () => {
    it('应该能够获取消息', () => {
      const message = chrome.i18n.getMessage('appName');

      expect(message).toBe('appName');
      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('appName');
    });

    it('应该支持替换参数', () => {
      const message = chrome.i18n.getMessage('greeting', 'World');

      expect(message).toBe('greeting');
      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('greeting', 'World');
    });

    it('应该支持多个替换参数', () => {
      const message = chrome.i18n.getMessage('multiParam', ['param1', 'param2']);

      expect(message).toBe('multiParam');
      expect(chrome.i18n.getMessage).toHaveBeenCalledWith('multiParam', ['param1', 'param2']);
    });
  });

  describe('chrome.i18n.getUILanguage', () => {
    it('应该返回当前 UI 语言', () => {
      const language = chrome.i18n.getUILanguage();

      expect(language).toBe('en');
    });
  });

  describe('chrome.i18n.detectLanguage', () => {
    it('应该能够检测文本语言', (done) => {
      const text = 'Hello World';

      chrome.i18n.detectLanguage(text, (result) => {
        expect(result.isReliable).toBe(true);
        expect(result.languages).toHaveLength(1);
        expect(result.languages[0].language).toBe('en');
        expect(result.languages[0].percentage).toBe(100);
        done();
      });
    });
  });
});
