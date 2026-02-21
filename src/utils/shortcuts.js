/**
 * VideoSpeed Pro - 快捷键设置面板
 * 用于Popup和选项页的快捷键管理
 */

export const DEFAULT_SHORTCUTS = {
  increase: { key: '=', label: '加速', desc: '增加播放速度' },
  decrease: { key: '-', label: '减速', desc: '降低播放速度' },
  reset: { key: '0', label: '重置', desc: '重置为正常速度' },
  'toggle-fullscreen': { key: 'f', label: '全屏', desc: '切换网页全屏' }
};

export const PROFILE_SHORTCUTS = [
  { key: '1', label: '学习模式', speed: '1.5x' },
  { key: '2', label: '复习模式', speed: '2.0x' },
  { key: '3', label: '浏览模式', speed: '1.25x' },
  { key: '4', label: '听力模式', speed: '0.75x' }
];

// 检查快捷键冲突
export function checkConflicts(shortcuts) {
  const values = Object.values(shortcuts);
  const conflicts = [];
  
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (values[i] === values[j]) {
        conflicts.push(values[i]);
      }
    }
  }
  
  return conflicts;
}

// 格式化快捷键显示
export function formatShortcut(key) {
  const keyMap = {
    ' ': '空格',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Escape': 'Esc',
    'Backspace': '退格',
    'Delete': 'Del',
    'Enter': '回车',
    'Tab': 'Tab',
    'ctrl': 'Ctrl',
    'alt': 'Alt',
    'shift': 'Shift',
    'meta': '⌘'
  };
  
  return key.split('+').map(k => keyMap[k] || k.toUpperCase()).join('+');
}
