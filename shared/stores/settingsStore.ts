/**
 * 设置状态管理 Store
 * 使用 Zustand 管理用户设置，并通过 persist 中间件同步到 Chrome Storage
 * @module shared/stores/settingsStore
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type {
  ShortcutAction,
  SpeedPreset,
  AnimationSpeed,
  ShortcutSettings,
} from '../types/shortcuts';
import { DEFAULT_SHORTCUTS, DEFAULT_PRESETS } from '../types/shortcuts';
import type { HUDConfig } from '../types/hud';
import { DEFAULT_HUD_CONFIG } from '../types/hud';
import { STORAGE_KEYS } from '../types/storage';

/**
 * 设置 Store 接口
 * 定义设置状态和操作方法
 */
interface SettingsStore extends ShortcutSettings {
  // 额外的设置
  hudConfig: HUDConfig;
  language: string;
  version: string;

  // Actions - 快捷键管理
  /**
   * 更新单个快捷键
   * @param action 快捷键操作
   * @param key 新的按键
   */
  updateShortcut: (action: ShortcutAction, key: string) => void;

  /**
   * 批量更新快捷键
   * @param shortcuts 快捷键映射对象
   */
  updateShortcuts: (shortcuts: Partial<Record<ShortcutAction, string>>) => void;

  /**
   * 重置所有快捷键为默认值
   */
  resetShortcuts: () => void;

  /**
   * 检查快捷键是否冲突
   * @param key 要检查的按键
   * @param excludeAction 要排除的操作（用于编辑时）
   * @returns 冲突的操作列表
   */
  checkShortcutConflict: (key: string, excludeAction?: ShortcutAction) => ShortcutAction[];

  // Actions - 预设管理
  /**
   * 添加速度预设
   * @param preset 预设对象
   */
  addPreset: (preset: SpeedPreset) => void;

  /**
   * 更新速度预设
   * @param id 预设 ID
   * @param preset 部分预设对象
   */
  updatePreset: (id: string, preset: Partial<SpeedPreset>) => void;

  /**
   * 删除速度预设
   * @param id 预设 ID
   */
  removePreset: (id: string) => void;

  /**
   * 重置预设为默认值
   */
  resetPresets: () => void;

  // Actions - 其他设置
  /**
   * 设置动画速度
   * @param speed 动画速度
   */
  setAnimationSpeed: (speed: AnimationSpeed) => void;

  /**
   * 更新 HUD 配置
   * @param config 部分 HUD 配置
   */
  updateHUDConfig: (config: Partial<HUDConfig>) => void;

  /**
   * 设置语言
   * @param lang 语言代码
   */
  setLanguage: (lang: string) => void;

  /**
   * 重置所有设置为默认值
   */
  resetAll: () => void;

  /**
   * 导出设置
   * @returns 设置对象
   */
  exportSettings: () => ShortcutSettings & {
    hudConfig: HUDConfig;
    language: string;
    version: string;
  };

  /**
   * 导入设置
   * @param settings 设置对象
   */
  importSettings: (settings: Partial<ShortcutSettings & {
    hudConfig: HUDConfig;
    language: string;
  }>) => void;
}

/**
 * 初始状态
 */
const initialState = {
  shortcuts: DEFAULT_SHORTCUTS,
  presets: DEFAULT_PRESETS,
  animationSpeed: 'normal' as AnimationSpeed,
  hudConfig: DEFAULT_HUD_CONFIG,
  language: 'en',
  version: '2.0.0',
};

/**
 * Chrome Storage 适配器
 * 将 Zustand 的 persist 中间件连接到 Chrome Storage API
 */
const chromeStorageAdapter = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.sync.get(name);
      return result[name] ? JSON.stringify(result[name]) : null;
    } catch (error) {
      console.error('从 Chrome Storage 读取失败:', error);
      // 降级到 local storage
      try {
        const localResult = await chrome.storage.local.get(name);
        return localResult[name] ? JSON.stringify(localResult[name]) : null;
      } catch (localError) {
        console.error('从 Chrome Local Storage 读取失败:', localError);
        return null;
      }
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const data = JSON.parse(value);
      await chrome.storage.sync.set({ [name]: data });
    } catch (error) {
      console.error('写入 Chrome Storage 失败:', error);
      // 降级到 local storage
      try {
        const data = JSON.parse(value);
        await chrome.storage.local.set({ [name]: data });
      } catch (localError) {
        console.error('写入 Chrome Local Storage 失败:', localError);
      }
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await chrome.storage.sync.remove(name);
    } catch (error) {
      console.error('从 Chrome Storage 删除失败:', error);
      try {
        await chrome.storage.local.remove(name);
      } catch (localError) {
        console.error('从 Chrome Local Storage 删除失败:', localError);
      }
    }
  },
};

/**
 * 设置状态管理 Store
 * 使用 Zustand 的 persist 中间件自动同步到 Chrome Storage
 */
export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set, get) => ({
        // 初始状态
        ...initialState,

        // Actions - 快捷键管理
        updateShortcut: (action, key) => {
          set(
            (state) => ({
              shortcuts: {
                ...state.shortcuts,
                [action]: key,
              },
            }),
            false,
            'updateShortcut'
          );
        },

        updateShortcuts: (shortcuts) => {
          set(
            (state) => ({
              shortcuts: {
                ...state.shortcuts,
                ...shortcuts,
              },
            }),
            false,
            'updateShortcuts'
          );
        },

        resetShortcuts: () => {
          set(
            { shortcuts: DEFAULT_SHORTCUTS },
            false,
            'resetShortcuts'
          );
        },

        checkShortcutConflict: (key, excludeAction) => {
          const { shortcuts } = get();
          const conflicts: ShortcutAction[] = [];

          for (const [action, shortcutKey] of Object.entries(shortcuts)) {
            if (shortcutKey === key && action !== excludeAction) {
              conflicts.push(action as ShortcutAction);
            }
          }

          return conflicts;
        },

        // Actions - 预设管理
        addPreset: (preset) => {
          set(
            (state) => ({
              presets: [...state.presets, preset],
            }),
            false,
            'addPreset'
          );
        },

        updatePreset: (id, preset) => {
          set(
            (state) => ({
              presets: state.presets.map((p) =>
                p.id === id ? { ...p, ...preset } : p
              ),
            }),
            false,
            'updatePreset'
          );
        },

        removePreset: (id) => {
          set(
            (state) => ({
              presets: state.presets.filter((p) => p.id !== id),
            }),
            false,
            'removePreset'
          );
        },

        resetPresets: () => {
          set(
            { presets: DEFAULT_PRESETS },
            false,
            'resetPresets'
          );
        },

        // Actions - 其他设置
        setAnimationSpeed: (speed) => {
          set(
            { animationSpeed: speed },
            false,
            'setAnimationSpeed'
          );
        },

        updateHUDConfig: (config) => {
          set(
            (state) => ({
              hudConfig: {
                ...state.hudConfig,
                ...config,
              },
            }),
            false,
            'updateHUDConfig'
          );
        },

        setLanguage: (lang) => {
          set(
            { language: lang },
            false,
            'setLanguage'
          );
        },

        resetAll: () => {
          set(
            initialState,
            false,
            'resetAll'
          );
        },

        exportSettings: () => {
          const state = get();
          return {
            shortcuts: state.shortcuts,
            presets: state.presets,
            animationSpeed: state.animationSpeed,
            hudConfig: state.hudConfig,
            language: state.language,
            version: state.version,
          };
        },

        importSettings: (settings) => {
          set(
            (state) => ({
              ...state,
              ...settings,
            }),
            false,
            'importSettings'
          );
        },
      }),
      {
        name: STORAGE_KEYS.SETTINGS,
        storage: createJSONStorage(() => chromeStorageAdapter),
        // 只持久化需要的字段
        partialize: (state) => ({
          shortcuts: state.shortcuts,
          presets: state.presets,
          animationSpeed: state.animationSpeed,
          hudConfig: state.hudConfig,
          language: state.language,
          version: state.version,
        }),
      }
    ),
    {
      name: 'SettingsStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);

/**
 * 选择器 Hooks
 * 提供便捷的状态选择器
 */

/**
 * 获取所有快捷键
 */
export const useShortcuts = () => useSettingsStore((state) => state.shortcuts);

/**
 * 获取单个快捷键
 * @param action 快捷键操作
 */
export const useShortcut = (action: ShortcutAction) =>
  useSettingsStore((state) => state.shortcuts[action]);

/**
 * 获取所有预设
 */
export const usePresets = () => useSettingsStore((state) => state.presets);

/**
 * 获取单个预设
 * @param id 预设 ID
 */
export const usePreset = (id: string) =>
  useSettingsStore((state) => state.presets.find((p) => p.id === id));

/**
 * 获取动画速度
 */
export const useAnimationSpeed = () => useSettingsStore((state) => state.animationSpeed);

/**
 * 获取 HUD 配置
 */
export const useHUDConfigFromSettings = () => useSettingsStore((state) => state.hudConfig);

/**
 * 获取语言
 */
export const useLanguage = () => useSettingsStore((state) => state.language);

/**
 * 获取版本
 */
export const useVersion = () => useSettingsStore((state) => state.version);

/**
 * 获取快捷键操作
 */
export const useShortcutActions = () => useSettingsStore((state) => ({
  updateShortcut: state.updateShortcut,
  updateShortcuts: state.updateShortcuts,
  resetShortcuts: state.resetShortcuts,
  checkShortcutConflict: state.checkShortcutConflict,
}));

/**
 * 获取预设操作
 */
export const usePresetActions = () => useSettingsStore((state) => ({
  addPreset: state.addPreset,
  updatePreset: state.updatePreset,
  removePreset: state.removePreset,
  resetPresets: state.resetPresets,
}));

/**
 * 获取设置操作
 */
export const useSettingsActions = () => useSettingsStore((state) => ({
  setAnimationSpeed: state.setAnimationSpeed,
  updateHUDConfig: state.updateHUDConfig,
  setLanguage: state.setLanguage,
  resetAll: state.resetAll,
  exportSettings: state.exportSettings,
  importSettings: state.importSettings,
}));
