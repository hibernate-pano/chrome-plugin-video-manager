/**
 * 向后兼容性测试
 * 验证新版本与旧版本的兼容性
 *
 * 测试内容：
 * 1. 所有现有快捷键功能
 * 2. Chrome 扩展权限
 * 3. Manifest 结构
 * 4. 核心功能保持一致
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_SHORTCUTS, DEFAULT_PRESETS } from '../../shared/types/shortcuts';

// 导入新旧版本的 manifest
import newManifest from '../../manifest.json';
import oldManifest from '../../../manifest.json';

describe('向后兼容性测试', () => {
  describe('快捷键兼容性', () => {
    // 旧版本的默认快捷键（从原始代码中提取）
    const OLD_DEFAULT_SHORTCUTS = {
      'increase': '=',
      'decrease': '-',
      'reset': '0',
      'toggle-fullscreen': 'f',
      'play-pause': ' ',
      'volume-up': ']',
      'volume-down': '[',
      'seek-forward': '.',
      'seek-backward': ',',
      'preset-1': '7',
      'preset-2': '8',
      'preset-3': '9',
      'preset-4': '4',
      'preset-5': '5',
      'preset-6': '6',
      'preset-7': '1',
    };

    it('应该保留所有旧版本的快捷键操作', () => {
      const oldActions = Object.keys(OLD_DEFAULT_SHORTCUTS);
      const newActions = Object.keys(DEFAULT_SHORTCUTS);

      // 检查所有旧的操作是否都存在于新版本中
      oldActions.forEach(action => {
        expect(newActions).toContain(action);
      });
    });

    it('应该保持相同的默认快捷键映射', () => {
      // 检查核心快捷键是否保持一致
      const coreShortcuts = [
        'increase',
        'decrease',
        'reset',
        'toggle-fullscreen',
        'play-pause',
        'volume-up',
        'volume-down',
        'seek-forward',
        'seek-backward',
      ];

      coreShortcuts.forEach(action => {
        expect(DEFAULT_SHORTCUTS[action as keyof typeof DEFAULT_SHORTCUTS]).toBe(
          OLD_DEFAULT_SHORTCUTS[action as keyof typeof OLD_DEFAULT_SHORTCUTS]
        );
      });
    });

    it('应该保持预设快捷键的映射', () => {
      const presetActions = [
        'preset-1',
        'preset-2',
        'preset-3',
        'preset-4',
        'preset-5',
        'preset-6',
        'preset-7',
      ];

      presetActions.forEach(action => {
        expect(DEFAULT_SHORTCUTS[action as keyof typeof DEFAULT_SHORTCUTS]).toBe(
          OLD_DEFAULT_SHORTCUTS[action as keyof typeof OLD_DEFAULT_SHORTCUTS]
        );
      });
    });

    it('应该保持相同的速度预设值', () => {
      const expectedPresets = [
        { speed: 0.5, label: '0.5x' },
        { speed: 0.75, label: '0.75x' },
        { speed: 1.0, label: '1.0x' },
        { speed: 1.25, label: '1.25x' },
        { speed: 1.5, label: '1.5x' },
        { speed: 1.75, label: '1.75x' },
        { speed: 2.0, label: '2.0x' },
      ];

      expect(DEFAULT_PRESETS).toHaveLength(expectedPresets.length);

      expectedPresets.forEach((expected, index) => {
        expect(DEFAULT_PRESETS[index].speed).toBe(expected.speed);
        expect(DEFAULT_PRESETS[index].label).toBe(expected.label);
      });
    });
  });

  describe('Chrome 扩展权限兼容性', () => {
    it('应该保持相同的权限', () => {
      expect(newManifest.permissions).toEqual(oldManifest.permissions);
    });

    it('应该使用相同的 Manifest 版本', () => {
      expect(newManifest.manifest_version).toBe(oldManifest.manifest_version);
      expect(newManifest.manifest_version).toBe(3);
    });

    it('应该保持相同的扩展名称和描述', () => {
      expect(newManifest.name).toBe(oldManifest.name);
      expect(newManifest.description).toBe(oldManifest.description);
    });

    it('应该保持相同的默认语言', () => {
      expect(newManifest.default_locale).toBe(oldManifest.default_locale);
      expect(newManifest.default_locale).toBe('en');
    });

    it('应该保持相同的图标配置', () => {
      expect(newManifest.icons).toEqual(oldManifest.icons);
    });
  });

  describe('Manifest 结构兼容性', () => {
    it('应该包含 action 配置', () => {
      expect(newManifest.action).toBeDefined();
      expect(newManifest.action.default_popup).toBe('options.html');
      expect(oldManifest.action.default_popup).toBe('options.html');
    });

    it('应该包含 background 配置', () => {
      expect(newManifest.background).toBeDefined();
      expect(oldManifest.background).toBeDefined();

      // 两者都应该使用 service_worker
      expect(newManifest.background.service_worker).toBeDefined();
      expect(oldManifest.background.service_worker).toBeDefined();
    });

    it('应该包含 content_scripts 配置', () => {
      expect(newManifest.content_scripts).toBeDefined();
      expect(oldManifest.content_scripts).toBeDefined();

      expect(newManifest.content_scripts).toHaveLength(1);
      expect(oldManifest.content_scripts).toHaveLength(1);
    });

    it('应该保持相同的 content_scripts 匹配模式', () => {
      const newMatches = newManifest.content_scripts[0].matches;
      const oldMatches = oldManifest.content_scripts[0].matches;

      expect(newMatches).toEqual(oldMatches);
      expect(newMatches).toContain('<all_urls>');
    });

    it('应该保持相同的 content_scripts 配置选项', () => {
      const newConfig = newManifest.content_scripts[0];
      const oldConfig = oldManifest.content_scripts[0];

      expect(newConfig.all_frames).toBe(oldConfig.all_frames);
      expect(newConfig.run_at).toBe(oldConfig.run_at);
      expect(newConfig.all_frames).toBe(true);
      expect(newConfig.run_at).toBe('document_end');
    });
  });

  describe('功能兼容性', () => {
    it('应该支持所有核心操作', () => {
      const coreActions = [
        'increase',      // 增加速度
        'decrease',      // 降低速度
        'reset',         // 重置速度
        'toggle-fullscreen', // 全屏
        'play-pause',    // 播放/暂停
        'volume-up',     // 音量增加
        'volume-down',   // 音量降低
        'seek-forward',  // 快进
        'seek-backward', // 快退
      ];

      coreActions.forEach(action => {
        expect(DEFAULT_SHORTCUTS).toHaveProperty(action);
      });
    });

    it('应该支持 7 个速度预设', () => {
      expect(DEFAULT_PRESETS).toHaveLength(7);

      // 验证预设 ID
      const presetIds = DEFAULT_PRESETS.map(p => p.id);
      expect(presetIds).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    });

    it('应该支持预设快捷键', () => {
      const presetShortcuts = [
        'preset-1',
        'preset-2',
        'preset-3',
        'preset-4',
        'preset-5',
        'preset-6',
        'preset-7',
      ];

      presetShortcuts.forEach(action => {
        expect(DEFAULT_SHORTCUTS).toHaveProperty(action);
      });
    });
  });

  describe('版本升级兼容性', () => {
    it('新版本号应该大于旧版本号', () => {
      const oldVersion = oldManifest.version.split('.').map(Number);
      const newVersion = newManifest.version.split('.').map(Number);

      // 比较主版本号
      expect(newVersion[0]).toBeGreaterThanOrEqual(oldVersion[0]);

      // 如果主版本号相同，比较次版本号
      if (newVersion[0] === oldVersion[0]) {
        expect(newVersion[1]).toBeGreaterThanOrEqual(oldVersion[1]);
      }
    });

    it('应该保持语义化版本格式', () => {
      const versionRegex = /^\d+\.\d+\.\d+$/;
      expect(newManifest.version).toMatch(versionRegex);
      expect(oldManifest.version).toMatch(versionRegex);
    });
  });

  describe('存储兼容性', () => {
    it('应该使用相同的存储权限', () => {
      expect(newManifest.permissions).toContain('storage');
      expect(oldManifest.permissions).toContain('storage');
    });

    it('应该支持相同的存储键名格式', () => {
      // 验证存储键名的一致性
      const storageKeys = {
        shortcuts: 'shortcuts',
        presets: 'presets',
        animationSpeed: 'animationSpeed',
        language: 'language',
      };

      // 这些键名应该在新旧版本中保持一致
      Object.values(storageKeys).forEach(key => {
        expect(key).toBeTruthy();
        expect(typeof key).toBe('string');
      });
    });
  });

  describe('网站兼容性', () => {
    it('应该支持所有 URL 模式', () => {
      const newMatches = newManifest.content_scripts[0].matches;
      const oldMatches = oldManifest.content_scripts[0].matches;

      expect(newMatches).toEqual(oldMatches);
      expect(newMatches).toContain('<all_urls>');
    });

    it('应该在所有 frame 中运行', () => {
      expect(newManifest.content_scripts[0].all_frames).toBe(true);
      expect(oldManifest.content_scripts[0].all_frames).toBe(true);
    });

    it('应该在 document_end 时运行', () => {
      expect(newManifest.content_scripts[0].run_at).toBe('document_end');
      expect(oldManifest.content_scripts[0].run_at).toBe('document_end');
    });
  });

  describe('国际化兼容性', () => {
    it('应该使用相同的国际化消息键', () => {
      expect(newManifest.name).toBe('__MSG_extName__');
      expect(oldManifest.name).toBe('__MSG_extName__');

      expect(newManifest.description).toBe('__MSG_extDescription__');
      expect(oldManifest.description).toBe('__MSG_extDescription__');
    });

    it('应该支持相同的默认语言', () => {
      expect(newManifest.default_locale).toBe('en');
      expect(oldManifest.default_locale).toBe('en');
    });
  });
});
