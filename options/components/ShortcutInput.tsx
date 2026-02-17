/**
 * 快捷键输入组件
 * 提供快捷键输入、实时验证和冲突检测功能
 * @module options/components/ShortcutInput
 */

import React, { useState, useRef, useMemo, useCallback, memo } from 'react';
import { Input } from '../../shared/components/ui/input';
import { Label } from '../../shared/components/ui/label';
import { cn } from '../../shared/lib/utils';
import type { ShortcutAction } from '../../shared/types/shortcuts';

/**
 * ShortcutInput 组件属性
 */
export interface ShortcutInputProps {
  /** 快捷键操作标识 */
  action: ShortcutAction;
  /** 快捷键标签（显示名称） */
  label: string;
  /** 快捷键描述 */
  description?: string;
  /** 当前快捷键值 */
  value: string;
  /** 是否有冲突 */
  hasConflict?: boolean;
  /** 冲突的操作列表 */
  conflictActions?: ShortcutAction[];
  /** 值变化回调 */
  onChange: (action: ShortcutAction, key: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 格式化按键显示
 * @param key 按键字符
 * @returns 格式化后的显示文本
 */
function formatKeyDisplay(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Enter') return 'Enter';
  if (key === 'Escape') return 'Esc';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * 获取操作的中文名称
 * @param action 快捷键操作
 * @returns 中文名称
 */
function getActionLabel(action: ShortcutAction): string {
  const labels: Record<ShortcutAction, string> = {
    'increase': '加速',
    'decrease': '减速',
    'reset': '重置速度',
    'toggle-fullscreen': '全屏',
    'play-pause': '播放/暂停',
    'volume-up': '音量+',
    'volume-down': '音量-',
    'seek-forward': '快进',
    'seek-backward': '快退',
    'preset-1': '预设1',
    'preset-2': '预设2',
    'preset-3': '预设3',
    'preset-4': '预设4',
    'preset-5': '预设5',
    'preset-6': '预设6',
    'preset-7': '预设7',
    'show-help': '显示帮助',
  };
  return labels[action] || action;
}

/**
 * 快捷键输入组件
 * 实现快捷键输入、实时验证和冲突检测高亮
 * 使用 React.memo 优化，避免不必要的重新渲染
 */
function ShortcutInput({
  action,
  label,
  description,
  value,
  hasConflict = false,
  conflictActions = [],
  onChange,
  disabled = false,
}: ShortcutInputProps): React.ReactElement {
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 处理键盘按下事件，使用 useCallback 缓存函数
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>): void => {
    // 阻止默认行为
    event.preventDefault();
    event.stopPropagation();

    // 忽略修饰键单独按下
    if (
      event.key === 'Shift' ||
      event.key === 'Control' ||
      event.key === 'Alt' ||
      event.key === 'Meta'
    ) {
      return;
    }

    // 如果按下 Escape，取消录制
    if (event.key === 'Escape') {
      setIsRecording(false);
      inputRef.current?.blur();
      return;
    }

    // 如果按下 Backspace 或 Delete，清空快捷键
    if (event.key === 'Backspace' || event.key === 'Delete') {
      onChange(action, '');
      setIsRecording(false);
      return;
    }

    // 记录按键
    const key = event.key;
    onChange(action, key);
    setIsRecording(false);

    // 短暂延迟后失去焦点
    setTimeout(() => {
      inputRef.current?.blur();
    }, 100);
  }, [action, onChange]);

  // 处理焦点事件，使用 useCallback 缓存函数
  const handleFocus = useCallback((): void => {
    setIsFocused(true);
    setIsRecording(true);
  }, []);

  const handleBlur = useCallback((): void => {
    setIsFocused(false);
    setIsRecording(false);
  }, []);

  // 处理点击事件，使用 useCallback 缓存函数
  const handleClick = useCallback((): void => {
    if (!disabled) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  // 显示值，使用 useMemo 缓存
  const displayValue = useMemo(() =>
    isRecording
      ? '按下任意键...'
      : value
      ? formatKeyDisplay(value)
      : '未设置',
    [isRecording, value]
  );

  return (
    <div className="space-y-2">
      {/* 标签 */}
      <Label
        htmlFor={`shortcut-${action}`}
        className="text-sm font-medium text-gray-700"
      >
        {label}
        {description && (
          <span className="ml-2 text-xs text-gray-500 font-normal">
            {description}
          </span>
        )}
      </Label>

      {/* 输入框 */}
      <div className="relative">
        <Input
          ref={inputRef}
          id={`shortcut-${action}`}
          type="text"
          value={displayValue}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onClick={handleClick}
          readOnly
          disabled={disabled}
          className={cn(
            'cursor-pointer font-mono text-center transition-all',
            // 冲突状态样式
            hasConflict && 'border-red-500 bg-red-50 focus:ring-red-500',
            // 录制状态样式
            isRecording && 'ring-2 ring-blue-500 border-blue-500',
            // 焦点状态样式
            isFocused && !hasConflict && 'border-blue-500',
            // 禁用状态样式
            disabled && 'cursor-not-allowed opacity-50'
          )}
          aria-invalid={hasConflict}
          aria-describedby={
            hasConflict ? `shortcut-${action}-error` : undefined
          }
        />

        {/* 录制指示器 */}
        {isRecording && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs text-blue-600">录制中</span>
            </div>
          </div>
        )}

        {/* 冲突指示器 */}
        {hasConflict && !isRecording && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* 冲突警告 */}
      {hasConflict && conflictActions.length > 0 && (
        <div
          id={`shortcut-${action}-error`}
          className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800"
          role="alert"
        >
          <svg
            className="w-4 h-4 mt-0.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            与以下快捷键冲突：
            {conflictActions.map((conflictAction, index) => (
              <span key={conflictAction}>
                {index > 0 && '、'}
                <strong>{getActionLabel(conflictAction)}</strong>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* 帮助文本 */}
      {!hasConflict && !isRecording && (
        <p className="text-xs text-gray-500">
          点击输入框后按下任意键设置快捷键，按 Backspace 清空
        </p>
      )}
    </div>
  );
}

// 使用 React.memo 优化组件，自定义比较函数
export default memo(ShortcutInput, (prevProps, nextProps) => {
  return (
    prevProps.action === nextProps.action &&
    prevProps.value === nextProps.value &&
    prevProps.hasConflict === nextProps.hasConflict &&
    prevProps.disabled === nextProps.disabled &&
    JSON.stringify(prevProps.conflictActions) === JSON.stringify(nextProps.conflictActions)
  );
});
