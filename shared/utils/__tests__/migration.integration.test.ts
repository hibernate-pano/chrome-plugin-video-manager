/**
 * 设置迁移集成测试
 * 测试完整的迁移流程
 * @module shared/utils/__tests__/migration.integration
 */

import {
  detectStorageVersion,
  needsMigration,
  migrate,
  autoMigrate,
  cleanupLegacyData,
  getMigrationStatus,
  backupSettings,
  restoreFromBackup,
  VERSIONS,
} from '../migration';

// Mock Chrome Storage API
const mockStorage = {
  sync: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
  local: {
    get: jest.fn(),
    set: jest.fn(),
  },
};

(global as any).chrome = {
  storage: mockStorage,
  runtime: {
    lastError: undefined,
  },
};

describe('Migration Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.chrome.runtime as any).lastError = undefined;
  });

  describe('完整迁移流程', () => {
    it('应该成功执行从旧版本到新版本的完整迁移', async () => {
      // 1. 设置旧版本数据
      const legacyData = {
        shortcuts: {
          increase: '=',
          decrease: '-',
          reset: '0',
          'toggle-fullscreen': 'f',
          'volume-up': ']',
          'volume-down': '[',
          'seek-forward': '.',
          'seek-backward': ',',
          'show-help': '?',
        },
        presets: [
          { value: 0.5, label: '0.5x', key: '7' },
          { value: 1.0, label: '1.0x', key: '9' },
          { value: 1.5, label: '1.5x', key: '5' },
        ],
        language: 'zh-CN',
      };

      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else if (Array.isArray(keys)) {
          const result: any = {};
          keys.forEach((key) => {
            if (legacyData[key as keyof typeof legacyData]) {
              result[key] = legacyData[key as keyof typeof legacyData];
            }
          });
          callback(result);
        }
      });

      mockStorage.sync.set.mockImplementation((data, callback) => {
        callback?.();
      });

      // 2. 检测版本
      const version = await detectStorageVersion();
      expect(version).toBe(VERSIONS.LEGACY);

      // 3. 检查是否需要迁移
      const shouldMigrate = await needsMigration();
      expect(shouldMigrate).toBe(true);

      // 4. 执行迁移
      const result = await migrate();
      expect(result.success).toBe(true);
      expect(result.needsMigration).toBe(true);
      expect(result.fromVersion).toBe(VERSIONS.LEGACY);
      expect(result.toVersion).toBe(VERSIONS.CURRENT);

      // 5. 验证迁移的数据
      expect(result.migratedData).toBeDefined();
      expect(result.migratedData?.shortcuts).toBeDefined();
      expect(result.migratedData?.presets).toBeDefined();
      expect(result.migratedData?.language).toBe('zh-CN');
      expect(result.migratedData?.version).toBe(VERSIONS.CURRENT);

      // 6. 验证快捷键映射
      const shortcuts = result.migratedData?.shortcuts;
      expect(shortcuts?.['speed-up']).toBe('=');
      expect(shortcuts?.['speed-down']).toBe('-');
      expect(shortcuts?.['speed-reset']).toBe('0');

      // 7. 验证预设转换
      const presets = result.migratedData?.presets;
      expect(presets).toHaveLength(3);
      expect(presets?.[0].speed).toBe(0.5);
      expect(presets?.[0].id).toBeDefined();
    });

    it('应该在迁移后成功清理旧数据', async () => {
      // 模拟已迁移状态
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        callback({
          'vsc-settings': {
            state: { version: '2.0.0' },
            version: 1,
          },
        });
      });

      mockStorage.sync.remove.mockImplementation((keys, callback) => {
        callback?.();
      });

      const result = await cleanupLegacyData();

      expect(result).toBe(true);
      expect(mockStorage.sync.remove).toHaveBeenCalledWith('shortcuts');
      expect(mockStorage.sync.remove).toHaveBeenCalledWith('presets');
      expect(mockStorage.sync.remove).toHaveBeenCalledWith('language');
      expect(mockStorage.sync.remove).toHaveBeenCalledWith('version');
    });
  });

  describe('备份和恢复', () => {
    it('应该成功备份和恢复设置', async () => {
      const testData = {
        shortcuts: { increase: '=' },
        presets: [{ value: 1.0, label: '1.0x', key: '9' }],
        language: 'en',
      };

      // Mock 备份
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        const data: any = {};
        if (testData[keys as keyof typeof testData]) {
          data[keys as string] = testData[keys as keyof typeof testData];
        }
        callback(data);
      });

      const backup = await backupSettings();

      expect(backup).toBeDefined();
      expect(backup._backupTimestamp).toBeDefined();

      // Mock 恢复
      mockStorage.sync.set.mockImplementation((data, callback) => {
        callback?.();
      });

      const restoreResult = await restoreFromBackup(backup);

      expect(restoreResult).toBe(true);
    });
  });

  describe('自动迁移', () => {
    it('应该在需要时自动执行迁移', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else if (Array.isArray(keys)) {
          callback({
            shortcuts: { increase: '=' },
          });
        }
      });

      mockStorage.sync.set.mockImplementation((data, callback) => {
        callback?.();
      });

      const result = await autoMigrate();

      expect(result.success).toBe(true);
      expect(result.needsMigration).toBe(true);
    });

    it('应该在不需要时跳过迁移', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        callback({
          'vsc-settings': {
            state: { version: '2.0.0' },
            version: 1,
          },
        });
      });

      const result = await autoMigrate();

      expect(result.success).toBe(true);
      expect(result.needsMigration).toBe(false);
    });
  });

  describe('迁移状态', () => {
    it('应该正确报告迁移状态', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else {
          callback({
            shortcuts: { increase: '=' },
          });
        }
      });

      const status = await getMigrationStatus();

      expect(status.currentVersion).toBe(VERSIONS.LEGACY);
      expect(status.targetVersion).toBe(VERSIONS.CURRENT);
      expect(status.needsMigration).toBe(true);
      expect(status.isLegacy).toBe(true);
      expect(status.isCurrent).toBe(false);
    });
  });
});
