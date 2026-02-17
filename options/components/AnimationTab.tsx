import React, { useState } from 'react';
import { useAnimationSpeed, useSettingsActions } from '../../shared/stores/settingsStore';
import { useAnimationConfig } from '../../shared/hooks/useAnimationConfig';
import { Button } from '../../shared/components/ui/button';
import { Sparkles, Play, Info, CheckCircle, XCircle } from 'lucide-react';
import type { AnimationSpeed } from '../../shared/types/shortcuts';

const ANIMATION_SPEED_OPTIONS: Array<{
  value: AnimationSpeed;
  label: string;
  description: string;
  duration: string;
}> = [
  { value: 'normal', label: '正常', description: '标准动画速度，提供流畅的视觉反馈', duration: '300ms' },
  { value: 'fast', label: '快速', description: '加快动画速度，减少等待时间', duration: '150ms' },
  { value: 'off', label: '关闭', description: '禁用所有动画效果，提升性能', duration: '0ms' },
];

function AnimationPreview(): React.ReactElement {
  const [isAnimating, setIsAnimating] = useState(false);
  const animConfig = useAnimationConfig();

  const handlePreview = () => {
    setIsAnimating(true);
    const timeout = animConfig.enabled ? animConfig.duration : 0;
    setTimeout(() => setIsAnimating(false), timeout + 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">动画预览</h3>
        <Button
          onClick={handlePreview}
          size="sm"
          variant="outline"
          disabled={isAnimating}
          className="border-slate-600 text-slate-300 hover:bg-slate-800 cursor-pointer"
        >
          <Play className="w-4 h-4 mr-1" />
          {isAnimating ? '预览中...' : '播放预览'}
        </Button>
      </div>

      <div className="relative h-32 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 overflow-hidden">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 text-white px-6 py-3 rounded-xl shadow-2xl border border-slate-700 transition-all ${animConfig.durationClass} ${
            isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{ transitionDuration: animConfig.enabled ? `${animConfig.duration}ms` : '0ms' }}
        >
          <div className="text-center">
            <div className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">1.5x</div>
            <div className="text-xs text-slate-400 mt-1">播放速度</div>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-slate-500 text-sm">
            {isAnimating ? '动画播放中...' : '点击"播放预览"查看效果'}
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <p>• 预览展示了 HUD 指示器的淡入淡出效果</p>
        <p>• 实际使用时，动画会在调整速度、音量等操作时自动触发</p>
        <p>• 关闭动画可以提升低性能设备的响应速度</p>
        {animConfig.reducedMotion && (
          <p className="text-purple-400 font-medium">• 检测到系统偏好减少动画，动画已自动禁用</p>
        )}
      </div>
    </div>
  );
}

export function AnimationTab(): React.ReactElement {
  const currentSpeed = useAnimationSpeed();
  const animConfig = useAnimationConfig();
  const { setAnimationSpeed } = useSettingsActions();
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">动画设置</h2>
            <p className="text-sm text-slate-400">自定义动画效果的速度，优化您的使用体验。</p>
          </div>
        </div>
      </div>

      {saveMessage && (
        <div className={`p-4 rounded-xl border animate-in fade-in-50 slide-in-from-top-2 duration-300 ${
            saveMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
          <div className="flex items-center gap-2">
            {saveMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{saveMessage.text}</span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">动画速度</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {ANIMATION_SPEED_OPTIONS.map((option) => {
            const isSelected = currentSpeed === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleSpeedChange(option.value)}
                className={`relative p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle className="w-5 h-5 text-indigo-400" />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-base font-semibold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {option.label}
                    </h4>
                    <span className={`text-xs px-2 py-0.5 rounded ${isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-slate-700 text-slate-400'}`}>
                      {option.duration}
                    </span>
                  </div>
                  <p className={`text-sm ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-700">
        <AnimationPreview />
      </div>

      <div className={`p-4 border rounded-xl ${
        animConfig.reducedMotion
          ? 'bg-purple-500/10 border-purple-500/30'
          : 'bg-purple-500/5 border-purple-500/20'
      }`}>
        <div className="flex items-start gap-3">
          <Info className={`w-5 h-5 mt-0.5 flex-shrink-0 ${animConfig.reducedMotion ? 'text-purple-400' : 'text-purple-500'}`} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-200">
              {animConfig.reducedMotion ? '系统偏好已检测' : '辅助功能支持'}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
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

      <div className="glass-card rounded-xl p-4 border border-indigo-500/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-200">使用提示</h3>
            <ul className="mt-2 text-sm text-slate-400 space-y-1">
              <li>• <strong className="text-slate-300">正常</strong>：推荐大多数用户使用，提供流畅的视觉体验</li>
              <li>• <strong className="text-slate-300">快速</strong>：适合追求效率的用户，减少动画等待时间</li>
              <li>• <strong className="text-slate-300">关闭</strong>：适合低性能设备或偏好简洁界面的用户</li>
              <li>• 设置会立即生效，无需刷新页面</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
