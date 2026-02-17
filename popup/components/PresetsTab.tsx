/**
 * Popup 预设 Tab
 * 快速应用速度和添加新预设
 */

import React, { useState } from 'react';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { 
  Gauge, FastForward, Rewind, CirclePlay,
  Plus
} from 'lucide-react';

export function PresetsTab(): React.ReactElement {
  const { presets } = useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSpeed, setNewSpeed] = useState('1.0');
  const [newLabel, setNewLabel] = useState('');

  const applyPreset = async (speed: number) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SET_SPEED',
        speed,
      });
    }
  };

  const getPresetIcon = (speed: number) => {
    if (speed <= 0.7) return Rewind;
    if (speed <= 1.0) return CirclePlay;
    if (speed <= 1.5) return FastForward;
    return Gauge;
  };

  const getPresetColor = (speed: number) => {
    if (speed <= 0.7) return 'from-teal-500 to-cyan-500';
    if (speed <= 1.0) return 'from-indigo-500 to-purple-500';
    if (speed <= 1.5) return 'from-purple-500 to-pink-500';
    return 'from-orange-500 to-red-500';
  };

  const handleAddPreset = () => {
    const speed = parseFloat(newSpeed);
    if (isNaN(speed) || speed < 0.1 || speed > 16) return;
    const label = newLabel || `${speed}x`;
    console.log('添加预设:', { speed, label });
    setShowAddForm(false);
    setNewSpeed('1.0');
    setNewLabel('');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => {
          const Icon = getPresetIcon(preset.speed);
          const colorClass = getPresetColor(preset.speed);
          return (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.speed)}
              className="group relative px-3 py-3 glass-card rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] cursor-pointer"
            >
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/10 group-hover:to-purple-500/5 transition-all duration-300" />
              <div className="relative text-center">
                <div className={`w-8 h-8 mx-auto mb-1.5 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="text-lg font-bold bg-gradient-to-br from-white to-slate-300 bg-clip-text text-transparent">
                  {preset.speed}x
                </div>
                <div className="text-xs text-slate-400 mt-0.5 truncate">
                  {preset.label}
                </div>
              </div>
            </button>
          );
        })}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-3 glass-card rounded-xl border border-dashed border-slate-600 hover:border-indigo-500 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-1"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <Plus className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-xs text-slate-400">添加</span>
        </button>
      </div>
      {showAddForm && (
        <div className="glass-card rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-medium text-slate-200">添加新预设</h4>
          <div className="flex gap-2">
            <input
              type="number"
              value={newSpeed}
              onChange={(e) => setNewSpeed(e.target.value)}
              step="0.1"
              min="0.1"
              max="16"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-indigo-500 cursor-text"
              placeholder="速度"
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-indigo-500 cursor-text"
              placeholder="标签(可选)"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddPreset}
              className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              添加
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}
      <div className="glass-card rounded-xl p-3 border border-slate-700/50">
        <p className="text-xs text-slate-400">
          <span className="text-indigo-400 font-medium">快捷键:</span> 使用{' '}
          <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300">Shift+1-9</kbd>{' '}
          快速切换预设
        </p>
      </div>
    </div>
  );
}
