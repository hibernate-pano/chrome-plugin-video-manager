export interface ShortcutSettings {
  increaseSpeed: string;
  decreaseSpeed: string;
  resetSpeed: string;
  fullscreen: string;
}

export interface PersistedSettings {
  shortcuts: ShortcutSettings;
  /** 数字键 1-N 直达的预设速度（x 倍），可自定义。 */
  presetSpeeds: number[];
  /** 非全屏模式下是否用空格键切换播放/暂停。 */
  spaceTogglePlay: boolean;
  /** 步进调速的上限（x 倍），防止长按冲过头。 */
  maxSpeed: number;
  /** 是否记住每个网站的播放速度，刷新/重开自动恢复。 */
  siteSpeedMemory: boolean;
}

export interface ShortcutDefinition {
  id: keyof ShortcutSettings;
  label: string;
  description: string;
}

export const STORAGE_KEY = 'vsc-settings';
export const LEGACY_SHORTCUTS_KEY = 'shortcuts';

/** 站点速度记忆表（storage.local）。 */
export const SITE_SPEEDS_KEY = 'vsc-site-speeds';

/** 每站点禁用速度记忆表（storage.local）：hostname -> true。 */
export const SITE_MEMORY_DISABLED_KEY = 'vsc-site-memory-disabled';

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  increaseSpeed: '=',
  decreaseSpeed: '-',
  resetSpeed: '0',
  fullscreen: 'f',
};

/** 数字键 1-4 对应的默认预设速度。 */
export const DEFAULT_PRESET_SPEEDS: number[] = [1.25, 1.5, 1.75, 2];

/** 预设速度的可配置范围。 */
export const PRESET_SPEED_MIN = 0.25;
export const PRESET_SPEED_MAX = 8;

export const DEFAULT_SPACE_TOGGLE_PLAY = true;

/** 步进调速默认上限。 */
export const DEFAULT_MAX_SPEED = 4;
export const MAX_SPEED_MIN = 1.5;
export const MAX_SPEED_MAX = 16;

export const DEFAULT_SITE_SPEED_MEMORY = true;

/** content script -> background 的速度变更消息类型，用于更新图标 badge。 */
export const SPEED_CHANGED_MESSAGE = 'vsc-speed-changed';

/** popup -> content script：查询当前播放状态。 */
export const GET_STATE_MESSAGE = 'vsc-get-state';

/** popup -> content script：重置当前视频速度为 1x。 */
export const RESET_SPEED_MESSAGE = 'vsc-reset-speed';

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
