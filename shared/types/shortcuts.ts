/**
 * 快捷键相关类型定义
 * @module shared/types/shortcuts
 */

/**
 * 快捷键操作类型
 * 定义所有支持的快捷键操作
 */
export type ShortcutAction =
  | 'increase'           // 增加播放速度
  | 'decrease'           // 降低播放速度
  | 'reset'              // 重置播放速度
  | 'toggle-fullscreen'  // 切换全屏模式
  | 'play-pause'         // 播放/暂停
  | 'volume-up'          // 增加音量
  | 'volume-down'        // 降低音量
  | 'seek-forward'       // 快进
  | 'seek-backward'      // 快退
  | 'show-help'          // 显示键盘帮助
  | 'preset-1'           // 预设速度 1
  | 'preset-2'           // 预设速度 2
  | 'preset-3'           // 预设速度 3
  | 'preset-4'           // 预设速度 4
  | 'preset-5'           // 预设速度 5
  | 'preset-6'           // 预设速度 6
  | 'preset-7';          // 预设速度 7

/**
 * 快捷键接口
 * 定义单个快捷键的结构
 */
export interface Shortcut {
  /** 快捷键对应的操作 */
  action: ShortcutAction;
  /** 快捷键按键 */
  key: string;
  /** 快捷键描述（用于显示） */
  description: string;
}

/**
 * 速度预设接口
 * 定义播放速度预设的结构
 */
export interface SpeedPreset {
  /** 预设唯一标识 */
  id: string;
  /** 播放速度值 */
  speed: number;
  /** 预设标签（用于显示） */
  label: string;
  /** 可选的快捷键 */
  shortcut?: string;
}

/**
 * 动画速度类型
 * 定义动画速度的可选值
 */
export type AnimationSpeed = 'normal' | 'fast' | 'off';

/**
 * 快捷键设置接口
 * 定义完整的快捷键配置结构
 */
export interface ShortcutSettings {
  /** 快捷键映射：操作 -> 按键 */
  shortcuts: Record<ShortcutAction, string>;
  /** 速度预设列表 */
  presets: SpeedPreset[];
  /** 动画速度设置 */
  animationSpeed: AnimationSpeed;
}

/**
 * 默认快捷键配置
 */
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  'increase': '=',
  'decrease': '-',
  'reset': '0',
  'toggle-fullscreen': 'f',
  'play-pause': ' ',
  'volume-up': ']',
  'volume-down': '[',
  'seek-forward': '.',
  'seek-backward': ',',
  'show-help': '?',
  'preset-1': '7',
  'preset-2': '8',
  'preset-3': '9',
  'preset-4': '4',
  'preset-5': '5',
  'preset-6': '6',
  'preset-7': '1',
};

/**
 * 默认速度预设
 */
export const DEFAULT_PRESETS: SpeedPreset[] = [
  { id: '1', speed: 0.5, label: '0.5x', shortcut: '7' },
  { id: '2', speed: 0.75, label: '0.75x', shortcut: '8' },
  { id: '3', speed: 1.0, label: '1.0x', shortcut: '9' },
  { id: '4', speed: 1.25, label: '1.25x', shortcut: '4' },
  { id: '5', speed: 1.5, label: '1.5x', shortcut: '5' },
  { id: '6', speed: 1.75, label: '1.75x', shortcut: '6' },
  { id: '7', speed: 2.0, label: '2.0x', shortcut: '1' },
];
