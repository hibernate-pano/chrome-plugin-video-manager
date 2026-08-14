/**
 * 轻量 i18n：优先使用 chrome.i18n（扩展上下文，跟随浏览器语言），
 * 缺失时回退到中文文案（开发/测试环境无 chrome 时也能工作）。
 */
export const t = (key: string, fallback: string): string => {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
  } catch {
    // 忽略并回退。
  }

  return fallback;
};
