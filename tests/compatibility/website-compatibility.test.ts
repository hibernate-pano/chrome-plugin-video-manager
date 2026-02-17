/**
 * 网站兼容性测试
 * 验证扩展在各种网站上的兼容性
 *
 * 测试内容：
 * 1. 媒体元素检测
 * 2. Shadow DOM 支持
 * 3. iframe 支持
 * 4. 常见视频网站兼容性
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MediaDetector } from '../../shared/modules/mediaDetector';

describe('网站兼容性测试', () => {
  let detector: MediaDetector;
  let container: HTMLDivElement;

  beforeEach(() => {
    detector = new MediaDetector();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    detector.destroy();
    document.body.removeChild(container);
    container.innerHTML = '';
  });

  describe('基础媒体元素检测', () => {
    it('应该检测到 video 元素', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      container.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
      expect(media[0].tagName).toBe('VIDEO');
    });

    it('应该检测到 audio 元素', () => {
      const audio = document.createElement('audio');
      audio.src = 'test.mp3';
      container.appendChild(audio);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
      expect(media[0].tagName).toBe('AUDIO');
    });

    it('应该检测到多个媒体元素', () => {
      const video1 = document.createElement('video');
      video1.src = 'test1.mp4';
      container.appendChild(video1);

      const video2 = document.createElement('video');
      video2.src = 'test2.mp4';
      container.appendChild(video2);

      const audio = document.createElement('audio');
      audio.src = 'test.mp3';
      container.appendChild(audio);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(3);
    });
  });

  describe('Shadow DOM 支持', () => {
    it('应该检测到 Shadow DOM 中的媒体元素', () => {
      const host = document.createElement('div');
      container.appendChild(host);

      const shadowRoot = host.attachShadow({ mode: 'open' });
      const video = document.createElement('video');
      video.src = 'test.mp4';
      shadowRoot.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media.length).toBeGreaterThan(0);

      // 验证找到的是 video 元素
      const foundVideo = Array.from(media).find(m => m.tagName === 'VIDEO');
      expect(foundVideo).toBeDefined();
    });

    it('应该检测到嵌套 Shadow DOM 中的媒体元素', () => {
      const host1 = document.createElement('div');
      container.appendChild(host1);

      const shadowRoot1 = host1.attachShadow({ mode: 'open' });
      const host2 = document.createElement('div');
      shadowRoot1.appendChild(host2);

      const shadowRoot2 = host2.attachShadow({ mode: 'open' });
      const video = document.createElement('video');
      video.src = 'test.mp4';
      shadowRoot2.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media.length).toBeGreaterThan(0);
    });
  });

  describe('iframe 支持', () => {
    it('应该检测到 iframe 中的媒体元素', () => {
      const iframe = document.createElement('iframe');
      container.appendChild(iframe);

      // 等待 iframe 加载
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const video = iframeDoc.createElement('video');
        video.src = 'test.mp4';
        iframeDoc.body.appendChild(video);

        const media = detector.getAllMediaElements();
        expect(media.length).toBeGreaterThan(0);
      }
    });
  });

  describe('常见视频网站模拟', () => {
    it('应该支持 YouTube 风格的视频结构', () => {
      // 模拟 YouTube 的视频结构
      const playerContainer = document.createElement('div');
      playerContainer.className = 'html5-video-player';

      const video = document.createElement('video');
      video.className = 'video-stream html5-main-video';
      video.src = 'test.mp4';

      playerContainer.appendChild(video);
      container.appendChild(playerContainer);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
      expect(media[0].tagName).toBe('VIDEO');
    });

    it('应该支持 Bilibili 风格的视频结构', () => {
      // 模拟 Bilibili 的视频结构
      const playerContainer = document.createElement('div');
      playerContainer.className = 'bilibili-player-video-wrap';

      const video = document.createElement('video');
      video.className = 'bilibili-player-video';
      video.src = 'test.mp4';

      playerContainer.appendChild(video);
      container.appendChild(playerContainer);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
      expect(media[0].tagName).toBe('VIDEO');
    });

    it('应该支持 HTML5 video 标签', () => {
      // 标准 HTML5 video
      const video = document.createElement('video');
      video.controls = true;
      video.src = 'test.mp4';
      container.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
      expect(media[0].tagName).toBe('VIDEO');
    });

    it('应该支持带 source 标签的 video', () => {
      const video = document.createElement('video');
      video.controls = true;

      const source = document.createElement('source');
      source.src = 'test.mp4';
      source.type = 'video/mp4';
      video.appendChild(source);

      container.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
      expect(media[0].tagName).toBe('VIDEO');
    });
  });

  describe('动态内容支持', () => {
    it('应该检测到动态添加的媒体元素', () => {
      // 初始没有媒体元素
      let media = detector.getAllMediaElements();
      expect(media).toHaveLength(0);

      // 动态添加视频
      const video = document.createElement('video');
      video.src = 'test.mp4';
      container.appendChild(video);

      // 清除缓存后重新检测
      detector.clearCache();
      media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
    });

    it('应该处理媒体元素的移除', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      container.appendChild(video);

      let media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);

      // 移除视频
      container.removeChild(video);

      // 清除缓存后重新检测
      detector.clearCache();
      media = detector.getAllMediaElements();
      expect(media).toHaveLength(0);
    });
  });

  describe('边界情况处理', () => {
    it('应该处理没有 src 的媒体元素', () => {
      const video = document.createElement('video');
      // 没有设置 src
      container.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
    });

    it('应该处理隐藏的媒体元素', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      video.style.display = 'none';
      container.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
    });

    it('应该处理 visibility: hidden 的媒体元素', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      video.style.visibility = 'hidden';
      container.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
    });

    it('应该处理零尺寸的媒体元素', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      video.style.width = '0';
      video.style.height = '0';
      container.appendChild(video);

      const media = detector.getAllMediaElements();
      expect(media).toHaveLength(1);
    });
  });

  describe('性能和缓存', () => {
    it('应该缓存检测结果', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      container.appendChild(video);

      const media1 = detector.getAllMediaElements();
      const media2 = detector.getAllMediaElements();

      // 应该返回相同的引用（缓存）
      expect(media1).toBe(media2);
    });

    it('应该在缓存过期后重新检测', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      container.appendChild(video);

      const media1 = detector.getAllMediaElements();

      // 等待缓存过期（假设缓存时间为 500ms）
      await new Promise(resolve => setTimeout(resolve, 600));

      const media2 = detector.getAllMediaElements();

      // 应该返回不同的引用（重新检测）
      expect(media1).not.toBe(media2);
    });

    it('应该支持手动清除缓存', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      container.appendChild(video);

      const media1 = detector.getAllMediaElements();

      detector.clearCache();

      const media2 = detector.getAllMediaElements();

      // 应该返回不同的引用
      expect(media1).not.toBe(media2);
    });
  });

  describe('目标媒体选择', () => {
    it('应该选择最大的可见媒体元素', () => {
      const video1 = document.createElement('video');
      video1.src = 'test1.mp4';
      video1.style.width = '100px';
      video1.style.height = '100px';
      container.appendChild(video1);

      const video2 = document.createElement('video');
      video2.src = 'test2.mp4';
      video2.style.width = '500px';
      video2.style.height = '500px';
      container.appendChild(video2);

      const target = detector.getTargetMedia();
      expect(target).toBe(video2);
    });

    it('应该在只有一个媒体元素时返回该元素', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      container.appendChild(video);

      const target = detector.getTargetMedia();
      expect(target).toBe(video);
    });

    it('应该在没有媒体元素时返回 null', () => {
      const target = detector.getTargetMedia();
      expect(target).toBeNull();
    });
  });
});
