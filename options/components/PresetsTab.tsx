import React, { useState, useCallback } from 'react';
import { usePresets, usePresetActions } from '../../shared/stores/settingsStore';
import PresetCard from './PresetCard';
import { Button } from '../../shared/components/ui/button';
import { Plus, RotateCcw, Gauge, Info, CheckCircle, XCircle } from 'lucide-react';
import type { SpeedPreset } from '../../shared/types/shortcuts';

export function PresetsTab(): React.ReactElement {
  const presets = usePresets();
  const { addPreset, resetPresets } = usePresetActions();
  const [isAdding, setIsAdding] = useState(false);
  const [newSpeed, setNewSpeed] = useState('1.0');
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleAddPreset = useCallback(() => {
    const speed = parseFloat(newSpeed);

    if (isNaN(speed) || speed <= 0 || speed > 10) {
      setSaveMessage({ type: 'error', text: '请输入有效的速度值（0.1 - 10.0）' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    const exists = presets.some((p) => p.speed === speed);
    if (exists) {
      setSaveMessage({ type: 'error', text: '该速度预设已存在' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    const maxId = presets.reduce((max, p) => {
      const id = parseInt(p.id);
      return isNaN(id) ? max : Math.max(max, id);
    }, 0);

    const newPreset: SpeedPreset = {
      id: (maxId + 1).toString(),
      speed,
      label: `${speed}x`,
    };

    addPreset(newPreset);
    setIsAdding(false);
    setNewSpeed('1.0');
    setSaveMessage({ type: 'success', text: '预设添加成功' });
    setTimeout(() => setSaveMessage(null), 3000);
  }, [newSpeed, presets, addPreset]);

  const handleResetPresets = useCallback(() => {
    if (window.confirm('确定要重置所有预设为默认值吗？')) {
      resetPresets();
      setSaveMessage({ type: 'success', text: '预设已重置为默认值' });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }, [resetPresets]);

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
    setNewSpeed('1.0');
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center">
            <Gauge className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">速度预设</h2>
            <p className="text-sm text-slate-400">管理您的播放速度预设，快速切换到常用速度。</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          添加预设
        </Button>

        <Button
          onClick={handleResetPresets}
          variant="outline"
          className="flex items-center gap-2 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          重置预设
        </Button>
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

      {isAdding && (
        <div className="glass-card rounded-xl p-6 animate-in fade-in-50 slide-in-from-top-2 duration-300">
          <h3 className="text-lg font-semibold text-white mb-4">添加新预设</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="new-speed" className="block text-sm font-medium text-slate-300 mb-2">
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
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-white placeholder-slate-500"
                placeholder="例如：1.5"
              />
              <p className="mt-1 text-xs text-slate-500">输入 0.1 到 10.0 之间的速度值</p>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleAddPreset} className="bg-indigo-600 hover:bg-indigo-500 cursor-pointer">
                确认添加
              </Button>
              <Button onClick={handleCancelAdd} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800 cursor-pointer">
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {presets.length === 0 ? (
          <div className="glass-card p-8 text-center text-slate-500 rounded-xl">
            <Gauge className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-sm">暂无预设</p>
            <p className="text-xs mt-1 text-slate-600">点击"添加预设"按钮创建您的第一个预设</p>
          </div>
        ) : (
          presets.map((preset) => (
            <PresetCard key={preset.id} preset={preset} />
          ))
        )}
      </div>

      <div className="glass-card rounded-xl p-4 border border-teal-500/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-200">使用提示</h3>
            <ul className="mt-2 text-sm text-slate-400 space-y-1">
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
