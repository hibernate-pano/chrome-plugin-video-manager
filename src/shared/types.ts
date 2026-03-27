export interface ShortcutSettings {
  increaseSpeed: string;
  decreaseSpeed: string;
  resetSpeed: string;
  fullscreen: string;
}

export interface PersistedSettings {
  shortcuts: ShortcutSettings;
}

export interface ShortcutDefinition {
  id: keyof ShortcutSettings;
  label: string;
  description: string;
}

export const STORAGE_KEY = 'vsc-settings';
export const LEGACY_SHORTCUTS_KEY = 'shortcuts';

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  increaseSpeed: '=',
  decreaseSpeed: '-',
  resetSpeed: '0',
  fullscreen: 'f',
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'increaseSpeed',
    label: '加速',
    description: '增加视频播放速度（+0.1）',
  },
  {
    id: 'decreaseSpeed',
    label: '减速',
    description: '降低视频播放速度（-0.1）',
  },
  {
    id: 'resetSpeed',
    label: '重置速度',
    description: '恢复到 1.0x',
  },
  {
    id: 'fullscreen',
    label: '网页全屏',
    description: '进入或退出网页全屏',
  },
];
