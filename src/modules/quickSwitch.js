/**
 * Quick Speed Switcher - 快捷键快速切换速度
 * 通过数字键 1-4 快速切换预设速度
 */

import { speedProfileManager } from './speedProfile.js';

// 快捷键映射
const PROFILE_SHORTCUTS = {
  '1': 'learning',
  '2': 'review', 
  '3': 'browse',
  '4': 'listening'
};

/**
 * 处理快捷键切换速度配置
 */
export function handleProfileShortcut(key, media, indicator) {
  const profileId = PROFILE_SHORTCUTS[key];
  if (!profileId) return false;
  
  const profile = speedProfileManager.profiles.find(p => p.id === profileId);
  if (!profile) return false;
  
  // 设置速度
  if (media) {
    media.playbackRate = profile.speed;
  }
  
  // 显示提示
  if (indicator) {
    indicator.show(`${profile.icon} ${profile.name} (${profile.speed}x)`);
  }
  
  return true;
}

/**
 * 获取当前可用的快捷键提示
 */
export function getProfileShortcutHints() {
  return [
    { key: '1', profile: 'learning', speed: '1.5x' },
    { key: '2', profile: 'review', speed: '2.0x' },
    { key: '3', profile: 'browse', speed: '1.25x' },
    { key: '4', profile: 'listening', speed: '0.75x' }
  ];
}
