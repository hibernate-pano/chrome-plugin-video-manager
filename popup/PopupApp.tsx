/**
 * Popup 主应用组件
 * 统一 Tab 布局：预设 | 快捷键 | 设置 | 帮助
 */

import React, { useState } from 'react';
import { useSettingsStore } from '../shared/stores/settingsStore';
import { 
  PlayCircle, Settings2, Zap, Gauge, 
  Keyboard, Sparkles, BookOpen, X
} from 'lucide-react';
import { PresetsTab } from './components/PresetsTab';
import { ShortcutsTab } from './components/ShortcutsTab';
import { SettingsTab } from './components/SettingsTab';
import { HelpTab } from './components/HelpTab';

type TabType = 'presets' | 'shortcuts' | 'settings' | 'help';

interface TabConfig {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabConfig[] = [
  { id: 'presets', label: '预设', icon: <Zap className="w-4 h-4" /> },
  { id: 'shortcuts', label: '快捷键', icon: <Keyboard className="w-4 h-4" /> },
  { id: 'settings', label: '设置', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'help', label: '帮助', icon: <BookOpen className="w-4 h-4" /> },
];

export const PopupApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const { presets, shortcuts } = useSettingsStore();

  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'presets':
        return <PresetsTab />;
      case 'shortcuts':
        return <ShortcutsTab />;
      case 'settings':
        return <SettingsTab />;
      case 'help':
        return <HelpTab />;
      default:
        return <PresetsTab />;
    }
  };

  return (
    <div className="w-[380px] min-h-[520px] bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 text-white p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -left-4 -bottom-4 w-16 h-16 bg-purple-500/20 rounded-full blur-xl" />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
              <PlayCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">视频速度控制器</h1>
              <p className="text-xs text-white/80">快速调节播放速度</p>
            </div>
          </div>
          <button
            onClick={openSettings}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            title="打开完整设置"
          >
            <Settings2 className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-slate-800 bg-slate-900/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'text-indigo-400 border-b-2 border-indigo-400 bg-slate-800/50'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {renderContent()}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 text-center">
        <button
          onClick={openSettings}
          className="text-xs text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer"
        >
          打开完整设置页面 →
        </button>
      </div>
    </div>
  );
};
