/**
 * Chrome Storage 工具函数
 * 提供安全的 Chrome Storage API 封装，包含错误处理和降级策略
 * @module shared/utils/chromeStorage
 */

import {
  type StorageArea,
  type StorageOptions,
  DEFAULT_STORAGE_OPTIONS,
} from '../types/storage';

/**
 * 获取指定的 Chrome Storage 区域
 * @param area 存储区域类型
 * @returns Chrome Storage API 实例
 */
function getStorageArea(area: StorageArea): chrome.storage.StorageArea {
  switch (area) {
    case 'sync':
      return chrome.storage.sync;
    case 'local':
      return chrome.storage.local;
    case 'managed':
      return chrome.storage.managed;
    case 'session':
      return chrome.storage.session;
    default:
      return chrome.storage.sync;
  }
}

/**
 * 安全地从 Chrome Storage 获取数据
 * 支持错误处理和降级策略（sync -> local）
 *
 * @template T 返回值类型
 * @param key 存储键名
 * @param defaultValue 默认值（当获取失败或不存在时返回）
 * @param options 存储选项
 * @returns Promise 包含获取的值或默认值
 *
 * @example
 * ```typescript
 * // 获取单个值
 * const speed = await safeStorageGet('playbackSpeed', 1.0);
 *
 * // 获取对象
 * const settings = await safeStorageGet('settings', { theme: 'light' });
 *
 * // 使用 local storage
 * const data = await safeStorageGet('data', null, { area: 'local' });
 * ```
 */
export async function safeStorageGet<T>(
  key: string,
  defaultValue: T,
  options: StorageOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const storage = getStorageArea(opts.area!);

  try {
    // 创建超时 Promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Storage get timeout'));
      }, opts.timeout);
    });

    // 执行获取操作
    const getPromise = new Promise<T>((resolve, reject) => {
      storage.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key] ?? defaultValue);
        }
      });
    });

    // 竞速：获取操作 vs 超时
    return await Promise.race([getPromise, timeoutPromise]);
  } catch (error) {
    console.error(`Storage get error for key "${key}":`, error);

    // 如果启用降级且当前使用 sync，尝试降级到 local
    if (opts.useFallback && opts.area === 'sync') {
      console.warn(`Falling back to local storage for key "${key}"`);
      try {
        const localStorage = getStorageArea('local');
        const result = await new Promise<T>((resolve, reject) => {
          localStorage.get(key, (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(result[key] ?? defaultValue);
            }
          });
        });
        return result;
      } catch (localError) {
        console.error(`Local storage get also failed for key "${key}":`, localError);
      }
    }

    // 所有尝试都失败，返回默认值
    return defaultValue;
  }
}

/**
 * 安全地向 Chrome Storage 设置数据
 * 支持错误处理和降级策略（sync -> local）
 *
 * @param key 存储键名
 * @param value 要存储的值
 * @param options 存储选项
 * @returns Promise<boolean> 成功返回 true，失败返回 false
 *
 * @example
 * ```typescript
 * // 设置单个值
 * const success = await safeStorageSet('playbackSpeed', 1.5);
 *
 * // 设置对象
 * await safeStorageSet('settings', { theme: 'dark', volume: 0.8 });
 *
 * // 使用 local storage
 * await safeStorageSet('cache', data, { area: 'local' });
 * ```
 */
export async function safeStorageSet(
  key: string,
  value: unknown,
  options: StorageOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const storage = getStorageArea(opts.area!);

  try {
    // 创建超时 Promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Storage set timeout'));
      }, opts.timeout);
    });

    // 执行设置操作
    const setPromise = new Promise<void>((resolve, reject) => {
      storage.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });

    // 竞速：设置操作 vs 超时
    await Promise.race([setPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.error(`Storage set error for key "${key}":`, error);

    // 如果启用降级且当前使用 sync，尝试降级到 local
    if (opts.useFallback && opts.area === 'sync') {
      console.warn(`Falling back to local storage for key "${key}"`);
      try {
        const localStorage = getStorageArea('local');
        await new Promise<void>((resolve, reject) => {
          localStorage.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        return true;
      } catch (localError) {
        console.error(`Local storage set also failed for key "${key}":`, localError);
      }
    }

    // 所有尝试都失败
    return false;
  }
}

/**
 * 安全地从 Chrome Storage 删除数据
 *
 * @param key 存储键名或键名数组
 * @param options 存储选项
 * @returns Promise<boolean> 成功返回 true，失败返回 false
 *
 * @example
 * ```typescript
 * // 删除单个键
 * await safeStorageRemove('tempData');
 *
 * // 删除多个键
 * await safeStorageRemove(['cache1', 'cache2']);
 * ```
 */
export async function safeStorageRemove(
  key: string | string[],
  options: StorageOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const storage = getStorageArea(opts.area!);

  try {
    await new Promise<void>((resolve, reject) => {
      storage.remove(key, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
    return true;
  } catch (error) {
    console.error(`Storage remove error for key "${key}":`, error);
    return false;
  }
}

/**
 * 安全地清空 Chrome Storage 所有数据
 *
 * @param options 存储选项
 * @returns Promise<boolean> 成功返回 true，失败返回 false
 *
 * @example
 * ```typescript
 * // 清空 sync storage
 * await safeStorageClear();
 *
 * // 清空 local storage
 * await safeStorageClear({ area: 'local' });
 * ```
 */
export async function safeStorageClear(
  options: StorageOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const storage = getStorageArea(opts.area!);

  try {
    await new Promise<void>((resolve, reject) => {
      storage.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
    return true;
  } catch (error) {
    console.error('Storage clear error:', error);
    return false;
  }
}

/**
 * 获取 Chrome Storage 使用的字节数
 *
 * @param keys 可选的键名或键名数组
 * @param options 存储选项
 * @returns Promise<number> 使用的字节数，失败返回 0
 *
 * @example
 * ```typescript
 * // 获取所有数据的大小
 * const totalBytes = await getStorageBytesInUse();
 *
 * // 获取特定键的大小
 * const bytes = await getStorageBytesInUse('settings');
 * ```
 */
export async function getStorageBytesInUse(
  keys?: string | string[],
  options: StorageOptions = {}
): Promise<number> {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const storage = getStorageArea(opts.area!);

  try {
    return await new Promise<number>((resolve, reject) => {
      storage.getBytesInUse(keys ?? null, (bytes) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(bytes);
        }
      });
    });
  } catch (error) {
    console.error('Storage getBytesInUse error:', error);
    return 0;
  }
}

/**
 * 批量获取多个键的值
 *
 * @template T 返回值类型
 * @param keys 键名数组
 * @param defaults 默认值对象
 * @param options 存储选项
 * @returns Promise 包含所有键值对
 *
 * @example
 * ```typescript
 * const data = await safeStorageGetMultiple(
 *   ['speed', 'volume', 'language'],
 *   { speed: 1.0, volume: 1.0, language: 'en' }
 * );
 * ```
 */
export async function safeStorageGetMultiple<T extends Record<string, unknown>>(
  keys: string[],
  defaults: T,
  options: StorageOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const storage = getStorageArea(opts.area!);

  try {
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      storage.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });

    // 合并默认值
    return { ...defaults, ...result } as T;
  } catch (error) {
    console.error('Storage getMultiple error:', error);

    // 降级策略
    if (opts.useFallback && opts.area === 'sync') {
      try {
        const localStorage = getStorageArea('local');
        const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
          localStorage.get(keys, (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(result);
            }
          });
        });
        return { ...defaults, ...result } as T;
      } catch (localError) {
        console.error('Local storage getMultiple also failed:', localError);
      }
    }

    return defaults;
  }
}

/**
 * 批量设置多个键值对
 *
 * @param items 要设置的键值对对象
 * @param options 存储选项
 * @returns Promise<boolean> 成功返回 true，失败返回 false
 *
 * @example
 * ```typescript
 * await safeStorageSetMultiple({
 *   speed: 1.5,
 *   volume: 0.8,
 *   language: 'zh-CN'
 * });
 * ```
 */
export async function safeStorageSetMultiple(
  items: Record<string, unknown>,
  options: StorageOptions = {}
): Promise<boolean> {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const storage = getStorageArea(opts.area!);

  try {
    await new Promise<void>((resolve, reject) => {
      storage.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
    return true;
  } catch (error) {
    console.error('Storage setMultiple error:', error);

    // 降级策略
    if (opts.useFallback && opts.area === 'sync') {
      try {
        const localStorage = getStorageArea('local');
        await new Promise<void>((resolve, reject) => {
          localStorage.set(items, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        return true;
      } catch (localError) {
        console.error('Local storage setMultiple also failed:', localError);
      }
    }

    return false;
  }
}

/**
 * 监听 Chrome Storage 变化
 *
 * @param callback 变化回调函数
 * @param options 存储选项
 * @returns 取消监听的函数
 *
 * @example
 * ```typescript
 * const unsubscribe = onStorageChange((changes, areaName) => {
 *   if (changes.settings) {
 *     console.log('Settings changed:', changes.settings.newValue);
 *   }
 * });
 *
 * // 取消监听
 * unsubscribe();
 * ```
 */
export function onStorageChange(
  callback: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void,
  options: StorageOptions = {}
): () => void {
  const opts = { ...DEFAULT_STORAGE_OPTIONS, ...options };

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    // 如果指定了存储区域，只监听该区域的变化
    if (opts.area && areaName !== opts.area) {
      return;
    }
    callback(changes, areaName);
  };

  chrome.storage.onChanged.addListener(listener);

  // 返回取消监听的函数
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
