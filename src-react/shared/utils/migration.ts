/**
 * 设置迁移工具
 * 处理从旧版本到新版本的设置升级
 * @module shared/utils/migration
 */

import type { ShortcutAction, SpeedPreset, AnimationSpeed } from '../types/shortcuts';
import type { StorageData } from '../types/storage';
import { DEFAULT_SHORTCUTS, DEFAULT_PRESETS } from '../types/shortcuts';
import { DEFAULT_HUD_CONFIG } from '../types/hud';
import { safeStorageGet, safeStorageSet, safeStorageGetMultiple } from './chromeStorage';

/**
 * 版本号常量
 */
export const VERSIONS = {
  /** 旧版本（原生 JS） */
  LEGACY: '1.0.0',
  /** 新版本（React 重构） */
  CURRENT: '2.0.0',
} as const;

/**
 * 旧版本数据结构
 */
interface LegacyShortcuts {
  increase: string;
  decrease: string;
  reset: string;
  'toggle-fullscreen': string;
  'volume-up': string;
  'volume-down': string;
  'seek-forward': string;
  'seek-backward': string;
  'show-help': string;
}

interface LegacyPreset {
  value: number;
  label: string;
  key: string;
}

interface LegacyStorageData {
  shortcuts?: LegacyShortcuts;
  presets?: LegacyPreset[];
  // 旧版本可能没有这些字段
  language?: string;
  version?: string;
  // 添加索引签名以满足 Record<string, unknown> 约束
  [key: string]: unknown;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean;
  /** 是否需要迁移 */
  needsMigration: boolean;
  /** 迁移前的版本 */
  fromVersion: string;
  /** 迁移后的版本 */
  toVersion: string;
  /** 迁移的数据 */
  migratedData?: Partial<StorageData>;
  /** 错误信息 */
  error?: string;
}

/**
 * 检测当前存储的版本
 * @returns Promise<string> 版本号
 */
export async function detectStorageVersion(): Promise<string> {
  // 尝试读取新版本的设置
  const newSettings = await safeStorageGet('vsc-settings', null);
  if (newSettings && typeof newSettings === 'object' && 'version' in newSettings) {
    return (newSettings as { version: string }).version;
  }

  // 尝试读取旧版本的版本号
  const legacyVersion = await safeStorageGet('version', null);
  if (legacyVersion) {
    return legacyVersion as string;
  }

  // 检查是否存在旧版本的快捷键
  const legacyShortcuts = await safeStorageGet('shortcuts', null);
  if (legacyShortcuts) {
    return VERSIONS.LEGACY;
  }

  // 全新安装
  return VERSIONS.CURRENT;
}

/**
 * 检查是否需要迁移
 * @returns Promise<boolean> 是否需要迁移
 */
export async function needsMigration(): Promise<boolean> {
  const version = await detectStorageVersion();
  return version === VERSIONS.LEGACY;
}

/**
 * 迁移旧版本快捷键到新版本
 * @param legacyShortcuts 旧版本快捷键
 * @returns 新版本快捷键
 */
function migrateLegacyShortcuts(
  legacyShortcuts: LegacyShortcuts
): Record<ShortcutAction, string> {
  const newShortcuts: Record<ShortcutAction, string> = { ...DEFAULT_SHORTCUTS };

  // 映射旧版本的快捷键到新版本
  const mapping: Record<keyof LegacyShortcuts, ShortcutAction | null> = {
    'increase': 'increase',
    'decrease': 'decrease',
    'reset': 'reset',
    'toggle-fullscreen': 'toggle-fullscreen',
    'volume-up': 'volume-up',
    'volume-down': 'volume-down',
    'seek-forward': 'seek-forward',
    'seek-backward': 'seek-backward',
    'show-help': 'show-help',
  };

  for (const [oldKey, newKey] of Object.entries(mapping)) {
    if (newKey && legacyShortcuts[oldKey as keyof LegacyShortcuts]) {
      newShortcuts[newKey] = legacyShortcuts[oldKey as keyof LegacyShortcuts];
    }
  }

  return newShortcuts;
}

/**
 * 迁移旧版本预设到新版本
 * @param legacyPresets 旧版本预设
 * @returns 新版本预设
 */
function migrateLegacyPresets(legacyPresets: LegacyPreset[]): SpeedPreset[] {
  return legacyPresets.map((preset, index) => ({
    id: `preset-${index + 1}`,
    speed: preset.value,
    label: preset.label,
    shortcut: preset.key,
  }));
}

/**
 * 从旧版本存储加载数据
 * @returns Promise<LegacyStorageData> 旧版本数据
 */
async function loadLegacyData(): Promise<LegacyStorageData> {
  const data = await safeStorageGetMultiple<LegacyStorageData>(
    ['shortcuts', 'presets', 'language', 'version'],
    {}
  );

  return data;
}

/**
 * 执行迁移
 * @returns Promise<MigrationResult> 迁移结果
 */
export async function migrate(): Promise<MigrationResult> {
  try {
    // 检测当前版本
    const currentVersion = await detectStorageVersion();

    // 如果已经是新版本，不需要迁移
    if (currentVersion === VERSIONS.CURRENT) {
      return {
        success: true,
        needsMigration: false,
        fromVersion: currentVersion,
        toVersion: VERSIONS.CURRENT,
      };
    }

    console.log(`开始迁移设置：从 ${currentVersion} 到 ${VERSIONS.CURRENT}`);

    // 加载旧版本数据
    const legacyData = await loadLegacyData();

    // 迁移快捷键
    const shortcuts = legacyData.shortcuts
      ? migrateLegacyShortcuts(legacyData.shortcuts)
      : DEFAULT_SHORTCUTS;

    // 迁移预设
    const presets = legacyData.presets
      ? migrateLegacyPresets(legacyData.presets)
      : DEFAULT_PRESETS;

    // 构建新版本数据
    const newData: Partial<StorageData> = {
      shortcuts,
      presets,
      animationSpeed: 'normal' as AnimationSpeed,
      hudConfig: DEFAULT_HUD_CONFIG,
      language: legacyData.language || 'en',
      version: VERSIONS.CURRENT,
    };

    // 保存到新版本存储
    const success = await safeStorageSet('vsc-settings', {
      state: newData,
      version: 1,
    });

    if (!success) {
      throw new Error('保存迁移数据失败');
    }

    console.log('设置迁移成功');

    return {
      success: true,
      needsMigration: true,
      fromVersion: currentVersion,
      toVersion: VERSIONS.CURRENT,
      migratedData: newData,
    };
  } catch (error) {
    console.error('设置迁移失败:', error);
    return {
      success: false,
      needsMigration: true,
      fromVersion: VERSIONS.LEGACY,
      toVersion: VERSIONS.CURRENT,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 自动迁移（如果需要）
 * 在应用启动时调用
 * @returns Promise<MigrationResult> 迁移结果
 */
export async function autoMigrate(): Promise<MigrationResult> {
  const shouldMigrate = await needsMigration();

  if (!shouldMigrate) {
    const version = await detectStorageVersion();
    return {
      success: true,
      needsMigration: false,
      fromVersion: version,
      toVersion: version,
    };
  }

  return migrate();
}

/**
 * 清理旧版本数据
 * 迁移成功后可以调用此函数清理旧数据
 * @returns Promise<boolean> 是否成功
 */
export async function cleanupLegacyData(): Promise<boolean> {
  try {
    // 检查是否已经迁移
    const version = await detectStorageVersion();
    if (version !== VERSIONS.CURRENT) {
      console.warn('尚未迁移到新版本，跳过清理');
      return false;
    }

    // 删除旧版本的键
    const legacyKeys = ['shortcuts', 'presets', 'language', 'version'];

    for (const key of legacyKeys) {
      try {
        await chrome.storage.sync.remove(key);
      } catch (error) {
        console.error(`删除旧键 ${key} 失败:`, error);
      }
    }

    console.log('旧版本数据清理完成');
    return true;
  } catch (error) {
    console.error('清理旧版本数据失败:', error);
    return false;
  }
}

/**
 * 获取迁移状态信息
 * @returns Promise<object> 迁移状态
 */
export async function getMigrationStatus() {
  const currentVersion = await detectStorageVersion();
  const shouldMigrate = await needsMigration();

  return {
    currentVersion,
    targetVersion: VERSIONS.CURRENT,
    needsMigration: shouldMigrate,
    isLegacy: currentVersion === VERSIONS.LEGACY,
    isCurrent: currentVersion === VERSIONS.CURRENT,
  };
}

/**
 * 备份当前设置
 * 在迁移前备份数据，以防迁移失败
 * @returns Promise<object> 备份数据
 */
export async function backupSettings(): Promise<Record<string, unknown>> {
  try {
    // 读取所有可能的键
    const allKeys = [
      'shortcuts',
      'presets',
      'language',
      'version',
      'vsc-settings',
    ];

    const backup: Record<string, unknown> = {};

    for (const key of allKeys) {
      const value = await safeStorageGet(key, null);
      if (value !== null) {
        backup[key] = value;
      }
    }

    // 添加备份时间戳
    backup._backupTimestamp = new Date().toISOString();

    console.log('设置备份完成');
    return backup;
  } catch (error) {
    console.error('备份设置失败:', error);
    throw error;
  }
}

/**
 * 从备份恢复设置
 * @param backup 备份数据
 * @returns Promise<boolean> 是否成功
 */
export async function restoreFromBackup(
  backup: Record<string, unknown>
): Promise<boolean> {
  try {
    // 移除备份时间戳
    const { _backupTimestamp, ...data } = backup;

    // 恢复所有数据
    for (const [key, value] of Object.entries(data)) {
      await safeStorageSet(key, value);
    }

    console.log('从备份恢复设置成功');
    return true;
  } catch (error) {
    console.error('从备份恢复设置失败:', error);
    return false;
  }
}
