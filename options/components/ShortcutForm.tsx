/**
 * 快捷键表单组件
 * 提供快捷键配置表单，集成 React Hook Form
 * @module options/components/ShortcutForm
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/components/ui/button';
import ShortcutInput from './ShortcutInput';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import type { ShortcutAction } from '../../shared/types/shortcuts';
import { DEFAULT_SHORTCUTS } from '../../shared/types/shortcuts';

/**
 * 表单数据类型
 */
interface ShortcutFormData {
  shortcuts: Record<ShortcutAction, string>;
}

/**
 * 快捷键分组配置
 */
interface ShortcutGroup {
  title: string;
  description: string;
  shortcuts: Array<{
    action: ShortcutAction;
    label: string;
    description?: string;
  }>;
}

/**
 * 快捷键分组定义
 */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '播放速度控制',
    description: '调整视频播放速度',
    shortcuts: [
      { action: 'increase', label: '加速', description: '增加播放速度' },
      { action: 'decrease', label: '减速', description: '降低播放速度' },
      { action: 'reset', label: '重置', description: '恢复正常速度' },
    ],
  },
  {
    title: '播放控制',
    description: '控制视频播放状态',
    shortcuts: [
      { action: 'play-pause', label: '播放/暂停', description: '切换播放状态' },
      { action: 'seek-forward', label: '快进', description: '向前跳转' },
      { action: 'seek-backward', label: '快退', description: '向后跳转' },
    ],
  },
  {
    title: '音量控制',
    description: '调整视频音量',
    shortcuts: [
      { action: 'volume-up', label: '音量增加', description: '提高音量' },
      { action: 'volume-down', label: '音量降低', description: '降低音量' },
    ],
  },
  {
    title: '显示控制',
    description: '控制视频显示模式',
    shortcuts: [
      { action: 'toggle-fullscreen', label: '全屏切换', description: '进入/退出全屏' },
    ],
  },
  {
    title: '速度预设',
    description: '快速切换到预设速度',
    shortcuts: [
      { action: 'preset-1', label: '预设 1', description: '0.5x' },
      { action: 'preset-2', label: '预设 2', description: '0.75x' },
      { action: 'preset-3', label: '预设 3', description: '1.0x' },
      { action: 'preset-4', label: '预设 4', description: '1.25x' },
      { action: 'preset-5', label: '预设 5', description: '1.5x' },
      { action: 'preset-6', label: '预设 6', description: '1.75x' },
      { action: 'preset-7', label: '预设 7', description: '2.0x' },
    ],
  },
];

/**
 * 快捷键表单组件
 * 实现表单布局和 React Hook Form 集成
 */
export function ShortcutForm(): React.ReactElement {
  const { t } = useTranslation();

  // 从 store 获取快捷键和操作
  const shortcuts = useSettingsStore((state) => state.shortcuts);
  const updateShortcuts = useSettingsStore((state) => state.updateShortcuts);
  const resetShortcuts = useSettingsStore((state) => state.resetShortcuts);

  // 表单状态
  const [localShortcuts, setLocalShortcuts] = useState<Record<ShortcutAction, string>>(shortcuts);
  const [conflicts, setConflicts] = useState<Map<ShortcutAction, ShortcutAction[]>>(new Map());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isDirty, setIsDirty] = useState(false);

  // React Hook Form
  const { handleSubmit, reset } = useForm<ShortcutFormData>({
    defaultValues: {
      shortcuts,
    },
  });

  // 同步 store 的快捷键到本地状态
  useEffect(() => {
    setLocalShortcuts(shortcuts);
    reset({ shortcuts });
  }, [shortcuts, reset]);

  // 检查是否有修改
  useEffect(() => {
    const hasChanges = Object.keys(localShortcuts).some(
      (action) => localShortcuts[action as ShortcutAction] !== shortcuts[action as ShortcutAction]
    );
    setIsDirty(hasChanges);
  }, [localShortcuts, shortcuts]);

  // 检查所有冲突
  useEffect(() => {
    const newConflicts = new Map<ShortcutAction, ShortcutAction[]>();

    Object.entries(localShortcuts).forEach(([action, key]) => {
      if (key) {
        const conflictActions = Object.entries(localShortcuts)
          .filter(([otherAction, otherKey]) => otherAction !== action && otherKey === key)
          .map(([otherAction]) => otherAction as ShortcutAction);

        if (conflictActions.length > 0) {
          newConflicts.set(action as ShortcutAction, conflictActions);
        }
      }
    });

    setConflicts(newConflicts);
  }, [localShortcuts]);

  // 处理快捷键变化，使用 useCallback 缓存函数
  const handleShortcutChange = useCallback((action: ShortcutAction, key: string): void => {
    setLocalShortcuts((prev) => ({
      ...prev,
      [action]: key,
    }));
  }, []);

  // 保存设置，使用 useCallback 缓存函数
  const onSubmit = useCallback(async (): Promise<void> => {
    // 检查是否有冲突
    if (conflicts.size > 0) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return;
    }

    setSaveStatus('saving');

    try {
      // 更新所有快捷键
      updateShortcuts(localShortcuts);

      setSaveStatus('success');
      setIsDirty(false);

      // 3秒后重置状态
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('保存快捷键失败:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [conflicts.size, updateShortcuts, localShortcuts]);

  // 重置为默认值，使用 useCallback 缓存函数
  const handleReset = useCallback((): void => {
    if (window.confirm('确定要重置所有快捷键为默认值吗？')) {
      resetShortcuts();
      setLocalShortcuts(DEFAULT_SHORTCUTS);
      setSaveStatus('idle');
      setIsDirty(false);
    }
  }, [resetShortcuts]);

  // 是否有冲突，使用 useMemo 缓存
  const hasAnyConflict = useMemo(() => conflicts.size > 0, [conflicts.size]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* 快捷键分组 */}
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title} className="space-y-4">
          {/* 分组标题 */}
          <div className="border-b border-gray-200 pb-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {group.title}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {group.description}
            </p>
          </div>

          {/* 快捷键输入列表 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {group.shortcuts.map((shortcut) => (
              <ShortcutInput
                key={shortcut.action}
                action={shortcut.action}
                label={shortcut.label}
                description={shortcut.description}
                value={localShortcuts[shortcut.action]}
                hasConflict={conflicts.has(shortcut.action)}
                conflictActions={conflicts.get(shortcut.action)}
                onChange={handleShortcutChange}
              />
            ))}
          </div>
        </div>
      ))}

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <div className="flex items-center gap-3">
          {/* 保存按钮 */}
          <Button
            type="submit"
            disabled={!isDirty || hasAnyConflict || saveStatus === 'saving'}
            className="min-w-[120px]"
          >
            {saveStatus === 'saving' ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {t('save')}...
              </>
            ) : (
              t('save')
            )}
          </Button>

          {/* 重置按钮 */}
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={saveStatus === 'saving'}
          >
            {t('resetToDefault')}
          </Button>
        </div>

        {/* 状态消息 */}
        <div className="flex items-center gap-2">
          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium">{t('saved')}</span>
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium">
                {hasAnyConflict ? t('conflictWarning') : t('fixAndSave')}
              </span>
            </div>
          )}

          {isDirty && saveStatus === 'idle' && (
            <span className="text-sm text-gray-500">
              有未保存的更改
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
