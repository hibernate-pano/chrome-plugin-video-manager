/**
 * Popup 设置 Tab
 * 动画开关、语言选择等基础设置
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { 
  Sparkles, Globe, HardDrive, Palette
} from 'lucide-react';

export function SettingsTab(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const settingsStore = useSettingsStore();

  const { 
    animationEnabled = true, 
    rememberPerSite = true,
    language = 'zh_CN'
  } = settingsStore;

  const handleAnimationChange = (enabled: boolean) => {
    // 应该是: settingsStore.setAnimationEnabled(enabled)
    console.log('动画设置:', enabled);
  };

  const handleSiteMemoryChange = (enabled: boolean) => {
    // 应该是: settingsStore.setRememberPerSite(enabled)
    console.log('网站记忆:', enabled);
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    // 应该是: settingsStore.setLanguage(lang)
    console.log('语言设置:', lang);
  };

  const languages = [
    { value: 'zh_CN', label: '简体中文' },
    { value: 'en', label: 'English' },
  ];

  return (
    <div className="space-y-4">
      {/* 动画设置 */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">动画效果</p>
              <p className="text-xs text-slate-400">启用 HUD 动画和过渡效果</p>
            </div>
          </div>
          <button
            onClick={() => handleAnimationChange(!animationEnabled)}
            className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${
              animationEnabled ? 'bg-indigo-600' : 'bg-slate-700'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
              animationEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* 网站记忆 */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">网站记忆</p>
              <p className="text-xs text-slate-400">每个网站独立记忆播放速度</p>
            </div>
          </div>
          <button
            onClick={() => handleSiteMemoryChange(!rememberPerSite)}
            className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${
              rememberPerSite ? 'bg-indigo-600' : 'bg-slate-700'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
              rememberPerSite ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* 语言选择 */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Globe className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">界面语言</p>
            <p className="text-xs text-slate-400">选择扩展界面显示语言</p>
          </div>
        </div>
        <div className="flex gap-2">
          {languages.map((lang) => (
            <button
              key={lang.value}
              onClick={() => handleLanguageChange(lang.value)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                language === lang.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主题提示 */}
      <div className="glass-card rounded-xl p-3 border border-slate-700/50">
        <div className="flex items-start gap-2">
          <Palette className="w-4 h-4 text-pink-400 mt-0.5" />
          <p className="text-xs text-slate-400">
            更多主题和高级设置请使用"打开完整设置"
          </p>
        </div>
      </div>
    </div>
  );
}
