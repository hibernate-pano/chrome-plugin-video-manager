document.addEventListener('DOMContentLoaded', () => {
    const inputs = {
        increase: document.getElementById('increase'),
        decrease: document.getElementById('decrease'),
        reset: document.getElementById('reset'),
        'toggle-play': document.getElementById('toggle-play'),
    };
    const saveButton = document.getElementById('save');
    const statusDiv = document.getElementById('status');

    // Default shortcuts
    const defaultShortcuts = {
        increase: '=',
        decrease: '-',
        reset: '0',
        'toggle-play': ' ',
    };

    // Load saved shortcuts and display them
    chrome.storage.sync.get({ shortcuts: defaultShortcuts }, (data) => {
        const shortcuts = data.shortcuts;
        for (const action in inputs) {
            inputs[action].value = shortcuts[action] || '';
        }
    });

    // Save shortcuts
    saveButton.addEventListener('click', () => {
        const newShortcuts = {};
        for (const action in inputs) {
            newShortcuts[action] = inputs[action].value.trim();
        }

        chrome.storage.sync.set({ shortcuts: newShortcuts }, () => {
            statusDiv.textContent = '设置已保存。';
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 1500);
        });
    });
});
