/**
 * LightboxManager 集成示例
 * 展示如何在实际应用中使用 LightboxManager
 */

import { getLightboxManager } from './lightboxManager';
import { useMediaStore } from '../stores/mediaStore';

/**
 * 示例 1：基本用法
 * 在键盘处理器中集成 Lightbox
 */
export function integrateWithKeyboardHandler() {
    const lightboxManager = getLightboxManager();

    // 监听 'f' 键切换全屏
    document.addEventListener('keydown', (e) => {
        if (e.key === 'f' || e.key === 'F') {
            const video = document.querySelector('video');
            if (video) {
                lightboxManager.toggle(video);
            }
        }

        // ESC 键退出全屏
        if (e.key === 'Escape') {
            if (lightboxManager.isActive()) {
                lightboxManager.exit();
            }
        }
    });
}

/**
 * 示例 2：与 React 组件集成
 * 在 React 组件中使用 Lightbox
 */
export function useFullscreenToggle() {
    const lightboxManager = getLightboxManager();
    const { isFullscreen } = useMediaStore();

    const toggleFullscreen = () => {
        const video = document.querySelector('video');
        if (video) {
            lightboxManager.toggle(video);
        }
    };

    return {
        isFullscreen,
        toggleFullscreen,
    };
}

/**
 * 示例 3：页面卸载时清理
 */
export function setupCleanup() {
    const lightboxManager = getLightboxManager();

    window.addEventListener('beforeunload', () => {
        lightboxManager.destroy();
    });
}

/**
 * 示例 4：完整的初始化流程
 */
export function initializeLightbox() {
    const lightboxManager = getLightboxManager();

    // 1. 设置键盘快捷键
    integrateWithKeyboardHandler();

    // 2. 设置清理逻辑
    setupCleanup();

    // 3. 返回管理器实例供其他模块使用
    return lightboxManager;
}
