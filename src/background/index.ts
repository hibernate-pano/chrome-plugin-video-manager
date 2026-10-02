import { TOGGLE_FULLSCREEN_MESSAGE } from '../shared/types';

/**
 * 工具栏图标没有弹窗：点击即切换当前标签页的网页全屏。
 * 这是唯一一条 background 职责——把"点扩展图标"翻译成"全屏这个视频"。
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: TOGGLE_FULLSCREEN_MESSAGE }, () => {
    // 页面没有内容脚本（chrome://、扩展页等）时连接会失败，静默忽略即可。
    void chrome.runtime.lastError;
  });
});
