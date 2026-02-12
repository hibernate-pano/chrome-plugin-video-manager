/**
 * Chrome Storage 相关类型定义
 * @module shared/types/storage
 */

import type { ShortcutAction, SpeedPreset, AnimationSpeed } from './shortcuts';
import type { HUDConfig } from './hud';

/**
 * 存储数据接口
 * 定义存储在 Chrome Storage 中的完整数据结构
 */
export interface StorageData {
  /** 快捷键映射 */
  shortcuts: Record<ShortcutAction, string>;
  /** 速度预设列表 */
  presets: SpeedPreset[];
  /** 动画速度设置 */
  animationSpeed: AnimationSpeed;
  /** HUD 配置 */
  hudConfig: HUDConfig;
  /** 界面语言 */
  language: string;
  /** 扩展版本号 */
  version: string;
}

/**
 * 存储键名常量
 * 定义所有使用的 Chrome Storage 键名
 */
export const STORAGE_KEYS = {
  /** 完整设置数据 */
  SETTINGS: 'vsc-settings',
  /** 快捷键 */
  SHORTCUTS: 'vsc-shortcuts',
  /** 预设 */
  PRESETS: 'vsc-presets',
  /** 动画速度 */
  ANIMATION_SPEED: 'vsc-animation-speed',
  /** HUD 配置 */
  HUD_CONFIG: 'vsc-hud-config',
  /** 语言 */
  LANGUAGE: 'vsc-language',
  /** 版本 */
  VERSION: 'vsc-version',
} as const;

/**
 * Chrome Storage 区域类型
 */
export type StorageArea = 'sync' | 'local' | 'managed' | 'session';

/**
 * Chrome Storage 变更事件
 */
export interface StorageChange<T = unknown> {
  /** 旧值 */
  oldValue?: T;
  /** 新值 */
  newValue?: T;
}

/**
 * Chrome Storage 变更映射
 */
export type StorageChanges = {
  [key: string]: StorageChange;
};

/**
 * Chrome Storage API 类型定义
 * 扩展 Chrome Storage API 的类型
 */
export interface ChromeStorageAPI {
  /**
   * 获取存储数据
   * @param keys 要获取的键名或键名数组
   * @returns Promise 包含请求的数据
   */
  get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * 设置存储数据
   * @param items 要设置的键值对
   * @returns Promise
   */
  set(items: Record<string, unknown>): Promise<void>;

  /**
   * 删除存储数据
   * @param keys 要删除的键名或键名数组
   * @returns Promise
   */
  remove(keys: string | string[]): Promise<void>;

  /**
   * 清空所有存储数据
   * @returns Promise
   */
  clear(): Promise<void>;

  /**
   * 获取存储使用的字节数
   * @param keys 可选的键名或键名数组
   * @returns Promise 包含字节数
   */
  getBytesInUse(keys?: string | string[]): Promise<number>;
}

/**
 * 存储错误类型
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * 存储错误代码
 */
export enum StorageErrorCode {
  /** 配额超限 */
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  /** 网络错误 */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** 权限错误 */
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  /** 未知错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 存储操作选项
 */
export interface StorageOptions {
  /** 存储区域 */
  area?: StorageArea;
  /** 是否使用降级策略（sync -> local） */
  useFallback?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 默认存储选项
 */
export const DEFAULT_STORAGE_OPTIONS: StorageOptions = {
  area: 'sync',
  useFallback: true,
  timeout: 5000,
};
