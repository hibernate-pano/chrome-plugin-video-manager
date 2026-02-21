/**
 * Video Position Memory - 视频位置记忆
 * 自动保存/恢复视频播放位置
 */

const STORAGE_KEY = 'videoPositions';

class VideoPositionMemory {
  constructor() {
    this.positions = {};
    this.saveThrottled = null;
  }

  async init() {
    try {
      const saved = await this._get(STORAGE_KEY);
      if (saved) this.positions = saved;
    } catch (e) {
      console.warn('[VideoPosition] Init failed:', e);
    }
  }

  /**
   * 生成视频唯一ID
   */
  getVideoId(url = window.location.href, title = document.title) {
    try {
      const u = new URL(url);
      return `${u.hostname}${u.pathname}`.slice(0, 100);
    } catch {
      return url.slice(0, 100);
    }
  }

  /**
   * 保存当前位置
   */
  savePosition(videoId, currentTime, duration) {
    this.positions[videoId] = {
      currentTime,
      duration,
      url: window.location.href,
      title: document.title,
      updatedAt: Date.now()
    };
    
    // 节流保存
    if (this.saveThrottled) clearTimeout(this.saveThrottled);
    this.saveThrottled = setTimeout(() => this._save(), 2000);
  }

  /**
   * 获取保存的位置
   */
  getPosition(videoId) {
    return this.positions[videoId];
  }

  /**
   * 检查是否有保存的位置
   */
  hasPosition(videoId) {
    const pos = this.positions[videoId];
    if (!pos) return false;
    
    // 如果超过7天没看，就不恢复了
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return pos.updatedAt > weekAgo;
  }

  /**
   * 清除位置记录
   */
  clearPosition(videoId) {
    delete this.positions[videoId];
    this._save();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const videos = Object.keys(this.positions).length;
    const totalTime = Object.values(this.positions).reduce((sum, p) => sum + (p.currentTime || 0), 0);
    return { videos, totalTime: Math.round(totalTime / 60) };
  }

  async _get(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key]));
    });
  }

  async _save() {
    await this._set(STORAGE_KEY, this.positions);
  }

  async _set(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
}

export const videoPositionMemory = new VideoPositionMemory();
