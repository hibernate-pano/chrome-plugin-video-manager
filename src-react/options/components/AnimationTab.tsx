/**
 * 动画设置标签页组件
 * 提供动画速度设置和预览功能
 * @module options/components/AnimationTab
 */

import React, { useState } from 'react';
import { useAnimationSpeed, useSettingsActions } from '../../shared/stores/settingsStore';
import { useAnimationConfig } from '../../shared/hooks/useAnimationConfig';
import { Button } from '../../shared/components/ui/button';
import type { AnimationSpeed } from '../../shared/types/shortcuts';

/**
 * 动画速度选项配置
 */
const ANIMATION_SPEED_OPTIONS: Array<{
  value: AnimationSpeed;
  label: string;
  description: string;
  duration: string;
}> = [
  {
    value: 'normal',
    label: '正常',
    description: '标准动画速度，提供流畅的视觉反馈',
    duration: '300ms',
  },
  {
    value: 'fast',
    label: '快速',
    description: '加快动画速度，减少等待时间',
    duration: '150ms',
  },
  {
    value: 'off',
    label: '关闭',
    description: '禁用所有动画效果，提升性能',
    duration: '0ms',
  },
];

/**
 * 动画预览组件
 * 展示不同动画速度的效果
 */
function AnimationPreview(): React.ReactElement {
  const [isAnimating, setIsAnimating] = useState(false);
  const animConfig = useAnimationConfig();

  // 触发预览动画
  const handlePreview = () => {
    setIsAnimating(true);
    // 使用实际的动画持续时间
    const timeout = animConfig.enabled ? animConfig.duration : 0;
    setTimeout(() => setIsAnimating(false), timeout + 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">动画预览</h3>
        <Button
          onClick={handlePreview}
          size="sm"
          variant="outline"
          disabled={isAnimating}
        >
          {isAnimating ? '预览中...' : '播放预览'}
        </Button>
      </div>

      {/* 预览区域 */}
      <div className="relative h-32 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-gray-200 overflow-hidden">
        {/* HUD 样式预览 */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            bg-black/80 text-white px-6 py-3 rounded-lg shadow-lg
            transition-all ${animConfig.durationClass}
            ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
          style={{
            transitionDuration: animConfig.enabled ? `${animConfig.duration}ms` : '0ms',
          }}
        >
          <div className="text-center">
            <div className="text-2xl font-bold">1.5x</div>
            <div className="text-xs text-gray-300 mt-1">播放速度</div>
          </div>
        </div>

        {/* 背景装饰 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-400 text-sm">
            {isAnimating ? '动画播放中...' : '点击"播放预览"查看效果'}
          </div>
        </div>
      </div>

      {/* 预览说明 */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• 预览展示了 HUD 指示器的淡入淡出效果</p>
        <p>• 实际使用时，动画会在调整速度、音量等操作时自动触发</p>
        <p>• 关闭动画可以提升低性能设备的响应速度</p>
        {animConfig.reducedMotion && (
          <p className="text-purple-600 font-medium">
            • 检测到系统偏好减少动画，动画已自动禁用
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 动画设置标签页组件
 * 实现动画速度选择器和动画预览
 */
export function AnimationTab(): React.ReactElement {
  const currentSpeed = useAnimationSpeed();
  const animConfig = useAnimationConfig();
  const { setAnimationSpeed } = useSettingsActions();
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /**
   * 处理动画速度更改
   */
  const handleSpeedChange = (speed: AnimationSpeed) => {
    setAnimationSpeed(speed);
    setSaveMessage({
      type: 'success',
      text: `动画速度已设置为：${ANIMATION_SPEED_OPTIONS.find(opt => opt.value === speed)?.label}`,
    });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* 标签页标题和描述 */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          动画设置
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          自定义动画效果的速度，优化您的使用体验。
        </p>
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

      {/* 动画速度选择器 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">动画速度</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {ANIMATION_SPEED_OPTIONS.map((option) => {
            const isSelected = currentSpeed === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleSpeedChange(option.value)}
                className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                {/* 选中指示器 */}
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}

                {/* 选项内容 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`text-base font-semibold ${
                        isSelected ? 'text-blue-900' : 'text-gray-900'
                      }`}
                    >
                      {option.label}
                    </h4>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        isSelected
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {option.duration}
                    </span>
                  </div>
                  <p
                    className={`text-sm ${
                      isSelected ? 'text-blue-700' : 'text-gray-600'
                    }`}
                  >
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 动画预览 */}
      <div className="pt-4 border-t border-gray-200">
        <AnimationPreview />
      </div>

      {/* 辅助功能说明 */}
      <div className={`p-4 border rounded-lg ${
        animConfig.reducedMotion
          ? 'bg-purple-100 border-purple-300'
          : 'bg-purple-50 border-purple-200'
      }`}>
        <div className="flex items-start gap-3">
          <svg
            className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
              animConfig.reducedMotion ? 'text-purple-700' : 'text-purple-600'
            }`}
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
            <h3 className={`text-sm font-medium ${
              animConfig.reducedMotion ? 'text-purple-900' : 'text-purple-900'
            }`}>
              {animConfig.reducedMotion ? '系统偏好已检测' : '辅助功能支持'}
            </h3>
            <p className={`mt-1 text-sm ${
              animConfig.reducedMotion ? 'text-purple-900' : 'text-purple-800'
            }`}>
              {animConfig.reducedMotion ? (
                <>
                  您的系统设置了"减少动画"偏好（prefers-reduced-motion），
                  扩展已自动禁用所有动画效果。这个设置会覆盖您在此处的选择。
                </>
              ) : (
                <>
                  如果您的系统设置了"减少动画"偏好（prefers-reduced-motion），
                  扩展将自动禁用动画效果，无论此处的设置如何。
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 使用提示 */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
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
              <li>• <strong>正常</strong>：推荐大多数用户使用，提供流畅的视觉体验</li>
              <li>• <strong>快速</strong>：适合追求效率的用户，减少动画等待时间</li>
              <li>• <strong>关闭</strong>：适合低性能设备或偏好简洁界面的用户</li>
              <li>• 设置会立即生效，无需刷新页面</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
