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
}

export const STORAGE_KEY = 'vsc-settings';
export const LEGACY_SHORTCUTS_KEY = 'shortcuts';

/**
 * 6.0.7 起废弃：站点速度记忆表的存储键（storage.local，hostname -> 播放速度）。
 * 功能已删除，但老用户机器上仍留着这份数据——它记录了用户访问过哪些站点，
 * 属于不该留存的历史。启动时一次性清掉，不做无痕迁移。
 */
export const LEGACY_SITE_SPEEDS_KEY = 'vsc-site-speeds';

/** 首次使用引导是否已展示（storage.local，设备级状态）。 */
export const FIRST_RUN_HINT_KEY = 'vsc-first-run-hint-shown';

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
  { id: 'increaseSpeed' },
  { id: 'decreaseSpeed' },
  { id: 'resetSpeed' },
  { id: 'togglePlay' },
  { id: 'seekBack' },
  { id: 'seekForward' },
  { id: 'fullscreen' },
];
