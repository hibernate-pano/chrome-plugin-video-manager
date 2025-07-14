document.addEventListener('DOMContentLoaded', () => {
    const inputs = {
        increase: document.getElementById('increase'),
        decrease: document.getElementById('decrease'),
        reset: document.getElementById('reset'),
        'toggle-play': document.getElementById('toggle-play'),
        'toggle-fullscreen': document.getElementById('toggle-fullscreen'),
    };
    const saveButton = document.getElementById('save');
    const statusDiv = document.getElementById('status');

    // Default shortcuts
    const defaultShortcuts = {
        increase: '=',
        decrease: '-',
        reset: '0',
        'toggle-play': ' ',
        'toggle-fullscreen': 'f',
    };

    // Load saved shortcuts and display them
    chrome.storage.sync.get({ shortcuts: defaultShortcuts }, (data) => {
        const shortcuts = data.shortcuts;
        for (const action in inputs) {
            if (inputs[action]) {
                inputs[action].value = shortcuts[action] || '';
            }
        }
    });

    // Handle shortcut recording
    for (const action in inputs) {
        const input = inputs[action];
        if (input) {
            input.addEventListener('keydown', (e) => {
                e.preventDefault();
                let shortcut = '';
                if (e.ctrlKey) shortcut += 'Ctrl+';
                if (e.altKey) shortcut += 'Alt+';
                if (e.shiftKey) shortcut += 'Shift+';
                if (e.metaKey) shortcut += 'Meta+';
                
                const key = e.key.toLowerCase();
                if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
                    shortcut += key;
                }
                input.value = shortcut;
            });
        }
    }

    // Save shortcuts
    saveButton.addEventListener('click', () => {
        const newShortcuts = {};
        for (const action in inputs) {
            if (inputs[action]) {
                newShortcuts[action] = inputs[action].value.trim();
            }
        }

        chrome.storage.sync.set({ shortcuts: newShortcuts }, () => {
            statusDiv.textContent = '设置已保存。';
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 1500);
        });
    });
});