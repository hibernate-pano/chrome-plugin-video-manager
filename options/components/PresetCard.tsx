/**
 * 速度预设卡片组件
 * 显示单个速度预设，支持编辑和删除
 * @module options/components/PresetCard
 */

import React, { useState, useCallback, memo } from 'react';
import { usePresetActions, useShortcuts } from '../../shared/stores/settingsStore';
import { Button } from '../../shared/components/ui/button';
import type { SpeedPreset } from '../../shared/types/shortcuts';

/**
 * PresetCard 组件属性
 */
interface PresetCardProps {
  /** 预设对象 */
  preset: SpeedPreset;
}

/**
 * 速度预设卡片组件
 * 使用 Tailwind CSS 实现类似 shadcn/ui Card 的样式
 * 实现编辑和删除功能
 * 使用 React.memo 优化，避免不必要的重新渲染
 */
function PresetCard({ preset }: PresetCardProps): React.ReactElement {
  const { updatePreset, removePreset } = usePresetActions();
  const shortcuts = useShortcuts();
  const [isEditing, setIsEditing] = useState(false);
  const [editSpeed, setEditSpeed] = useState(preset.speed.toString());
  const [editShortcut, setEditShortcut] = useState(preset.shortcut || '');

  /**
   * 处理保存编辑，使用 useCallback 缓存函数
   */
  const handleSave = useCallback(() => {
    const speed = parseFloat(editSpeed);

    // 验证速度值
    if (isNaN(speed) || speed <= 0 || speed > 10) {
      alert('请输入有效的速度值（0.1 - 10.0）');
      return;
    }

    // 更新预设
    updatePreset(preset.id, {
      speed,
      label: `${speed}x`,
      shortcut: editShortcut || undefined,
    });

    setIsEditing(false);
  }, [preset.id, editSpeed, editShortcut, updatePreset]);

  /**
   * 处理取消编辑，使用 useCallback 缓存函数
   */
  const handleCancel = useCallback(() => {
    setEditSpeed(preset.speed.toString());
    setEditShortcut(preset.shortcut || '');
    setIsEditing(false);
  }, [preset.speed, preset.shortcut]);

  /**
   * 处理删除预设，使用 useCallback 缓存函数
   */
  const handleDelete = useCallback(() => {
    if (window.confirm(`确定要删除预设 "${preset.label}" 吗？`)) {
      removePreset(preset.id);
    }
  }, [preset.id, preset.label, removePreset]);

  /**
   * 处理快捷键输入，使用 useCallback 缓存函数
   */
  const handleShortcutKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const key = e.key;

    // 忽略修饰键
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) {
      return;
    }

    setEditShortcut(key);
  }, []);

  /**
   * 检查快捷键是否已被使用，使用 useCallback 缓存函数
   */
  const isShortcutUsed = useCallback((key: string): boolean => {
    if (!key) return false;
    return Object.values(shortcuts).includes(key);
  }, [shortcuts]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
      {isEditing ? (
        // 编辑模式
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              编辑预设
            </h3>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="取消编辑"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* 速度输入 */}
            <div>
              <label
                htmlFor={`speed-${preset.id}`}
                className="block text-sm font-medium text-gray-700 mb-2"
              >
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 快捷键输入 */}
            <div>
              <label
                htmlFor={`shortcut-${preset.id}`}
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                快捷键（可选）
              </label>
              <input
                id={`shortcut-${preset.id}`}
                type="text"
                value={editShortcut}
                onKeyDown={handleShortcutKeyDown}
                readOnly
                placeholder="点击后按下按键"
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer ${
                  isShortcutUsed(editShortcut)
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-300'
                }`}
              />
              {isShortcutUsed(editShortcut) && (
                <p className="mt-1 text-xs text-yellow-600">
                  ⚠️ 该快捷键已被其他功能使用
                </p>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} size="sm">
                保存
              </Button>
              <Button onClick={handleCancel} variant="outline" size="sm">
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // 显示模式
        <div className="p-6">
          <div className="flex items-center justify-between">
            {/* 预设信息 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-sm">
                <span className="text-2xl font-bold text-white">
                  {preset.speed}x
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {preset.label}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  {preset.shortcut ? (
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                      <span>快捷键：</span>
                      <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                        {preset.shortcut}
                      </kbd>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">
                      未设置快捷键
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                aria-label="编辑预设"
                title="编辑"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={handleDelete}
                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                aria-label="删除预设"
                title="删除"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 使用 React.memo 优化组件，自定义比较函数
export default memo(PresetCard, (prevProps, nextProps) => {
  return (
    prevProps.preset.id === nextProps.preset.id &&
    prevProps.preset.speed === nextProps.preset.speed &&
    prevProps.preset.label === nextProps.preset.label &&
    prevProps.preset.shortcut === nextProps.preset.shortcut
  );
});
