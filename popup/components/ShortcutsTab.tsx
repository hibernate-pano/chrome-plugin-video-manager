/**
 * Popup 快捷键 Tab
 * 查看和快速修改快捷键
 */

import React from 'react';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { 
  Zap, Minus, RotateCcw, PlayCircle, 
  Volume2, Volume1, Maximize2, Keyboard
} from 'lucide-react';

interface ShortcutItem {
  key: string;
  icon: React.ReactNode;
  label: string;
}

export function ShortcutsTab(): React.ReactElement {
  const { shortcuts } = useSettingsStore();

  const shortcutItems: ShortcutItem[] = [
    { key: shortcuts.increaseSpeed, icon: <Zap className="w-3.5 h-3.5" />, label: '加速' },
    { key: shortcuts.decreaseSpeed, icon: <Minus className="w-3.5 h-3.5" />, label: '减速' },
    { key: shortcuts.resetSpeed, icon: <RotateCcw className="w-3.5 h-3.5" />, label: '重置' },
    { key: shortcuts.playPause, icon: <PlayCircle className="w-3.5 h-3.5" />, label: '播放/暂停' },
    { key: shortcuts.volumeUp, icon: <Volume2 className="w-3.5 h-3.5" />, label: '音量+' },
    { key: shortcuts.volumeDown, icon: <Volume1 className="w-3.5 h-3.5" />, label: '音量-' },
    { key: shortcuts.toggleFullscreen, icon: <Maximize2 className="w-3.5 h-3.5" />, label: '全屏' },
  ];

  const getIconColor = (label: string) => {
    switch (label) {
      case '加速': return 'bg-indigo-500/20 text-indigo-400';
      case '减速': return 'bg-teal-500/20 text-teal-400';
      case '重置': return 'bg-purple-500/20 text-purple-400';
      case '播放/暂停': return 'bg-green-500/20 text-green-400';
      case '音量+': return 'bg-orange-500/20 text-orange-400';
      case '音量-': return 'bg-red-500/20 text-red-400';
      case '全屏': return 'bg-pink-500/20 text-pink-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* 快捷键列表 */}
      <div className="glass-card rounded-xl p-4 space-y-2">
        {shortcutItems.map((item, index) => (
          <React.Fragment key={item.label}>
            <div className="flex justify-between items-center py-2">
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${getIconColor(item.label)}`}>
                  {item.icon}
                </div>
                <span className="text-sm text-slate-300">{item.label}</span>
              </div>
              <kbd className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs font-mono text-slate-200 shadow-inner">
                {item.key || '未设置'}
              </kbd>
            </div>
            {index < shortcutItems.length - 1 && (
              <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* 提示 */}
      <div className="glass-card rounded-xl p-3 border border-slate-700/50">
        <div className="flex items-start gap-2">
          <Keyboard className="w-4 h-4 text-indigo-400 mt-0.5" />
          <p className="text-xs text-slate-400">
            点击"打开完整设置"可自定义所有快捷键
          </p>
        </div>
      </div>
    </div>
  );
}
