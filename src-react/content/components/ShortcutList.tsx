/**
 * 快捷键列表组件
 * 显示所有可用的快捷键及其描述，支持国际化
 * @module content/components/ShortcutList
 */

import { useMemo, memo } from 'react';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import type { ShortcutAction } from '../../shared/types/shortcuts';

/**
 * 快捷键分组
 */
interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    action: ShortcutAction;
    label: string;
    description: string;
  }>;
}

/**
 * 获取快捷键分组数据
 * 根据当前语言返回对应的文本
 */
function getShortcutGroups(language: string): ShortcutGroup[] {
  const isZh = language === 'zh-CN' || language === 'zh_CN' || language === 'zh';

  return [
    {
      title: isZh ? '播放速度控制' : 'Playback Speed Control',
      shortcuts: [
        {
          action: 'increase',
          label: isZh ? '加速' : 'Speed Up',
          description: isZh ? '增加播放速度 (+0.1)' : 'Increase playback speed (+0.1)',
        },
        {
          action: 'decrease',
          label: isZh ? '减速' : 'Slow Down',
          description: isZh ? '降低播放速度 (-0.1)' : 'Decrease playback speed (-0.1)',
        },
        {
          action: 'reset',
          label: isZh ? '重置速度' : 'Reset Speed',
          description: isZh ? '重置播放速度为 1.0x' : 'Reset playback speed to 1.0x',
        },
      ],
    },
    {
      title: isZh ? '播放控制' : 'Playback Control',
      shortcuts: [
        {
          action: 'play-pause',
          label: isZh ? '播放/暂停' : 'Play/Pause',
          description: isZh ? '切换播放/暂停状态' : 'Toggle play/pause',
        },
        {
          action: 'seek-forward',
          label: isZh ? '快进' : 'Seek Forward',
          description: isZh ? '快进 5 秒' : 'Seek forward 5 seconds',
        },
        {
          action: 'seek-backward',
          label: isZh ? '快退' : 'Seek Backward',
          description: isZh ? '快退 5 秒' : 'Seek backward 5 seconds',
        },
      ],
    },
    {
      title: isZh ? '音量控制' : 'Volume Control',
      shortcuts: [
        {
          action: 'volume-up',
          label: isZh ? '增加音量' : 'Volume Up',
          description: isZh ? '增加音量 (+10%)' : 'Increase volume (+10%)',
        },
        {
          action: 'volume-down',
          label: isZh ? '降低音量' : 'Volume Down',
          description: isZh ? '降低音量 (-10%)' : 'Decrease volume (-10%)',
        },
      ],
    },
    {
      title: isZh ? '全屏模式' : 'Fullscreen Mode',
      shortcuts: [
        {
          action: 'toggle-fullscreen',
          label: isZh ? '切换全屏' : 'Toggle Fullscreen',
          description: isZh ? '进入/退出网页全屏模式' : 'Enter/exit page fullscreen mode',
        },
      ],
    },
    {
      title: isZh ? '速度预设' : 'Speed Presets',
      shortcuts: [
        {
          action: 'preset-1',
          label: isZh ? '预设 1' : 'Preset 1',
          description: isZh ? '应用速度预设 1' : 'Apply speed preset 1',
        },
        {
          action: 'preset-2',
          label: isZh ? '预设 2' : 'Preset 2',
          description: isZh ? '应用速度预设 2' : 'Apply speed preset 2',
        },
        {
          action: 'preset-3',
          label: isZh ? '预设 3' : 'Preset 3',
          description: isZh ? '应用速度预设 3' : 'Apply speed preset 3',
        },
        {
          action: 'preset-4',
          label: isZh ? '预设 4' : 'Preset 4',
          description: isZh ? '应用速度预设 4' : 'Apply speed preset 4',
        },
        {
          action: 'preset-5',
          label: isZh ? '预设 5' : 'Preset 5',
          description: isZh ? '应用速度预设 5' : 'Apply speed preset 5',
        },
        {
          action: 'preset-6',
          label: isZh ? '预设 6' : 'Preset 6',
          description: isZh ? '应用速度预设 6' : 'Apply speed preset 6',
        },
        {
          action: 'preset-7',
          label: isZh ? '预设 7' : 'Preset 7',
          description: isZh ? '应用速度预设 7' : 'Apply speed preset 7',
        },
      ],
    },
    {
      title: isZh ? '帮助' : 'Help',
      shortcuts: [
        {
          action: 'show-help',
          label: isZh ? '显示帮助' : 'Show Help',
          description: isZh ? '显示/隐藏此帮助窗口' : 'Show/hide this help window',
        },
      ],
    },
  ];
}

/**
 * 格式化快捷键显示
 * 将按键转换为更友好的显示格式
 */
function formatShortcutKey(key: string): string {
  // 特殊键映射
  const specialKeys: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Escape': 'ESC',
    'Enter': '⏎',
    'Tab': '⇥',
    'Backspace': '⌫',
    'Delete': '⌦',
  };

  return specialKeys[key] || key.toUpperCase();
}

/**
 * 快捷键列表组件
 * 使用 React.memo 优化，避免不必要的重新渲染
 */
function ShortcutList() {
  const { shortcuts, language, presets } = useSettingsStore((state) => ({
    shortcuts: state.shortcuts,
    language: state.language,
    presets: state.presets,
  }));

  // 使用 useMemo 缓存快捷键分组数据
  const groups = useMemo(() => getShortcutGroups(language), [language]);

  // 使用 useMemo 缓存语言判断
  const isZh = useMemo(() =>
    language === 'zh-CN' || language === 'zh_CN' || language === 'zh',
    [language]
  );

  return (
    <div className="shortcut-list">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="shortcut-group">
          <h3 className="group-title">{group.title}</h3>
          <div className="shortcuts">
            {group.shortcuts.map((shortcut) => {
              const key = shortcuts[shortcut.action];
              let displayDescription = shortcut.description;

              // 如果是预设快捷键，显示对应的速度值
              if (shortcut.action.startsWith('preset-')) {
                const presetIndex = parseInt(shortcut.action.replace('preset-', '')) - 1;
                const preset = presets[presetIndex];
                if (preset) {
                  displayDescription = isZh
                    ? `设置速度为 ${preset.speed}x`
                    : `Set speed to ${preset.speed}x`;
                }
              }

              return (
                <div key={shortcut.action} className="shortcut-item">
                  <div className="shortcut-info">
                    <div className="shortcut-label">{shortcut.label}</div>
                    <div className="shortcut-description">{displayDescription}</div>
                  </div>
                  <kbd className="shortcut-key">{formatShortcutKey(key)}</kbd>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 额外提示 */}
      <div className="shortcut-tips">
        <p className="tip-title">{isZh ? '💡 提示' : '💡 Tips'}</p>
        <ul className="tip-list">
          <li>
            {isZh
              ? '您可以在设置页面自定义所有快捷键'
              : 'You can customize all shortcuts in the settings page'}
          </li>
          <li>
            {isZh
              ? '快捷键只在有视频或音频元素时才会生效'
              : 'Shortcuts only work when video or audio elements are present'}
          </li>
          <li>
            {isZh
              ? '在全屏模式下，可以使用方向键控制播放'
              : 'In fullscreen mode, you can use arrow keys to control playback'}
          </li>
        </ul>
      </div>

      {/* 内联样式 */}
      <style>{`
        .shortcut-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .shortcut-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .group-title {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          margin: 0;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e7eb;
        }

        .shortcuts {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .shortcut-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          background-color: #f9fafb;
          border-radius: 8px;
          transition: background-color 0.2s ease;
        }

        .shortcut-item:hover {
          background-color: #f3f4f6;
        }

        .shortcut-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .shortcut-label {
          font-size: 14px;
          font-weight: 500;
          color: #111827;
        }

        .shortcut-description {
          font-size: 13px;
          color: #6b7280;
        }

        .shortcut-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
          height: 32px;
          padding: 0 12px;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', 'Source Code Pro', monospace;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          background-color: white;
          border: 2px solid #d1d5db;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .shortcut-tips {
          margin-top: 8px;
          padding: 16px;
          background-color: #eff6ff;
          border-left: 4px solid #3b82f6;
          border-radius: 8px;
        }

        .tip-title {
          font-size: 14px;
          font-weight: 600;
          color: #1e40af;
          margin: 0 0 12px 0;
        }

        .tip-list {
          margin: 0;
          padding-left: 20px;
          list-style-type: disc;
        }

        .tip-list li {
          font-size: 13px;
          color: #1e40af;
          margin-bottom: 6px;
        }

        .tip-list li:last-child {
          margin-bottom: 0;
        }

        /* 暗色模式支持 */
        @media (prefers-color-scheme: dark) {
          .group-title {
            color: #f9fafb;
            border-bottom-color: #374151;
          }

          .shortcut-item {
            background-color: #374151;
          }

          .shortcut-item:hover {
            background-color: #4b5563;
          }

          .shortcut-label {
            color: #f9fafb;
          }

          .shortcut-description {
            color: #9ca3af;
          }

          .shortcut-key {
            color: #e5e7eb;
            background-color: #1f2937;
            border-color: #4b5563;
          }

          .shortcut-tips {
            background-color: #1e3a5f;
            border-left-color: #3b82f6;
          }

          .tip-title {
            color: #93c5fd;
          }

          .tip-list li {
            color: #93c5fd;
          }
        }
      `}</style>
    </div>
  );
}

// 使用 React.memo 优化组件
export default memo(ShortcutList);
