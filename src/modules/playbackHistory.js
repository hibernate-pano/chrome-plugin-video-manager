/**
 * Playback History - 播放历史记录
 * 记录用户观看过的视频信息
 */

// Chrome Storage API helper
const storage = {
  get: (key) => new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key]));
  }),
  set: (key, value) => new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  })
};

const STORAGE_KEY = 'playbackHistory';
const MAX_HISTORY_ITEMS = 100;

export class PlaybackHistory {
  constructor() {
    this.history = [];
  }

  /**
   * 初始化 - 从存储加载
   */
  async init() {
    try {
      const saved = await storage.get(STORAGE_KEY);
      if (Array.isArray(saved)) {
        this.history = saved;
      }
    } catch (e) {
      console.warn('[PlaybackHistory] Init failed:', e);
    }
  }

  /**
   * 添加或更新历史记录
   */
  async addRecord(videoInfo) {
    const record = {
      id: this.generateId(videoInfo),
      url: videoInfo.url || window.location.href,
      title: videoInfo.title || this.getPageTitle(),
      thumbnail: videoInfo.thumbnail || '',
      site: videoInfo.site || this.detectSite(),
      duration: videoInfo.duration || 0,
      watchedDuration: videoInfo.watchedDuration || 0,
      playbackSpeed: videoInfo.speed || 1.0,
      lastWatched: Date.now(),
      createdAt: videoInfo.createdAt || Date.now(),
      visitCount: 1
    };

    // 检查是否已存在
    const existingIndex = this.history.findIndex(h => h.id === record.id);
    
    if (existingIndex !== -1) {
      // 更新现有记录
      const existing = this.history[existingIndex];
      record.visitCount = (existing.visitCount || 1) + 1;
      record.createdAt = existing.createdAt;
      this.history[existingIndex] = record;
    } else {
      // 添加新记录
      this.history.unshift(record);
      
      // 限制历史数量
      if (this.history.length > MAX_HISTORY_ITEMS) {
        this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
      }
    }

    await this.save();
    return record;
  }

  /**
   * 获取历史记录
   */
  getHistory(options = {}) {
    let result = [...this.history];
    
    if (options.site) {
      result = result.filter(h => h.site === options.site);
    }
    
    if (options.limit) {
      result = result.slice(0, options.limit);
    }
    
    if (options.search) {
      const query = options.search.toLowerCase();
      result = result.filter(h => 
        h.title.toLowerCase().includes(query) ||
        h.url.toLowerCase().includes(query)
      );
    }
    
    return result;
  }

  /**
   * 获取观看统计
   */
  getStats() {
    const sites = {};
    let totalTime = 0;
    let totalVideos = this.history.length;

    this.history.forEach(h => {
      // 统计各站点
      sites[h.site] = (sites[h.site] || 0) + 1;
      // 统计总观看时长
      totalTime += h.watchedDuration || 0;
    });

    return {
      totalVideos,
      totalTime,
      totalTimeFormatted: this.formatDuration(totalTime),
      sites,
      mostVisited: Object.entries(sites).sort((a, b) => b[1] - a[1])[0]
    };
  }

  /**
   * 清空历史
   */
  async clearHistory() {
    this.history = [];
    await this.save();
  }

  /**
   * 删除单条记录
   */
  async deleteRecord(recordId) {
    const index = this.history.findIndex(h => h.id === recordId);
    if (index !== -1) {
      this.history.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  /**
   * 生成唯一ID
   */
  generateId(videoInfo) {
    const url = videoInfo.url || window.location.href;
    // 使用URL和标题生成唯一ID
    const str = `${url}_${videoInfo.title || ''}_${videoInfo.duration || 0}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 获取页面标题
   */
  getPageTitle() {
    return document.title || '未知视频';
  }

  /**
   * 检测网站
   */
  detectSite() {
    const hostname = window.location.hostname;
    if (hostname.includes('bilibili')) return 'bilibili';
    if (hostname.includes('youtube')) return 'youtube';
    if (hostname.includes('youku')) return 'youku';
    if (hostname.includes('iqiyi')) return 'iqiyi';
    if (hostname.includes('vqq')) return 'tencent';
    if (hostname.includes('coursera')) return 'coursera';
    if (hostname.includes('udemy')) return 'udemy';
    if (hostname.includes('douyin')) return 'douyin';
    return 'other';
  }

  /**
   * 格式化时长
   */
  formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}小时${mins}分钟`;
  }

  /**
   * 保存到存储
   */
  async save() {
    await storage.set(STORAGE_KEY, this.history);
  }
}

// 导出单例
export const playbackHistory = new PlaybackHistory();
