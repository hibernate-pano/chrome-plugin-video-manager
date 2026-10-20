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

/**
 * 原生扩展命令：打开设置页。
 *
 * 必须是 `chrome.commands` 而不是页面内按键监听 —— 原生命令在浏览器层面
 * 拦截，不会被站点或浏览器自己的快捷键吞掉，而且用户能在
 * `chrome://extensions/shortcuts` 里自己改键。
 *
 * 名字必须与 manifest.json 里 `commands` 的键**完全一致**：
 * 两边对不上时命令永远不触发，而且没有任何报错（Chrome 只是不认这个命令）。
 */
export const OPEN_OPTIONS_COMMAND = 'open-options';

/**
 * content -> background：这个标签页当前的倍速。
 *
 * 只在**值真的变了**的时候发：连按 `=` 时每次都会调速，但倍率没变时
 * 再发一遍只是白白唤醒一次 service worker。
 *
 * background 靠 sender.tab.id 认出是哪个标签页 —— 内容脚本不知道自己的
 * tabId，这是唯一正确的对应方式。
 */
export const SPEED_REPORT_MESSAGE = 'vsc-speed-report';

/**
 * 控制条发出的 DOM 事件：倍速变了。
 *
 * 为什么用 DOM 事件而不是构造函数回调：控制条由 FullscreenController 创建，
 * 而控制条与运行时之间的这条线要能独立演化。事件把两者解耦 ——
 * 控制条只管发，谁关心谁订阅，不必改控制条或控制器的构造参数。
 *
 * 事件派发在宿主节点（#vsc-controls，挂在 body 上的 light DOM）上并冒泡，
 * 所以订阅方在 document 上监听即可。shadow root 内部的元素不需要被外部
 * 直接拿到，外部代码也拿不到。
 */
export const SPEED_CHANGE_EVENT = 'vsc-speed-change';

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'increaseSpeed' },
  { id: 'decreaseSpeed' },
  { id: 'resetSpeed' },
  { id: 'togglePlay' },
  { id: 'seekBack' },
  { id: 'seekForward' },
  { id: 'fullscreen' },
];
