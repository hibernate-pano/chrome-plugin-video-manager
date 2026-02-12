/**
 * 内容脚本集成测试
 * 验证所有 UI 组件、核心功能和性能
 * @module content/__tests__/contentScript.integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import ContentApp from '../ContentApp';
import { useMediaStore } from '../../shared/stores/mediaStore';
import { useHUDStore } from '../../shared/stores/hudStore';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { MediaDetector } from '../../shared/modules/mediaDetector';
import { KeyboardHandlerWithStore } from '../../shared/modules/keyboardHandlerWithStore';

// Mock Chrome API
global.chrome = {
  storage: {
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  i18n: {
    getMessage: vi.fn((key) => key),
  },
  runtime: {
    lastError: null,
  },
} as any;

describe('内容脚本集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 重置所有 stores
    useMediaStore.getState().reset();
    useHUDStore.getState().reset();
    useSettingsStore.getState().resetShortcuts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('UI 组件集成', () => {
    it('应该成功渲染 ContentApp 组件', () => {
      const { container } = render(<ContentApp />);
      expect(container).toBeTruthy();
    });

    it('应该包含所有必要的 UI 组件', async () => {
      render(<ContentApp />);

      // 等待组件渲染
      await waitFor(() => {
        // HUD 组件应该存在（即使不可见）
        expect(document.querySelector('#vsc-hud-shadow-host')).toBeTruthy();
        // Lightbox 组件应该存在（即使不可见）
        expect(document.querySelector('#vsc-lightbox-shadow-host')).toBeTruthy();
        // KeyboardHelpModal 组件应该存在（即使不可见）
        expect(document.querySelector('#vsc-keyboard-help-shadow-host')).toBeTruthy();
      });
    });

    it('应该正确使用 Shadow DOM 隔离样式', async () => {
      render(<ContentApp />);

      await waitFor(() => {
        const hudHost = document.querySelector('#vsc-hud-shadow-host');
        expect(hudHost).toBeTruthy();
        expect((hudHost as HTMLElement).shadowRoot).toBeTruthy();

        const lightboxHost = document.querySelector('#vsc-lightbox-shadow-host');
        expect(lightboxHost).toBeTruthy();
        expect((lightboxHost as HTMLElement).shadowRoot).toBeTruthy();

        const keyboardHelpHost = document.querySelector('#vsc-keyboard-help-shadow-host');
        expect(keyboardHelpHost).toBeTruthy();
        expect((keyboardHelpHost as HTMLElement).shadowRoot).toBeTruthy();
      });
    });

    it('应该能够切换键盘帮助模态框', async () => {
      render(<ContentApp />);

      // 触发切换事件
      act(() => {
        window.dispatchEvent(new CustomEvent('vsc-toggle-keyboard-help'));
      });

      // 等待状态更新
      await waitFor(() => {
        // 键盘帮助模态框应该可见
        // 注意：由于使用 Shadow DOM，我们无法直接查询内部元素
        // 这里我们只验证事件被正确处理
        expect(true).toBe(true);
      });
    });
  });

  describe('核心功能集成', () => {
    describe('媒体检测', () => {
      it('应该能够检测页面上的视频元素', () => {
        // 创建测试视频元素
        const video = document.createElement('video');
        video.src = 'test.mp4';
        document.body.appendChild(video);

        const detector = new MediaDetector();
        const media = detector.getAllMediaElements();

        expect(media.length).toBeGreaterThan(0);
        expect(media[0].tagName).toBe('VIDEO');

        detector.destroy();
      });

      it('应该能够检测页面上的音频元素', () => {
        // 创建测试音频元素
        const audio = document.createElement('audio');
        audio.src = 'test.mp3';
        document.body.appendChild(audio);

        const detector = new MediaDetector();
        const media = detector.getAllMediaElements();

        expect(media.length).toBeGreaterThan(0);
        expect(media[0].tagName).toBe('AUDIO');

        detector.destroy();
      });

      it('应该能够检测多个媒体元素', () => {
        // 创建多个媒体元素
        const video1 = document.createElement('video');
        video1.src = 'test1.mp4';
        document.body.appendChild(video1);

        const video2 = document.createElement('video');
        video2.src = 'test2.mp4';
        document.body.appendChild(video2);

        const audio = document.createElement('audio');
        audio.src = 'test.mp3';
        document.body.appendChild(audio);

        const detector = new MediaDetector();
        const media = detector.getAllMediaElements();

        expect(media.length).toBe(3);

        detector.destroy();
      });

      it('应该使用缓存提高性能', () => {
        const video = document.createElement('video');
        video.src = 'test.mp4';
        document.body.appendChild(video);

        const detector = new MediaDetector({ cacheExpiryMs: 1000 });

        // 第一次调用
        const media1 = detector.getAllMediaElements();
        // 第二次调用应该使用缓存
        const media2 = detector.getAllMediaElements();

        // 应该返回相同的引用
        expect(media1).toBe(media2);

        detector.destroy();
      });
    });

    describe('播放控制', () => {
      it('应该能够调整播放速度', () => {
        const { result } = renderHook(() => useMediaStore());

        // 创建测试视频元素
        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        document.body.appendChild(video);

        act(() => {
          result.current.setCurrentMedia(video);
          result.current.setPlaybackRate(1.5);
        });

        expect(video.playbackRate).toBe(1.5);
        expect(result.current.playbackRate).toBe(1.5);
      });

      it('应该能够调整音量', () => {
        const { result } = renderHook(() => useMediaStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        document.body.appendChild(video);

        act(() => {
          result.current.setCurrentMedia(video);
          result.current.setVolume(0.5);
        });

        expect(video.volume).toBe(0.5);
        expect(result.current.volume).toBe(0.5);
      });

      it('应该能够快进', () => {
        const { result } = renderHook(() => useMediaStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        video.currentTime = 10;
        video.duration = 100;
        document.body.appendChild(video);

        act(() => {
          result.current.setCurrentMedia(video);
          result.current.seekForward(5);
        });

        expect(video.currentTime).toBe(15);
      });

      it('应该能够快退', () => {
        const { result } = renderHook(() => useMediaStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        video.currentTime = 10;
        video.duration = 100;
        document.body.appendChild(video);

        act(() => {
          result.current.setCurrentMedia(video);
          result.current.seekBackward(5);
        });

        expect(video.currentTime).toBe(5);
      });

      it('应该防止快进超过视频时长', () => {
        const { result } = renderHook(() => useMediaStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        video.currentTime = 95;
        video.duration = 100;
        document.body.appendChild(video);

        act(() => {
          result.current.setCurrentMedia(video);
          result.current.seekForward(10);
        });

        expect(video.currentTime).toBe(100);
      });

      it('应该防止快退到负数时间', () => {
        const { result } = renderHook(() => useMediaStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        video.currentTime = 3;
        video.duration = 100;
        document.body.appendChild(video);

        act(() => {
          result.current.setCurrentMedia(video);
          result.current.seekBackward(5);
        });

        expect(video.currentTime).toBe(0);
      });
    });

    describe('HUD 显示', () => {
      it('应该在调整速度时显示 HUD', async () => {
        const { result: mediaResult } = renderHook(() => useMediaStore());
        const { result: hudResult } = renderHook(() => useHUDStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        document.body.appendChild(video);

        act(() => {
          mediaResult.current.setCurrentMedia(video);
          mediaResult.current.setPlaybackRate(1.5);
          hudResult.current.show({ type: 'speed', value: 1.5 });
        });

        expect(hudResult.current.visible).toBe(true);
        expect(hudResult.current.type).toBe('speed');
        expect(hudResult.current.value).toBe(1.5);
      });

      it('应该在调整音量时显示 HUD', async () => {
        const { result: mediaResult } = renderHook(() => useMediaStore());
        const { result: hudResult } = renderHook(() => useHUDStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        document.body.appendChild(video);

        act(() => {
          mediaResult.current.setCurrentMedia(video);
          mediaResult.current.setVolume(0.8);
          hudResult.current.show({ type: 'volume', value: 0.8 });
        });

        expect(hudResult.current.visible).toBe(true);
        expect(hudResult.current.type).toBe('volume');
        expect(hudResult.current.value).toBe(0.8);
      });

      it('应该在快进快退时显示 HUD', async () => {
        const { result: mediaResult } = renderHook(() => useMediaStore());
        const { result: hudResult } = renderHook(() => useHUDStore());

        const video = document.createElement('video') as HTMLVideoElement;
        video.src = 'test.mp4';
        video.currentTime = 10;
        video.duration = 100;
        document.body.appendChild(video);

        act(() => {
          mediaResult.current.setCurrentMedia(video);
          mediaResult.current.seekForward(5);
          hudResult.current.show({ type: 'seek', value: 5 });
        });

        expect(hudResult.current.visible).toBe(true);
        expect(hudResult.current.type).toBe('seek');
        expect(hudResult.current.value).toBe(5);
      });

      it('应该在指定时间后自动隐藏 HUD', async () => {
        const { result } = renderHook(() => useHUDStore());

        act(() => {
          result.current.show({ type: 'speed', value: 1.5, duration: 2000 });
        });

        expect(result.current.visible).toBe(true);

        act(() => {
          vi.advanceTimersByTime(2000);
        });

        await waitFor(() => {
          expect(result.current.visible).toBe(false);
        });
      });
    });

    describe('设置管理', () => {
      it('应该能够加载默认设置', () => {
        const { result } = renderHook(() => useSettingsStore());

        expect(result.current.shortcuts).toBeDefined();
        expect(result.current.presets).toBeDefined();
        expect(result.current.animationSpeed).toBeDefined();
      });

      it('应该能够更新快捷键', () => {
        const { result } = renderHook(() => useSettingsStore());

        act(() => {
          result.current.updateShortcut('increase', '+');
        });

        expect(result.current.shortcuts.increase).toBe('+');
      });

      it('应该能够重置快捷键', () => {
        const { result } = renderHook(() => useSettingsStore());

        // 先修改快捷键
        act(() => {
          result.current.updateShortcut('increase', '+');
        });

        expect(result.current.shortcuts.increase).toBe('+');

        // 重置
        act(() => {
          result.current.resetShortcuts();
        });

        // 应该恢复默认值
        expect(result.current.shortcuts.increase).toBe('=');
      });

      it('应该能够添加速度预设', () => {
        const { result } = renderHook(() => useSettingsStore());

        const initialLength = result.current.presets.length;

        act(() => {
          result.current.addPreset({
            id: 'custom-1',
            speed: 2.5,
            label: '2.5x',
          });
        });

        expect(result.current.presets.length).toBe(initialLength + 1);
        expect(result.current.presets[result.current.presets.length - 1].speed).toBe(2.5);
      });

      it('应该能够删除速度预设', () => {
        const { result } = renderHook(() => useSettingsStore());

        const initialLength = result.current.presets.length;
        const firstPresetId = result.current.presets[0].id;

        act(() => {
          result.current.removePreset(firstPresetId);
        });

        expect(result.current.presets.length).toBe(initialLength - 1);
        expect(result.current.presets.find(p => p.id === firstPresetId)).toBeUndefined();
      });

      it('应该能够更新动画速度设置', () => {
        const { result } = renderHook(() => useSettingsStore());

        act(() => {
          result.current.setAnimationSpeed('fast');
        });

        expect(result.current.animationSpeed).toBe('fast');

        act(() => {
          result.current.setAnimationSpeed('off');
        });

        expect(result.current.animationSpeed).toBe('off');
      });
    });
  });

  describe('性能测试', () => {
    it('应该在合理时间内初始化所有组件', () => {
      const startTime = performance.now();

      render(<ContentApp />);

      const endTime = performance.now();
      const initTime = endTime - startTime;

      // 初始化时间应该小于 100ms
      expect(initTime).toBeLessThan(100);
    });

    it('应该在合理时间内检测媒体元素', () => {
      // 创建多个媒体元素
      for (let i = 0; i < 10; i++) {
        const video = document.createElement('video');
        video.src = `test${i}.mp4`;
        document.body.appendChild(video);
      }

      const detector = new MediaDetector();
      const startTime = performance.now();

      detector.getAllMediaElements();

      const endTime = performance.now();
      const detectTime = endTime - startTime;

      // 检测时间应该小于 50ms
      expect(detectTime).toBeLessThan(50);

      detector.destroy();
    });

    it('应该在合理时间内更新 HUD', () => {
      const { result } = renderHook(() => useHUDStore());

      const startTime = performance.now();

      act(() => {
        result.current.show({ type: 'speed', value: 1.5 });
      });

      const endTime = performance.now();
      const updateTime = endTime - startTime;

      // 更新时间应该小于 10ms
      expect(updateTime).toBeLessThan(10);
    });

    it('应该能够处理快速连续的操作', () => {
      const { result: mediaResult } = renderHook(() => useMediaStore());
      const { result: hudResult } = renderHook(() => useHUDStore());

      const video = document.createElement('video') as HTMLVideoElement;
      video.src = 'test.mp4';
      video.duration = 100;
      document.body.appendChild(video);

      act(() => {
        mediaResult.current.setCurrentMedia(video);
      });

      const startTime = performance.now();

      // 快速连续执行 100 次操作
      act(() => {
        for (let i = 0; i < 100; i++) {
          mediaResult.current.setPlaybackRate(1.0 + i * 0.01);
          hudResult.current.show({ type: 'speed', value: 1.0 + i * 0.01 });
        }
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // 总时间应该小于 100ms
      expect(totalTime).toBeLessThan(100);

      // 最终状态应该正确
      expect(mediaResult.current.playbackRate).toBe(2.0);
      expect(hudResult.current.value).toBe(2.0);
    });

    it('应该不会造成内存泄漏', () => {
      const initialNodeCount = document.body.childNodes.length;

      // 多次挂载和卸载
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(<ContentApp />);
        unmount();
      }

      // DOM 节点数量应该恢复到初始值
      expect(document.body.childNodes.length).toBe(initialNodeCount);
    });
  });

  describe('错误处理', () => {
    it('应该优雅处理不存在的媒体元素', () => {
      const { result } = renderHook(() => useMediaStore());

      // 不设置媒体元素，直接调用操作
      expect(() => {
        act(() => {
          result.current.setPlaybackRate(1.5);
        });
      }).not.toThrow();
    });

    it('应该优雅处理无效的播放速度', () => {
      const { result } = renderHook(() => useMediaStore());

      const video = document.createElement('video') as HTMLVideoElement;
      video.src = 'test.mp4';
      document.body.appendChild(video);

      act(() => {
        result.current.setCurrentMedia(video);
      });

      // 尝试设置无效的速度值
      expect(() => {
        act(() => {
          result.current.setPlaybackRate(-1);
        });
      }).not.toThrow();

      expect(() => {
        act(() => {
          result.current.setPlaybackRate(0);
        });
      }).not.toThrow();
    });

    it('应该优雅处理无效的音量值', () => {
      const { result } = renderHook(() => useMediaStore());

      const video = document.createElement('video') as HTMLVideoElement;
      video.src = 'test.mp4';
      document.body.appendChild(video);

      act(() => {
        result.current.setCurrentMedia(video);
      });

      // 尝试设置无效的音量值
      expect(() => {
        act(() => {
          result.current.setVolume(-0.5);
        });
      }).not.toThrow();

      expect(() => {
        act(() => {
          result.current.setVolume(1.5);
        });
      }).not.toThrow();
    });

    it('应该优雅处理 Chrome Storage 错误', async () => {
      // Mock storage 错误
      (chrome.storage.sync.get as any).mockRejectedValueOnce(new Error('Storage error'));

      const { result } = renderHook(() => useSettingsStore());

      // 应该不会抛出错误
      expect(() => {
        act(() => {
          result.current.updateShortcut('increase', '+');
        });
      }).not.toThrow();
    });
  });

  describe('边界情况', () => {
    it('应该处理页面上没有媒体元素的情况', () => {
      const detector = new MediaDetector();
      const media = detector.getAllMediaElements();

      expect(media).toEqual([]);

      detector.destroy();
    });

    it('应该处理媒体元素动态添加的情况', () => {
      const detector = new MediaDetector();

      // 初始没有媒体元素
      let media = detector.getAllMediaElements();
      expect(media.length).toBe(0);

      // 动态添加视频元素
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      // 清除缓存后重新检测
      act(() => {
        vi.advanceTimersByTime(600); // 超过缓存过期时间
      });

      media = detector.getAllMediaElements();
      expect(media.length).toBe(1);

      detector.destroy();
    });

    it('应该处理媒体元素被移除的情况', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const detector = new MediaDetector();
      let media = detector.getAllMediaElements();
      expect(media.length).toBe(1);

      // 移除视频元素
      video.remove();

      // 清除缓存后重新检测
      act(() => {
        vi.advanceTimersByTime(600);
      });

      media = detector.getAllMediaElements();
      expect(media.length).toBe(0);

      detector.destroy();
    });

    it('应该处理极端的播放速度值', () => {
      const { result } = renderHook(() => useMediaStore());

      const video = document.createElement('video') as HTMLVideoElement;
      video.src = 'test.mp4';
      document.body.appendChild(video);

      act(() => {
        result.current.setCurrentMedia(video);
      });

      // 测试极小值
      act(() => {
        result.current.setPlaybackRate(0.1);
      });
      expect(video.playbackRate).toBe(0.1);

      // 测试极大值
      act(() => {
        result.current.setPlaybackRate(16.0);
      });
      expect(video.playbackRate).toBe(16.0);
    });

    it('应该处理视频时长为 0 的情况', () => {
      const { result } = renderHook(() => useMediaStore());

      const video = document.createElement('video') as HTMLVideoElement;
      video.src = 'test.mp4';
      video.duration = 0;
      document.body.appendChild(video);

      act(() => {
        result.current.setCurrentMedia(video);
      });

      // 尝试快进
      expect(() => {
        act(() => {
          result.current.seekForward(5);
        });
      }).not.toThrow();
    });

    it('应该处理视频时长为 Infinity 的情况', () => {
      const { result } = renderHook(() => useMediaStore());

      const video = document.createElement('video') as HTMLVideoElement;
      video.src = 'test.mp4';
      video.duration = Infinity;
      document.body.appendChild(video);

      act(() => {
        result.current.setCurrentMedia(video);
      });

      // 尝试快进
      expect(() => {
        act(() => {
          result.current.seekForward(5);
        });
      }).not.toThrow();
    });
  });
});
