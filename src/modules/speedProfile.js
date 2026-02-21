/**
 * Speed Profiles - 速度配置管理
 * 支持创建不同场景的速度配置（学习、复习、浏览等）
 */

import { defaultShortcuts } from '../utils/storage.js';

// Chrome Storage API helper
const storage = {
  get: (key) => new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key]));
  }),
  set: (key, value) => new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  })
};

// 内置配置
export const DEFAULT_PROFILES = [
  {
    id: 'learning',
    name: '学习模式',
    name_en: 'Learning',
    icon: '📚',
    speed: 1.5,
    description: '适合认真观看学习内容',
    isBuiltIn: true
  },
  {
    id: 'review',
    name: '复习模式',
    name_en: 'Review',
    icon: '🔄',
    speed: 2.0,
    description: '快速回顾已学内容',
    isBuiltIn: true
  },
  {
    id: 'browse',
    name: '浏览模式',
    name_en: 'Browse',
    icon: '👀',
    speed: 1.25,
    description: '快速浏览筛选内容',
    isBuiltIn: true
  },
  {
    id: 'listening',
    name: '听力模式',
    name_en: 'Listening',
    icon: '👂',
    speed: 0.75,
    description: '慢速精听练习',
    isBuiltIn: true
  }
];

const STORAGE_KEY = 'speedProfiles';
const ACTIVE_PROFILE_KEY = 'activeProfile';

export class SpeedProfileManager {
  constructor() {
    this.profiles = [...DEFAULT_PROFILES];
    this.activeProfileId = 'learning';
  }

  /**
   * 初始化 - 从存储加载配置
   */
  async init() {
    try {
      const saved = await storage.get(STORAGE_KEY);
      if (saved && Array.isArray(saved)) {
        // 合并内置配置和自定义配置
        const builtInIds = DEFAULT_PROFILES.map(p => p.id);
        const customProfiles = saved.filter(p => !p.isBuiltIn && !builtInIds.includes(p.id));
        this.profiles = [...DEFAULT_PROFILES, ...customProfiles];
      }

      const active = await storage.get(ACTIVE_PROFILE_KEY);
      if (active) {
        this.activeProfileId = active;
      }
    } catch (e) {
      console.warn('[SpeedProfile] Init failed:', e);
    }
  }

  /**
   * 获取所有配置
   */
  getProfiles() {
    return this.profiles;
  }

  /**
   * 获取当前激活的配置
   */
  getActiveProfile() {
    return this.profiles.find(p => p.id === this.activeProfileId) || this.profiles[0];
  }

  /**
   * 设置当前激活的配置
   */
  async setActiveProfile(profileId) {
    const profile = this.profiles.find(p => p.id === profileId);
    if (profile) {
      this.activeProfileId = profileId;
      await storage.set(ACTIVE_PROFILE_KEY, profileId);
      return profile;
    }
    return null;
  }

  /**
   * 添加自定义配置
   */
  async addProfile(profile) {
    const newProfile = {
      id: `custom_${Date.now()}`,
      name: profile.name || '自定义',
      name_en: profile.name_en || 'Custom',
      icon: profile.icon || '⚡',
      speed: profile.speed || 1.0,
      description: profile.description || '',
      isBuiltIn: false,
      createdAt: Date.now()
    };
    
    this.profiles.push(newProfile);
    await this.save();
    return newProfile;
  }

  /**
   * 更新配置
   */
  async updateProfile(profileId, updates) {
    const index = this.profiles.findIndex(p => p.id === profileId);
    if (index !== -1 && !this.profiles[index].isBuiltIn) {
      this.profiles[index] = { ...this.profiles[index], ...updates };
      await this.save();
      return this.profiles[index];
    }
    return null;
  }

  /**
   * 删除自定义配置
   */
  async deleteProfile(profileId) {
    const index = this.profiles.findIndex(p => p.id === profileId);
    if (index !== -1 && !this.profiles[index].isBuiltIn) {
      this.profiles.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  /**
   * 保存到存储
   */
  async save() {
    const toSave = this.profiles.filter(p => !p.isBuiltIn);
    await storage.set(STORAGE_KEY, toSave);
  }

  /**
   * 快速切换到指定速度
   */
  async applySpeed(speed) {
    const closest = this.findClosestProfile(speed);
    if (closest) {
      await this.setActiveProfile(closest.id);
    }
    return closest;
  }

  /**
   * 找到最接近的速度配置
   */
  findClosestProfile(speed) {
    return this.profiles.reduce((prev, curr) => {
      return Math.abs(curr.speed - speed) < Math.abs(prev.speed - speed) ? curr : prev;
    });
  }
}

// 导出单例
export const speedProfileManager = new SpeedProfileManager();
