export interface ShortcutSettings {
  increaseSpeed: string;
  decreaseSpeed: string;
  resetSpeed: string;
  togglePlay: string;
  seekBack: string;
  seekForward: string;
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

/** 站点速度记忆表（storage.local）：hostname -> 播放速度。 */
export const SITE_SPEEDS_KEY = 'vsc-site-speeds';

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  increaseSpeed: '=',
  decreaseSpeed: '-',
  resetSpeed: '0',
  togglePlay: ' ',
  seekBack: 'ArrowLeft',
  seekForward: 'ArrowRight',
  fullscreen: 'f',
};

/** 快进快退的固定步长（秒）。 */
export const SEEK_STEP_SECONDS = 5;

/** content -> background：切换当前标签页的网页全屏。 */
export const TOGGLE_FULLSCREEN_MESSAGE = 'vsc-toggle-fullscreen';

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'increaseSpeed',
    label: '加速',
    description: '增加视频播放速度（+0.1，长按连续）',
  },
  {
    id: 'decreaseSpeed',
    label: '减速',
    description: '降低视频播放速度（-0.1，长按连续）',
  },
  {
    id: 'resetSpeed',
    label: '重置速度',
    description: '恢复到 1.0x',
  },
  {
    id: 'togglePlay',
    label: '播放 / 暂停',
    description: '切换视频播放与暂停；留空即禁用',
  },
  {
    id: 'seekBack',
    label: '快退 5 秒',
    description: '后退 5 秒；留空即禁用',
  },
  {
    id: 'seekForward',
    label: '快进 5 秒',
    description: '前进 5 秒；留空即禁用',
  },
  {
    id: 'fullscreen',
    label: '网页全屏',
    description: '进入或退出网页全屏',
  },
];
