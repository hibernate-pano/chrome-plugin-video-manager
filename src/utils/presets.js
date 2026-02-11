/**
 * 速度预设工具函数
 * @module utils/presets
 */

import { defaultPresets } from './storage.js';

// 重新导出 defaultPresets，保持向后兼容
export { defaultPresets };

/**
 * 从Chrome存储加载速度预设
 * @returns {Promise<Array>} 速度预设数组
 */
export function loadSpeedPresets() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({ presets: defaultPresets }, (data) => {
            resolve(data.presets);
        });
    });
}

/**
 * 保存速度预设到Chrome存储
 * @param {Array} presets - 速度预设数组
 * @returns {Promise<void>}
 */
export function saveSpeedPresets(presets) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ presets }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

/**
 * 根据按键查找预设
 * @param {string} key - 按键（如 '1', '2'）
 * @param {Array} presets - 预设数组
 * @returns {Object|null} 预设对象或null
 */
export function findPresetByKey(key, presets) {
    return presets.find((p) => p.key === key) || null;
}
