/**
 * HUD 集成测试
 * 验证 HUD 的所有功能：速度指示器、音量指示器、快进快退指示器
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useHUDStore,
  useShowSpeed,
  useShowVolume,
  useShowSeek,
  useShowReset,
} from '../../../shared/stores/hudStore';

describe('HUD 功能验证', () => {
  beforeEach(() => {
    // 重置 store 状态
    useHUDStore.getState().reset();
    // 使用假定时器
    vi.useFakeTimers();
  });

  afterEach(() => {
    // 清理
    useHUDStore.getState().reset();
    vi.restoreAllMocks();
  });

  describe('速度指示器', () => {
    it('应该正确显示播放速度', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.type).toBe('speed');
      expect(result.current.value).toBe(1.5);
    });

    it('应该支持不同的速度值', () => {
      const { result } = renderHook(() => useHUDStore());

      const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

      speeds.forEach((speed) => {
        act(() => {
          result.current.show({
            type: 'speed',
            value: speed,
          });
        });

        expect(result.current.value).toBe(speed);
      });
    });

    it('应该使用便捷 Hook 显示速度', () => {
      const { result: hookResult } = renderHook(() => useShowSpeed());
      const { result: storeResult } = renderHook(() => useHUDStore());

      act(() => {
        hookResult.current(2.0);
      });

      expect(storeResult.current.visible).toBe(true);
      expect(storeResult.current.type).toBe('speed');
      expect(storeResult.current.value).toBe(2.0);
    });

    it('应该在指定时间后自动隐藏', async () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 2000,
        });
      });

      expect(result.current.visible).toBe(true);

      // 快进时间
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(result.current.visible).toBe(false);
      });
    });
  });

  describe('音量指示器', () => {
    it('应该正确显示音量值', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'volume',
          value: 0.8,
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.type).toBe('volume');
      expect(result.current.value).toBe(0.8);
    });

    it('应该支持 0-1 范围的音量值', () => {
      const { result } = renderHook(() => useHUDStore());

      const volumes = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

      volumes.forEach((volume) => {
        act(() => {
          result.current.show({
            type: 'volume',
            value: volume,
          });
        });

        expect(result.current.value).toBe(volume);
      });
    });

    it('应该使用便捷 Hook 显示音量', () => {
      const { result: hookResult } = renderHook(() => useShowVolume());
      const { result: storeResult } = renderHook(() => useHUDStore());

      act(() => {
        hookResult.current(0.6);
      });

      expect(storeResult.current.visible).toBe(true);
      expect(storeResult.current.type).toBe('volume');
      expect(storeResult.current.value).toBe(0.6);
    });

    it('应该在指定时间后自动隐藏', async () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'volume',
          value: 0.5,
          duration: 1500,
        });
      });

      expect(result.current.visible).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1500);
      });

      await waitFor(() => {
        expect(result.current.visible).toBe(false);
      });
    });
  });

  describe('快进快退指示器', () => {
    it('应该正确显示快进秒数', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'seek',
          value: 10,
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.type).toBe('seek');
      expect(result.current.value).toBe(10);
    });

    it('应该正确显示快退秒数', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'seek',
          value: -5,
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.type).toBe('seek');
      expect(result.current.value).toBe(-5);
    });

    it('应该支持不同的跳转秒数', () => {
      const { result } = renderHook(() => useHUDStore());

      const seekValues = [-30, -10, -5, 5, 10, 30];

      seekValues.forEach((seconds) => {
        act(() => {
          result.current.show({
            type: 'seek',
            value: seconds,
          });
        });

        expect(result.current.value).toBe(seconds);
      });
    });

    it('应该使用便捷 Hook 显示跳转', () => {
      const { result: hookResult } = renderHook(() => useShowSeek());
      const { result: storeResult } = renderHook(() => useHUDStore());

      act(() => {
        hookResult.current(15);
      });

      expect(storeResult.current.visible).toBe(true);
      expect(storeResult.current.type).toBe('seek');
      expect(storeResult.current.value).toBe(15);
    });

    it('应该在指定时间后自动隐藏', async () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'seek',
          value: 10,
          duration: 1000,
        });
      });

      expect(result.current.visible).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.visible).toBe(false);
      });
    });
  });

  describe('重置指示器', () => {
    it('应该正确显示重置状态', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'reset',
          value: 1.0,
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.type).toBe('reset');
      expect(result.current.value).toBe(1.0);
    });

    it('应该使用便捷 Hook 显示重置', () => {
      const { result: hookResult } = renderHook(() => useShowReset());
      const { result: storeResult } = renderHook(() => useHUDStore());

      act(() => {
        hookResult.current();
      });

      expect(storeResult.current.visible).toBe(true);
      expect(storeResult.current.type).toBe('reset');
      expect(storeResult.current.value).toBe(1.0);
    });
  });

  describe('HUD 自动隐藏逻辑', () => {
    it('应该使用默认的显示持续时间', async () => {
      const { result } = renderHook(() => useHUDStore());

      // 默认配置的 displayDuration 是 2000ms
      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
        });
      });

      expect(result.current.visible).toBe(true);

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(result.current.visible).toBe(false);
      });
    });

    it('应该支持自定义显示持续时间', async () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 3000,
        });
      });

      expect(result.current.visible).toBe(true);

      // 2000ms 后仍然可见
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(result.current.visible).toBe(true);

      // 再过 1000ms 后隐藏
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.visible).toBe(false);
      });
    });

    it('应该在快速连续操作时取消之前的定时器', async () => {
      const { result } = renderHook(() => useHUDStore());

      // 第一次显示
      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 2000,
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.value).toBe(1.5);

      // 1000ms 后再次显示（应该取消之前的定时器）
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      act(() => {
        result.current.show({
          type: 'speed',
          value: 2.0,
          duration: 2000,
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.value).toBe(2.0);

      // 再过 1000ms，第一个定时器应该已经被取消，HUD 仍然可见
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.visible).toBe(true);

      // 再过 1000ms，第二个定时器触发，HUD 隐藏
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.visible).toBe(false);
      });
    });

    it('应该能够手动隐藏 HUD', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 5000,
        });
      });

      expect(result.current.visible).toBe(true);

      // 手动隐藏
      act(() => {
        result.current.hide();
      });

      expect(result.current.visible).toBe(false);
      expect(result.current.type).toBe(null);
    });

    it('应该在手动隐藏时取消定时器', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 2000,
        });
      });

      expect(result.current.timeout).not.toBe(null);

      act(() => {
        result.current.hide();
      });

      expect(result.current.timeout).toBe(null);
    });
  });

  describe('HUD 配置', () => {
    it('应该能够更新显示持续时间', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.updateConfig({
          displayDuration: 3000,
        });
      });

      expect(result.current.config.displayDuration).toBe(3000);
    });

    it('应该能够更新显示位置', () => {
      const { result } = renderHook(() => useHUDStore());

      const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const;

      positions.forEach((position) => {
        act(() => {
          result.current.updateConfig({
            position,
          });
        });

        expect(result.current.config.position).toBe(position);
      });
    });

    it('应该能够更新动画持续时间', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.updateConfig({
          animationDuration: 500,
        });
      });

      expect(result.current.config.animationDuration).toBe(500);
    });

    it('应该能够更新自定义类名', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.updateConfig({
          customClassName: 'my-custom-hud',
        });
      });

      expect(result.current.config.customClassName).toBe('my-custom-hud');
    });

    it('应该能够同时更新多个配置项', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.updateConfig({
          displayDuration: 3000,
          position: 'top-right',
          animationDuration: 500,
        });
      });

      expect(result.current.config.displayDuration).toBe(3000);
      expect(result.current.config.position).toBe('top-right');
      expect(result.current.config.animationDuration).toBe(500);
    });
  });

  describe('HUD 状态重置', () => {
    it('应该能够重置到初始状态', () => {
      const { result } = renderHook(() => useHUDStore());

      // 修改状态
      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
        });
        result.current.updateConfig({
          displayDuration: 3000,
          position: 'top-right',
        });
      });

      expect(result.current.visible).toBe(true);
      expect(result.current.config.displayDuration).toBe(3000);

      // 重置
      act(() => {
        result.current.reset();
      });

      expect(result.current.visible).toBe(false);
      expect(result.current.type).toBe(null);
      expect(result.current.value).toBe(0);
      expect(result.current.timeout).toBe(null);
      // 配置也应该重置
      expect(result.current.config.displayDuration).toBe(2000);
      expect(result.current.config.position).toBe('top-right');
    });

    it('应该在重置时取消定时器', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 5000,
        });
      });

      expect(result.current.timeout).not.toBe(null);

      act(() => {
        result.current.reset();
      });

      expect(result.current.timeout).toBe(null);
    });
  });

  describe('边界情况', () => {
    it('应该处理极小的速度值', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 0.1,
        });
      });

      expect(result.current.value).toBe(0.1);
    });

    it('应该处理极大的速度值', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 10.0,
        });
      });

      expect(result.current.value).toBe(10.0);
    });

    it('应该处理音量值为 0（静音）', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'volume',
          value: 0,
        });
      });

      expect(result.current.value).toBe(0);
    });

    it('应该处理音量值为 1（最大音量）', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'volume',
          value: 1,
        });
      });

      expect(result.current.value).toBe(1);
    });

    it('应该处理跳转值为 0', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'seek',
          value: 0,
        });
      });

      expect(result.current.value).toBe(0);
    });

    it('应该处理极短的显示持续时间', async () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 100,
        });
      });

      expect(result.current.visible).toBe(true);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(result.current.visible).toBe(false);
      });
    });

    it('应该处理极长的显示持续时间', () => {
      const { result } = renderHook(() => useHUDStore());

      act(() => {
        result.current.show({
          type: 'speed',
          value: 1.5,
          duration: 10000,
        });
      });

      expect(result.current.visible).toBe(true);

      // 5000ms 后仍然可见
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.visible).toBe(true);
    });
  });
});
