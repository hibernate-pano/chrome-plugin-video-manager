/**
 * PlaybackController 单元测试
 * @module shared/modules/__tests__/playbackController
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlaybackController, createPlaybackController } from '../playbackController';
import * as hudStoreModule from '../../stores/hudStore';

// Mock HUD Store
const mockShow = vi.fn();
const mockHide = vi.fn();
const mockUpdateConfig = vi.fn();
const mockCancelTimeout = vi.fn();
const mockReset = vi.fn();

vi.mock('../../stores/hudStore', () => ({
  useHUDStore: {
    getState: () => ({
      show: mockShow,
      hide: mockHide,
      updateConfig: mockUpdateConfig,
      cancelTimeout: mockCancelTimeout,
      reset: mockReset,
      visible: false,
      type: null,
      value: 0,
      timeout: null,
      config: {
        displayDuration: 2000,
        animationDuration: 300,
        position: 'center' as const,
      },
    }),
  },
}));

describe('PlaybackController', () => {
  let controller: PlaybackController;
  let mockMedia: HTMLMediaElement;
  let mockVideo: HTMLVideoElement;

  beforeEach(() => {
    // 重置所有 mock
    vi.clearAllMocks();

    // 创建控制器实例
    controller = new PlaybackController();

    // 创建 mock 媒体元素
    mockMedia = {
      playbackRate: 1.0,
      volume: 0.5,
      muted: false,
      paused: true,
      currentTime: 10,
      duration: 100,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    } as unknown as HTMLMediaElement;

    mockVideo = {
      ...mockMedia,
      currentTime: 10,
      duration: 100,
    } as unknown as HTMLVideoElement;
  });

  describe('handleSpeed', () => {
    it('应该增加播放速度', () => {
      controller.handleSpeed(mockMedia, 'increase');

      expect(mockMedia.playbackRate).toBe(1.1);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'speed',
        value: 1.1,
      });
    });

    it('应该减少播放速度', () => {
      controller.handleSpeed(mockMedia, 'decrease');

      expect(mockMedia.playbackRate).toBe(0.9);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'speed',
        value: 0.9,
      });
    });

    it('应该重置播放速度', () => {
      mockMedia.playbackRate = 2.0;
      controller.handleSpeed(mockMedia, 'reset');

      expect(mockMedia.playbackRate).toBe(1.0);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'reset',
        value: 1.0,
      });
    });

    it('应该限制最大播放速度', () => {
      mockMedia.playbackRate = 15.9;
      controller.handleSpeed(mockMedia, 'increase');

      expect(mockMedia.playbackRate).toBe(16);
    });

    it('应该限制最小播放速度', () => {
      mockMedia.playbackRate = 0.2;
      controller.handleSpeed(mockMedia, 'decrease');

      expect(mockMedia.playbackRate).toBe(0.1);
    });

    it('应该处理无效的播放速度', () => {
      mockMedia.playbackRate = NaN;
      controller.handleSpeed(mockMedia, 'increase');

      expect(mockMedia.playbackRate).toBe(1.1);
    });
  });

  describe('handleSeek', () => {
    it('应该快进视频', () => {
      controller.handleSeek(mockVideo, 'forward');

      expect(mockVideo.currentTime).toBe(15);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'seek',
        value: 5,
      });
    });

    it('应该快退视频', () => {
      controller.handleSeek(mockVideo, 'backward');

      expect(mockVideo.currentTime).toBe(5);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'seek',
        value: -5,
      });
    });

    it('应该使用自定义步长', () => {
      controller.handleSeek(mockVideo, 'forward', 10);

      expect(mockVideo.currentTime).toBe(20);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'seek',
        value: 10,
      });
    });

    it('应该限制在视频时长范围内', () => {
      mockVideo.currentTime = 95;
      controller.handleSeek(mockVideo, 'forward');

      expect(mockVideo.currentTime).toBe(100);
    });

    it('应该限制在 0 以上', () => {
      mockVideo.currentTime = 3;
      controller.handleSeek(mockVideo, 'backward');

      expect(mockVideo.currentTime).toBe(0);
    });
  });

  describe('handleVolume', () => {
    it('应该增加音量', () => {
      controller.handleVolume(mockMedia, 'up');

      expect(mockMedia.volume).toBe(0.6);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'volume',
        value: 60,
      });
    });

    it('应该减少音量', () => {
      controller.handleVolume(mockMedia, 'down');

      expect(mockMedia.volume).toBe(0.4);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'volume',
        value: 40,
      });
    });

    it('应该使用自定义步长', () => {
      controller.handleVolume(mockMedia, 'up', 0.2);

      expect(mockMedia.volume).toBe(0.7);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'volume',
        value: 70,
      });
    });

    it('应该限制最大音量为 1', () => {
      mockMedia.volume = 0.95;
      controller.handleVolume(mockMedia, 'up');

      expect(mockMedia.volume).toBe(1);
    });

    it('应该限制最小音量为 0', () => {
      mockMedia.volume = 0.05;
      controller.handleVolume(mockMedia, 'down');

      expect(mockMedia.volume).toBe(0);
    });
  });

  describe('handlePlayPause', () => {
    it('应该播放暂停的媒体', async () => {
      await controller.handlePlayPause(mockMedia);

      expect(mockMedia.play).toHaveBeenCalled();
    });

    it('应该暂停正在播放的媒体', async () => {
      mockMedia.paused = false;
      await controller.handlePlayPause(mockMedia);

      expect(mockMedia.pause).toHaveBeenCalled();
    });

    it('应该处理播放失败', async () => {
      const error = new Error('播放失败');
      (mockMedia.play as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      // 不应该抛出错误
      await expect(controller.handlePlayPause(mockMedia)).resolves.toBeUndefined();
    });
  });

  describe('setSpeed', () => {
    it('应该设置指定的播放速度', () => {
      controller.setSpeed(mockMedia, 1.5);

      expect(mockMedia.playbackRate).toBe(1.5);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'speed',
        value: 1.5,
      });
    });

    it('应该拒绝无效的速度值', () => {
      controller.setSpeed(mockMedia, NaN);
      expect(mockMedia.playbackRate).toBe(1.0); // 保持原值

      controller.setSpeed(mockMedia, -1);
      expect(mockMedia.playbackRate).toBe(1.0); // 保持原值

      controller.setSpeed(mockMedia, 20);
      expect(mockMedia.playbackRate).toBe(1.0); // 保持原值
    });
  });

  describe('setVolume', () => {
    it('应该设置指定的音量', () => {
      controller.setVolume(mockMedia, 0.8);

      expect(mockMedia.volume).toBe(0.8);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'volume',
        value: 80,
      });
    });

    it('应该拒绝无效的音量值', () => {
      controller.setVolume(mockMedia, NaN);
      expect(mockMedia.volume).toBe(0.5); // 保持原值

      controller.setVolume(mockMedia, -0.1);
      expect(mockMedia.volume).toBe(0.5); // 保持原值

      controller.setVolume(mockMedia, 1.5);
      expect(mockMedia.volume).toBe(0.5); // 保持原值
    });
  });

  describe('toggleMute', () => {
    it('应该切换静音状态', () => {
      controller.toggleMute(mockMedia);

      expect(mockMedia.muted).toBe(true);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'volume',
        value: 0,
      });
    });

    it('应该取消静音', () => {
      mockMedia.muted = true;
      controller.toggleMute(mockMedia);

      expect(mockMedia.muted).toBe(false);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'volume',
        value: 50,
      });
    });
  });

  describe('seekTo', () => {
    it('应该跳转到指定时间', () => {
      controller.seekTo(mockMedia, 30);

      expect(mockMedia.currentTime).toBe(30);
      expect(mockShow).toHaveBeenCalledWith({
        type: 'seek',
        value: 20,
      });
    });

    it('应该限制在视频时长范围内', () => {
      controller.seekTo(mockMedia, 150);

      expect(mockMedia.currentTime).toBe(100);
    });

    it('应该拒绝无效的时间值', () => {
      controller.seekTo(mockMedia, NaN);
      expect(mockMedia.currentTime).toBe(10); // 保持原值

      controller.seekTo(mockMedia, -5);
      expect(mockMedia.currentTime).toBe(10); // 保持原值
    });
  });

  describe('配置管理', () => {
    it('应该使用默认配置', () => {
      const config = controller.getConfig();

      expect(config.speedStep).toBe(0.1);
      expect(config.volumeStep).toBe(0.1);
      expect(config.seekStep).toBe(5);
      expect(config.minSpeed).toBe(0.1);
      expect(config.maxSpeed).toBe(16);
    });

    it('应该使用自定义配置', () => {
      const customController = new PlaybackController({
        speedStep: 0.25,
        volumeStep: 0.05,
        seekStep: 10,
      });

      const config = customController.getConfig();

      expect(config.speedStep).toBe(0.25);
      expect(config.volumeStep).toBe(0.05);
      expect(config.seekStep).toBe(10);
    });

    it('应该更新配置', () => {
      controller.updateConfig({
        speedStep: 0.2,
      });

      const config = controller.getConfig();

      expect(config.speedStep).toBe(0.2);
      expect(config.volumeStep).toBe(0.1); // 保持原值
    });
  });

  describe('工厂函数', () => {
    it('应该创建新实例', () => {
      const newController = createPlaybackController({
        speedStep: 0.5,
      });

      expect(newController).toBeInstanceOf(PlaybackController);
      expect(newController.getConfig().speedStep).toBe(0.5);
    });
  });
});
