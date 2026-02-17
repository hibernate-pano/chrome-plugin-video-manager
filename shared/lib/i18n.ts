import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 导入语言资源
import enMessages from '../../_locales/en/messages.json';
import zhCNMessages from '../../_locales/zh_CN/messages.json';

// 将 Chrome 扩展的 messages.json 格式转换为 i18next 格式
function convertChromeMessages(messages: Record<string, { message: string; description?: string }>) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    result[key] = value.message;
  }
  return result;
}

// 转换语言资源
const resources = {
  en: {
    translation: convertChromeMessages(enMessages),
  },
  'zh-CN': {
    translation: convertChromeMessages(zhCNMessages),
  },
};

// 检测浏览器语言
function detectBrowserLanguage(): string {
  // 优先使用 Chrome 扩展 API
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    const locale = chrome.i18n.getUILanguage();
    // 将 zh_CN 转换为 zh-CN
    return locale.replace('_', '-');
  }

  // 降级到浏览器语言
  const browserLang = navigator.language || (navigator as any).userLanguage;
  return browserLang;
}

// 初始化 i18next
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: detectBrowserLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React 已经处理了 XSS
    },
    // 支持的语言
    supportedLngs: ['en', 'zh-CN'],
    // 语言检测选项
    load: 'languageOnly', // 只加载语言部分，忽略地区
    // 调试模式（生产环境关闭）
    debug: process.env.NODE_ENV === 'development',
  });

export default i18n;
