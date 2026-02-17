import React from 'react';
import { useTranslation } from 'react-i18next';
import { PlayCircle, Globe } from 'lucide-react';

function Logo(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 border border-white/10">
        <PlayCircle className="w-6 h-6 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
          {t('extName')}
        </h1>
        <p className="text-sm text-slate-400">
          {t('settingsTitle')}
        </p>
      </div>
    </div>
  );
}

interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
];

function LanguageSelector(): React.ReactElement {
  const { i18n } = useTranslation();

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const newLang = event.target.value;
    i18n.changeLanguage(newLang);

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
        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
          <Globe className="w-4 h-4 text-slate-400" />
        </div>
        <select
          id="language-select"
          value={i18n.language}
          onChange={handleLanguageChange}
          className="block w-full pl-3 pr-10 py-2 text-sm bg-slate-800 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-lg text-slate-200 cursor-pointer hover:bg-slate-750 transition-colors"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-slate-800 text-slate-200">
              {lang.nativeName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Header(): React.ReactElement {
  return (
    <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Logo />
          <LanguageSelector />
        </div>
      </div>
    </header>
  );
}
