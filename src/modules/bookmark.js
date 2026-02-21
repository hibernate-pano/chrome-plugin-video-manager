/**
 * Video Bookmark - 视频时间书签
 * 允许用户标记视频中的精彩片段并快速跳转
 */

const STORAGE_KEY = 'videoBookmarks';

export class VideoBookmark {
  constructor() {
    this.bookmarks = [];
  }

  async init() {
    try {
      const saved = await this._get(STORAGE_KEY);
      if (Array.isArray(saved)) {
        this.bookmarks = saved;
      }
    } catch (e) {
      console.warn('[VideoBookmark] Init failed:', e);
    }
  }

  /**
   * 添加书签
   */
  async addBookmark(videoInfo) {
    const bookmark = {
      id: `bm_${Date.now()}`,
      url: videoInfo.url || window.location.href,
      title: videoInfo.title || document.title,
      site: videoInfo.site || this._detectSite(),
      timestamp: videoInfo.timestamp || 0,
      note: videoInfo.note || '',
      createdAt: Date.now()
    };

    this.bookmarks.unshift(bookmark);
    
    // 限制数量
    if (this.bookmarks.length > 200) {
      this.bookmarks = this.bookmarks.slice(0, 200);
    }

    await this._save();
    return bookmark;
  }

  /**
   * 获取当前视频的书签
   */
  getBookmarksForCurrentVideo() {
    const url = window.location.href;
    return this.bookmarks.filter(b => this._isSameVideo(b.url, url))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 获取所有书签
   */
  getAllBookmarks(options = {}) {
    let result = [...this.bookmarks];
    
    if (options.site) {
      result = result.filter(b => b.site === options.site);
    }
    
    if (options.limit) {
      result = result.slice(0, options.limit);
    }
    
    return result;
  }

  /**
   * 删除书签
   */
  async deleteBookmark(bookmarkId) {
    const index = this.bookmarks.findIndex(b => b.id === bookmarkId);
    if (index !== -1) {
      this.bookmarks.splice(index, 1);
      await this._save();
      return true;
    }
    return false;
  }

  /**
   * 清空当前视频的书签
   */
  async clearBookmarksForCurrentVideo() {
    const url = window.location.href;
    this.bookmarks = this.bookmarks.filter(b => !this._isSameVideo(b.url, url));
    await this._save();
  }

  /**
   * 更新书签备注
   */
  async updateBookmarkNote(bookmarkId, note) {
    const bookmark = this.bookmarks.find(b => b.id === bookmarkId);
    if (bookmark) {
      bookmark.note = note;
      bookmark.updatedAt = Date.now();
      await this._save();
      return bookmark;
    }
    return null;
  }

  /**
   * 检测是否为同一视频
   */
  _isSameVideo(url1, url2) {
    try {
      const u1 = new URL(url1);
      const u2 = new URL(url2);
      // 简化比较：只比较hostname和pathname
      return u1.hostname === u2.hostname && u1.pathname === u2.pathname;
    } catch {
      return url1 === url2;
    }
  }

  /**
   * 检测网站
   */
  _detectSite() {
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
   * 格式化时间戳
   */
  formatTimestamp(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async _get(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key]));
    });
  }

  async _save() {
    await this._set(STORAGE_KEY, this.bookmarks);
  }

  async _set(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
}

export const videoBookmark = new VideoBookmark();
