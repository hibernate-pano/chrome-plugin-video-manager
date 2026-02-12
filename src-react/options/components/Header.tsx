/**
 * 设置页面头部组件
 * 包含 Logo 和语言选择器
 * @module options/components/Header
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Logo 组件
 * 显示扩展的图标和名称
 */
function Logo(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      {/* 图标 */}
      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      {/* 标题 */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {t('extName')}
        </h1>
        <p className="text-sm text-gray-500">
          {t('settingsTitle')}
        </p>
      </div>
    </div>
  );
}

/**
 * 语言选项
 */
interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * 支持的语言列表
 */
const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
];

/**
 * 语言选择器组件
 * 允许用户切换界面语言
 */
function LanguageSelector(): React.ReactElement {
  const { i18n } = useTranslation();

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const newLang = event.target.value;
    i18n.changeLanguage(newLang);

    // 保存到 Chrome Storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ language: newLang });
    }
  };

  return (
    <div className="relative">
      <label htmlFor="language-select" className="sr-only">
        Select Language
      </label>
      <div className="flex items-center gap-2">
        {/* 语言图标 */}
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
          />
        </svg>
        {/* 语言选择下拉框 */}
        <select
          id="language-select"
          value={i18n.language}
          onChange={handleLanguageChange}
          className="block w-full pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-md bg-white cursor-pointer"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * 页面头部组件
 * 包含 Logo 和语言选择器
 */
export function Header(): React.ReactElement {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* 左侧：Logo */}
          <Logo />

          {/* 右侧：语言选择器 */}
          <LanguageSelector />
        </div>
      </div>
    </header>
  );
}
