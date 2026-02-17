/**
 * 速度预设标签页组件
 * 提供速度预设管理界面
 * @module options/components/PresetsTab
 */

import React, { useState, useCallback } from 'react';
import { usePresets, usePresetActions } from '../../shared/stores/settingsStore';
import PresetCard from './PresetCard';
import { Button } from '../../shared/components/ui/button';
import type { SpeedPreset } from '../../shared/types/shortcuts';

/**
 * 速度预设标签页组件
 * 实现预设列表和添加预设功能
 */
export function PresetsTab(): React.ReactElement {
  const presets = usePresets();
  const { addPreset, resetPresets } = usePresetActions();
  const [isAdding, setIsAdding] = useState(false);
  const [newSpeed, setNewSpeed] = useState('1.0');
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /**
   * 处理添加新预设，使用 useCallback 缓存函数
   */
  const handleAddPreset = useCallback(() => {
    const speed = parseFloat(newSpeed);

    // 验证速度值
    if (isNaN(speed) || speed <= 0 || speed > 10) {
      setSaveMessage({
        type: 'error',
        text: '请输入有效的速度值（0.1 - 10.0）',
      });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    // 检查是否已存在相同速度的预设
    const exists = presets.some((p) => p.speed === speed);
    if (exists) {
      setSaveMessage({
        type: 'error',
        text: '该速度预设已存在',
      });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    // 生成新的预设 ID
    const maxId = presets.reduce((max, p) => {
      const id = parseInt(p.id);
      return isNaN(id) ? max : Math.max(max, id);
    }, 0);
    const newId = (maxId + 1).toString();

    // 添加新预设
    const newPreset: SpeedPreset = {
      id: newId,
      speed,
      label: `${speed}x`,
    };

    addPreset(newPreset);
    setIsAdding(false);
    setNewSpeed('1.0');
    setSaveMessage({
      type: 'success',
      text: '预设添加成功',
    });
    setTimeout(() => setSaveMessage(null), 3000);
  }, [newSpeed, presets, addPreset]);

  /**
   * 处理重置预设，使用 useCallback 缓存函数
   */
  const handleResetPresets = useCallback(() => {
    if (window.confirm('确定要重置所有预设为默认值吗？')) {
      resetPresets();
      setSaveMessage({
        type: 'success',
        text: '预设已重置为默认值',
      });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }, [resetPresets]);

  /**
   * 处理取消添加，使用 useCallback 缓存函数
   */
  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
    setNewSpeed('1.0');
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* 标签页标题和描述 */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          速度预设
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          管理您的播放速度预设，快速切换到常用速度。
        </p>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="flex items-center gap-2"
        >
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          添加预设
        </Button>

        <Button
          onClick={handleResetPresets}
          variant="outline"
          className="flex items-center gap-2"
        >
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          重置预设
        </Button>
      </div>

      {/* 保存消息 */}
      {saveMessage && (
        <div
          className={`p-4 rounded-lg border ${
            saveMessage.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          } animate-in fade-in-50 slide-in-from-top-2 duration-300`}
        >
          <div className="flex items-center gap-2">
            {saveMessage.type === 'success' ? (
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 flex-shrink-0"
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
            )}
            <span className="text-sm font-medium">{saveMessage.text}</span>
          </div>
        </div>
      )}

      {/* 添加预设表单 */}
      {isAdding && (
        <div className="p-6 bg-gray-50 border border-gray-200 rounded-lg animate-in fade-in-50 slide-in-from-top-2 duration-300">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            添加新预设
          </h3>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="new-speed"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                播放速度
              </label>
              <input
                id="new-speed"
                type="number"
                min="0.1"
                max="10"
                step="0.05"
                value={newSpeed}
                onChange={(e) => setNewSpeed(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例如：1.5"
              />
              <p className="mt-1 text-xs text-gray-500">
                输入 0.1 到 10.0 之间的速度值
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleAddPreset}>
                确认添加
              </Button>
              <Button onClick={handleCancelAdd} variant="outline">
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 预设列表 */}
      <div className="space-y-3">
        {presets.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-sm">暂无预设</p>
            <p className="text-xs mt-1">点击"添加预设"按钮创建您的第一个预设</p>
          </div>
        ) : (
          presets.map((preset) => (
            <PresetCard key={preset.id} preset={preset} />
          ))
        )}
      </div>

      {/* 使用提示 */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-blue-900">
              使用提示
            </h3>
            <ul className="mt-2 text-sm text-blue-800 space-y-1">
              <li>• 预设可以帮助您快速切换到常用的播放速度</li>
              <li>• 您可以为每个预设设置快捷键，方便快速切换</li>
              <li>• 支持 0.1x 到 10.0x 的速度范围</li>
              <li>• 建议设置 3-5 个常用速度预设</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
