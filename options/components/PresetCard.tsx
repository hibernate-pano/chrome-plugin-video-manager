import React, { useState, useCallback, memo } from 'react';
import { usePresetActions, useShortcuts } from '../../shared/stores/settingsStore';
import { Button } from '../../shared/components/ui/button';
import { Pencil, Trash2, Key, Rewind, CirclePlay, FastForward, Gauge } from 'lucide-react';
import type { SpeedPreset } from '../../shared/types/shortcuts';

interface PresetCardProps {
  preset: SpeedPreset;
}

function PresetCard({ preset }: PresetCardProps): React.ReactElement {
  const { updatePreset, removePreset } = usePresetActions();
  const shortcuts = useShortcuts();
  const [isEditing, setIsEditing] = useState(false);
  const [editSpeed, setEditSpeed] = useState(preset.speed.toString());
  const [editShortcut, setEditShortcut] = useState(preset.shortcut || '');

  const handleSave = useCallback(() => {
    const speed = parseFloat(editSpeed);

    if (isNaN(speed) || speed <= 0 || speed > 10) {
      alert('请输入有效的速度值（0.1 - 10.0）');
      return;
    }

    updatePreset(preset.id, {
      speed,
      label: `${speed}x`,
      shortcut: editShortcut || undefined,
    });

    setIsEditing(false);
  }, [preset.id, editSpeed, editShortcut, updatePreset]);

  const handleCancel = useCallback(() => {
    setEditSpeed(preset.speed.toString());
    setEditShortcut(preset.shortcut || '');
    setIsEditing(false);
  }, [preset.speed, preset.shortcut]);

  const handleDelete = useCallback(() => {
    if (window.confirm(`确定要删除预设 "${preset.label}" 吗？`)) {
      removePreset(preset.id);
    }
  }, [preset.id, preset.label, removePreset]);

  const handleShortcutKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const key = e.key;

    if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) {
      return;
    }

    setEditShortcut(key);
  }, []);

  const isShortcutUsed = useCallback((key: string): boolean => {
    if (!key) return false;
    return Object.values(shortcuts).includes(key);
  }, [shortcuts]);

  const getSpeedIcon = (speed: number) => {
    if (speed <= 0.7) return Rewind;
    if (speed <= 1.0) return CirclePlay;
    if (speed <= 1.5) return FastForward;
    return Gauge;
  };

  const getSpeedColor = (speed: number) => {
    if (speed <= 0.7) return 'from-teal-500 to-cyan-500';
    if (speed <= 1.0) return 'from-indigo-500 to-purple-500';
    if (speed <= 1.5) return 'from-purple-500 to-pink-500';
    return 'from-orange-500 to-red-500';
  };

  const Icon = getSpeedIcon(preset.speed);
  const colorClass = getSpeedColor(preset.speed);

  return (
    <div className="glass-card rounded-xl transition-all duration-200 hover:border-indigo-500/30">
      {isEditing ? (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">编辑预设</h3>
            <button
              onClick={handleCancel}
              className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              aria-label="取消编辑"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor={`speed-${preset.id}`} className="block text-sm font-medium text-slate-300 mb-2">
                播放速度
              </label>
              <input
                id={`speed-${preset.id}`}
                type="number"
                min="0.1"
                max="10"
                step="0.05"
                value={editSpeed}
                onChange={(e) => setEditSpeed(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor={`shortcut-${preset.id}`} className="block text-sm font-medium text-slate-300 mb-2">
                快捷键（可选）
              </label>
              <input
                id={`shortcut-${preset.id}`}
                type="text"
                value={editShortcut}
                onKeyDown={handleShortcutKeyDown}
                readOnly
                placeholder="点击后按下按键"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer text-white ${
                  isShortcutUsed(editShortcut)
                    ? 'border-yellow-500/50 bg-yellow-500/10'
                    : 'border-slate-600 bg-slate-800'
                }`}
              />
              {isShortcutUsed(editShortcut) && (
                <p className="mt-1 text-xs text-yellow-400">
                  该快捷键已被其他功能使用
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} size="sm" className="bg-indigo-600 hover:bg-indigo-500 cursor-pointer">
                保存
              </Button>
              <Button onClick={handleCancel} variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-800 cursor-pointer">
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center w-14 h-14 bg-gradient-to-br ${colorClass} rounded-xl shadow-lg shadow-indigo-500/20`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{preset.label}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {preset.shortcut ? (
                    <div className="flex items-center gap-1 text-sm text-slate-400">
                      <Key className="w-4 h-4" />
                      <span>快捷键：</span>
                      <kbd className="px-2 py-1 text-xs font-semibold text-slate-200 bg-slate-700 border border-slate-600 rounded cursor-pointer hover:bg-slate-600 transition-colors">
                        {preset.shortcut}
                      </kbd>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500">未设置快捷键</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                aria-label="编辑预设"
                title="编辑"
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                onClick={handleDelete}
                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                aria-label="删除预设"
                title="删除"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(PresetCard, (prevProps, nextProps) => {
  return (
    prevProps.preset.id === nextProps.preset.id &&
    prevProps.preset.speed === nextProps.preset.speed &&
    prevProps.preset.label === nextProps.preset.label &&
    prevProps.preset.shortcut === nextProps.preset.shortcut
  );
});
