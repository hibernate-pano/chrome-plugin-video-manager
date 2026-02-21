/**
 * Onboarding & Changelog Module
 * 入门引导和更新日志
 */

import { STORAGE_KEYS } from '../shared/constants.js';

const CURRENT_VERSION = '3.7.0';

const CHANGELOG = [
  {
    version: '3.7.0',
    date: '2026-02-21',
    features: [
      '新增：入门引导 - 首次安装用户必看',
      '新增：更新日志 - 了解最新变化',
      '优化：数字键1-4快速切换速度',
      '优化：手势控制 - 滑动调节音量和速度'
    ]
  },
  {
    version: '3.6.0',
    date: '2026-02-21',
    features: [
      '新增：Store发布材料',
      '新增：快捷键管理工具'
    ]
  },
  {
    version: '3.5.0',
    date: '2026-02-21',
    features: [
      '新增：数字键快速切换速度配置',
      '新增：手势控制功能'
    ]
  },
  {
    version: '3.4.0',
    date: '2026-02-21',
    features: [
      '新增：视频位置记忆功能',
      '自动保存和恢复播放位置'
    ]
  },
  {
    version: '3.3.0',
    date: '2026-02-21',
    features: [
      '新增：数据统计面板',
      '观看时长、站点分布统计'
    ]
  },
  {
    version: '3.2.0',
    date: '2026-02-21',
    features: [
      '新增：云端同步功能',
      '跨设备同步设置'
    ]
  },
  {
    version: '3.1.0',
    date: '2026-02-21',
    features: [
      '新增：自定义主题',
      '新增：时间书签',
      '改进：设置页面重构'
    ]
  },
  {
    version: '3.0.0',
    date: '2026-02-21',
    features: [
      '新增：速度配置Profiles',
      '新增：播放历史',
      '全新Pro版本发布'
    ]
  }
];

const ONBOARDING_STEPS = [
  {
    title: '欢迎使用 VideoSpeed Pro! 🚀',
    content: '一款专为学习者打造的视频速度控制工具',
    icon: '⚡'
  },
  {
    title: '快捷键控制 ⌨️',
    content: '按 = 加速，按 - 减速，按 0 重置，按 f 全屏',
    icon: '⌨️'
  },
  {
    title: '快速切换 ⚡',
    content: '按数字键 1-4 快速切换预设速度：1=学习(1.5x) 2=复习(2x) 3=浏览(1.25x) 4=听力(0.75x)',
    icon: '🔢'
  },
  {
    title: '开启Pro之旅 💎',
    content: '点击扩展图标进入设置，解锁速度配置、历史记录、云同步等Pro功能',
    icon: '💎'
  }
];

class OnboardingManager {
  constructor() {
    this.storageKey = 'onboardingState';
  }

  async init() {
    const state = await this.getState();
    
    // 检查是否需要显示引导
    if (state.needsOnboarding) {
      return { type: 'onboarding', step: 0 };
    }
    
    // 检查版本更新
    if (state.lastVersion !== CURRENT_VERSION) {
      return { type: 'changelog', version: CURRENT_VERSION };
    }
    
    return null;
  }

  async getState() {
    return new Promise(resolve => {
      chrome.storage.local.get(this.storageKey, result => {
        resolve(result[this.storageKey] || { needsOnboarding: true, lastVersion: null });
      });
    });
  }

  async completeOnboarding() {
    return new Promise(resolve => {
      chrome.storage.local.set({
        [this.storageKey]: { needsOnboarding: false, lastVersion: CURRENT_VERSION }
      }, resolve);
    });
  }

  async markChangelogSeen() {
    return new Promise(resolve => {
      chrome.storage.local.get(this.storageKey, result => {
        const state = result[this.storageKey] || {};
        state.lastVersion = CURRENT_VERSION;
        state.needsOnboarding = false;
        chrome.storage.local.set({ [this.storageKey]: state }, resolve);
      });
    });
  }

  getChangelog() {
    return CHANGELOG;
  }

  getOnboardingSteps() {
    return ONBOARDING_STEPS;
  }
}

export const onboardingManager = new OnboardingManager();
export { CURRENT_VERSION, CHANGELOG, ONBOARDING_STEPS };
