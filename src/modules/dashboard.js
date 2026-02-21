/**
 * Dashboard - 数据统计面板
 * 展示观看统计、学习进度等数据
 */

const STORAGE_KEYS = {
  HISTORY: 'playbackHistory',
  BOOKMARKS: 'videoBookmarks',
  PROFILES: 'speedProfiles'
};

export class Dashboard {
  constructor() {
    this.stats = null;
  }

  async init() {
    await this.loadData();
    return this;
  }

  async loadData() {
    const historyResult = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    const history = historyResult[STORAGE_KEYS.HISTORY] || [];
    
    const bookmarksResult = await chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS);
    const bookmarks = bookmarksResult[STORAGE_KEYS.BOOKMARKS] || [];

    this.stats = this.calculateStats(history, bookmarks);
    return this.stats;
  }

  calculateStats(history, bookmarks) {
    // 基本统计
    const totalVideos = history.length;
    const uniqueSites = [...new Set(history.map(h => h.site))].length;
    
    // 观看时长
    const totalSeconds = history.reduce((sum, h) => sum + (h.watchedDuration || 0), 0);
    const avgSpeed = totalVideos > 0 
      ? history.reduce((sum, h) => sum + (h.playbackSpeed || 1), 0) / totalVideos 
      : 1;

    // 按站点统计
    const siteStats = {};
    history.forEach(h => {
      const site = h.site || 'other';
      if (!siteStats[site]) {
        siteStats[site] = { count: 0, time: 0 };
      }
      siteStats[site].count++;
      siteStats[site].time += h.watchedDuration || 0;
    });

    // 按速度统计
    const speedStats = {};
    history.forEach(h => {
      const speed = Math.round((h.playbackSpeed || 1) * 2) / 2; // 四舍五入到0.5
      speedStats[speed] = (speedStats[speed] || 0) + 1;
    });

    // 最近7天统计
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentHistory = history.filter(h => h.lastWatched > sevenDaysAgo);
    const recentTime = recentHistory.reduce((sum, h) => sum + (h.watchedDuration || 0), 0);

    // 书签统计
    const totalBookmarks = bookmarks.length;

    return {
      totalVideos,
      totalTime: totalSeconds,
      totalTimeFormatted: this.formatDuration(totalSeconds),
      avgSpeed: avgSpeed.toFixed(1),
      uniqueSites,
      siteStats,
      speedStats,
      recentVideos: recentHistory.length,
      recentTime,
      recentTimeFormatted: this.formatDuration(recentTime),
      totalBookmarks,
      streak: this.calculateStreak(history),
      mostUsedSpeed: Object.entries(speedStats).sort((a, b) => b[1] - a[1])[0]?.[0] || '1.0'
    };
  }

  calculateStreak(history) {
    if (history.length === 0) return 0;
    
    const dates = [...new Set(history.map(h => 
      new Date(h.lastWatched).toDateString()
    ))].sort((a, b) => new Date(b) - new Date(a));

    let streak = 1;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    if (dates[0] !== today && dates[0] !== yesterday) {
      return 0;
    }

    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (prev - curr) / 86400000;
      
      if (diff <= 1) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  }

  formatDuration(seconds) {
    if (!seconds || seconds < 60) return `${Math.round(seconds || 0)}秒`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}小时${mins}分钟`;
  }

  getSiteIcon(site) {
    const icons = {
      bilibili: '📺',
      youtube: '▶️',
      youku: '🎬',
      iqiyi: '🎥',
      tencent: '📡',
      coursera: '🎓',
      udemy: '💼',
      douyin: '🎵',
      other: '🌐'
    };
    return icons[site] || '🌐';
  }

  generateReport() {
    if (!this.stats) return '暂无数据';

    const { stats } = this;
    const lines = [
      '📊 观看统计报告',
      '━━━━━━━━━━━━━━━━',
      '',
      `📺 观看视频: ${stats.totalVideos} 个`,
      `⏱️ 总观看时长: ${stats.totalTimeFormatted}`,
      `📍 涉及站点: ${stats.uniqueSites} 个`,
      `⚡ 平均速度: ${stats.avgSpeed}x`,
      `📖 书签数量: ${stats.totalBookmarks}`,
      '',
      '📈 最近7天:',
      `  • 观看 ${stats.recentVideos} 个视频`,
      `  • 时长 ${stats.recentTimeFormatted}`,
      '',
      '🔥 最常用速度: ' + stats.mostUsedSpeed + 'x',
      '💪 连续学习: ' + stats.streak + ' 天',
      ''
    ];

    // 添加站点统计
    if (Object.keys(stats.siteStats).length > 0) {
      lines.push('🌐 站点分布:');
      const topSites = Object.entries(stats.siteStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      
      topSites.forEach(([site, data]) => {
        lines.push(`  ${this.getSiteIcon(site)} ${site}: ${data.count}个视频`);
      });
    }

    return lines.join('\n');
  }
}

export const dashboard = new Dashboard();
