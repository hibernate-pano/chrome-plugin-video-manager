/**
 * HUD（抬头显示）相关类型定义
 * @module shared/types/hud
 */

/**
 * HUD 显示类型
 * 定义 HUD 可以显示的不同类型的指示器
 */
export type HUDType = 'speed' | 'volume' | 'seek' | 'reset';

/**
 * HUD 位置类型
 * 定义 HUD 在页面上的显示位置
 */
export type HUDPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';

/**
 * HUD 状态接口
 * 定义 HUD 的当前显示状态
 */
export interface HUDState {
  /** 是否可见 */
  visible: boolean;
  /** HUD 类型 */
  type: HUDType | null;
  /** 显示的值 */
  value: number;
  /** 超时定时器 ID */
  timeout: number | null;
}

/**
 * HUD 配置接口
 * 定义 HUD 的配置参数
 */
export interface HUDConfig {
  /** 显示持续时间（毫秒） */
  displayDuration: number;
  /** 动画持续时间（毫秒） */
  animationDuration: number;
  /** HUD 位置 */
  position: HUDPosition;
  /** 是否启用动画 */
  enableAnimation?: boolean;
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
  /** 自定义样式类名 */
  customClassName?: string;
}

/**
 * 默认 HUD 配置
 */
export const DEFAULT_HUD_CONFIG: HUDConfig = {
  displayDuration: 2000,
  animationDuration: 300,
  position: 'center',
  enableAnimation: true,
  debounceDelay: 100,
};

/**
 * HUD 显示选项接口
 * 用于 show 方法的参数
 */
export interface HUDShowOptions {
  /** HUD 类型 */
  type: HUDType;
  /** 显示的值 */
  value: number;
  /** 可选的自定义持续时间 */
  duration?: number;
  /** 可选的附加文本 */
  text?: string;
}
