/**
 * Custom Theme - 自定义主题
 * 允许用户自定义速度指示器的外观
 */

const DEFAULT_THEME = {
  id: 'default',
  name: '默认主题',
  name_en: 'Default',
  colors: {
    background: 'rgba(0, 0, 0, 0.75)',
    text: '#ffffff',
    border: '#4a90d9',
    accent: '#4a90d9'
  },
  position: 'bottom-right',
  opacity: 0.9,
  fontSize: 16,
  borderRadius: 8,
  isBuiltIn: true
};

const BUILT_IN_THEMES = [
  DEFAULT_THEME,
  {
    id: 'dark',
    name: '深色主题',
    name_en: 'Dark',
    colors: {
      background: 'rgba(30, 30, 30, 0.9)',
      text: '#e0e0e0',
      border: '#ff6b6b',
      accent: '#ff6b6b'
    },
    position: 'bottom-right',
    opacity: 0.95,
    fontSize: 16,
    borderRadius: 12,
    isBuiltIn: true
  },
  {
    id: 'light',
    name: '浅色主题',
    name_en: 'Light',
    colors: {
      background: 'rgba(255, 255, 255, 0.95)',
      text: '#333333',
      border: '#2196f3',
      accent: '#2196f3'
    },
    position: 'top-right',
    opacity: 1,
    fontSize: 14,
    borderRadius: 4,
    isBuiltIn: true
  },
  {
    id: 'neon',
    name: '霓虹主题',
    name_en: 'Neon',
    colors: {
      background: 'rgba(0, 0, 0, 0.8)',
      text: '#00ff88',
      border: '#00ff88',
      accent: '#ff00ff'
    },
    position: 'center',
    opacity: 1,
    fontSize: 20,
    borderRadius: 20,
    isBuiltIn: true
  },
  {
    id: 'minimal',
    name: '极简主题',
    name_en: 'Minimal',
    colors: {
      background: 'transparent',
      text: '#000000',
      border: 'transparent',
      accent: '#666666'
    },
    position: 'bottom-left',
    opacity: 1,
    fontSize: 12,
    borderRadius: 0,
    isBuiltIn: true
  }
];

const STORAGE_KEY = 'customThemes';
const ACTIVE_THEME_KEY = 'activeTheme';

export class ThemeManager {
  constructor() {
    this.themes = [...BUILT_IN_THEMES];
    this.activeThemeId = 'default';
  }

  async init() {
    try {
      const saved = await this._get(STORAGE_KEY);
      if (saved && Array.isArray(saved)) {
        const customThemes = saved.filter(t => !t.isBuiltIn);
        this.themes = [...BUILT_IN_THEMES, ...customThemes];
      }
      
      const active = await this._get(ACTIVE_THEME_KEY);
      if (active) this.activeThemeId = active;
    } catch (e) {
      console.warn('[ThemeManager] Init failed:', e);
    }
  }

  getThemes() {
    return this.themes;
  }

  getActiveTheme() {
    return this.themes.find(t => t.id === this.activeThemeId) || DEFAULT_THEME;
  }

  async setActiveTheme(themeId) {
    const theme = this.themes.find(t => t.id === themeId);
    if (theme) {
      this.activeThemeId = themeId;
      await this._set(ACTIVE_THEME_KEY, themeId);
      return theme;
    }
    return null;
  }

  async addCustomTheme(theme) {
    const newTheme = {
      id: `custom_${Date.now()}`,
      ...theme,
      isBuiltIn: false,
      createdAt: Date.now()
    };
    this.themes.push(newTheme);
    await this._saveCustom();
    return newTheme;
  }

  async updateTheme(themeId, updates) {
    const index = this.themes.findIndex(t => t.id === themeId);
    if (index !== -1 && !this.themes[index].isBuiltIn) {
      this.themes[index] = { ...this.themes[index], ...updates };
      await this._saveCustom();
      return this.themes[index];
    }
    return null;
  }

  async deleteTheme(themeId) {
    const index = this.themes.findIndex(t => t.id === themeId);
    if (index !== -1 && !this.themes[index].isBuiltIn) {
      this.themes.splice(index, 1);
      await this._saveCustom();
      return true;
    }
    return false;
  }

  // 生成CSS变量
  generateCSS(theme) {
    if (!theme) theme = this.getActiveTheme();
    return `
      --vs-indicator-bg: ${theme.colors.background};
      --vs-indicator-text: ${theme.colors.text};
      --vs-indicator-border: ${theme.colors.border};
      --vs-indicator-accent: ${theme.colors.accent};
      --vs-indicator-opacity: ${theme.opacity};
      --vs-indicator-font-size: ${theme.fontSize}px;
      --vs-indicator-radius: ${theme.borderRadius}px;
    `;
  }

  // 获取位置类名
  getPositionClass() {
    const theme = this.getActiveTheme();
    const positions = {
      'top-left': 'vs-top-left',
      'top-right': 'vs-top-right',
      'bottom-left': 'vs-bottom-left',
      'bottom-right': 'vs-bottom-right',
      'center': 'vs-center'
    };
    return positions[theme.position] || 'vs-bottom-right';
  }

  async _get(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key]));
    });
  }

  async _set(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  async _saveCustom() {
    const customThemes = this.themes.filter(t => !t.isBuiltIn);
    await this._set(STORAGE_KEY, customThemes);
  }
}

export const themeManager = new ThemeManager();
