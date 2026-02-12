/**
 * Settings Store 测试
 * @module shared/stores/__tests__/settingsStore
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../settingsStore';
import { act } from '@testing-library/react';
import { mockChromeStorage } from '../../utils/__tests__/setup';

describe('settingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.chrome.runtime as any).lastError = undefined;

    // Mock Chrome Storage 成功响应
    mockChromeStorage.sync.get.mockImplementation((_key: any, callback: any) => {
      callback({});
    });
    mockChromeStorage.sync.set.mockImplementation((_items: any, callback: any) => {
      callback();
    });

    // 重置 store 到初始状态
    act(() => {
      useSettingsStore.getState().resetAll();
    });
  });

  describe('初始状态', () => {
    it('应该有正确的初始值', () => {
      const state = useSettingsStore.getState();

      expect(state.shortcuts).toBeDefined();
      expect(state.presets).toBeDefined();
      expect(state.animationSpeed).toBe('normal');
      expect(state.language).toBe('en');
      expect(state.version).toBe('2.0.0');
    });

    it('应该有默认的快捷键配置', () => {
      const state = useSettingsStore.getState();

      expect(state.shortcuts.increase).toBeDefined();
      expect(state.shortcuts.decrease).toBeDefined();
      expect(state.shortcuts.reset).toBeDefined();
    });

    it('应该有默认的预设配置', () => {
      const state = useSettingsStore.getState();

      expect(state.presets.length).toBeGreaterThan(0);
      expect(state.presets[0]).toHaveProperty('id');
      expect(state.presets[0]).toHaveProperty('speed');
      expect(state.presets[0]).toHaveProperty('label');
    });
  });

  describe('updateShortcut', () => {
    it('应该更新单个快捷键', () => {
      act(() => {
        useSettingsStore.getState().updateShortcut('increase', '+');
      });

      expect(useSettingsStore.getState().shortcuts.increase).toBe('+');
    });

    it('不应该影响其他快捷键', () => {
      const originalDecrease = useSettingsStore.getState().shortcuts.decrease;

      act(() => {
        useSettingsStore.getState().updateShortcut('increase', '+');
      });

      expect(useSettingsStore.getState().shortcuts.decrease).toBe(originalDecrease);
    });
  });

  describe('updateShortcuts', () => {
    it('应该批量更新快捷键', () => {
      act(() => {
        useSettingsStore.getState().updateShortcuts({
          increase: '+',
          decrease: '_',
          reset: '0',
        });
      });

      const shortcuts = useSettingsStore.getState().shortcuts;
      expect(shortcuts.increase).toBe('+');
      expect(shortcuts.decrease).toBe('_');
      expect(shortcuts.reset).toBe('0');
    });
  });

  describe('resetShortcuts', () => {
    it('应该重置所有快捷键为默认值', () => {
      act(() => {
        useSettingsStore.getState().updateShortcut('increase', '+');
        useSettingsStore.getState().resetShortcuts();
      });

      const shortcuts = useSettingsStore.getState().shortcuts;
      expect(shortcuts.increase).not.toBe('+');
    });
  });

  describe('checkShortcutConflict', () => {
    it('应该检测快捷键冲突', () => {
      act(() => {
        useSettingsStore.getState().updateShortcut('increase', '=');
      });

      const conflicts = useSettingsStore.getState().checkShortcutConflict('=');
      expect(conflicts).toContain('increase');
    });

    it('应该排除指定的操作', () => {
      act(() => {
        useSettingsStore.getState().updateShortcut('increase', '=');
      });

      const conflicts = useSettingsStore.getState().checkShortcutConflict('=', 'increase');
      expect(conflicts).not.toContain('increase');
    });

    it('当没有冲突时应该返回空数组', () => {
      const conflicts = useSettingsStore.getState().checkShortcutConflict('xyz');
      expect(conflicts).toEqual([]);
    });
  });

  describe('addPreset', () => {
    it('应该添加新的预设', () => {
      const newPreset = {
        id: 'test-preset',
        speed: 2.5,
        label: '2.5x',
      };

      act(() => {
        useSettingsStore.getState().addPreset(newPreset);
      });

      const presets = useSettingsStore.getState().presets;
      expect(presets).toContainEqual(newPreset);
    });
  });

  describe('updatePreset', () => {
    it('应该更新现有预设', () => {
      const presets = useSettingsStore.getState().presets;
      const firstPresetId = presets[0].id;

      act(() => {
        useSettingsStore.getState().updatePreset(firstPresetId, {
          speed: 3.0,
          label: '3.0x',
        });
      });

      const updatedPreset = useSettingsStore.getState().presets.find(
        (p) => p.id === firstPresetId
      );
      expect(updatedPreset?.speed).toBe(3.0);
      expect(updatedPreset?.label).toBe('3.0x');
    });
  });

  describe('removePreset', () => {
    it('应该删除指定预设', () => {
      const presets = useSettingsStore.getState().presets;
      const firstPresetId = presets[0].id;
      const initialLength = presets.length;

      act(() => {
        useSettingsStore.getState().removePreset(firstPresetId);
      });

      const newPresets = useSettingsStore.getState().presets;
      expect(newPresets.length).toBe(initialLength - 1);
      expect(newPresets.find((p) => p.id === firstPresetId)).toBeUndefined();
    });
  });

  describe('resetPresets', () => {
    it('应该重置预设为默认值', () => {
      act(() => {
        useSettingsStore.getState().addPreset({
          id: 'custom',
          speed: 5.0,
          label: '5.0x',
        });
        useSettingsStore.getState().resetPresets();
      });

      const presets = useSettingsStore.getState().presets;
      expect(presets.find((p) => p.id === 'custom')).toBeUndefined();
    });
  });

  describe('setAnimationSpeed', () => {
    it('应该设置动画速度', () => {
      act(() => {
        useSettingsStore.getState().setAnimationSpeed('fast');
      });

      expect(useSettingsStore.getState().animationSpeed).toBe('fast');
    });
  });

  describe('updateHUDConfig', () => {
    it('应该更新 HUD 配置', () => {
      act(() => {
        useSettingsStore.getState().updateHUDConfig({
          displayDuration: 3000,
          position: 'bottom-left',
        });
      });

      const config = useSettingsStore.getState().hudConfig;
      expect(config.displayDuration).toBe(3000);
      expect(config.position).toBe('bottom-left');
    });
  });

  describe('setLanguage', () => {
    it('应该设置语言', () => {
      act(() => {
        useSettingsStore.getState().setLanguage('zh-CN');
      });

      expect(useSettingsStore.getState().language).toBe('zh-CN');
    });
  });

  describe('resetAll', () => {
    it('应该重置所有设置为默认值', () => {
      act(() => {
        useSettingsStore.getState().updateShortcut('increase', '+');
        useSettingsStore.getState().setLanguage('zh-CN');
        useSettingsStore.getState().setAnimationSpeed('fast');
        useSettingsStore.getState().resetAll();
      });

      const state = useSettingsStore.getState();
      expect(state.shortcuts.increase).not.toBe('+');
      expect(state.language).toBe('en');
      expect(state.animationSpeed).toBe('normal');
    });
  });

  describe('exportSettings', () => {
    it('应该导出所有设置', () => {
      const settings = useSettingsStore.getState().exportSettings();

      expect(settings).toHaveProperty('shortcuts');
      expect(settings).toHaveProperty('presets');
      expect(settings).toHaveProperty('animationSpeed');
      expect(settings).toHaveProperty('hudConfig');
      expect(settings).toHaveProperty('language');
      expect(settings).toHaveProperty('version');
    });
  });

  describe('importSettings', () => {
    it('应该导入设置', () => {
      const newSettings = {
        language: 'zh-CN',
        animationSpeed: 'fast' as const,
      };

      act(() => {
        useSettingsStore.getState().importSettings(newSettings);
      });

      const state = useSettingsStore.getState();
      expect(state.language).toBe('zh-CN');
      expect(state.animationSpeed).toBe('fast');
    });
  });

  describe('Chrome Storage 同步', () => {
    it('应该在状态更改时调用 Chrome Storage', async () => {
      act(() => {
        useSettingsStore.getState().setLanguage('zh-CN');
      });

      // 等待异步操作
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证 Chrome Storage 被调用
      expect(mockChromeStorage.sync.set).toHaveBeenCalled();
    });
  });
});
