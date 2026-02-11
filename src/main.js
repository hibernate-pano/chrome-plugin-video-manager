/**
 * Video & Audio Speed Controller - 主入口
 * @module main
 */

import { loadShortcutSettings, onShortcutsChanged } from './utils/storage.js';
import { ensureMatchesPolyfill } from './utils/dom.js';
import { MediaDetector } from './modules/mediaDetector.js';
import { HUD } from './modules/hud.js';
import { LightboxManager } from './modules/lightbox.js';
import { PlaybackController } from './modules/playbackController.js';
import { KeyboardHandler } from './modules/keyboardHandler.js';
import { KeyboardHelp } from './modules/keyboardHelp.js';
import { PerformanceMonitor } from './utils/performance.js';

/**
 * 主应用类
 */
class VideoSpeedController {
    constructor() {
        this.shortcuts = {};
        this.mediaDetector = null;
        this.hud = null;
        this.lightboxManager = null;
        this.playbackController = null;
        this.keyboardHandler = null;
        this.keyboardHelp = null;
        this.performanceMonitor = new PerformanceMonitor();
    }

    /**
     * 初始化应用
     */
    async init() {
        try {
            // 确保浏览器兼容性
            ensureMatchesPolyfill();

            // 加载快捷键设置
            this.shortcuts = await loadShortcutSettings();

            // 初始化各个模块
            this.hud = new HUD();
            this.lightboxManager = new LightboxManager();
            this.mediaDetector = new MediaDetector();
            this.playbackController = new PlaybackController(this.hud);
            this.keyboardHelp = new KeyboardHelp();
            this.keyboardHandler = new KeyboardHandler(
                this.shortcuts,
                this.mediaDetector,
                this.playbackController,
                this.lightboxManager,
                this.keyboardHelp
            );

            // 设置媒体检测和事件监听
            this.mediaDetector.setupMediaElementDetection();
            this.mediaDetector.setupMediaEventDelegation();

            // 初始化键盘事件处理
            this.keyboardHandler.init();

            // 监听快捷键变更
            onShortcutsChanged((newShortcuts) => {
                this.shortcuts = newShortcuts;
                this.keyboardHandler.updateShortcuts(newShortcuts);
            });

            console.log('Video Speed Controller initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Video Speed Controller:', error);
        }
    }

    /**
     * 清理资源
     */
    destroy() {
        if (this.keyboardHandler) {
            this.keyboardHandler.destroy();
        }
        if (this.keyboardHelp) {
            this.keyboardHelp.destroy();
        }
        if (this.hud) {
            this.hud.destroy();
        }
        if (this.lightboxManager && this.lightboxManager.isActive()) {
            this.lightboxManager.exit();
        }
        if (this.mediaDetector) {
            this.mediaDetector.destroy();
        }
        if (this.performanceMonitor) {
            console.log(this.performanceMonitor.getSummary());
        }
    }
}

// 使用IIFE避免污染全局作用域
(() => {
    const app = new VideoSpeedController();
    app.init();

    // 在页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        app.destroy();
    });
})();
