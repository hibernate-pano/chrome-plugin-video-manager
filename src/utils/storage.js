/**
 * Chrome Storage API工具函数
 * @module utils/storage
 */

/**
 * 默认快捷键配置
 */
export const defaultShortcuts = {
    increase: '=',
    decrease: '-',
    reset: '0',
    'toggle-fullscreen': 'f',
    'volume-up': ']',
    'volume-down': '[',
    'seek-forward': '.',
    'seek-backward': ',',
    'show-help': '?',
};

/**
 * 默认速度预设
 */
export const defaultPresets = [
    { value: 0.5, label: '0.5x', key: '7' },
    { value: 0.75, label: '0.75x', key: '8' },
    { value: 1.0, label: '1.0x', key: '9' },
    { value: 1.25, label: '1.25x', key: '4' },
    { value: 1.5, label: '1.5x', key: '5' },
    { value: 1.75, label: '1.75x', key: '6' },
    { value: 2.0, label: '2.0x', key: '0' },
];

/**
 * 从Chrome存储加载快捷键设置
 * @returns {Promise<Object>} 快捷键配置对象
 */
export function loadShortcutSettings() {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.sync.get({ shortcuts: defaultShortcuts }, (data) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                let shortcuts = data.shortcuts;

                // 清理已删除的快捷键（如 toggle-play）
                const validShortcuts = {};
                let needsUpdate = false;

                for (const action in defaultShortcuts) {
                    if (shortcuts[action] !== undefined) {
                        validShortcuts[action] = shortcuts[action];
                    } else {
                        validShortcuts[action] = defaultShortcuts[action];
                    }
                }

                // 检查是否有已删除的快捷键
                for (const action in shortcuts) {
                    if (!(action in defaultShortcuts)) {
                        console.log(`检测到已删除的快捷键: ${action}，正在清理...`);
                        needsUpdate = true;
                    }
                }

                if (needsUpdate) {
                    // 更新存储，移除已删除的快捷键
                    chrome.storage.sync.set({ shortcuts: validShortcuts });
                    shortcuts = validShortcuts;
                }

                resolve(validShortcuts);
            });
        } catch (e) {
            console.error('加载快捷键失败:', e);
            resolve(defaultShortcuts); // 使用默认值作为后备
        }
    });
}

/**
 * 保存快捷键设置到Chrome存储
 * @param {Object} shortcuts - 快捷键配置对象
 * @returns {Promise<void>}
 */
export function saveShortcutSettings(shortcuts) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ shortcuts }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

/**
 * 监听快捷键设置变更
 * @param {Function} callback - 当快捷键变更时的回调函数
 */
export function onShortcutsChanged(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        try {
            if (namespace === 'sync' && changes.shortcuts) {
                callback(changes.shortcuts.newValue);
            }
        } catch (e) {
            console.error('处理快捷键变更失败:', e);
        }
    });
}
