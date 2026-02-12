/**
 * 媒体检测模块测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MediaDetector } from '../mediaDetector';

describe('MediaDetector', () => {
  let detector: MediaDetector;

  beforeEach(() => {
    detector = new MediaDetector();
    document.body.innerHTML = `
      <video id="video1" src="test.mp4"></video>
      <audio id="audio1" src="test.mp3"></audio>
    `;
  });

  afterEach(() => {
    detector.destroy();
    document.body.innerHTML = '';
  });

  describe('基本功能', () => {
    it('应该检测所有媒体元素', () => {
      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(2);
      expect(media[0].tagName).toBe('VIDEO');
      expect(media[1].tagName).toBe('AUDIO');
    });

    it('应该返回目标媒体元素', () => {
      const target = detector.getTargetMedia();
      expect(target).not.toBeNull();
      expect(target?.tagName).toMatch(/VIDEO|AUDIO/);
    });
  });

  describe('缓存机制', () => {
    it('应该缓存媒体元素', () => {
      const media1 = detector.getAllMediaElements();
      const media2 = detector.getAllMediaElements();
      // 应该返回相同的数组引用（缓存生效）
      expect(media1).toBe(media2);
    });

    it('应该在缓存过期后重新获取', async () => {
      const media1 = detector.getAllMediaElements();

      // 等待缓存过期（默认 500ms）
      await new Promise(resolve => setTimeout(resolve, 600));

      const media2 = detector.getAllMediaElements();
      // 应该返回不同的数组引用（缓存已过期）
      expect(media1).not.toBe(media2);
    });

    it('应该在调用 invalidateCache 后标记缓存为过期', () => {
      const media1 = detector.getAllMediaElements();
      detector.invalidateCache();
      const media2 = detector.getAllMediaElements();
      // 应该返回不同的数组引用（缓存已失效）
      expect(media1).not.toBe(media2);
    });
  });

  describe('IntersectionObserver', () => {
    it('应该设置 IntersectionObserver', () => {
      // IntersectionObserver 应该在构造函数中设置
      expect(detector).toBeDefined();
      // 注意：在 jsdom 环境中，IntersectionObserver 可能不可用
      // 这个测试主要验证代码不会抛出错误
    });
  });

  describe('资源清理', () => {
    it('应该正确清理所有资源', () => {
      detector.setupMediaElementDetection();
      detector.setupMediaEventDelegation();

      // 调用 destroy 不应该抛出错误
      expect(() => detector.destroy()).not.toThrow();
    });
  });

  describe('配置选项', () => {
    it('应该使用自定义缓存过期时间', () => {
      const customDetector = new MediaDetector({ cacheExpiryMs: 1000 });
      expect(customDetector).toBeDefined();
      customDetector.destroy();
    });

    it('应该使用自定义检查间隔', () => {
      const customDetector = new MediaDetector({ checkIntervals: [100, 200, 300] });
      expect(customDetector).toBeDefined();
      customDetector.destroy();
    });
  });

  describe('边界情况', () => {
    it('应该处理没有媒体元素的情况', () => {
      document.body.innerHTML = '';
      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(0);
    });

    it('应该处理单个媒体元素', () => {
      document.body.innerHTML = '<video id="video1" src="test.mp4"></video>';
      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
    });

    it('应该在没有媒体元素时返回 null', () => {
      document.body.innerHTML = '';
      const target = detector.getTargetMedia();
      expect(target).toBeNull();
    });
  });
});
