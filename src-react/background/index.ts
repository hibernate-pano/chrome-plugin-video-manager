// Background Service Worker for Chrome Extension
// Manifest V3 要求使用 Service Worker 而不是 background page

console.log('Video Speed Controller - Background Service Worker initialized');

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed:', details.reason);

    if (details.reason === 'install') {
    // 首次安装时的初始化逻辑
        console.log('First time installation');
    } else if (details.reason === 'update') {
    // 更新时的逻辑
        console.log('Extension updated');
    }
});

// 监听来自 content script 或 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message, 'from:', sender);

    // 处理不同类型的消息
    switch (message.type) {
    case 'GET_SETTINGS':
        // 获取设置
        chrome.storage.sync.get(null, (data) => {
            sendResponse({ success: true, data });
        });
        return true; // 保持消息通道开启以支持异步响应

    case 'SAVE_SETTINGS':
        // 保存设置
        chrome.storage.sync.set(message.data, () => {
            sendResponse({ success: true });
        });
        return true;

    default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, areaName) => {
    console.log('Storage changed:', changes, 'in area:', areaName);

    // 通知所有 content scripts 设置已更改
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'SETTINGS_CHANGED',
                    changes,
                }).catch(() => {
                    // 忽略无法发送消息的标签页（如 chrome:// 页面）
                });
            }
        });
    });
});

// 保持 service worker 活跃（可选）
// Service Worker 在空闲时会被终止，这是正常行为
// 如果需要保持活跃，可以使用 chrome.alarms API
