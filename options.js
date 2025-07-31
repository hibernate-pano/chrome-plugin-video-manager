document.addEventListener('DOMContentLoaded', () => {
    const inputs = {
        increase: document.getElementById('increase'),
        decrease: document.getElementById('decrease'),
        reset: document.getElementById('reset'),
        'toggle-fullscreen': document.getElementById('toggle-fullscreen'),
    };
    const saveButton = document.getElementById('save');
    const statusDiv = document.getElementById('status');

    // 标签页功能
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // 移除所有活动标签的活动状态
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // 激活当前选中的标签
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Default shortcuts
    const defaultShortcuts = {
        increase: '=',
        decrease: '-',
        reset: '0',
        'toggle-fullscreen': 'f',
    };

    // 常见的浏览器快捷键，应避免冲突
    const commonBrowserShortcuts = [
        'ctrl+t', 'ctrl+n', 'ctrl+w', 'ctrl+f', 'ctrl+s', 'ctrl+p', 'ctrl+r', 'f5',
        'alt+f4', 'ctrl+tab', 'ctrl+shift+tab', 'ctrl+1', 'ctrl+2', 'ctrl+3', 'ctrl+4',
        'ctrl+5', 'ctrl+6', 'ctrl+7', 'ctrl+8', 'ctrl+9', 'ctrl+0', 'f1', 'f11',
        'ctrl+shift+n', 'ctrl+j', 'ctrl+h', 'ctrl+d', 'ctrl+l', 'ctrl+k'
    ];

    // Mac系统上的常用快捷键
    const commonMacShortcuts = [
        'meta+t', 'meta+n', 'meta+w', 'meta+f', 'meta+s', 'meta+p', 'meta+r',
        'meta+tab', 'meta+`', 'meta+1', 'meta+2', 'meta+3', 'meta+4',
        'meta+5', 'meta+6', 'meta+7', 'meta+8', 'meta+9', 'meta+0',
        'meta+shift+n', 'meta+j', 'meta+h', 'meta+d', 'meta+l', 'meta+k'
    ];

    // 检测操作系统类型，为Mac用户显示更准确的警告
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const relevantBrowserShortcuts = isMac 
        ? [...commonBrowserShortcuts, ...commonMacShortcuts] 
        : commonBrowserShortcuts;

    // 显示快捷键的格式化函数
    function formatShortcut(shortcut) {
        if (shortcut === ' ') return '空格键';
        return shortcut;
    }

    // 从显示格式还原为存储格式
    function parseShortcut(displayValue) {
        if (displayValue === '空格键') return ' ';
        return displayValue;
    }

    // 添加重置按钮
    const resetButton = document.getElementById('reset-shortcuts');

    // 重置为默认快捷键
    resetButton.addEventListener('click', () => {
        for (const action in inputs) {
            if (inputs[action]) {
                inputs[action].value = formatShortcut(defaultShortcuts[action]);
                inputs[action].classList.remove('warning');
            }
        }
        statusDiv.textContent = '已恢复默认设置，请点击保存以应用。';
        statusDiv.style.color = 'green';
    });

    // Load saved shortcuts and display them
    chrome.storage.sync.get({ shortcuts: defaultShortcuts }, (data) => {
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
        
        for (const action in inputs) {
            if (inputs[action]) {
                inputs[action].value = formatShortcut(shortcuts[action] || '');
            }
        }
    });

    // 检查快捷键冲突
    function checkShortcutConflicts() {
        const shortcutMap = {};
        let hasConflict = false;
        let hasEmpty = false;
        let hasBrowserConflict = false;

        statusDiv.textContent = '';
        statusDiv.style.color = 'green';

        // 清除所有警告样式
        for (const action in inputs) {
            if (inputs[action]) {
                inputs[action].classList.remove('warning');
            }
        }

        // 检查重复和空白快捷键
        for (const action in inputs) {
            if (inputs[action]) {
                const displayValue = inputs[action].value.trim();
                const shortcut = parseShortcut(displayValue);
                
                // 检查空白快捷键
                if (!shortcut) {
                    inputs[action].classList.add('warning');
                    hasEmpty = true;
                    continue;
                }
                
                // 检查快捷键冲突
                if (shortcutMap[shortcut]) {
                    inputs[action].classList.add('warning');
                    inputs[shortcutMap[shortcut]].classList.add('warning');
                    hasConflict = true;
                } else {
                    shortcutMap[shortcut] = action;
                }

                // 检查与浏览器常用快捷键冲突
                const normalizedShortcut = shortcut.toLowerCase();
                if (relevantBrowserShortcuts.includes(normalizedShortcut)) {
                    inputs[action].classList.add('warning');
                    hasBrowserConflict = true;
                }
            }
        }

        // 显示警告信息
        if (hasConflict || hasEmpty || hasBrowserConflict) {
            let message = '';
            if (hasConflict) message += '检测到重复的快捷键设置！ ';
            if (hasEmpty) message += '快捷键不能为空！ ';
            if (hasBrowserConflict) message += '部分快捷键与浏览器常用快捷键冲突，可能会被浏览器优先处理。 ';
            
            statusDiv.textContent = message;
            statusDiv.style.color = 'red';
            return false;
        }
        
        return true;
    }

    // Handle shortcut recording
    for (const action in inputs) {
        const input = inputs[action];
        if (input) {
            // 添加CSS类用于警告样式
            input.classList.add('shortcut-input');
            
            input.addEventListener('keydown', (e) => {
                e.preventDefault();
                let shortcut = '';
                if (e.ctrlKey) shortcut += 'ctrl+';
                if (e.altKey) shortcut += 'alt+';
                if (e.shiftKey) shortcut += 'shift+';
                if (e.metaKey) shortcut += 'meta+';
                
                const key = e.key.toLowerCase();
                if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
                    if (key === ' ') {
                        input.value = '空格键';
                    } else {
                        shortcut += key;
                        input.value = shortcut;
                    }
                }
                
                // 实时检查冲突
                setTimeout(checkShortcutConflicts, 100);
            });
            
            // 失去焦点时检查冲突
            input.addEventListener('blur', checkShortcutConflicts);
        }
    }

    // Save shortcuts
    saveButton.addEventListener('click', () => {
        // 先检查快捷键冲突
        if (!checkShortcutConflicts()) {
            statusDiv.textContent += ' 请修正问题后再保存。';
            return;
        }

        const newShortcuts = {};
        try {
            for (const action in inputs) {
                if (inputs[action]) {
                    const displayValue = inputs[action].value.trim();
                    const value = parseShortcut(displayValue);
                    newShortcuts[action] = value || defaultShortcuts[action]; // 如果为空，使用默认值
                }
            }

            chrome.storage.sync.set({ shortcuts: newShortcuts }, () => {
                if (chrome.runtime.lastError) {
                    statusDiv.textContent = '保存失败: ' + chrome.runtime.lastError.message;
                    statusDiv.style.color = 'red';
                } else {
                    statusDiv.textContent = '设置已保存。';
                    statusDiv.style.color = 'green';
                    setTimeout(() => {
                        statusDiv.textContent = '';
                    }, 1500);
                }
            });
        } catch (error) {
            statusDiv.textContent = '保存出错: ' + error.message;
            statusDiv.style.color = 'red';
        }
    });

    // 初始加载时检查冲突
    setTimeout(checkShortcutConflicts, 500);
});