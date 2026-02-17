import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShortcutForm } from './ShortcutForm';
import { Keyboard, Info } from 'lucide-react';

export function ShortcutsTab(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Keyboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {t('shortcutsTab')}
            </h2>
            <p className="text-sm text-slate-400">
              自定义视频控制快捷键，提升您的观看体验。
            </p>
          </div>
        </div>
      </div>

      <ShortcutForm />

      <div className="glass-card rounded-xl p-4 border border-indigo-500/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-200">
              使用提示
            </h3>
            <ul className="mt-2 text-sm text-slate-400 space-y-1">
              <li>• 点击输入框后按下您想要设置的按键</li>
              <li>• 系统会自动检测快捷键冲突并高亮显示</li>
              <li>• 支持字母、数字、符号等常用按键</li>
              <li>• 修改后记得点击"保存设置"按钮</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
