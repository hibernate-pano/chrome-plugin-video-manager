/**
 * 快捷键设置标签页组件
 * 提供快捷键配置界面
 * @module options/components/ShortcutsTab
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShortcutForm } from './ShortcutForm';

/**
 * 快捷键设置标签页组件
 * 使用 shadcn/ui Tabs 组件，提供标签页切换动画
 */
export function ShortcutsTab(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* 标签页标题和描述 */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          {t('shortcutsTab')}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          自定义视频控制快捷键，提升您的观看体验。
        </p>
      </div>

      {/* 快捷键表单 */}
      <ShortcutForm />

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
