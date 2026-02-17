/**
 * 设置迁移工具测试
 * @module shared/utils/__tests__/migration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
};

global.chrome = {
  storage: mockStorage,
  runtime: {
    lastError: undefined,
  },
} as any;

describe('migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 lastError
    (global.chrome.runtime as any).lastError = undefined;
  });

  describe('detectStorageVersion', () => {
    it('应该检测到新版本设置', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        callback({
          'vsc-settings': {
            state: { version: '2.0.0' },
            version: 1,
          },
        });
      });

      const version = await detectStorageVersion();
      expect(version).toBe('2.0.0');
    });

    it('应该检测到旧版本设置', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else if (keys === 'version') {
          callback({});
        } else if (keys === 'shortcuts') {
          callback({
            shortcuts: {
              increase: '=',
              decrease: '-',
            },
          });
        }
      });

      const version = await detectStorageVersion();
      expect(version).toBe(VERSIONS.LEGACY);
    });

    it('应该检测到全新安装', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const version = await detectStorageVersion();
      expect(version).toBe(VERSIONS.CURRENT);
    });
  });

  describe('needsMigration', () => {
    it('当检测到旧版本时应该返回 true', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else if (keys === 'version') {
          callback({});
        } else if (keys === 'shortcuts') {
          callback({
            shortcuts: {
              increase: '=',
            },
          });
        }
      });

      const result = await needsMigration();
      expect(result).toBe(true);
    });

    it('当检测到新版本时应该返回 false', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        callback({
          'vsc-settings': {
            state: { version: '2.0.0' },
            version: 1,
          },
        });
      });

      const result = await needsMigration();
      expect(result).toBe(false);
    });
  });

  describe('migrate', () => {
    it('应该成功迁移旧版本数据', async () => {
      // Mock 读取旧版本数据
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else if (Array.isArray(keys)) {
          callback({
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
          });
        }
      });

      // Mock 保存新版本数据
      mockStorage.sync.set.mockImplementation((data, callback) => {
        callback?.();
      });

      const result = await migrate();

      expect(result.success).toBe(true);
      expect(result.needsMigration).toBe(true);
      expect(result.fromVersion).toBe(VERSIONS.LEGACY);
      expect(result.toVersion).toBe(VERSIONS.CURRENT);
      expect(result.migratedData).toBeDefined();
      expect(result.migratedData?.shortcuts).toBeDefined();
      expect(result.migratedData?.presets).toBeDefined();
      expect(result.migratedData?.language).toBe('zh-CN');
    });

    it('当已经是新版本时不应该迁移', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        callback({
          'vsc-settings': {
            state: { version: '2.0.0' },
            version: 1,
          },
        });
      });

      const result = await migrate();

      expect(result.success).toBe(true);
      expect(result.needsMigration).toBe(false);
      expect(result.fromVersion).toBe(VERSIONS.CURRENT);
    });

    it('应该处理迁移失败的情况', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else if (Array.isArray(keys)) {
          callback({
            shortcuts: {
              increase: '=',
            },
          });
        }
      });

      // Mock 保存失败
      mockStorage.sync.set.mockImplementation((data, callback) => {
        (global.chrome.runtime as any).lastError = { message: 'Storage error' };
        callback?.();
      });

      const result = await migrate();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('autoMigrate', () => {
    it('当需要迁移时应该执行迁移', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else if (Array.isArray(keys)) {
          callback({
            shortcuts: {
              increase: '=',
            },
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

    it('当不需要迁移时应该跳过', async () => {
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

  describe('cleanupLegacyData', () => {
    it('应该清理旧版本数据', async () => {
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

    it('当尚未迁移时不应该清理', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        if (keys === 'vsc-settings') {
          callback({});
        } else {
          callback({
            shortcuts: { increase: '=' },
          });
        }
      });

      const result = await cleanupLegacyData();

      expect(result).toBe(false);
      expect(mockStorage.sync.remove).not.toHaveBeenCalled();
    });
  });

  describe('getMigrationStatus', () => {
    it('应该返回迁移状态信息', async () => {
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

  describe('backupSettings', () => {
    it('应该备份所有设置', async () => {
      mockStorage.sync.get.mockImplementation((keys, callback) => {
        const data: Record<string, any> = {
          shortcuts: { increase: '=' },
          presets: [{ value: 1.0, label: '1.0x', key: '9' }],
          language: 'en',
        };
        callback({ [keys as string]: data[keys as string] });
      });

      const backup = await backupSettings();

      expect(backup).toBeDefined();
      expect(backup.shortcuts).toBeDefined();
      expect(backup.presets).toBeDefined();
      expect(backup.language).toBeDefined();
      expect(backup._backupTimestamp).toBeDefined();
    });
  });

  describe('restoreFromBackup', () => {
    it('应该从备份恢复设置', async () => {
      const backup = {
        shortcuts: { increase: '=' },
        presets: [{ value: 1.0, label: '1.0x', key: '9' }],
        language: 'en',
        _backupTimestamp: '2024-01-01T00:00:00.000Z',
      };

      mockStorage.sync.set.mockImplementation((data, callback) => {
        callback?.();
      });

      const result = await restoreFromBackup(backup);

      expect(result).toBe(true);
      expect(mockStorage.sync.set).toHaveBeenCalledTimes(3); // shortcuts, presets, language
    });
  });
});
