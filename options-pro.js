/**
 * Options Pro - Complete Pro Features
 */

const STORAGE_KEYS = {
  PROFILES: 'speedProfiles',
  ACTIVE_PROFILE: 'activeProfile',
  HISTORY: 'playbackHistory',
  THEMES: 'customThemes',
  ACTIVE_THEME: 'activeTheme',
  BOOKMARKS: 'videoBookmarks'
};

const DEFAULT_PROFILES = [
  { id: 'learning', name: '学习模式', name_en: 'Learning', icon: '📚', speed: 1.5, description: '适合认真观看', isBuiltIn: true },
  { id: 'review', name: '复习模式', name_en: 'Review', icon: '🔄', speed: 2.0, description: '快速回顾', isBuiltIn: true },
  { id: 'browse', name: '浏览模式', name_en: 'Browse', icon: '👀', speed: 1.25, description: '快速浏览', isBuiltIn: true },
  { id: 'listening', name: '听力模式', name_en: 'Listening', icon: '👂', speed: 0.75, description: '慢速精听', isBuiltIn: true }
];

const BUILT_IN_THEMES = [
  { id: 'default', name: '默认', name_en: 'Default', position: 'bottom-right', colors: { background: 'rgba(0,0,0,0.75)', text: '#ffffff', border: '#4a90d9' }, isBuiltIn: true },
  { id: 'dark', name: '深色', name_en: 'Dark', position: 'bottom-right', colors: { background: 'rgba(30,30,30,0.9)', text: '#e0e0e0', border: '#ff6b6b' }, isBuiltIn: true },
  { id: 'light', name: '浅色', name_en: 'Light', position: 'top-right', colors: { background: 'rgba(255,255,255,0.95)', text: '#333333', border: '#2196f3' }, isBuiltIn: true },
  { id: 'neon', name: '霓虹', name_en: 'Neon', position: 'center', colors: { background: 'rgba(0,0,0,0.8)', text: '#00ff88', border: '#00ff88' }, isBuiltIn: true }
];

// Init on load
document.addEventListener('DOMContentLoaded', async () => {
  const activeTab = document.querySelector('.tab-button.active');
  if (activeTab) await initTab(activeTab.dataset.tab);

  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      await initTab(btn.dataset.tab);
    });
  });
});

async function initTab(tab) {
  switch(tab) {
    case 'profiles': await loadProfiles(); break;
    case 'history': await loadHistory(); break;
    case 'theme': await loadThemes(); break;
    case 'bookmarks': await loadBookmarks(); break;
  }
}

// ============ Profiles ============
async function loadProfiles() {
  const grid = document.getElementById('profileGrid');
  if (!grid) return;
  
  const saved = await chrome.storage.local.get(STORAGE_KEYS.PROFILES);
  const active = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_PROFILE);
  
  let profiles = DEFAULT_PROFILES;
  if (saved[STORAGE_KEYS.PROFILES]) {
    const custom = saved[STORAGE_KEYS.PROFILES].filter(p => !DEFAULT_PROFILES.find(d => d.id === p.id));
    profiles = [...DEFAULT_PROFILES, ...custom];
  }
  
  const activeId = active[STORAGE_KEYS.ACTIVE_PROFILE] || 'learning';
  
  grid.innerHTML = profiles.map(p => `
    <div class="card ${p.id === activeId ? 'active' : ''}" data-id="${p.id}" data-speed="${p.speed}">
      <div class="card-icon">${p.icon}</div>
      <div class="card-title">${p.name}</div>
      <div class="card-desc">${p.speed}x</div>
    </div>
  `).join('');
  
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', async () => {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_PROFILE]: card.dataset.id });
      grid.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      showStatus('已切换到 ' + card.querySelector('.card-title').textContent);
    });
  });
}

document.getElementById('addProfileBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('newProfileName').value.trim();
  const speed = parseFloat(document.getElementById('newProfileSpeed').value);
  const icon = document.getElementById('newProfileIcon').value.trim() || '⚡';
  
  if (!name || !speed) return showStatus('请填写名称和速度', true);
  
  const newProfile = { id: `custom_${Date.now()}`, name, icon, speed, description: '自定义', isBuiltIn: false };
  const saved = await chrome.storage.local.get(STORAGE_KEYS.PROFILES);
  const custom = saved[STORAGE_KEYS.PROFILES] || [];
  custom.push(newProfile);
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: custom });
  
  document.getElementById('newProfileName').value = '';
  document.getElementById('newProfileSpeed').value = '';
  await loadProfiles();
  showStatus('已添加: ' + name);
});

// ============ History ============
async function loadHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  const history = result[STORAGE_KEYS.HISTORY] || [];
  
  document.getElementById('totalVideos').textContent = history.length;
  const totalSeconds = history.reduce((sum, h) => sum + (h.watchedDuration || 0), 0);
  document.getElementById('totalTime').textContent = formatDuration(totalSeconds);
  
  const list = document.getElementById('historyList');
  if (!list) return;
  
  if (history.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无观看记录</div>';
    return;
  }
  
  list.innerHTML = history.slice(0, 15).map(h => `
    <div class="list-item">
      <div>
        <div style="font-weight:500;font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.title || '未知'}</div>
        <div style="font-size:11px;color:#666;">
          <span style="background:#e0e0e0;padding:1px 5px;border-radius:3px;">${h.site || 'other'}</span>
          ${formatTime(h.lastWatched)}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="color:#667eea;font-weight:bold;">${h.playbackSpeed || 1}x</div>
        <div style="font-size:11px;color:#999;">${formatDuration(h.watchedDuration || 0)}</div>
      </div>
    </div>
  `).join('');
}

document.getElementById('clearHistoryBtn')?.addEventListener('click', async () => {
  if (confirm('确定清空所有历史?')) {
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
    await loadHistory();
    showStatus('已清空');
  }
});

// ============ Themes ============
async function loadThemes() {
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  
  const saved = await chrome.storage.local.get(STORAGE_KEYS.THEMES);
  const active = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_THEME);
  
  let themes = BUILT_IN_THEMES;
  if (saved[STORAGE_KEYS.THEMES]) {
    const custom = saved[STORAGE_KEYS.THEMES].filter(t => !BUILT_IN_THEMES.find(b => b.id === t.id));
    themes = [...BUILT_IN_THEMES, ...custom];
  }
  
  const activeId = active[STORAGE_KEYS.ACTIVE_THEME] || 'default';
  const activeTheme = themes.find(t => t.id === activeId) || themes[0];
  
  grid.innerHTML = themes.map(t => `
    <div class="card ${t.id === activeId ? 'active' : ''}" data-id="${t.id}" data-theme='${JSON.stringify(t)}'>
      <div class="card-icon" style="background:${t.colors.background};color:${t.colors.text};padding:8px;border-radius:8px;border:2px solid ${t.colors.border};">
        Aa
      </div>
      <div class="card-title">${t.name}</div>
    </div>
  `).join('');
  
  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', async () => {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_THEME]: card.dataset.id });
      grid.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      showStatus('已切换主题');
    });
  });
  
  // Update color pickers
  if (activeTheme) {
    document.getElementById('themeBgColor').value = rgbToHex(activeTheme.colors.background) || '#000000';
    document.getElementById('themeBgColorText').value = activeTheme.colors.background;
    document.getElementById('themeTextColor').value = rgbToHex(activeTheme.colors.text) || '#ffffff';
    document.getElementById('themeTextColorText').value = activeTheme.colors.text;
    document.getElementById('themeBorderColor').value = rgbToHex(activeTheme.colors.border) || '#4a90d9';
    document.getElementById('themeBorderColorText').value = activeTheme.colors.border;
  }
}

document.getElementById('saveThemeBtn')?.addEventListener('click', async () => {
  const themeId = `custom_${Date.now()}`;
  const newTheme = {
    id: themeId,
    name: '自定义主题',
    name_en: 'Custom',
    position: 'bottom-right',
    colors: {
      background: document.getElementById('themeBgColorText').value,
      text: document.getElementById('themeTextColorText').value,
      border: document.getElementById('themeBorderColorText').value
    },
    isBuiltIn: false
  };
  
  const saved = await chrome.storage.local.get(STORAGE_KEYS.THEMES);
  const custom = saved[STORAGE_KEYS.THEMES] || [];
  custom.push(newTheme);
  await chrome.storage.local.set({ [STORAGE_KEYS.THEMES]: custom, [STORAGE_KEYS.ACTIVE_THEME]: themeId });
  
  await loadThemes();
  showStatus('自定义主题已保存');
});

// ============ Bookmarks ============
async function loadBookmarks() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS);
  const bookmarks = result[STORAGE_KEYS.BOOKMARKS] || [];
  
  // Current video bookmarks
  const currentUrl = window.location.href;
  const currentBookmarks = bookmarks.filter(b => isSameVideo(b.url, currentUrl));
  
  const list = document.getElementById('bookmarkList');
  if (list) {
    if (currentBookmarks.length === 0) {
      list.innerHTML = '<div class="empty-state">当前视频暂无书签<br><small>点击"添加当前时间书签"创建</small></div>';
    } else {
      list.innerHTML = currentBookmarks.sort((a,b) => a.timestamp - b.timestamp).map(b => `
        <div class="bookmark-item" data-url="${b.url}" data-time="${b.timestamp}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="bookmark-time">${formatTimestamp(b.timestamp)}</span>
            <span class="bookmark-delete" data-id="${b.id}">✕</span>
          </div>
          ${b.note ? `<div class="bookmark-note">${b.note}</div>` : ''}
        </div>
      `).join('');
      
      list.querySelectorAll('.bookmark-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.classList.contains('bookmark-delete')) return;
          // Send message to content script to seek
          chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'seekTo', 
                timestamp: parseFloat(item.dataset.time) 
              });
            }
          });
        });
      });
      
      list.querySelectorAll('.bookmark-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteBookmark(btn.dataset.id);
          await loadBookmarks();
        });
      });
    }
  }
  
  // All bookmarks
  const allList = document.getElementById('allBookmarksList');
  if (allList) {
    if (bookmarks.length === 0) {
      allList.innerHTML = '<div class="empty-state">暂无书签</div>';
    } else {
      allList.innerHTML = bookmarks.slice(0, 20).map(b => `
        <div class="list-item">
          <div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">
            ${b.title || '未知'} 
            <span style="color:#667eea;">@${formatTimestamp(b.timestamp)}</span>
          </div>
          <span class="bookmark-delete" data-id="${b.id}">✕</span>
        </div>
      `).join('');
      
      allList.querySelectorAll('.bookmark-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          await deleteBookmark(btn.dataset.id);
          await loadBookmarks();
        });
      });
    }
  }
}

document.getElementById('addBookmarkBtn')?.addEventListener('click', async () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getCurrentTime' }, async (response) => {
        if (response && response.currentTime !== undefined) {
          const result = await chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS);
          const bookmarks = result[STORAGE_KEYS.BOOKMARKS] || [];
          
          bookmarks.unshift({
            id: `bm_${Date.now()}`,
            url: tabs[0].url,
            title: tabs[0].title,
            timestamp: response.currentTime,
            note: '',
            createdAt: Date.now()
          });
          
          await chrome.storage.local.set({ [STORAGE_KEYS.BOOKMARKS]: bookmarks });
          await loadBookmarks();
          showStatus('书签已添加: ' + formatTimestamp(response.currentTime));
        }
      });
    }
  });
});

async function deleteBookmark(id) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.BOOKMARKS);
  const bookmarks = result[STORAGE_KEYS.BOOKMARKS] || [];
  const filtered = bookmarks.filter(b => b.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.BOOKMARKS]: filtered });
}

// ============ Utils ============
function showStatus(msg, isError = false) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = msg;
    status.className = isError ? 'error' : 'success';
    setTimeout(() => status.className = '', 3000);
  }
}

function formatDuration(seconds) {
  if (!seconds || seconds < 60) return Math.round(seconds || 0) + '秒';
  if (seconds < 3600) return Math.round(seconds / 60) + '分钟';
  return Math.floor(seconds / 3600) + '小时' + Math.round((seconds % 3600) / 60) + '分';
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function formatTimestamp(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function rgbToHex(color) {
  if (!color || color.startsWith('#')) return color;
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return '#' + [match[1], match[2], match[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}

function isSameVideo(url1, url2) {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    return u1.hostname === u2.hostname && u1.pathname === u2.pathname;
  } catch { return url1 === url2; }
}
