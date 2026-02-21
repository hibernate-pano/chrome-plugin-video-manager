/**
 * Cloud Sync - 云端同步
 * 使用 Chrome Storage API 实现多设备同步
 */

import { storage } from '../utils/storage.js';

const STORAGE_KEYS = {
  PROFILES: 'speedProfiles',
  ACTIVE_PROFILE: 'activeProfile',
  THEMES: 'customThemes',
  ACTIVE_THEME: 'activeTheme',
  BOOKMARKS: 'videoBookmarks',
  HISTORY: 'playbackHistory',
  SETTINGS: 'userSettings',
  LAST_SYNC: 'lastSyncTime',
  SYNC_ENABLED: 'syncEnabled'
};

// 需要同步的数据项
const SYNC_ITEMS = [
  'speedProfiles',
  'activeProfile', 
  'customThemes',
  'activeTheme',
  'userSettings'
];

export class CloudSync {
  constructor() {
    this.enabled = false;
    this.lastSync = null;
    this.listeners = [];
  }

  async init() {
    try {
      const result = await this._get(STORAGE_KEYS.SYNC_ENABLED);
      this.enabled = result === true;
      
      const lastSyncResult = await this._get(STORAGE_KEYS.LAST_SYNC);
      this.lastSync = lastSyncResult;
      
      // 监听存储变化
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && this.enabled) {
          this._handleRemoteChanges(changes);
        }
      });
      
      console.log('[CloudSync] Initialized, enabled:', this.enabled);
    } catch (e) {
      console.warn('[CloudSync] Init failed:', e);
    }
  }

  /**
   * 启用/禁用同步
   */
  async setEnabled(enabled) {
    this.enabled = enabled;
    await this._set(STORAGE_KEYS.SYNC_ENABLED, enabled);
    
    if (enabled) {
      // 立即同步一次
      await this.sync();
    }
    
    this._notifyListeners('enabled', enabled);
    return this.enabled;
  }

  /**
   * 获取同步状态
   */
  getStatus() {
    return {
      enabled: this.enabled,
      lastSync: this.lastSync,
      account: 'chrome-account' // Chrome 会自动处理账户信息
    };
  }

  /**
   * 手动触发同步
   */
  async sync() {
    if (!this.enabled) {
      console.log('[CloudSync] Sync skipped - not enabled');
      return { success: false, reason: 'not_enabled' };
    }

    try {
      const timestamp = Date.now();
      
      // 从 local 获取需要同步的数据
      const localData = {};
      for (const key of SYNC_ITEMS) {
        const result = await this._getLocal(key);
        if (result !== undefined) {
          localData[key] = result;
        }
      }

      // 写入 sync 存储（会自动同步到云端）
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set(localData, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      this.lastSync = timestamp;
      await this._set(STORAGE_KEYS.LAST_SYNC, timestamp);

      console.log('[CloudSync] Sync completed:', Object.keys(localData));
      this._notifyListeners('sync', { success: true, items: Object.keys(localData) });
      
      return { success: true, timestamp };
    } catch (e) {
      console.error('[CloudSync] Sync failed:', e);
      this._notifyListeners('error', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * 处理远程变化
   */
  async _handleRemoteChanges(changes) {
    console.log('[CloudSync] Remote changes detected:', Object.keys(changes));
    // 可以在这里处理冲突，例如：比较时间戳，选择最新的
  }

  /**
   * 添加监听器
   */
  addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * 移除监听器
   */
  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  _notifyListeners(event, data) {
    this.listeners.forEach(l => l(event, data));
  }

  _get(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key]));
    });
  }

  _set(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  _getLocal(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key]));
    });
  }
}

export const cloudSync = new CloudSync();
